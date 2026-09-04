import { marketDataService } from "../marketdata/service";
import { getSnapshot } from "../marketdata/gateway/gateway";
import { identifyStrategy } from "../engine/scanner";
import { sizePosition, portfolioHeatPct, returnCorrelation, GLOBAL_RISK } from "../engine/risk";
import { openRiskDollars, listPositions } from "../engine/portfolio";
import { publicPackageStatus } from "../governance/runtime";
import { parseTradeQuantity, resolveTradeSymbol } from "./trade-symbol";

/**
 * INTENT ROUTER — the deterministic switch between the AI reasoning model
 * and the deterministic engine.
 *
 * House rule: the AI model narrates; code decides. Every chat message is
 * classified HERE — pure functions, no model call — before the LLM is
 * invoked, and the mode determines which tools the model is even offered:
 *
 *   CHAT (default)   → conversation / reasoning / research with the AI
 *                      model. proposeTrade is NOT in the tool list.
 *   TRADE_INTENT     → an imperative to transact ("buy X", "sell", "flatten").
 *                      Runs the advisory-first pipeline: analyze the market,
 *                      check the protocol, deliver a verdict — staging is
 *                      only possible on a follow-up imperative while an
 *                      advisory for that symbol+side is on the table.
 *   ORDER_COMMAND    → CONFIRM/REJECT ORDER … — existing confirmation path.
 *   STATUS_QUERY     → positions / orders / P&L / monitors — read-only.
 *   STRATEGIZE       → "strategize / build a strategy / backtest …" —
 *                      routed to the deterministic strategy builder path.
 *
 * Conservatism: ambiguous → CHAT. A missed trade intent costs one more
 * sentence; a false one stages a ticket nobody asked for.
 */

export type ChatMode = "CHAT" | "TRADE_INTENT" | "ORDER_COMMAND" | "STATUS_QUERY" | "STRATEGIZE";

export interface ThreadState {
  advisory: Advisory | null;
  stagedTicketId: string | null;
  stagedExpiresAt: number | null;
  pendingQuantity: number | null;
}

const threads = new Map<string, ThreadState>();

export function getThreadState(userId: string): ThreadState {
  return threads.get(userId) ?? { advisory: null, stagedTicketId: null, stagedExpiresAt: null, pendingQuantity: null };
}

export function setThreadState(userId: string, s: Partial<ThreadState>): ThreadState {
  const next = { ...getThreadState(userId), ...s };
  threads.set(userId, next);
  return next;
}

export function clearThreadState(userId: string): void {
  threads.delete(userId);
}

/* ---------- lexicon (versioned constants — changing a trigger is a code edit) ---------- */

export const ORDER_COMMAND_RE = /^\s*(confirm|reject)\s+order\s+[a-z0-9-]+\s*$/i;
export const STATUS_TRIGGERS = /\b(p&l|pnl|profit|loss|positions?|orders?|tickets?|monitors?|watchlist|what'?s open|how am i doing|portfolio|balance)\b/i;
export const STRATEGIZE_TRIGGERS = /\b(strategi[sz]e|build (me )?a strategy|create (a )?strategy|design (a )?strategy|write (a )?strategy|backtest|game ?plan|trade plan)\b/i;
export const TRADE_TRIGGERS = /\b(buy|sell|long|short|flatten|exit|close (my |the )?position|add to)\b/i;
export const STAGE_FOLLOWUP_RE = /\b(stage|stage it|do it|go ahead|place it|send it|buy it|sell it|execute|proceed|let'?s do it|confirmed?)\b/i;
const QUESTION_OR_NEGATION = /(\?|^\s*(should|would|could|is it|what if|what happens|why did|when (to|should)|how about)|\b(don'?t|do not|hold off|not yet|wait)\b)/i;

export interface IntentResult {
  mode: ChatMode;
  symbol: string | null;
  side: "BUY" | "SELL" | null;
  quantity: number | null;
  quantityError: string | null;
  followUp: boolean; // imperative follow-up on an existing advisory ("stage it")
  reason: string;
}

function extractSymbol(text: string, thread: ThreadState): string | null {
  return resolveTradeSymbol(text, thread);
}

function extractQuantity(text: string): { quantity: number | null; error: string | null } {
  return parseTradeQuantity(text);
}

export function classifyIntent(text: string, thread: ThreadState): IntentResult {
  const qty = extractQuantity(text);
  const base: Omit<IntentResult, "mode" | "reason"> = {
    symbol: extractSymbol(text, thread),
    side: /\b(sell|short|flatten|exit|close)\b/i.test(text) ? "SELL" : /\b(buy|long|add to)\b/i.test(text) ? "BUY" : null,
    quantity: qty.quantity,
    quantityError: qty.error,
    followUp: false,
  };

  if (ORDER_COMMAND_RE.test(text)) {
    return { ...base, mode: "ORDER_COMMAND", reason: "exact order command — existing confirmation path" };
  }

  // Imperative follow-up on an active advisory → escalate to staging turn.
  if (thread.advisory && STAGE_FOLLOWUP_RE.test(text) && !QUESTION_OR_NEGATION.test(text)) {
    return {
      ...base,
      symbol: base.symbol ?? thread.advisory.symbol,
      side: base.side ?? thread.advisory.side,
      mode: "TRADE_INTENT",
      followUp: true,
      reason: `imperative follow-up on advisory for ${thread.advisory.symbol} — staging permitted this turn`,
    };
  }

  const hasTradeTrigger = TRADE_TRIGGERS.test(text);
  const isQuestionOrNegated = QUESTION_OR_NEGATION.test(text);

  if (hasTradeTrigger && !isQuestionOrNegated) {
    return { ...base, side: base.side ?? "BUY", mode: "TRADE_INTENT", reason: "imperative trade instruction" };
  }
  if (STRATEGIZE_TRIGGERS.test(text)) {
    return { ...base, mode: "STRATEGIZE", reason: "strategy-building request — deterministic strategy builder path" };
  }
  if (STATUS_TRIGGERS.test(text) && !hasTradeTrigger) {
    return { ...base, mode: "STATUS_QUERY", reason: "read-only status request" };
  }
  return {
    ...base,
    mode: "CHAT",
    reason: hasTradeTrigger && isQuestionOrNegated
      ? "trade word inside a question/negation — conversation ABOUT trading, not an instruction"
      : "no trade trigger — default conversation",
  };
}

/* ---------- the advisory (§4 of the Intent Router specification) ---------- */

export interface Advisory {
  symbol: string;
  side: "BUY" | "SELL";
  verdict: "FAVORABLE" | "WAIT" | "UNFAVORABLE" | "BLOCKED";
  reasons: string[];
  dataQuality: { fresh: boolean; bars: number; marketOpen: boolean; delaySeconds: number };
  setup: { strategyId: string; confidence: number; reasons: string[] } | null;
  sizingPreview: { qty: number; dollarRisk: number; cappedBy: string } | null;
  proposed: { lastPrice: number | null; note: string } | null;
  watchFor: string | null;
  currentHeatPct: number;
  governanceVersion: string;
  composedAt: number;
}

const ADVISORY_TTL_MS = 5 * 60_000;
const PAPER_EQUITY = 100_000;

export function advisoryFresh(a: Advisory | null): boolean {
  return !!a && Date.now() - a.composedAt < ADVISORY_TTL_MS;
}

/**
 * Compose an advisory WITHOUT the model: market analysis + protocol check →
 * deterministic verdict. Never throws on data failure — a dead feed is an
 * UNFAVORABLE verdict with the feed's own error as the reason (§5 spec:
 * never estimate a missing value).
 */
export async function composeAdvisory(userId: string, symbol: string, side: "BUY" | "SELL"): Promise<Advisory> {
  const reasons: string[] = [];
  const sym = symbol.toUpperCase();

  // ── 1. DATA ── track + refresh; failure → UNFAVORABLE with the verbatim error
  let feed;
  try {
    feed = await marketDataService.track(sym);
  } catch (e) {
    return {
      symbol: sym, side, verdict: "UNFAVORABLE",
      reasons: [`cannot obtain market data for ${sym}: ${(e as Error).message}`],
      dataQuality: { fresh: false, bars: 0, marketOpen: false, delaySeconds: 0 },
      setup: null, sizingPreview: null, proposed: null,
      watchFor: "verify the symbol and the data gateway, then ask again",
      currentHeatPct: 0, governanceVersion: "unknown", composedAt: Date.now(),
    };
  }
  await marketDataService.refresh(sym).catch(() => undefined);
  feed = marketDataService.get(sym);

  const bars = feed?.bars.length ?? 0;
  const delaySeconds = feed?.delaySeconds ?? 0;
  const fresh = !!feed && !feed.error && bars >= 30 && delaySeconds <= 180;
  const marketOpen = !!feed?.indicators && bars > 0;
  if (feed?.error) reasons.push(`data feed: ${feed.error}`);
  if (!fresh && !feed?.error) reasons.push(`insufficient fresh bars (${bars}) or stale feed (delay ${delaySeconds}s) — the engine never estimates missing data`);

  // New setup Market Data Gateway fallback (broker → Yahoo) when Eyes bars are thin.
  let gatewayLast: number | null = null;
  let gatewaySource: string | null = null;
  if (!fresh || feed?.error) {
    try {
      const snap = await getSnapshot(userId, sym);
      if (snap.market_data_available && typeof snap.price === "number" && snap.price > 0) {
        gatewayLast = snap.price;
        gatewaySource = snap.source_name ?? snap.source ?? "Market Data Gateway";
        reasons.push(
          `gateway quote: ${gatewayLast} via ${gatewaySource}` +
            (snap.stale ? " (stale)" : "") +
            " — used for advisory when intraday bar feed is incomplete",
        );
      }
    } catch (e) {
      reasons.push(`gateway quote unavailable: ${(e as Error).message}`);
    }
  }

  // ── 2. ANALYZE — best-fit setup from the deterministic scanner
  let setup: Advisory["setup"] = null;
  const ind = feed?.indicators;
  if (feed && ind && bars >= 30) {
    const gapPct = ind.priorDay && ind.priorDay.close > 0 && feed.bars.length > 0
      ? +(((feed.bars[0].o - ind.priorDay.close) / ind.priorDay.close) * 100).toFixed(2)
      : null;
    const vsVwapPct = ind.vwap && ind.last ? +(((ind.last - ind.vwap) / ind.vwap) * 100).toFixed(2) : null;
    const todayVol = feed.bars.slice(-ind.barCount).reduce((a, b) => a + b.v, 0);
    const priorWindow = feed.bars.slice(0, Math.max(feed.bars.length - ind.barCount, 0)).slice(-ind.barCount);
    const priorVol = priorWindow.reduce((a, b) => a + b.v, 0);
    const relativeVolume = priorVol > 0 ? +(todayVol / priorVol).toFixed(2) : null;
    const identified = identifyStrategy({ gapPct, vsVwapPct, rsi14: ind.rsi14, relativeVolume });
    if (identified) {
      setup = { strategyId: identified.strategyId, confidence: identified.confidence, reasons: identified.reasons };
      reasons.push(...identified.reasons.map((r) => `setup: ${r}`));
    } else {
      reasons.push("no engine setup matches the current tape (scanner returned no candidate)");
    }
  }

  // ── 3. PROTOCOL CHECK — governance + the SAME gate functions the monitor uses
  let governanceVersion = "unknown";
  let governanceActive = false;
  try {
    const packages = await publicPackageStatus();
    const activePkg = packages.find((p) => p.status === "ACTIVE");
    governanceActive = !!activePkg;
    governanceVersion = activePkg?.version ?? "none";
    if (!activePkg) reasons.push("no active signed governance package — the engine may not trade");
  } catch (e) {
    reasons.push(`governance unavailable: ${(e as Error).message}`);
  }

  const heat = portfolioHeatPct(await openRiskDollars(userId), PAPER_EQUITY);
  if (heat >= GLOBAL_RISK.portfolioHeatMaxPct) {
    reasons.push(`portfolio heat ${heat}% already at the ${GLOBAL_RISK.portfolioHeatMaxPct}% cap — new risk is forbidden until exposure falls`);
  }

  let corrBlock: string | null = null;
  if (feed && bars >= 10) {
    const open = await listPositions(userId, 50);
    const candCloses = feed.bars.slice(-31).map((b) => b.c);
    for (const p of open.filter((x) => x.status === "OPEN" && x.symbol !== sym)) {
      const pFeed = marketDataService.get(p.symbol);
      if (!pFeed || pFeed.bars.length < 10) continue;
      const corr = returnCorrelation(candCloses, pFeed.bars.slice(-31).map((b) => b.c));
      if (corr !== null && corr > GLOBAL_RISK.maxPairwiseCorrelation) {
        corrBlock = `correlation r=${corr} vs open position ${p.symbol} exceeds ${GLOBAL_RISK.maxPairwiseCorrelation}`;
        break;
      }
    }
  }
  if (corrBlock) reasons.push(corrBlock);

  // ── 4. VERDICT ──
  const last = ind?.last ?? gatewayLast;
  let verdict: Advisory["verdict"];
  let watchFor: string | null = null;
  const noUsablePrice = last === null || !(last > 0);
  if (noUsablePrice && (feed?.error || !fresh)) {
    verdict = "UNFAVORABLE";
    watchFor = "restore a fresh data feed or gateway quote, then ask again";
  } else if (!governanceActive || heat >= GLOBAL_RISK.portfolioHeatMaxPct || corrBlock) {
    verdict = "BLOCKED";
    watchFor = !governanceActive ? "governance must be active" : heat >= GLOBAL_RISK.portfolioHeatMaxPct ? "portfolio heat must fall below the cap" : "correlated exposure must come down";
  } else if (!fresh || !marketOpen) {
    // Gateway quote alone is enough to discuss / optionally stage under WAIT —
    // full FAVORABLE still requires engine bars + setup.
    verdict = "WAIT";
    watchFor = !fresh
      ? "intraday bar feed incomplete — gateway quote available; staging allowed after you say stage it (CONFIRM still required)"
      : "regular session / bar indicators not ready — ask me to watch it";
  } else if (!setup) {
    verdict = "WAIT";
    watchFor = "a confirmed engine setup (scanner currently sees no candidate) — ask me to watch it";
  } else {
    verdict = "FAVORABLE";
  }

  // Sizing preview needs a protective stop; the engine never invents one —
  // preview only when the setup supplies structure (null otherwise, by design).
  let sizingPreview: Advisory["sizingPreview"] = null;
  if (verdict === "FAVORABLE" && last !== null && ind?.vwap) {
    const stopRef = Math.min(ind.vwap, last * 0.99);
    const size = sizePosition({ accountEquity: PAPER_EQUITY, entry: last, stop: stopRef, maxRiskPct: GLOBAL_RISK.defaultPositionRiskPct, maxPositionPct: 25 });
    if (size.qty > 0) sizingPreview = { qty: size.qty, dollarRisk: size.dollarRisk, cappedBy: size.cappedBy };
  }

  return {
    symbol: sym,
    side,
    verdict,
    reasons,
    dataQuality: { fresh, bars, marketOpen, delaySeconds },
    setup,
    sizingPreview,
    proposed: last !== null ? { lastPrice: last, note: gatewaySource && !fresh ? `gateway ${gatewaySource} — entry/stop finalize when you stage` : "entry/stop finalize when you stage — the engine sizes from YOUR stop, never an invented one" } : null,
    watchFor,
    currentHeatPct: heat,
    governanceVersion,
    composedAt: Date.now(),
  };
}
