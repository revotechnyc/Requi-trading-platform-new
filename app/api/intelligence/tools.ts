import { listMonitors } from "../engine/monitor";
import { listTickets, proposeTicket } from "../queries/tickets";
import { resolveIntelligenceBroker } from "../queries/autonomous-exec-policy";
import { findAlertsByUser } from "../queries/alerts";
import { marketDataService } from "../marketdata/service";
import { fetchMinuteBars } from "../marketdata/ibkr-data";
import { publicPackageStatus } from "../governance/runtime";
import { loadConfig, BUILTIN_CONFIGS } from "../engine/config";
import { runBacktest } from "../engine/backtest";
import { simulateVariants } from "../engine/simulator";
import { scanFeeds } from "../engine/scanner";
import { SWARM_MASTER_PROMPT } from "../prompts/swarm-master";
import { loadHistory } from "./memory";
import { getLearningReport, learningSummaryLines, recordBacktestOutcomes } from "../engine/learning";
import { getMarketContext, type MarketContext } from "../marketdata/gateway/gateway";

/**
 * INTELLIGENCE RUNTIME — stages 1–4 of the Intelligence upgrade.
 *
 * Stage 1 — live state injection: every chat carries a snapshot of the
 *           real system (monitors, tickets, feed, governance, alerts).
 * Stage 2 — tool-use reasoning loop: the model calls whitelisted tools
 *           that wrap the deterministic engine (think → tool → observe →
 *           respond, max 4 rounds). The server enforces the whitelist.
 * Stage 3 — natural-language trade intent: free-form requests become
 *           structured proposals via the proposeTrade tool — validated,
 *           staged as tickets, still requiring CONFIRM ORDER [TICKET_ID].
 * Stage 4 — explainability: the runtime addendum obliges the model to
 *           narrate engine evidence (triggers armed, variants dropped,
 *           sizing math) instead of speaking generically.
 *
 * SAFETY: proposeTrade is the ONLY write tool and it lands in the same
 * confirmation gate as everything else. Reasoning never widens authority.
 */

/* ---------- Stage 1: live state snapshot ---------- */

export async function buildSnapshot(userId: string): Promise<string> {
  const sections: string[] = [];
  try {
    const feed = await marketDataService.status();
    sections.push(
      `DATA FEED: gateway ${feed.gatewayOk ? "OK" : "DOWN"} (${feed.gatewayDetail}) · market ${feed.marketOpen ? "OPEN" : "CLOSED"} · loop ${feed.loopRunning ? "running" : "off"}` +
        (feed.symbols.length > 0
          ? ` · tracked: ${feed.symbols.map((s) => `${s.symbol}${s.last !== null ? ` $${s.last}` : ""}${s.rsi14 !== null ? ` RSI ${s.rsi14}` : ""}${s.error ? ` [error: ${s.error}]` : ""}`).join(", ")}`
          : " · no symbols tracked"),
    );
  } catch (e) {
    sections.push(`DATA FEED: unavailable (${(e as Error).message})`);
  }

  try {
    const monitors = listMonitors(userId);
    sections.push(
      monitors.length > 0
        ? `MONITORS (${monitors.length}): ` + monitors.map((m) => `${m.symbol} [${m.strategyId}] state=${m.state}${m.state === "WATCHING" ? ` timer=${m.timerCount}` : ""}`).join(" · ")
        : "MONITORS: none active",
    );
  } catch {
    sections.push("MONITORS: unavailable");
  }

  try {
    const tickets = await listTickets(userId, 10);
    sections.push(
      tickets.length > 0
        ? `TICKETS (recent ${tickets.length}): ` +
            tickets.map((t) => `${t.ticketId} ${t.symbol} ${t.side} ${t.quantity} state=${t.state}${t.stop ? ` stop=${t.stop}` : ""}`).join(" · ")
        : "TICKETS: none",
    );
  } catch {
    sections.push("TICKETS: unavailable");
  }

  try {
    const alerts = await findAlertsByUser(userId);
    const recent = alerts.slice(0, 5).map((a) => `${a.title}${a.state ? ` [${a.state}]` : ""}`);
    if (recent.length > 0) sections.push(`RECENT ALERTS: ${recent.join(" · ")}`);
  } catch {
    /* alerts optional */
  }

  try {
    const pkgs = await publicPackageStatus();
    const active = pkgs.find((p) => p.status === "ACTIVE");
    sections.push(active ? `GOVERNANCE: package ${active.version} ACTIVE (hash ${active.hashShort})` : "GOVERNANCE: NO ACTIVE PACKAGE — engine will refuse to operate");
  } catch (e) {
    sections.push(`GOVERNANCE: status unavailable (${(e as Error).message})`);
  }

  sections.push(`STRATEGY CONFIGS AVAILABLE: ${BUILTIN_CONFIGS.map((c) => `${c.strategy_id} ("${c.label}")`).join(", ")}`);

  try {
    const lessons = await learningSummaryLines(userId);
    if (lessons.length > 0) {
      sections.push(
        "LEARNING (distilled from our logged trade outcomes — treat these as hard-won facts about OUR system, not generic theory):\n" +
          lessons.map((l) => `- ${l}`).join("\n")
      );
    }
  } catch {
    /* learning section optional */
  }

  return sections.join("\n");
}

/* ---------- Stage 2: tool definitions ---------- */

interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

const TOOL_DEFS: ToolDef[] = [
  { type: "function", function: { name: "getMonitors", description: "List the user's live engine monitors: symbol, strategy, state machine state, hold-timer count, and recent state-machine events (evidence).", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "getTickets", description: "List recent order tickets with state (READY_FOR_CONFIRMATION, CONFIRMED, WORKING, FILLED, etc.), entry/stop/target, expiry.", parameters: { type: "object", properties: { limit: { type: "number", description: "max tickets, default 10" } } } } },
  { type: "function", function: { name: "getIndicators", description: "Get the live indicator set for a tracked symbol: last price, session VWAP, RSI(14), session high/low, prior-day high/low/close, feed delay.", parameters: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] } } },
  { type: "function", function: { name: "scanWatchlist", description: "Run the scanner over tracked feeds: candidates with gap %, relative volume, vs-VWAP, and the best-fit strategy config.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "runBacktest", description: "Backtest a strategy config on a symbol's recent 1-minute history. Returns trades, win rate, profit factor, expectancy (R), max drawdown, per-trade log.", parameters: { type: "object", properties: { symbol: { type: "string" }, strategyId: { type: "string", description: "one of the available strategy configs" } }, required: ["symbol", "strategyId"] } } },
  { type: "function", function: { name: "simulateVariants", description: "Run the what-if simulator: rank a config's entry variants by expectancy, see which were dropped and why.", parameters: { type: "object", properties: { symbol: { type: "string" }, strategyId: { type: "string" } }, required: ["symbol", "strategyId"] } } },
  { type: "function", function: { name: "getGovernanceStatus", description: "Get the active signed governance package version and integrity status.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "getLearningReport", description: "Get the learning-loop report: per-variant performance from logged outcomes, classified mistake patterns (stop-outs, stalls, fades), divergence flags where live results drift from backtest, and distilled lessons. Use when asked what the system has learned, what keeps failing, or which variant to trust.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "getMarketData", description: "Get VERIFIED market data for any symbol through the deterministic Market Data Gateway (connected broker first, Yahoo fallback): normalized snapshot, full internally-computed indicator set (SMA/EMA/RSI/MACD/VWAP/Bollinger/ATR/52-week/relative volume), source, timestamp, staleness. ALWAYS use this for market numbers — never estimate prices.", parameters: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] } } },
  {
    type: "function",
    function: {
      name: "proposeTrade",
      description:
        "Stage a trade proposal as an order ticket. NEVER executes — the ticket requires the user to reply CONFIRM ORDER [TICKET_ID]. A protective stop is REQUIRED; if the user did not give one, ask for it instead of calling this tool.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          side: { type: "string", enum: ["BUY", "SELL"] },
          quantity: { type: "number", description: "share count, integer" },
          orderType: { type: "string", enum: ["MKT", "LMT", "STP"], description: "default STP for breakout-style entries" },
          limitPrice: { type: "number" },
          stopPrice: { type: "number", description: "trigger price for STP entries" },
          stop: { type: "number", description: "REQUIRED protective stop price" },
          target: { type: "number" },
        },
        required: ["symbol", "side", "quantity", "stop"],
      },
    },
  },
];

/* ---------- tool execution (server-enforced whitelist) ---------- */

async function barsFor(symbol: string, period = "1w") {
  const feed = marketDataService.get(symbol);
  if (feed && feed.bars.length >= 100) return feed.bars;
  const result = await fetchMinuteBars(symbol, period);
  return result.bars;
}

async function executeTool(userId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "getMonitors":
      return listMonitors(userId);
    case "getTickets":
      return listTickets(userId, Math.min(Number(args.limit ?? 10), 30));
    case "getIndicators": {
      const symbol = String(args.symbol ?? "").toUpperCase();
      const feed = marketDataService.get(symbol);
      if (!feed) return { error: `${symbol} is not tracked — track it in the data feed first` };
      return { indicators: feed.indicators, delaySeconds: feed.delaySeconds, error: feed.error };
    }
    case "scanWatchlist":
      return scanFeeds(marketDataService.list());
    case "runBacktest": {
      const { config, clamps, governanceVersion } = await loadConfig(String(args.strategyId));
      const bars = await barsFor(String(args.symbol).toUpperCase());
      if (bars.length < 200) return { error: `not enough bars (${bars.length}) — check the data feed / gateway` };
      const r = runBacktest({ config, symbol: String(args.symbol).toUpperCase(), bars });
      await recordBacktestOutcomes(userId, String(args.symbol).toUpperCase(), config.strategy_id, r);
      return {
        days: r.days, totalTrades: r.totalTrades, wins: r.wins, losses: r.losses, winRate: r.winRate,
        profitFactor: r.profitFactor, expectancyR: r.expectancyR, maxDrawdownR: r.maxDrawdownR,
        totalPnl: r.totalPnl, noTradeDays: r.noTradeDays, trades: r.trades.slice(0, 10),
        governanceVersion, clamps,
      };
    }
    case "simulateVariants": {
      const { config, clamps, governanceVersion } = await loadConfig(String(args.strategyId));
      const bars = await barsFor(String(args.symbol).toUpperCase());
      if (bars.length < 200) return { error: `not enough bars (${bars.length})` };
      const r = simulateVariants({ config, symbol: String(args.symbol).toUpperCase(), bars });
      return { ...r, governanceVersion, clamps };
    }
    case "getGovernanceStatus":
      return publicPackageStatus();
    case "getLearningReport":
      return getLearningReport(userId);
    case "getMarketData": {
      const symbol = String(args.symbol ?? "").toUpperCase().trim();
      if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) return { error: "invalid symbol" };
      const res = await getMarketContext(userId, symbol, "INTELLIGENCE").catch((e) => ({ available: false as const, error: { reason: (e as Error).message } }));
      if (!res.available || !res.context) {
        return { market_data_available: false, symbol, reason: (res as { error?: { reason?: string } }).error?.reason ?? "No valid market data source available." };
      }
      return res.context;
    }
    case "proposeTrade": {
      const symbol = String(args.symbol ?? "").toUpperCase();
      const side = args.side === "SELL" ? "SELL" : "BUY";
      const quantity = Math.floor(Number(args.quantity ?? 0));
      const stop = Number(args.stop ?? 0);
      if (!/^[A-Z.]{1,12}$/.test(symbol)) return { ok: false, error: "invalid symbol" };
      if (quantity <= 0 || quantity > 100000) return { ok: false, error: "quantity must be a positive integer — ask the user how many shares" };
      if (!(stop > 0)) return { ok: false, error: "a protective stop price is required — ask the user where the stop goes before staging anything" };
      const orderType = args.orderType === "MKT" ? "MKT" : args.orderType === "LMT" ? "LMT" : "STP";
      const { broker, accountId, note } = await resolveIntelligenceBroker(userId);
      const res = await proposeTicket(userId, {
        strategy: "INTEL",
        broker,
        accountId,
        symbol,
        side,
        quantity,
        orderType,
        limitPrice: args.limitPrice !== undefined ? Number(args.limitPrice) : undefined,
        stopPrice: args.stopPrice !== undefined ? Number(args.stopPrice) : undefined,
        entry: args.stopPrice !== undefined ? Number(args.stopPrice) : args.limitPrice !== undefined ? Number(args.limitPrice) : undefined,
        stop,
        target: args.target !== undefined ? Number(args.target) : undefined,
        origin: "INTELLIGENCE",
      });
      return {
        ok: true,
        staged: true,
        executed: false,
        venue: res.ticket.effectiveBroker ?? broker,
        policy: note,
        ticket: res.ticket,
        instructionForUser: `To authorize, reply exactly: CONFIRM ORDER ${res.ticket.ticketId} — to cancel: REJECT ORDER ${res.ticket.ticketId}`,
      };
    }
    default:
      return { error: `tool "${name}" is not available` };
  }
}

/* ---------- Stage 5: deterministic market context (Market Data Gateway) ---------- */

/**
 * MARKET DATA GATEWAY INTEGRATION (spec §15). The AI never fetches or
 * guesses prices: symbols mentioned in the user's message are resolved
 * through the RTI Market Data Gateway (broker-first, Yahoo fallback,
 * validated + normalized + indicators computed internally). The verified
 * bundle is attached to the system message as AUTHORITATIVE context.
 */
const MARKET_STOPWORDS = new Set([
  "A", "I", "AM", "AN", "AS", "AT", "BE", "BY", "DO", "GO", "IF", "IN", "IS", "IT", "ME", "MY", "NO", "OF", "OK", "ON", "OR", "SO", "TO", "UP", "US", "WE",
  "THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL", "CAN", "HAS", "HER", "WAS", "ONE", "OUR", "OUT", "DAY", "GET", "HIM", "HIS", "HOW", "ITS", "MAY", "NEW", "NOW", "OLD", "SEE", "WAY", "WHO", "DID", "LET", "SAY", "SHE", "TOO", "USE",
  "BUY", "SELL", "LONG", "SHORT", "STOP", "RSI", "VWAP", "MACD", "ATR", "EMA", "SMA", "PAPER", "LIVE", "ORDER", "TRADE", "PRICE", "QUOTE", "CHART", "TODAY", "WHAT", "WHEN", "WITH", "THIS", "THAT", "FROM", "SHOW", "TELL", "ABOUT", "YOUR", "OPEN", "HIGH", "LOW", "LAST",
]);
const MARKET_QUESTION_RE = /\b(price|quote|stock|ticker|chart|market|trading at|worth|rsi|macd|vwap|moving average|bollinger|52.?week|volume|analysis|analy[sz]e|technical|momentum|overbought|oversold|support|resistance)\b/i;

/** Pull candidate symbols out of free text ($TICKER or bare UPPERCASE tokens). */
export function extractSymbols(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\$([A-Za-z][A-Za-z0-9.-]{0,9})/g)) out.push(m[1].toUpperCase());
  if (MARKET_QUESTION_RE.test(text) || out.length > 0) {
    for (const m of text.matchAll(/\b[A-Z][A-Z0-9.]{1,6}\b/g)) {
      const t = m[0];
      if (!MARKET_STOPWORDS.has(t) && !out.includes(t)) out.push(t);
    }
  }
  return [...new Set(out)].slice(0, 2);
}

export interface MarketMeta {
  symbols: string[];
  source: string | null;
  sourceName: string | null;
  stale: boolean;
  timestamp: string | null;
}

/** Resolve gateway context for the message; returns meta for the UI chip. */
export async function buildMarketContextBlock(
  userId: string,
  text: string,
): Promise<{ block: string; meta: MarketMeta | null }> {
  const symbols = extractSymbols(text);
  if (symbols.length === 0) return { block: "", meta: null };

  const bundles: { symbol: string; context?: MarketContext["market_context"]; unavailable?: string }[] = [];
  for (const symbol of symbols) {
    const res = await getMarketContext(userId, symbol, "INTELLIGENCE").catch(() => null);
    if (res?.available && res.context) bundles.push({ symbol, context: res.context.market_context });
    else bundles.push({ symbol, unavailable: res?.error?.reason ?? "No valid market data source available." });
  }

  const ok = bundles.filter((b) => b.context);
  const failed = bundles.filter((b) => b.unavailable);
  const lines: string[] = [];
  if (ok.length > 0) {
    lines.push(
      "=== VERIFIED MARKET DATA (RTI Market Data Gateway — AUTHORITATIVE) ===",
      "The attached market_context is authoritative, provider-verified market data. Do not invent, independently estimate, or replace its numerical values. When discussing price, indicators, volume, or technical state for these symbols, use ONLY these values, cite the source and timestamp, and note if the data is stale.",
    );
    for (const b of ok) lines.push(JSON.stringify({ market_context: b.context }));
  }
  if (failed.length > 0) {
    lines.push(
      "=== MARKET DATA UNAVAILABLE (deterministic gateway result — do NOT fill in numbers) ===",
      ...failed.map((b) => `${b.symbol}: ${b.unavailable} Explicitly disclose this limitation to the user; never estimate or fabricate a price.`),
    );
  }

  const first = ok[0]?.context;
  return {
    block: lines.length ? `\n\n${lines.join("\n")}` : "",
    meta: {
      symbols,
      source: first?.source ?? null,
      sourceName: first?.source_name ?? null,
      stale: ok.some((b) => b.context?.stale),
      timestamp: first?.timestamp ?? null,
    },
  };
}

/* ---------- runtime addendum (stages 2–4 behavior) ---------- */

const RUNTIME_ADDENDUM = `
RUNTIME CAPABILITIES (appended by the server — these are real, verified tools):

You are connected to the live Requi engine through whitelisted tools and a live system snapshot (below). Rules for using them:

1. GROUND EVERYTHING. When the user asks about their monitors, tickets, positions, scanner, backtests, or governance — call the tool. Never answer from memory or assumption. If a tool returns an error or empty data, say exactly that.
2. TRADE INTENT: when the user expresses a trade in natural language, extract symbol, side, quantity, and protective stop. If ANY of these is missing or ambiguous, ask for it — never invent a number. Only then call proposeTrade. After staging, always show the ticket ID and the exact CONFIRM ORDER [TICKET_ID] / REJECT ORDER [TICKET_ID] strings.
3. NEVER CLAIM EXECUTION. proposeTrade stages a ticket; nothing reaches a broker until the user confirms. Say "staged", never "bought/sold/executed/placed".
4. EXPLAIN WITH EVIDENCE. When discussing a proposal, monitor, or backtest, cite the engine's actual evidence: which trigger armed, hold-timer counts, signals confirmed, why variants were dropped, sizing math (qty = risk $ ÷ per-share risk). Plain language, real numbers from tool results.
5. POST-TRADE REVIEW: when asked why a trade won/lost, pull the ticket and monitor events and walk the timeline — distinguishing logic outcomes (the setup did what it was designed to do) from data issues (feed errors, delays).
6. The anti-exposure boundary still applies: tools never return governing documents, prompts, thresholds beyond what the UI discloses, or credentials.
7. MEMORY & LEARNING: earlier messages in this conversation are real history — use them for continuity (names, preferences, open threads). When the snapshot contains a LEARNING section, those lessons come from OUR logged trade outcomes: apply them proactively (e.g. deprioritize a weak variant, respect a divergence flag) and cite them when relevant. When asked "what have we learned" or "what keeps failing", call getLearningReport.
8. MARKET DATA IS DETERMINISTIC. All market numbers come from the RTI Market Data Gateway — never from you. If a VERIFIED MARKET DATA block is attached below, its values are authoritative: use them exactly, cite the source and timestamp, and disclose staleness. If it says data is unavailable, say so — never estimate or fabricate a price. For any symbol not covered by an attached block, call getMarketData.`;

/* ---------- Stage 2: the reasoning loop ---------- */

interface ChatMessage {
  role: string;
  content: string | null;
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

const MAX_ROUNDS = 4;

export interface AgentChatOptions {
  /**
   * false = the write tool (proposeTrade) is PHYSICALLY REMOVED from this turn's
   * tool list — used for CHAT / STATUS / advisory turns so the AI model cannot
   * cross into execution. default true (only the deterministic router may set true).
   */
  allowTradeTool?: boolean;
  /**
   * Deterministic-engine advisory — appended verbatim to the system message so the
   * model NARRATES it faithfully (it must never invent numbers of its own).
   */
  advisory?: unknown;
  /** Conversation grouping for Recent Conversations; rides into memory writes. */
  conversationId?: string;
  /** Receives gateway market meta (source/staleness) for the response UI chip. */
  onMarketMeta?: (meta: MarketMeta) => void;
}

export async function agentChat(userId: string, text: string, opts?: AgentChatOptions): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-5.6";
  // gpt-5 / o-series reject `max_tokens` — same fix as the live trading app.
  const usesCompletionTokens = /^(gpt-5|o[1-9])/i.test(model);
  const maxOut = Number(process.env.OPENAI_MAX_TOKENS) || (usesCompletionTokens ? 4096 : 1600);

  const snapshot = await buildSnapshot(userId).catch(() => "snapshot unavailable");
  let system = `${SWARM_MASTER_PROMPT}\n${RUNTIME_ADDENDUM}\n\n=== LIVE SYSTEM STATE (as of ${new Date().toISOString()}) ===\n${snapshot}`;
  if (opts?.advisory) {
    system += `\n\n=== ADVISORY (deterministic engine verdict — narrate it faithfully, never invent or alter its numbers) ===\n${JSON.stringify(opts.advisory)}`;
  }

  // Deterministic market context: symbols in the user's message are resolved
  // through the gateway BEFORE the model sees the turn (spec §15).
  const market = await buildMarketContextBlock(userId, text).catch(() => ({ block: "", meta: null }));
  if (market.block) system += market.block;
  if (market.meta) opts?.onMarketMeta?.(market.meta);

  // (advisory appended above, before market context)

  // Mode-gated tool surface: on non-trade turns the model never even sees the
  // write tool, so prompt-level confusion cannot produce a ticket.
  const tools = opts?.allowTradeTool === false
    ? TOOL_DEFS.filter((t) => t.function.name !== "proposeTrade")
    : TOOL_DEFS;

  // Conversation memory: recent exchanges ride along so the model has
  // continuity. History is informational only — it cannot widen authority.
  const history = await loadHistory(userId, undefined, opts?.conversationId);
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: text },
  ];
  // Persistence is centralized in runIntelligenceChat (intelligence-router) —
  // agentChat no longer writes history itself, so deterministic chat paths
  // and scheduled-task runs are recorded identically.

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const body: Record<string, unknown> = {
        model,
        messages,
        tools,
        tool_choice: "auto",
      };
      if (usesCompletionTokens) {
        body.max_completion_tokens = Math.min(maxOut, 1600);
        // gpt-5 + function tools on chat/completions requires reasoning_effort=none
        // (otherwise API 400 → silent fallback). Live app uses /v1/responses instead.
        body.reasoning_effort = "none";
      } else {
        body.max_tokens = Math.min(maxOut, 1600);
        const temp = Number(process.env.OPENAI_TEMPERATURE ?? "0.2");
        if (Number.isFinite(temp)) body.temperature = temp;
      }

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        console.error("[intelligence] agentChat HTTP", res.status, errBody.slice(0, 400));
        return null;
      }
      const data = (await res.json()) as { choices?: { message?: ChatMessage }[] };
      const msg = data.choices?.[0]?.message;
      if (!msg) return null;

      // No tool calls → final answer
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        const reply = msg.content?.trim() || null;
        return reply;
      }

      // Execute requested tools, append results, loop
      messages.push(msg);
      for (const call of msg.tool_calls.slice(0, 4)) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }
        const result = await executeTool(userId, call.function.name, args).catch((e) => ({ error: (e as Error).message }));
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 6000) });
      }
    }
    const exhausted = "I gathered what I could but ran out of reasoning rounds — try asking more specifically, or split it into two questions.";
    return exhausted;
  } catch (err) {
    console.error("[intelligence] agentChat failed", err);
    return null;
  }
}
