/**
 * Step 4 — Lucia narrates deterministic engine JSON; code owns every number.
 * Fallback: template prose (no markdown report cards) when LLM is unavailable.
 */
import type { ConsoleResearchDepth } from "./market-intent";
import type { GeneralMarketAnalysis } from "./general-market";
import type {
  MarketMoversResult,
  StockCandidate,
  StockDiscoveryResult,
} from "./stock-discovery";
import { luciaPromptChat } from "./lucia-prompt";
import { agentChat } from "./tools";

export type EngineNarrationKind = "stock_discovery" | "market_movers" | "general_market";

export type EngineCandidatePayload = {
  symbol: string;
  score: number | null;
  risk: string | null;
  price: number | null;
  dailyChangePct: number | null;
  relativeStrengthVsSpy: number | null;
  rsi14: number | null;
  relativeVolume: number | null;
  sectorLabel: string | null;
  reasons: string[];
  source: string | null;
  timestamp: string | null;
};

export type EngineNarrationPayload = {
  kind: EngineNarrationKind;
  userPrompt: string;
  depth?: ConsoleResearchDepth;
  regime: string;
  marketHealth: number;
  asOf: string;
  scanned?: number;
  focusSectors?: Array<{ symbol: string; label: string; dailyChangePct: number | null }>;
  candidates?: EngineCandidatePayload[];
  gainers?: EngineCandidatePayload[];
  losers?: EngineCandidatePayload[];
  indexes?: Array<{
    symbol: string;
    price: number | null;
    dailyChangePct: number | null;
    source: string | null;
    timestamp: string | null;
  }>;
  modelFields?: {
    probability: "WAIT";
    expectedValue: "WAIT";
    reosErs: "WAIT";
  };
  missingFields?: string[];
  sourceName: string;
  dataSource: string | null;
  dataTimestamp: string | null;
};

function fmtPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "n/a";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function fmtPrice(price: number | null): string {
  if (price === null || !Number.isFinite(price)) return "n/a";
  return `$${(Math.round(price * 100) / 100).toFixed(2)}`;
}

function round2(n: number | null): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function regimeLabel(regime: string): string {
  return regime.replace(/_/g, " ").toLowerCase();
}

function serializeCandidate(c: StockCandidate): EngineCandidatePayload {
  return {
    symbol: c.symbol,
    score: c.score,
    risk: c.risk,
    price: round2(c.price),
    dailyChangePct: round2(c.dailyChangePct),
    relativeStrengthVsSpy: round2(c.relativeStrengthVsSpy),
    rsi14: round2(c.rsi14),
    relativeVolume: round2(c.relativeVolume),
    sectorLabel: c.sectorLabel,
    reasons: c.reasons.slice(0, 3),
    source: c.source,
    timestamp: c.timestamp,
  };
}

export function buildDiscoveryNarrationPayload(
  text: string,
  analysis: GeneralMarketAnalysis,
  discovery: StockDiscoveryResult,
  sourceName: string,
  depth?: ConsoleResearchDepth,
): EngineNarrationPayload {
  const top = discovery.candidates[0];
  return {
    kind: "stock_discovery",
    userPrompt: text,
    depth,
    regime: discovery.regime,
    marketHealth: discovery.marketHealth,
    asOf: discovery.asOf,
    scanned: discovery.scanned,
    focusSectors: discovery.focusSectors,
    candidates: discovery.candidates.map(serializeCandidate),
    modelFields:
      depth === "quant"
        ? { probability: "WAIT", expectedValue: "WAIT", reosErs: "WAIT" }
        : undefined,
    missingFields: discovery.missingFields.length ? discovery.missingFields : undefined,
    sourceName,
    dataSource: top?.source ?? analysis.indexes.find((i) => i.available)?.source ?? null,
    dataTimestamp: top?.timestamp ?? analysis.asOf,
  };
}

export function buildMoversNarrationPayload(
  text: string,
  analysis: GeneralMarketAnalysis,
  movers: MarketMoversResult,
  sourceName: string,
): EngineNarrationPayload {
  const sample = movers.gainers[0] ?? movers.losers[0];
  return {
    kind: "market_movers",
    userPrompt: text,
    regime: analysis.regime,
    marketHealth: analysis.marketHealth,
    asOf: movers.asOf,
    scanned: movers.scanned,
    gainers: movers.gainers.map(serializeCandidate),
    losers: movers.losers.map(serializeCandidate),
    indexes: analysis.indexes
      .filter((i) => i.available)
      .map((i) => ({
        symbol: i.symbol,
        price: i.price,
        dailyChangePct: i.dailyChangePct,
        source: i.source,
        timestamp: i.timestamp,
      })),
    sourceName,
    dataSource: sample?.source ?? null,
    dataTimestamp: sample?.timestamp ?? movers.asOf,
  };
}

export function buildGeneralMarketNarrationPayload(
  text: string,
  analysis: GeneralMarketAnalysis,
  sourceName: string,
): EngineNarrationPayload {
  const first = analysis.indexes.find((i) => i.available);
  return {
    kind: "general_market",
    userPrompt: text,
    regime: analysis.regime,
    marketHealth: analysis.marketHealth,
    asOf: analysis.asOf,
    indexes: analysis.indexes.map((i) => ({
      symbol: i.symbol,
      price: i.price,
      dailyChangePct: i.dailyChangePct,
      source: i.source,
      timestamp: i.timestamp,
    })),
    sourceName,
    dataSource: first?.source ?? null,
    dataTimestamp: first?.timestamp ?? analysis.asOf,
  };
}

export function engineNarrationEnabled(): boolean {
  return process.env.INTELLIGENCE_ENGINE_NARRATION !== "off";
}

export function llmNarrationEnabled(): boolean {
  if (!engineNarrationEnabled()) return false;
  if (process.env.INTELLIGENCE_ENGINE_NARRATION === "code-only") return false;
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function candidateLine(c: EngineCandidatePayload, brief = false): string {
  const parts = [
    `**${c.symbol}**`,
    c.score !== null ? `${c.score}/100` : null,
    c.risk ? `${c.risk.toLowerCase()} risk` : null,
    `${fmtPrice(c.price)} (${fmtPct(c.dailyChangePct)})`,
  ].filter(Boolean);
  if (brief) return parts.join(" · ");
  const extra = [
    c.relativeStrengthVsSpy !== null
      ? `vs SPY ${c.relativeStrengthVsSpy >= 0 ? "+" : ""}${c.relativeStrengthVsSpy.toFixed(2)}%`
      : null,
    c.rsi14 !== null ? `RSI ${c.rsi14.toFixed(1)}` : null,
    c.relativeVolume !== null ? `RVOL ${c.relativeVolume.toFixed(2)}x` : null,
  ].filter(Boolean);
  return extra.length ? `${parts.join(" · ")} (${extra.join(", ")})` : parts.join(" · ");
}

/** Deterministic colleague-style prose — no markdown report cards. */
export function formatConversationalEngineReply(payload: EngineNarrationPayload): string {
  const regime = regimeLabel(payload.regime);
  const sourceLine = payload.dataSource
    ? `_Data: ${payload.dataSource}${payload.dataTimestamp ? ` · ${payload.dataTimestamp}` : ""}_`
    : "";

  if (payload.kind === "stock_discovery") {
    const top = payload.candidates?.[0];
    const sectors =
      payload.focusSectors
        ?.slice(0, 2)
        .map((s) => `${s.label} (${s.symbol} ${fmtPct(s.dailyChangePct)})`)
        .join(", ") ?? "";

    if (!top) {
      return [
        `I ran the live US scan in a ${regime} tape (health ${payload.marketHealth}/100), but nothing in the liquid universe passed filters this pass.`,
        "",
        "Status is **WAIT** on qualified names — I did not invent any tickers.",
        sourceLine,
      ]
        .filter(Boolean)
        .join("\n");
    }

    if (payload.depth === "simple") {
      const backup = payload.candidates?.[1];
      const lines = [
        `Today's US tape looks ${regime} (health ${payload.marketHealth}/100). One name the engine liked is ${candidateLine(top)}.`,
      ];
      if (top.reasons.length) lines.push(`Why it showed up: ${top.reasons.slice(0, 2).join("; ")}.`);
      if (sectors) lines.push(`Sector context: ${sectors}.`);
      if (backup) lines.push(`If you want a second look, ${candidateLine(backup, true)} is next on the list.`);
      lines.push(
        "",
        "This is research, not a buy order — no brokerage account is required for this scan.",
        sourceLine,
      );
      return lines.filter(Boolean).join("\n");
    }

    const names = payload.candidates?.slice(0, 5) ?? [];
    const lead = names[0]!;
    const rest = names.slice(1).map((c) => candidateLine(c, true)).join("; ");

    const lines = [
      `The US market is in a ${regime} regime today (health ${payload.marketHealth}/100). I scanned ${payload.scanned ?? names.length} liquid names${sectors ? ` with ${sectors} leading` : ""}.`,
      "",
      `Top setup on this pass: ${candidateLine(lead)}.${top.reasons.length ? ` ${top.reasons[0]}.` : ""}`,
    ];
    if (rest) lines.push(`Also on the board: ${rest}.`);
    if (payload.depth === "quant") {
      lines.push(
        "",
        "This is an engine research ranking, not a trade signal. Calibrated win-rate, expected value, and REOS/ERS were **not** run on this pass — only the discovery score, risk band, RSI, volume, and vs-SPY fields above.",
      );
    } else {
      lines.push("", "Research ranking only — not a trade authorization.");
    }
    lines.push("", sourceLine);
    return lines.filter(Boolean).join("\n");
  }

  if (payload.kind === "market_movers") {
    const g = payload.gainers?.slice(0, 3).map((c) => candidateLine(c, true)).join("; ") || "none verified";
    const l = payload.losers?.slice(0, 3).map((c) => candidateLine(c, true)).join("; ") || "none verified";
    const idx =
      payload.indexes
        ?.filter((i) => i.dailyChangePct !== null)
        .map((i) => `${i.symbol} ${fmtPct(i.dailyChangePct)}`)
        .join(" · ") ?? "";
    return [
      `Here's what's moving in US liquid names — tape is ${regime} (health ${payload.marketHealth}/100).`,
      "",
      `Biggest gainers: ${g}.`,
      `Biggest decliners: ${l}.`,
      idx ? `Index context: ${idx}.` : "",
      "",
      "Research context only — not a buy list.",
      sourceLine,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const idxLines =
    payload.indexes
      ?.filter((i) => i.dailyChangePct !== null)
      .map((i) => `${i.symbol} ${fmtPrice(i.price)} (${fmtPct(i.dailyChangePct)})`)
      .join(", ") ?? "index quotes unavailable";
  return [
    `Here's the US market snapshot: ${idxLines}.`,
    `Regime: ${regime} · health ${payload.marketHealth}/100.`,
    "",
    "General market research does not require a connected portfolio or brokerage.",
    sourceLine,
  ]
    .filter(Boolean)
    .join("\n");
}

const PROTOCOL_DUMP_RE =
  /^(#{1,3}\s|###\s|\*\*Quantitative US scan|\*\*Stock discovery|\*\*US market snapshot|Ranked candidates \(top|Model fields on this scan|RESEARCH ONLY \/ NO TRADE|BLOCKED|UNVERIFIED)/im;

export function looksLikeProtocolDump(text: string): boolean {
  return PROTOCOL_DUMP_RE.test(text.trim());
}

function buildNarrationDeveloperBlock(payload: EngineNarrationPayload): string {
  return [
    "=== DETERMINISTIC ENGINE OUTPUT (authoritative — narrate conversationally) ===",
    "The numbers below are final. Do not alter, round differently, or add symbols not listed.",
    JSON.stringify(payload, null, 2),
    "",
    "NARRATION RULES:",
    "- Speak as Lucia in a warm, colleague tone — 2–4 short paragraphs unless the user asked for quant detail.",
    "- Use ONLY symbols and numbers from the JSON above.",
    "- Do NOT output markdown tables, ### headers, numbered gate checklists, or BLOCKED/UNVERIFIED templates.",
    "- Say this is research context, not a trade authorization.",
    "- For WAIT model fields, state honestly that probability / EV / REOS / ERS were not calculated on this pass.",
    "- Mention the data source once at the end; do not ask for portfolio, charts, or broker L1 for general research.",
  ].join("\n");
}

export async function narrateEngineOutput(
  userId: string,
  userText: string,
  result: { reply: string; enginePayload?: EngineNarrationPayload },
  opts?: { conversationId?: string },
): Promise<string> {
  const payload = result.enginePayload;
  if (!payload) return result.reply;

  const codeFallback = () => formatConversationalEngineReply(payload);

  if (!llmNarrationEnabled()) return codeFallback();

  const developerExtra = buildNarrationDeveloperBlock(payload);

  const lucia = await luciaPromptChat(userId, userText, {
    conversationId: opts?.conversationId,
    injectMarket: false,
    developerExtra,
  }).catch(() => null);

  if (lucia?.reply && !looksLikeProtocolDump(lucia.reply)) {
    return lucia.reply.trim();
  }

  const swarm = await agentChat(userId, userText, {
    allowTradeTool: false,
    skipMarketContext: true,
    developerExtra,
    conversationId: opts?.conversationId,
  }).catch(() => null);

  if (swarm && !looksLikeProtocolDump(swarm)) {
    return swarm.trim();
  }

  return codeFallback();
}
