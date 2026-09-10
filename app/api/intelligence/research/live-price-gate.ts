/**
 * Requi Live Price-Confirmation Gate (client protocol §14).
 *
 * Composes existing gateway snapshot + indicators + halt/news into a structured
 * honesty report. Never invents bid/ask/depth. Never claims BUY/PASS when
 * execution-critical fields are missing → WAIT or BLOCKED.
 */
import { getSnapshot, getIndicators, getHistory } from "../../marketdata/gateway/gateway";
import type { GatewayIndicators } from "../../marketdata/gateway/indicators";
import type { OhlcvBar } from "../../marketdata/gateway/types";
import { fetchNasdaqHaltStatus } from "../../intelligence-data/providers/nasdaq-halts";
import { fetchNews } from "../../intelligence-data/providers/news";
import { fetchEdgarFilings } from "../../intelligence-data/providers/edgar";
import { resolveSymbolsFromText } from "../../intelligence-data/symbol-resolver";

const ET = "America/New_York";
const OR_MINUTES = 15;
const PREMARKET_START_MIN = 4 * 60; // 04:00 ET
const RTH_OPEN_MIN = 9 * 60 + 30; // 09:30 ET
const RTH_OR_END_MIN = RTH_OPEN_MIN + OR_MINUTES; // 09:45 ET

export type LiveGateFieldStatus = "AVAILABLE" | "UNAVAILABLE";

export type LiveGateField = {
  field: string;
  status: LiveGateFieldStatus;
  value: string;
  owningApi: string;
};

export type LiveGateClassification = "WAIT" | "BLOCKED";

export type SessionRangeMetrics = {
  orh: number | null;
  orl: number | null;
  orBars: number;
  premarketHigh: number | null;
  premarketLow: number | null;
  premarketBars: number;
};

export type LiveGateResult = {
  symbol: string;
  classification: LiveGateClassification;
  reason: string;
  requiredNext: string;
  fields: LiveGateField[];
  availableCount: number;
  totalCount: number;
  priceVsVwap: "ABOVE" | "BELOW" | "AT" | "UNAVAILABLE";
  orStatus: "ABOVE_ORH" | "BELOW_ORL" | "INSIDE_OR" | "OR_FORMING" | "UNAVAILABLE";
  reportMarkdown: string;
};

/** Narrow intent — do not steal ordinary price questions. */
export function isLivePriceConfirmationQuery(text: string): boolean {
  const lower = text.toLowerCase();
  if (
    /\blive\s+price[-\s]?confirmation\s+gate\b/.test(lower) ||
    /\brequi\s+live\s+price[-\s]?confirmation\b/.test(lower) ||
    /\blive\s+price[-\s]?confirmation\b/.test(lower)
  ) {
    return true;
  }
  if (/\blive\s+gate\b/.test(lower)) {
    if (/\b(evaluate|confirm|post[-\s]?earnings|after\s+earnings|price|ticker|symbol)\b/.test(lower)) {
      return true;
    }
    // Bare "live gate on TICKER"
    if (/\bon\s+[A-Za-z]{1,5}\b/.test(lower) || /\$[A-Za-z]/.test(lower)) return true;
  }
  if (
    /\bprice\s+confirmation\s+gate\b/.test(lower) ||
    /\bevaluate\b[\s\S]{0,80}\b(live\s+gate|price\s+confirmation|post[-\s]?earnings\s+candidate)\b/.test(lower)
  ) {
    return true;
  }
  if (
    /\bpost[-\s]?earnings\s+candidate\b/.test(lower) &&
    /\b(gate|vwap|opening\s+range|bid|ask|spread)\b/.test(lower)
  ) {
    return true;
  }
  return false;
}

function etMinutesSinceMidnight(epochMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(epochMs));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/**
 * Opening range = high/low of first N RTH minutes (default 15).
 * Premarket = high/low of bars from 04:00 ET until RTH open.
 */
export function computeSessionRangeMetrics(
  bars: OhlcvBar[],
  rangeMinutes = OR_MINUTES,
): SessionRangeMetrics {
  const orEnd = RTH_OPEN_MIN + rangeMinutes;
  const pre: OhlcvBar[] = [];
  const orBars: OhlcvBar[] = [];
  for (const b of bars) {
    const m = etMinutesSinceMidnight(b.t);
    if (m >= PREMARKET_START_MIN && m < RTH_OPEN_MIN) pre.push(b);
    else if (m >= RTH_OPEN_MIN && m < orEnd) orBars.push(b);
  }

  const orh = orBars.length ? Math.max(...orBars.map((b) => b.h)) : null;
  const orl = orBars.length ? Math.min(...orBars.map((b) => b.l)) : null;
  const premarketHigh = pre.length ? Math.max(...pre.map((b) => b.h)) : null;
  const premarketLow = pre.length ? Math.min(...pre.map((b) => b.l)) : null;

  return {
    orh: Number.isFinite(orh as number) ? orh : null,
    orl: Number.isFinite(orl as number) ? orl : null,
    orBars: orBars.length,
    premarketHigh: Number.isFinite(premarketHigh as number) ? premarketHigh : null,
    premarketLow: Number.isFinite(premarketLow as number) ? premarketLow : null,
    premarketBars: pre.length,
  };
}

export function classifyPriceVsVwap(
  price: number | null,
  vwap: number | null,
): LiveGateResult["priceVsVwap"] {
  if (price === null || vwap === null || !Number.isFinite(price) || !Number.isFinite(vwap)) {
    return "UNAVAILABLE";
  }
  const eps = Math.max(0.0001, Math.abs(vwap) * 1e-6);
  if (Math.abs(price - vwap) <= eps) return "AT";
  return price > vwap ? "ABOVE" : "BELOW";
}

export function classifyOrStatus(
  price: number | null,
  ranges: SessionRangeMetrics,
): LiveGateResult["orStatus"] {
  if (price === null || !Number.isFinite(price)) return "UNAVAILABLE";
  if (ranges.orBars < OR_MINUTES || ranges.orh === null || ranges.orl === null) {
    return ranges.orBars > 0 ? "OR_FORMING" : "UNAVAILABLE";
  }
  if (price > ranges.orh) return "ABOVE_ORH";
  if (price < ranges.orl) return "BELOW_ORL";
  return "INSIDE_OR";
}

function fmtNum(v: number | null | undefined, dp = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toFixed(dp);
}

function pushField(
  fields: LiveGateField[],
  field: string,
  status: LiveGateFieldStatus,
  value: string,
  owningApi: string,
) {
  fields.push({ field, status, value, owningApi });
}

function buildReport(result: Omit<LiveGateResult, "reportMarkdown">): string {
  const lines = [
    "**REQUI LIVE PRICE-CONFIRMATION GATE**",
    "",
    `- **Ticker:** ${result.symbol}`,
    `- **Classification:** **${result.classification}**`,
    `- **Data completeness:** ${result.availableCount} / ${result.totalCount} required fields available`,
    `- **Price vs VWAP:** ${result.priceVsVwap}`,
    `- **Opening-range status:** ${result.orStatus}`,
    "",
    "| Field | Status | Value | Owning API / connection |",
    "|-------|--------|-------|-------------------------|",
  ];
  for (const f of result.fields) {
    lines.push(`| ${f.field} | ${f.status} | ${f.value.replace(/\|/g, "/")} | ${f.owningApi} |`);
  }
  lines.push(
    "",
    "### Critical gates",
    `- Bid/Ask/Spread: **UNAVAILABLE** → cannot confirm executable entry`,
    `- VWAP confirmation: **${result.priceVsVwap === "UNAVAILABLE" ? "WAIT" : result.priceVsVwap}**`,
    `- Opening range: **${result.orStatus}**`,
    `- Market depth / slippage / EV / R:R: **NOT CALCULABLE** without broker L1 + risk engine`,
    "",
    `**Reason:** ${result.reason}`,
    "",
    `**Required next connection:** ${result.requiredNext}`,
    "",
    "This gate does **not** authorize a BUY. Client protocol §14 requires bid/ask/spread, VWAP/OR confirmation, and portfolio rules before a pass.",
  );
  return lines.join("\n");
}

async function evaluateSymbol(userId: string, symbol: string): Promise<LiveGateResult> {
  const fields: LiveGateField[] = [];
  const snap = await getSnapshot(userId, symbol);
  const indRes = await getIndicators(userId, symbol);
  const intraday = await getHistory(userId, symbol, "1d", "1m");
  const halt = await fetchNasdaqHaltStatus(symbol);
  const news = await fetchNews(symbol).catch(() => null);
  const edgar = await fetchEdgarFilings(symbol).catch(() => null);

  const ind: GatewayIndicators | null = indRes.indicators;
  const price = snap.market_data_available ? snap.price : null;
  const sourceName = snap.market_data_available ? snap.source_name : "Market Data Gateway";
  const ranges = computeSessionRangeMetrics(intraday.available ? intraday.bars : []);

  // Price / session / timestamp
  if (snap.market_data_available) {
    pushField(fields, "current_price", "AVAILABLE", `$${fmtNum(snap.price)}`, sourceName);
    pushField(fields, "market_session", "AVAILABLE", snap.market_session, "Market session service (NYSE calendar)");
    pushField(fields, "timestamp", "AVAILABLE", snap.timestamp, sourceName);
    if (ind?.daily_change != null) {
      pushField(
        fields,
        "daily_change",
        "AVAILABLE",
        `${fmtNum(ind.daily_change)} (${fmtNum(ind.daily_change_pct)}%)`,
        "Market Data Gateway indicators",
      );
    } else {
      pushField(fields, "daily_change", "UNAVAILABLE", "—", "Market Data Gateway indicators");
    }
  } else {
    pushField(fields, "current_price", "UNAVAILABLE", "—", "Market Data Gateway");
    pushField(fields, "market_session", "UNAVAILABLE", "—", "Market session service (NYSE calendar)");
    pushField(fields, "timestamp", "UNAVAILABLE", "—", "Market Data Gateway");
    pushField(fields, "daily_change", "UNAVAILABLE", "—", "Market Data Gateway indicators");
  }

  // Broker microstructure — Phase 3
  pushField(fields, "bid", "UNAVAILABLE", "—", "BrokerProvider (L1 quote)");
  pushField(fields, "ask", "UNAVAILABLE", "—", "BrokerProvider (L1 quote)");
  pushField(fields, "spread_pct", "UNAVAILABLE", "—", "BrokerProvider (L1 quote)");
  pushField(fields, "market_depth", "UNAVAILABLE", "—", "BrokerProvider (L2)");

  // Tape indicators
  const tape: Array<[string, number | null | undefined, number, string]> = [
    ["rsi_14", ind?.rsi_14, 2, "Market Data Gateway indicators (internal calc)"],
    ["atr_14", ind?.atr_14, 4, "Market Data Gateway indicators (internal calc)"],
    ["vwap", ind?.vwap, 4, "Market Data Gateway indicators (internal calc)"],
    ["relative_volume", ind?.relative_volume, 2, "Market Data Gateway indicators (internal calc)"],
    ["ema_20", ind?.ema_20, 4, "Market Data Gateway indicators (internal calc)"],
    ["ema_50", ind?.ema_50, 4, "Market Data Gateway indicators (internal calc)"],
  ];
  for (const [name, val, dp, api] of tape) {
    if (val !== null && val !== undefined && Number.isFinite(val)) {
      pushField(fields, name, "AVAILABLE", fmtNum(val, dp), api);
    } else {
      pushField(fields, name, "UNAVAILABLE", "—", api);
    }
  }

  // Opening range / premarket
  if (ranges.orh !== null && ranges.orl !== null && ranges.orBars >= OR_MINUTES) {
    pushField(
      fields,
      "opening_range_high",
      "AVAILABLE",
      fmtNum(ranges.orh),
      "Intraday OHLCV (first 15 RTH minutes)",
    );
    pushField(
      fields,
      "opening_range_low",
      "AVAILABLE",
      fmtNum(ranges.orl),
      "Intraday OHLCV (first 15 RTH minutes)",
    );
  } else if (ranges.orBars > 0) {
    pushField(
      fields,
      "opening_range_high",
      "UNAVAILABLE",
      `forming (${ranges.orBars}/${OR_MINUTES} bars)`,
      "Intraday OHLCV (first 15 RTH minutes)",
    );
    pushField(
      fields,
      "opening_range_low",
      "UNAVAILABLE",
      `forming (${ranges.orBars}/${OR_MINUTES} bars)`,
      "Intraday OHLCV (first 15 RTH minutes)",
    );
  } else {
    pushField(fields, "opening_range_high", "UNAVAILABLE", "—", "Intraday OHLCV (first 15 RTH minutes)");
    pushField(fields, "opening_range_low", "UNAVAILABLE", "—", "Intraday OHLCV (first 15 RTH minutes)");
  }

  if (ranges.premarketHigh !== null && ranges.premarketLow !== null) {
    pushField(
      fields,
      "premarket_high",
      "AVAILABLE",
      fmtNum(ranges.premarketHigh),
      "Intraday OHLCV (04:00–09:30 ET)",
    );
    pushField(
      fields,
      "premarket_low",
      "AVAILABLE",
      fmtNum(ranges.premarketLow),
      "Intraday OHLCV (04:00–09:30 ET)",
    );
  } else {
    pushField(fields, "premarket_high", "UNAVAILABLE", "—", "Intraday OHLCV (04:00–09:30 ET)");
    pushField(fields, "premarket_low", "UNAVAILABLE", "—", "Intraday OHLCV (04:00–09:30 ET)");
  }

  // Halt
  if (halt.available) {
    pushField(
      fields,
      "trading_halt",
      "AVAILABLE",
      halt.halted ? `HALTED — ${halt.reason ?? "see feed"}` : "Not halted (Nasdaq halt RSS)",
      halt.source,
    );
  } else {
    pushField(fields, "trading_halt", "UNAVAILABLE", halt.error ?? "—", halt.source);
  }

  // News / filings (material context — not EMA)
  const headlines = news?.available && news.payload?.headlines?.length
    ? news.payload.headlines.slice(0, 3).map((h) => h.title).join("; ")
    : null;
  if (headlines) {
    pushField(fields, "material_news", "AVAILABLE", headlines.slice(0, 180), news?.source ?? "News providers");
  } else {
    pushField(fields, "material_news", "UNAVAILABLE", "—", "Google News RSS / Yahoo news");
  }

  const filings = edgar?.available && Array.isArray(edgar.payload) && edgar.payload.length
    ? edgar.payload.slice(0, 3).map((f) => f.form).join(", ")
    : null;
  if (filings) {
    pushField(fields, "latest_sec_filings", "AVAILABLE", filings, "SEC EDGAR");
  } else {
    pushField(fields, "latest_sec_filings", "UNAVAILABLE", "—", "SEC EDGAR");
  }

  // Sector / benchmark — not wired as Live Gate inputs yet
  pushField(fields, "sector_direction", "UNAVAILABLE", "—", "Sector ETF relative strength — not wired");
  pushField(fields, "benchmark_direction", "UNAVAILABLE", "—", "Index/benchmark relative strength — not wired");

  const priceVsVwap = classifyPriceVsVwap(price, ind?.vwap ?? null);
  const orStatus = classifyOrStatus(price, ranges);

  const availableCount = fields.filter((f) => f.status === "AVAILABLE").length;
  const totalCount = fields.length;

  let classification: LiveGateClassification = "WAIT";
  let reason =
    "Execution-critical microstructure (bid/ask/spread/depth) is unavailable from BrokerProvider. Public/reference quotes cannot satisfy client §14 tradability checks.";
  let requiredNext = "Broker L1 quote (bid/ask/spread); then L2 depth for slippage checks";

  if (halt.available && halt.halted) {
    classification = "BLOCKED";
    reason = `Active trading halt on Nasdaq halt feed${halt.reason ? `: ${halt.reason}` : ""}.`;
    requiredNext = "Wait for halt resumption + re-run Live Gate";
  } else if (!snap.market_data_available) {
    classification = "BLOCKED";
    reason = "No verified market snapshot available from the Market Data Gateway.";
    requiredNext = "Restore Yahoo/broker market data connectivity";
  } else {
    // Always WAIT while bid/ask missing — never PASS in Rev1 free stack
    classification = "WAIT";
    const extras: string[] = [];
    if (priceVsVwap === "UNAVAILABLE") extras.push("VWAP unavailable");
    if (orStatus === "UNAVAILABLE" || orStatus === "OR_FORMING") extras.push("opening range not confirmed");
    if (extras.length) {
      reason += ` Also: ${extras.join("; ")}.`;
    }
  }

  const partial = {
    symbol: symbol.toUpperCase(),
    classification,
    reason,
    requiredNext,
    fields,
    availableCount,
    totalCount,
    priceVsVwap,
    orStatus,
  };
  return { ...partial, reportMarkdown: buildReport(partial) };
}

export async function runLivePriceConfirmationGate(
  userId: string,
  text: string,
): Promise<{ reply: string; symbols: string[]; meta: { source: string | null; sourceName: string | null; stale: boolean; timestamp: string | null } } | null> {
  if (!isLivePriceConfirmationQuery(text)) return null;

  const symbols = resolveSymbolsFromText(text);
  if (!symbols.length) {
    return {
      symbols: [],
      reply: [
        "**REQUI LIVE PRICE-CONFIRMATION GATE**",
        "",
        "A Live Price-Confirmation Gate request was detected, but **no ticker** could be resolved.",
        "",
        "Example: `Evaluate POST using the Requi Live Price-Confirmation Gate.`",
      ].join("\n"),
      meta: { source: null, sourceName: null, stale: false, timestamp: null },
    };
  }

  const target = symbols[0]!;
  const result = await evaluateSymbol(userId, target);
  return {
    symbols: [result.symbol],
    reply: result.reportMarkdown,
    meta: {
      source: "gateway",
      sourceName: "Live Price-Confirmation Gate (gateway + indicators)",
      stale: false,
      timestamp: new Date().toISOString(),
    },
  };
}
