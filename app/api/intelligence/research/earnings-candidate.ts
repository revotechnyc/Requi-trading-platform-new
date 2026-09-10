/**
 * Revision 1 research runner — Quarterly Earnings Candidate Selection (partial).
 * Uses only verified retrieved data. Missing fields → unavailable / WAIT / BLOCKED
 * with owning API named. Never invents numbers.
 */
import { fetchEarnings } from "../../intelligence-data/providers/earnings";
import {
  fetchHistoricalEarnings,
  summarizeBeatHistory,
  type HistoricalEarningsResult,
} from "../../intelligence-data/providers/earnings-history";
import { getSnapshot, getIndicators } from "../../marketdata/gateway/gateway";
import { fetchEdgarFilings } from "../../intelligence-data/providers/edgar";
import { fetchSecCompanyFacts } from "../../intelligence-data/providers/edgar-facts";
import { fetchAlphaVantageOverview, sanitizeProviderError } from "../../intelligence-data/providers/alpha-vantage";
import { fetchFredMacroBackdrop, formatFredMacroBrief } from "../../intelligence-data/providers/fred";
import { fetchNasdaqHaltStatus } from "../../intelligence-data/providers/nasdaq-halts";
import { fetchEstimateRevisions, formatRevisionBrief } from "../../intelligence-data/providers/estimates";
import { fetchImpliedMove } from "../../intelligence-data/providers/massive-options";
import { fetchEdgarGuidance } from "../../intelligence-data/providers/edgar-guidance";
import { resolveSymbolsFromText } from "../../intelligence-data/symbol-resolver";
import { fetchEarningsCalendarForDate, resolveEarningsCalendarDate } from "../../intelligence-data/earnings-day";
import { runEventStudy } from "./event-study";
import { runPeerReadThrough } from "./peer-read-through";
import { classifyBaseReset } from "./base-reset";
import { getDataProviderMode } from "../../intelligence-data/providers/mode";

const RESEARCH_TOP_N = 5;
const SCREEN_HORIZON_DAYS = 7;
/** Cap history fetches to stay within free-tier rate limits. */
const SCREEN_POOL_MAX = 20;

export type ScreenCandidate = {
  symbol: string;
  reportDate: string;
  reportTime: string;
  beatRate: number | null;
  avgSurprisePct: number | null;
  quarters: number;
  screenScore: number;
};

function addCalendarDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = new Date(Date.UTC(y!, m! - 1, d!, 17, 0, 0));
  base.setUTCDate(base.getUTCDate() + delta);
  return base.toISOString().slice(0, 10);
}

export function screenScoreFromHistory(
  beatRate: number | null,
  avgSurprisePct: number | null,
  quarters: number,
): number {
  const br = beatRate ?? 0;
  const sur = avgSurprisePct ?? 0;
  return br + Math.max(-50, Math.min(50, sur)) * 0.35 + Math.min(quarters, 8) * 0.5;
}

/** Rank screen pool: beat rate → avg surprise → quarters → symbol. */
export function rankScreenCandidates(rows: ScreenCandidate[]): ScreenCandidate[] {
  return [...rows].sort((a, b) => {
    const ar = a.beatRate ?? -1;
    const br = b.beatRate ?? -1;
    if (br !== ar) return br - ar;
    const as = a.avgSurprisePct ?? Number.NEGATIVE_INFINITY;
    const bs = b.avgSurprisePct ?? Number.NEGATIVE_INFINITY;
    if (bs !== as) return bs - as;
    if (b.quarters !== a.quarters) return b.quarters - a.quarters;
    return a.symbol.localeCompare(b.symbol);
  });
}

/** Build a capped screen pool by round-robin across calendar days (day-0 cannot monopolize). */
export function buildCrossDayScreenPool<T>(
  byDay: T[][],
  max = SCREEN_POOL_MAX,
): T[] {
  const days = byDay.map((d) => [...d]);
  const pool: T[] = [];
  let progressed = true;
  while (pool.length < max && progressed) {
    progressed = false;
    for (let d = 0; d < days.length && pool.length < max; d++) {
      const day = days[d]!;
      if (!day.length) continue;
      pool.push(day.shift()!);
      progressed = true;
    }
  }
  return pool;
}

/**
 * Upcoming earnings universe → historical-surprise screen → top N.
 * Does not invent scores; names with no history still eligible but rank last.
 * Pool is sampled across the horizon (not only the first calendar day) so
 * "upcoming" is not starved when today already has ≥ SCREEN_POOL_MAX names.
 */
export async function selectStrongestUpcomingCandidates(
  maxSymbols = RESEARCH_TOP_N,
): Promise<{ symbols: string[]; note: string; screened: ScreenCandidate[] }> {
  const today =
    resolveEarningsCalendarDate("earnings calendar today") ?? new Date().toISOString().slice(0, 10);
  const byDay: Array<Array<{ symbol: string; reportDate: string; reportTime: string }>> = [];
  const seen = new Set<string>();

  for (let i = 0; i < SCREEN_HORIZON_DAYS; i++) {
    const ymd = addCalendarDaysYmd(today, i);
    const cal = await fetchEarningsCalendarForDate(ymd);
    const dayRows: Array<{ symbol: string; reportDate: string; reportTime: string }> = [];
    if (cal.available) {
      for (const row of cal.rows) {
        if (!row.symbol || seen.has(row.symbol)) continue;
        seen.add(row.symbol);
        dayRows.push({
          symbol: row.symbol,
          reportDate: row.date,
          reportTime: row.reportTime === "unknown" ? "—" : row.reportTime,
        });
      }
    }
    byDay.push(dayRows);
  }

  const pool = buildCrossDayScreenPool(byDay, SCREEN_POOL_MAX);
  const totalUnique = seen.size;
  if (!pool.length) {
    return {
      symbols: [],
      note: `No Finnhub calendar names in the next ${SCREEN_HORIZON_DAYS}-day window starting ${today}.`,
      screened: [],
    };
  }

  const screened: ScreenCandidate[] = [];
  for (const row of pool) {
    const hist = await fetchHistoricalEarnings(row.symbol);
    const summary = hist.available ? summarizeBeatHistory(hist.rows) : null;
    const beatRate = summary?.epsBeatRate ?? null;
    const avgSurprisePct = summary?.avgSurprisePct ?? null;
    const quarters = summary?.quarters ?? 0;
    screened.push({
      symbol: row.symbol,
      reportDate: row.reportDate,
      reportTime: row.reportTime,
      beatRate,
      avgSurprisePct,
      quarters,
      screenScore: screenScoreFromHistory(beatRate, avgSurprisePct, quarters),
    });
  }

  const ranked = rankScreenCandidates(screened);
  const top = ranked.slice(0, maxSymbols);
  return {
    symbols: top.map((r) => r.symbol),
    note: `Screened ${pool.length} of ${totalUnique} upcoming calendar names over ${SCREEN_HORIZON_DAYS} days from ${today} (pool capped at ${SCREEN_POOL_MAX}, sampled across days); ranked by historical beat rate then avg EPS surprise (available factors only — not a trade authorization). Selected: ${top.map((t) => `${t.symbol} (${t.reportDate}${t.reportTime !== "—" ? ` ${t.reportTime}` : ""})`).join(", ") || "none"}.`,
    screened: ranked,
  };
}
export type GapStatus = "retrieved" | "calculated" | "verified" | "unavailable" | "conflicting" | "WAIT" | "BLOCKED";

export type GapItem = {
  field: string;
  status: GapStatus;
  detail: string;
  owningApi: string;
};

export type CandidateClassification =
  | "STRONG_CANDIDATE"
  | "WATCHLIST"
  | "REJECT"
  | "WAIT"
  | "BLOCKED";

export type CandidateResearchResult = {
  symbol: string;
  classification: CandidateClassification;
  rawScore: number | null;
  scoreNotes: string[];
  nextEarnings: {
    date: string | null;
    dateType: string | null;
    reportTime: string | null;
    epsEstimate: number | null;
    source: string;
  };
  beatHistory: ReturnType<typeof summarizeBeatHistory> | null;
  historicalSource: string | null;
  historicalQuarters: number;
  price: number | null;
  rsi14: number | null;
  filingsAvailable: boolean;
  gaps: GapItem[];
  reportMarkdown: string;
};

const EARNINGS_PROTOCOL_MARKERS =
  /REQUI\s+QUARTERLY\s+EARNINGS|CANDIDATE\s+SELECTION\s+PROTOCOL|SMALL-?CAP\s+CANDIDATE|BASE\s+RESET|EARNINGS\s+SWARM|INSTITUTIONAL\s+EARNINGS/i;

const PEER_READ_THROUGH_RE =
  /\bPEER\s*READ[-\s]?THROUGH\b|\brun\s+peer\s+read-through\b|\bpeer\s+read-through\s+analysis\b/i;

const RUN_RESEARCH_RE =
  /\b(run|execute|perform|start)\b[\s\S]{0,40}\b(research|protocol|candidate\s+selection|earnings\s+screen)\b/i;

/** True when the user is asking for peer read-through. */
export function isPeerReadThroughRequest(text: string): boolean {
  return PEER_READ_THROUGH_RE.test(text);
}

export function isBaseResetProtocol(text: string): boolean {
  return /\bBASE\s+RESET\b/i.test(text);
}

/** True for earnings / small-cap / base-reset style research (not peer-only). */
export function isEarningsResearchProtocol(text: string): boolean {
  if (EARNINGS_PROTOCOL_MARKERS.test(text)) return true;
  if (RUN_RESEARCH_RE.test(text) && resolveSymbolsFromText(text).length > 0) return true;
  if (text.length > 4000 && /\bScore each company from 0 to 100\b/i.test(text)) return true;
  return false;
}

export function isResearchProtocolText(text: string): boolean {
  return isPeerReadThroughRequest(text) || isEarningsResearchProtocol(text);
}

function peerReadThroughUnavailableReply(symbols: string[]): string {
  const target =
    symbols.length > 0
      ? `Target ticker(s) detected: **${symbols.join(", ")}**.`
      : "No valid ticker was detected in the prompt.";
  return [
    "PEER_READ_THROUGH_UNAVAILABLE",
    "",
    "## Peer Read-Through",
    "",
    "Peer map / scores unavailable for this run.",
    "",
    target,
    "",
    "Protocol words such as PEER / READ / PEERS are **not** treated as stock tickers.",
    "",
    "Configure ESTIMATES_API_KEY (or DATA_PROVIDER_MODE=mock) for peer fixtures/vendor peers.",
    "",
    "No peer scores were invented.",
  ].join("\n");
}

function pushGap(gaps: GapItem[], item: GapItem) {
  gaps.push(item);
}

function scoreEarningsConsistency(hist: HistoricalEarningsResult | null, gaps: GapItem[]): {
  points: number;
  max: number;
  notes: string[];
} {
  const max = 15;
  const notes: string[] = [];
  if (!hist?.available || !hist.rows.length) {
    pushGap(gaps, {
      field: "historical_eps_consistency",
      status: "unavailable",
      detail: hist?.error ?? "No historical EPS rows",
      owningApi: "Finnhub /stock/earnings",
    });
    return { points: 0, max, notes: ["Historical EPS unavailable — section scored 0 and flagged"] };
  }

  const summary = summarizeBeatHistory(hist.rows);
  pushGap(gaps, {
    field: "historical_eps_surprises",
    status: "retrieved",
    detail: `${summary.quarters} quarters from ${hist.source}`,
    owningApi: hist.source,
  });
  pushGap(gaps, {
    field: "eps_beat_rate",
    status: "calculated",
    detail: summary.epsBeatRate === null ? "n/a" : `${summary.epsBeatRate.toFixed(1)}%`,
    owningApi: "internal calc from retrieved surprises",
  });

  if (hist.conflict) {
    pushGap(gaps, {
      field: "historical_eps_source_conflict",
      status: "conflicting",
      detail: "Finnhub and Alpha Vantage EPS actuals disagree for at least one overlapping period — Finnhub kept; CONSENSUS_CONFLICT",
      owningApi: "Finnhub + Alpha Vantage",
    });
    notes.push("EPS history source conflict flagged — WAIT confidence");
  }

  if (hist.incompleteForProtocol) {
    pushGap(gaps, {
      field: "historical_lookback_6_to_8_quarters",
      status: "WAIT",
      detail: `Only ${hist.rows.length} quarters available (protocol prefers 6–8). Free Finnhub often caps at ~4; Alpha Vantage used as backfill when configured.`,
      owningApi: "Finnhub /stock/earnings + Alpha Vantage EARNINGS",
    });
    notes.push(`Incomplete history (${hist.rows.length} quarters) — confidence reduced`);
  }

  let points = 0;
  if (summary.epsBeatRate !== null) {
    if (summary.epsBeatRate >= 80) points += 8;
    else if (summary.epsBeatRate >= 70) points += 6;
    else if (summary.epsBeatRate >= 50) points += 3;
    notes.push(`EPS beat rate ${summary.epsBeatRate.toFixed(1)}% over ${summary.quarters} quarters`);
  }
  if (summary.avgSurprisePct !== null) {
    if (summary.avgSurprisePct >= 5) points += 5;
    else if (summary.avgSurprisePct >= 0) points += 2;
    notes.push(`Avg EPS surprise ${summary.avgSurprisePct.toFixed(2)}%`);
  }
  pushGap(gaps, {
    field: "revenue_beat_history",
    status: "unavailable",
    detail: "Revenue surprise series not in free Finnhub /stock/earnings payload",
    owningApi: "Finnhub calendar history / paid fundamentals (e.g. FMP, Intrinio)",
  });

  return { points: Math.min(max, points), max, notes };
}

function scorePreEarningsTape(
  rsi: number | null,
  gaps: GapItem[],
): { points: number; max: number; notes: string[] } {
  const max = 10;
  const notes: string[] = [];
  if (rsi === null) {
    pushGap(gaps, {
      field: "pre_earnings_rsi",
      status: "unavailable",
      detail: "RSI unavailable from gateway",
      owningApi: "Yahoo/IBKR Market Data Gateway",
    });
    return { points: 0, max, notes: ["RSI unavailable"] };
  }
  pushGap(gaps, {
    field: "pre_earnings_rsi",
    status: "retrieved",
    detail: `RSI(14)=${rsi.toFixed(2)}`,
    owningApi: "Market Data Gateway indicators",
  });
  // Protocol: not excessively overbought (RSI >> 70 is a warning)
  if (rsi >= 75) {
    notes.push(`RSI ${rsi.toFixed(1)} — extended / overbought warning`);
    return { points: 2, max, notes };
  }
  if (rsi >= 55 && rsi < 70) {
    notes.push(`RSI ${rsi.toFixed(1)} — constructive momentum band`);
    return { points: 7, max, notes };
  }
  if (rsi >= 40 && rsi < 55) {
    notes.push(`RSI ${rsi.toFixed(1)} — neutral`);
    return { points: 5, max, notes };
  }
  notes.push(`RSI ${rsi.toFixed(1)}`);
  return { points: 4, max, notes };
}

function markStillUnavailableSections(gaps: GapItem[], filled: Set<string>) {
  const missing: Array<{ field: string; owningApi: string; detail: string }> = [
    {
      field: "analyst_estimate_revisions_30_60_90d",
      owningApi: "Finnhub premium estimates / FactSet / Bloomberg",
      detail: "Required by protocol; no verified data in Revision 1 free stack",
    },
    {
      field: "company_specific_kpis",
      owningApi: "SEC 10-Q/8-K text extract + IR — not wired",
      detail: "Required by protocol; no verified data in Revision 1 free stack",
    },
    {
      field: "guidance_quality",
      owningApi: "SEC 8-K + transcript APIs — not wired",
      detail: "Required by protocol; no verified data in Revision 1 free stack",
    },
    {
      field: "industry_peer_confirmation",
      owningApi: "Peer map + peer earnings — Peer Read-Through engine pending",
      detail: "Required by protocol; no verified data in Revision 1 free stack",
    },
    {
      field: "priced_in_expectations_options_iv",
      owningApi: "Options chain API (Tradier/IBKR/Polygon) — not wired",
      detail: "Required by protocol; no verified data in Revision 1 free stack",
    },
    {
      field: "historical_price_reaction_event_study",
      owningApi: "Point-in-time price DB around earnings — not wired",
      detail: "Required by protocol; no verified data in Revision 1 free stack",
    },
    {
      field: "valuation_vs_peers",
      owningApi: "Fundamentals + peer multiples — not wired",
      detail: "Required by protocol; no verified data in Revision 1 free stack",
    },
    {
      field: "short_interest_float",
      owningApi: "FINRA / Ortex / paid short-interest API — not wired",
      detail: "Required by protocol; no verified data in Revision 1 free stack",
    },
    {
      field: "live_vwap_opening_range_gate",
      owningApi: "Live Price-Confirmation Gate → BrokerProvider L1 (not Yahoo/public last)",
      detail:
        "Gate module is wired and returns WAIT/BLOCKED honesty reports. Execution-critical bid/ask/spread/depth remain UNAVAILABLE without BrokerProvider L1 — public last/VWAP/OR cannot authorize a BUY/PASS under client §14.",
    },
  ];
  for (const row of missing) {
    if (filled.has(row.field)) continue;
    pushGap(gaps, {
      field: row.field,
      status: "unavailable",
      detail: row.detail,
      owningApi: row.owningApi,
    });
  }
}

function scoreFundamentalQuality(
  factsAvailable: boolean,
  derived: {
    grossMargin: number | null;
    operatingMargin: number | null;
    netMargin: number | null;
    currentRatio: number | null;
    netCash: number | null;
    freeCashFlow: number | null;
  },
  gaps: GapItem[],
): { points: number; max: number; notes: string[] } {
  const max = 15;
  const notes: string[] = [];
  if (!factsAvailable) {
    pushGap(gaps, {
      field: "revenue_margin_fcf_quality",
      status: "unavailable",
      detail: "SEC companyfacts / Alpha Vantage fundamentals not retrieved",
      owningApi: "SEC companyfacts + Alpha Vantage OVERVIEW",
    });
    return { points: 0, max, notes: ["Fundamental quality unavailable"] };
  }

  const parts: string[] = [];
  let points = 4; // base for having verified filed facts
  let conflictingMargin = false;

  const pushMargin = (label: string, value: number | null, scoreFn: (v: number) => number) => {
    if (value === null) return;
    const pct = value * 100;
    if (!isPlausibleMarginRatio(value)) {
      conflictingMargin = true;
      parts.push(`${label} ${pct.toFixed(1)}% [IMPLAUSIBLE XBRL — excluded from score]`);
      return;
    }
    parts.push(`${label} ${pct.toFixed(1)}%`);
    points += scoreFn(value);
  };

  pushMargin("gross margin", derived.grossMargin, (v) => (v > 0.3 ? 3 : v > 0.15 ? 2 : 0));
  pushMargin("op margin", derived.operatingMargin, (v) => (v > 0.1 ? 3 : v > 0 ? 1 : 0));

  if (derived.freeCashFlow !== null) {
    parts.push(`FCF ${Math.round(derived.freeCashFlow).toLocaleString()}`);
    if (derived.freeCashFlow > 0) points += 3;
  }
  if (derived.currentRatio !== null) {
    parts.push(`current ratio ${derived.currentRatio.toFixed(2)}`);
    if (derived.currentRatio >= 1.2) points += 2;
  }

  if (conflictingMargin) {
    pushGap(gaps, {
      field: "revenue_margin_fcf_quality",
      status: "conflicting",
      detail: `${parts.join("; ")}. Margin outside plausible range (−50%…100%) — likely mismatched XBRL periods/units; not used as a positive score driver.`,
      owningApi: "SEC companyfacts (XBRL)",
    });
    notes.push(`Fundamentals from SEC XBRL with conflicting margin(s): ${parts.join(", ")}`);
    // Keep base points for having facts, but do not treat as clean quality signal.
    return { points: Math.min(max, 4), max, notes };
  }

  pushGap(gaps, {
    field: "revenue_margin_fcf_quality",
    status: "calculated",
    detail: parts.join("; ") || "SEC facts present; limited margin inputs",
    owningApi: "SEC companyfacts (XBRL)",
  });
  notes.push(`Fundamentals from SEC XBRL: ${parts.join(", ") || "partial"}`);
  return { points: Math.min(max, points), max, notes };
}

/** Gross/op/net margin as a ratio — reject absurd XBRL mismatches (e.g. 193%). */
export function isPlausibleMarginRatio(m: number | null | undefined): boolean {
  if (m === null || m === undefined || !Number.isFinite(m)) return false;
  return m >= -0.5 && m <= 1.0;
}

export async function researchEarningsCandidate(
  userId: string,
  symbol: string,
): Promise<CandidateResearchResult> {
  const sym = symbol.toUpperCase();
  const gaps: GapItem[] = [];
  const scoreNotes: string[] = [];

  const [nextLayer, hist, snap, ind, edgar, secFacts, avOverview, halt, fred, revisions, implied, guidance, eventStudy] =
    await Promise.all([
      fetchEarnings(sym),
      fetchHistoricalEarnings(sym),
      getSnapshot(userId, sym).catch(() => null),
      getIndicators(userId, sym).catch(() => null),
      fetchEdgarFilings(sym).catch(() => null),
      fetchSecCompanyFacts(sym).catch(() => null),
      fetchAlphaVantageOverview(sym).catch(() => ({ available: false, payload: null, error: "overview fetch failed" })),
      fetchNasdaqHaltStatus(sym).catch(() => null),
      fetchFredMacroBackdrop().catch(() => null),
      fetchEstimateRevisions(sym).catch(() => null),
      fetchImpliedMove(sym).catch(() => null),
      fetchEdgarGuidance(sym).catch(() => null),
      runEventStudy(sym).catch(() => null),
    ]);

  const peerEngine = await runPeerReadThrough(sym).catch(() => null);

  const next = nextLayer.payload;
  if (nextLayer.available && next?.reportDate) {
    pushGap(gaps, {
      field: "next_earnings_date",
      status: next.dateType === "confirmed" ? "verified" : "retrieved",
      detail: `${next.reportDate} (${next.dateType ?? "unknown"}) ${next.reportTime ?? ""}`.trim(),
      owningApi: nextLayer.source,
    });
  } else {
    pushGap(gaps, {
      field: "next_earnings_date",
      status: "unavailable",
      detail: nextLayer.error ?? "No next earnings date",
      owningApi: "Finnhub calendar / Yahoo calendarEvents",
    });
  }

  const histScore = scoreEarningsConsistency(hist, gaps);
  scoreNotes.push(...histScore.notes);

  const price =
    snap && snap.market_data_available && typeof snap.price === "number" ? snap.price : null;
  if (price !== null) {
    pushGap(gaps, {
      field: "last_price",
      status: "retrieved",
      detail: `$${price.toFixed(2)}`,
      owningApi: snap?.source_name ?? "Market Data Gateway",
    });
  } else {
    pushGap(gaps, {
      field: "last_price",
      status: "unavailable",
      detail: "Quote unavailable",
      owningApi: "Yahoo/IBKR Market Data Gateway",
    });
  }

  const rsi14 =
    ind?.available && ind.indicators && typeof ind.indicators.rsi_14 === "number"
      ? ind.indicators.rsi_14
      : null;
  const tapeScore = scorePreEarningsTape(rsi14, gaps);
  scoreNotes.push(...tapeScore.notes);

  const filingsAvailable = Boolean(edgar?.available && edgar.payload);
  pushGap(gaps, {
    field: "sec_filing_list",
    status: filingsAvailable ? "retrieved" : "unavailable",
    detail: filingsAvailable ? "Recent filing metadata/links present" : edgar?.error ?? "EDGAR unavailable",
    owningApi: "SEC EDGAR",
  });

  const factsOk = Boolean(secFacts?.available && secFacts.facts.length);
  if (factsOk && secFacts) {
    pushGap(gaps, {
      field: "sec_filing_fundamentals_extract",
      status: "retrieved",
      detail: `${secFacts.facts.length} XBRL concepts (latest filed USD facts)`,
      owningApi: "SEC companyfacts (XBRL)",
    });
  } else {
    pushGap(gaps, {
      field: "sec_filing_fundamentals_extract",
      status: "unavailable",
      detail: secFacts?.error ?? "Filing text/KPI extraction limited — companyfacts unavailable",
      owningApi: "SEC companyfacts (XBRL)",
    });
  }

  const fundScore = scoreFundamentalQuality(
    factsOk,
    secFacts?.derived ?? {
      grossMargin: null,
      operatingMargin: null,
      netMargin: null,
      currentRatio: null,
      netCash: null,
      freeCashFlow: null,
    },
    gaps,
  );
  scoreNotes.push(...fundScore.notes);

  if (avOverview.available && avOverview.payload) {
    const o = avOverview.payload;
    pushGap(gaps, {
      field: "company_profile",
      status: "retrieved",
      detail: [
        o.name,
        o.exchange,
        o.sector,
        o.industry,
        o.marketCap !== null ? `mcap ${o.marketCap}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      owningApi: "Alpha Vantage OVERVIEW",
    });
  } else {
    pushGap(gaps, {
      field: "company_profile",
      status: "unavailable",
      detail: sanitizeProviderError(avOverview.error, "Alpha Vantage OVERVIEW unavailable"),
      owningApi: "Alpha Vantage OVERVIEW",
    });
  }

  if (halt?.available) {
    pushGap(gaps, {
      field: "trading_halt_status",
      status: halt.halted ? "BLOCKED" : "verified",
      detail: halt.halted
        ? `HALTED — ${halt.reason ?? "see Nasdaq halt feed"}`
        : "Not present on current Nasdaq halt RSS",
      owningApi: "Nasdaq Trader Trade Halt RSS",
    });
    if (halt.halted) scoreNotes.push("BLOCKED — active trading halt on Nasdaq halt feed");
  } else {
    pushGap(gaps, {
      field: "trading_halt_status",
      status: "unavailable",
      detail: halt?.error ?? "Halt feed unavailable",
      owningApi: "Nasdaq Trader Trade Halt RSS",
    });
  }

  if (fred?.available) {
    pushGap(gaps, {
      field: "macro_backdrop_fred",
      status: "retrieved",
      detail: formatFredMacroBrief(fred).slice(0, 4).join("; "),
      owningApi: "FRED",
    });
  } else {
    pushGap(gaps, {
      field: "macro_backdrop_fred",
      status: "unavailable",
      detail: fred?.error ?? "FRED_API_KEY missing or fetch failed",
      owningApi: "FRED",
    });
  }

  if (revisions?.available) {
    pushGap(gaps, {
      field: "analyst_estimate_revisions_30_60_90d",
      status: revisions.mock ? "retrieved" : "verified",
      detail: `${formatRevisionBrief(revisions)}${revisions.mock ? " [MOCK]" : ""}`,
      owningApi: revisions.source,
    });
    if (revisions.mock) scoreNotes.push("Estimate revisions from MOCK fixtures — not live vendor");
  } else {
    pushGap(gaps, {
      field: "analyst_estimate_revisions_30_60_90d",
      status: "unavailable",
      detail: revisions?.error ?? "Estimates vendor unavailable",
      owningApi: "FactSet/LSEG/CapIQ estimates API",
    });
  }

  if (implied?.available && implied.impliedMovePct != null) {
    pushGap(gaps, {
      field: "priced_in_expectations_options_iv",
      status: "retrieved",
      detail: `implied move ${implied.impliedMovePct.toFixed(2)}%; IV ${implied.iv ?? "n/a"}; expiry ${implied.expiry ?? "n/a"}${implied.mock ? " [MOCK]" : ""}`,
      owningApi: implied.source,
    });
  } else {
    pushGap(gaps, {
      field: "priced_in_expectations_options_iv",
      status: "unavailable",
      detail: implied?.error ?? implied?.detail ?? "Options IV unavailable",
      owningApi: "Massive Options",
    });
  }

  if (eventStudy?.available && eventStudy.events.length) {
    pushGap(gaps, {
      field: "historical_price_reaction_event_study",
      status: eventStudy.incomplete ? "WAIT" : "calculated",
      detail: `n=${eventStudy.events.length}; avg gap ${eventStudy.avgGapPct?.toFixed(2) ?? "n/a"}%; avg D1 ${eventStudy.avgD1Pct?.toFixed(2) ?? "n/a"}%; avg D10 ${eventStudy.avgD10Pct?.toFixed(2) ?? "n/a"}%${eventStudy.mock ? " [MOCK]" : ""}`,
      owningApi: eventStudy.source,
    });
  } else {
    pushGap(gaps, {
      field: "historical_price_reaction_event_study",
      status: "unavailable",
      detail: eventStudy?.error ?? "Event study unavailable",
      owningApi: "Massive Stocks event-study",
    });
  }

  if (guidance?.available) {
    pushGap(gaps, {
      field: "guidance_quality",
      status: "retrieved",
      detail: guidance.guidanceSnippets.slice(0, 2).join(" | ") || "guidance phrases present",
      owningApi: guidance.source,
    });
    pushGap(gaps, {
      field: "company_specific_kpis",
      status: guidance.kpiSnippets.length ? "retrieved" : "WAIT",
      detail: guidance.kpiSnippets.slice(0, 2).join(" | ") || "No KPI phrases matched in 8-K text",
      owningApi: guidance.source,
    });
  } else {
    pushGap(gaps, {
      field: "guidance_quality",
      status: "unavailable",
      detail: guidance?.error ?? "8-K guidance extract unavailable",
      owningApi: "SEC 8-K extract",
    });
    pushGap(gaps, {
      field: "company_specific_kpis",
      status: "unavailable",
      detail: guidance?.error ?? "KPI extract unavailable",
      owningApi: "SEC 8-K extract",
    });
  }

  if (peerEngine?.available) {
    pushGap(gaps, {
      field: "industry_peer_confirmation",
      status: peerEngine.scores.incomplete ? "WAIT" : "calculated",
      detail: peerEngine.scores.detail,
      owningApi: peerEngine.scores.mock ? "MOCK/EstimatesVendor peers" : "Estimates vendor peers",
    });
    if (peerEngine.scores.peerFundamentalScore != null && peerEngine.scores.peers.length) {
      pushGap(gaps, {
        field: "valuation_vs_peers",
        status: "WAIT",
        detail: "Peer set present; full valuation multiples vs peers still limited on free/partial stack",
        owningApi: "Estimates vendor peers + fundamentals",
      });
    }
  }

  const baseReset = classifyBaseReset({
    symbol: sym,
    revisions: revisions ?? null,
    guidance: guidance ?? null,
    eventStudy: eventStudy ?? null,
    peers: peerEngine?.scores ?? null,
  });
  scoreNotes.push(`Base Reset classifier: ${baseReset.classification}`);

  const usedMockPaid =
    Boolean(revisions?.mock) ||
    Boolean(implied?.mock) ||
    Boolean(eventStudy?.mock) ||
    Boolean(peerEngine?.scores.mock) ||
    getDataProviderMode() === "mock";

  const filled = new Set(gaps.filter((g) => g.status !== "unavailable").map((g) => g.field));
  filled.add("revenue_margin_fcf_quality"); // handled above (retrieved or unavailable)
  markStillUnavailableSections(gaps, filled);

  // Weighted score using ONLY dimensions we can populate (rescale to 0–100 of available weight)
  const earned = histScore.points + tapeScore.points + fundScore.points;
  const availableMax = histScore.max + tapeScore.max + fundScore.max;
  const rawScore = availableMax > 0 ? Math.round((earned / availableMax) * 100) : null;

  // Protocol interpretation on partial data: missing critical sections → WAIT, not STRONG
  const criticalUnavailable = gaps.filter(
    (g) =>
      g.status === "unavailable" &&
      [
        "analyst_estimate_revisions_30_60_90d",
        "revenue_margin_fcf_quality",
        "guidance_quality",
        "historical_price_reaction_event_study",
      ].includes(g.field),
  ).length;

  const hasConflict = gaps.some((g) => g.status === "conflicting");
  const isHalted = Boolean(halt?.available && halt.halted);

  let classification: CandidateClassification = "WAIT";
  if (isHalted) {
    classification = "BLOCKED";
    scoreNotes.push("BLOCKED — Nasdaq halt feed shows active halt");
  } else if (!hist.available && !nextLayer.available) {
    classification = "BLOCKED";
    scoreNotes.push("BLOCKED — no earnings calendar or history from configured APIs");
  } else if (hasConflict) {
    classification = "WAIT";
    scoreNotes.push("WAIT — material source conflict (CONSENSUS_CONFLICT)");
  } else if (criticalUnavailable >= 3) {
    classification = "WAIT";
    scoreNotes.push("WAIT — critical protocol sections unavailable");
  } else if (rawScore !== null && rawScore >= 80 && criticalUnavailable === 0 && !usedMockPaid) {
    classification = "STRONG_CANDIDATE";
  } else if (rawScore !== null && rawScore >= 70) {
    classification = "WATCHLIST";
  } else if (rawScore !== null && rawScore < 70 && hist.available) {
    classification = "REJECT";
    scoreNotes.push("Partial score below 70 on available factors — reject pending more data");
  }

  // Never claim STRONG on mock paid stack or incomplete live gates
  if (classification === "STRONG_CANDIDATE") {
    if (usedMockPaid) {
      classification = "WATCHLIST";
      scoreNotes.push("Downgraded from STRONG — MOCK/dummy paid providers cannot authorize STRONG");
    } else if (criticalUnavailable > 0) {
      classification = "WATCHLIST";
      scoreNotes.push("Downgraded from STRONG — critical protocol gates still incomplete");
    }
  }

  const beatHistory = hist.available ? summarizeBeatHistory(hist.rows) : null;

  let reportMarkdown = formatCandidateReport({
    symbol: sym,
    classification,
    rawScore,
    scoreNotes,
    nextEarnings: {
      date: next?.reportDate ?? null,
      dateType: next?.dateType ?? null,
      reportTime: next?.reportTime ?? null,
      epsEstimate: next?.epsEstimate ?? null,
      source: nextLayer.source,
    },
    beatHistory,
    historicalSource: hist.available ? hist.source : null,
    historicalQuarters: hist.rows.length,
    price,
    rsi14,
    filingsAvailable,
    gaps,
    reportMarkdown: "",
  });

  reportMarkdown += `\n\n${baseReset.reportMarkdown}`;
  if (peerEngine?.available) {
    reportMarkdown += `\n\n${peerEngine.reportMarkdown}`;
  }

  return {
    symbol: sym,
    classification,
    rawScore,
    scoreNotes,
    nextEarnings: {
      date: next?.reportDate ?? null,
      dateType: next?.dateType ?? null,
      reportTime: next?.reportTime ?? null,
      epsEstimate: next?.epsEstimate ?? null,
      source: nextLayer.source,
    },
    beatHistory,
    historicalSource: hist.available ? hist.source : null,
    historicalQuarters: hist.rows.length,
    price,
    rsi14,
    filingsAvailable,
    gaps,
    reportMarkdown,
  };
}

function formatCandidateReport(r: CandidateResearchResult): string {
  const lines: string[] = [
    `## Earnings candidate research — **${r.symbol}**`,
    "",
    `- **Classification:** ${r.classification}`,
    `- **Partial score (available factors only):** ${r.rawScore === null ? "n/a" : `${r.rawScore}/100`}`,
    `- **As of:** ${new Date().toISOString()}`,
    "",
    "### Next earnings",
    `- Date: ${r.nextEarnings.date ?? "unavailable"} (${r.nextEarnings.dateType ?? "n/a"})`,
    `- Timing: ${r.nextEarnings.reportTime ?? "unknown"}`,
    `- EPS estimate: ${r.nextEarnings.epsEstimate ?? "n/a"}`,
    `- Source: ${r.nextEarnings.source}`,
    "",
    "### Historical EPS consistency (calculated)",
  ];

  if (r.beatHistory) {
    lines.push(
      `- Quarters used: ${r.beatHistory.quarters}`,
      `- EPS beats: ${r.beatHistory.epsBeatCount}`,
      `- Beat rate: ${r.beatHistory.epsBeatRate?.toFixed(1) ?? "n/a"}%`,
      `- Avg surprise %: ${r.beatHistory.avgSurprisePct?.toFixed(2) ?? "n/a"}`,
      `- Median surprise %: ${r.beatHistory.medianSurprisePct?.toFixed(2) ?? "n/a"}`,
      `- Source: ${r.historicalSource}`,
    );
  } else {
    lines.push("- Unavailable from Finnhub historical earnings");
  }

  lines.push(
    "",
    "### Tape (supporting)",
    `- Last price: ${r.price !== null ? `$${r.price.toFixed(2)}` : "unavailable"}`,
    `- RSI(14): ${r.rsi14 !== null ? r.rsi14.toFixed(2) : "unavailable"}`,
    `- SEC filing list: ${r.filingsAvailable ? "available" : "unavailable"}`,
    "",
    "### Score notes",
    ...r.scoreNotes.map((n) => `- ${n}`),
    "",
    "### Gap register (Revision 1 honesty)",
    "",
    "| Field | Status | Owning API / connection | Detail |",
    "|-------|--------|-------------------------|--------|",
  );

  for (const g of r.gaps) {
    const detail = g.detail.replace(/\|/g, "/");
    lines.push(`| ${g.field} | ${g.status} | ${g.owningApi} | ${detail} |`);
  }

  lines.push(
    "",
    "### Operating principle",
    "Beat history determines what to research further — it does **not** authorize a trade.",
    "Missing critical gates remain WAIT/BLOCKED. No figures were invented.",
  );

  return lines.join("\n");
}

export async function runRevision1Research(
  userId: string,
  text: string,
): Promise<{ reply: string; symbols: string[] } | null> {
  if (!isResearchProtocolText(text)) return null;

  let symbols = resolveSymbolsFromText(text);
  let screenNote = "";

  // Peer-only prompts: run peer engine when possible; else honest unavailable.
  if (isPeerReadThroughRequest(text) && !isEarningsResearchProtocol(text)) {
    const target = symbols.slice(0, 5);
    if (!target.length) {
      return { symbols: [], reply: peerReadThroughUnavailableReply([]) };
    }
    const parts: string[] = [];
    for (const s of target) {
      const peer = await runPeerReadThrough(s);
      parts.push(peer.reportMarkdown);
    }
    return { symbols: target, reply: parts.join("\n\n---\n\n") };
  }

  // If protocol pasted with no tickers, screen upcoming calendar for strongest available names.
  // Never silently replace an explicit "on TICKER" request with calendar names.
  if (!symbols.length) {
    const askedForExplicitTickers = /\b(?:on|for)\s+[A-Z]{1,5}\b/.test(text) || /\$[A-Za-z]/.test(text);
    if (askedForExplicitTickers) {
      return {
        symbols: [],
        reply: [
          "## Revision 1 research run",
          "",
          "A research protocol was detected, but **no valid tickers** could be resolved from the prompt.",
          "",
          "Protocol header words are ignored as tickers. Use explicit symbols, e.g.:",
          "`Run earnings candidate research on PLTR, COIN`",
          "",
          "Today's earnings calendar was **not** used as a substitute.",
        ].join("\n"),
      };
    }

    const selected = await selectStrongestUpcomingCandidates(RESEARCH_TOP_N);
    symbols = selected.symbols;
    screenNote = selected.note;
    if (!symbols.length) {
      return {
        symbols: [],
        reply: [
          "## Revision 1 research run",
          "",
          "A research protocol was detected, but **no tickers** were found in the prompt and the upcoming Finnhub earnings calendar window is empty.",
          "",
          selected.note,
          "",
          "Provide tickers (e.g. `Run earnings candidate research on AAPL, MSFT, NVDA`) or retry on a day with calendar coverage.",
          "",
          "Long protocol text was accepted without truncation.",
        ].join("\n"),
      };
    }
  }

  symbols = symbols.slice(0, RESEARCH_TOP_N);
  const results: CandidateResearchResult[] = [];
  for (const sym of symbols) {
    results.push(await researchEarningsCandidate(userId, sym));
  }

  // Report order = strongest among *available* partial scores (client "strongest" ask).
  results.sort((a, b) => {
    const as = a.rawScore ?? -1;
    const bs = b.rawScore ?? -1;
    if (bs !== as) return bs - as;
    const abr = a.beatHistory?.epsBeatRate ?? -1;
    const bbr = b.beatHistory?.epsBeatRate ?? -1;
    if (bbr !== abr) return bbr - abr;
    const asu = a.beatHistory?.avgSurprisePct ?? Number.NEGATIVE_INFINITY;
    const bsu = b.beatHistory?.avgSurprisePct ?? Number.NEGATIVE_INFINITY;
    if (bsu !== asu) return bsu - asu;
    return a.symbol.localeCompare(b.symbol);
  });

  const header = [
    "# Revision 1 — Earnings candidate research report",
    "",
    `Protocol detected. Analyzed **${results.length}** symbol(s): ${results.map((r) => r.symbol).join(", ")}.`,
    "",
    screenNote
      ? `${screenNote}`
      : "Tickers were taken from the prompt (explicit list).",
    "",
    "This run uses **free connected sources only**. Incomplete sections are listed in each gap register — nothing was invented.",
    "Partial scores and screen ranks are **research screens only** — they do not authorize a trade under the client protocol.",
    "",
    "---",
    "",
  ];

  const body = results.map((r) => r.reportMarkdown).join("\n\n---\n\n");

  const summary = [
    "",
    "---",
    "",
    "## Batch summary (ranked by partial score among available factors)",
    "",
    "| Rank | Symbol | Classification | Partial score | Next earnings | Timing | Quarters hist |",
    "|------|--------|----------------|---------------|---------------|--------|---------------|",
    ...results.map(
      (r, i) =>
        `| ${i + 1} | ${r.symbol} | ${r.classification} | ${r.rawScore ?? "n/a"} | ${r.nextEarnings.date ?? "n/a"} | ${r.nextEarnings.reportTime ?? "unknown"} | ${r.historicalQuarters} |`,
    ),
    "",
    "### Next data connections to close WAIT gates",
    "1. Estimate revisions API (30/60/90d) — premium consensus vendor",
    "2. Options IV / implied move",
    "3. Event-study price history (gap / D1 / D10 / MAE)",
    "4. Peer read-through engine",
    "5. Guidance / KPI full-text extract from 8-K + IR",
    "6. Broker L1 bid/ask/spread for Live Price-Confirmation Gate pass",
    "",
    "_Now wired on free keys when configured: Alpha Vantage OVERVIEW/EARNINGS backfill, SEC companyfacts XBRL, FRED macro backdrop, Nasdaq halt RSS, Live Gate honesty report._",
  ];

  return { reply: header.join("\n") + body + summary.join("\n"), symbols: results.map((r) => r.symbol) };
}
