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
import { resolveSymbolsFromText } from "../../intelligence-data/symbol-resolver";
import { fetchEarningsCalendarForDate, resolveEarningsCalendarDate } from "../../intelligence-data/earnings-day";

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

/** True when the user is asking for peer read-through (engine not built in Rev1). */
export function isPeerReadThroughRequest(text: string): boolean {
  return PEER_READ_THROUGH_RE.test(text);
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
    "The **Peer Read-Through engine is not implemented** in Revision 1.",
    "",
    target,
    "",
    "Protocol words such as PEER / READ / PEERS are **not** treated as stock tickers.",
    "",
    "### Missing connections (required before peer scores can be produced)",
    "1. Peer map (competitors / suppliers / customers / end-market proxies)",
    "2. Peer earnings calendar + surprise history",
    "3. Peer guidance / KPI extraction",
    "4. Peer after-hours / day-1 reaction series",
    "5. Target sensitivity to peer events (point-in-time)",
    "",
    "No peer relevance, fundamental, market-reaction, expectation-reset, sensitivity, or divergence scores were invented.",
    "",
    "For earnings beat-history screening on a real ticker, use:",
    "`Run earnings candidate research on MSFT`",
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
    detail: `${summary.quarters} quarters from Finnhub`,
    owningApi: "Finnhub /stock/earnings",
  });
  pushGap(gaps, {
    field: "eps_beat_rate",
    status: "calculated",
    detail: summary.epsBeatRate === null ? "n/a" : `${summary.epsBeatRate.toFixed(1)}%`,
    owningApi: "internal calc from Finnhub surprises",
  });

  if (hist.incompleteForProtocol) {
    pushGap(gaps, {
      field: "historical_lookback_6_to_8_quarters",
      status: "WAIT",
      detail: `Only ${hist.rows.length} quarters available (protocol prefers 6–8). Free Finnhub often caps at ~4.`,
      owningApi: "Finnhub /stock/earnings (upgrade) or paid estimates vendor",
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

function markUnavailableSections(gaps: GapItem[]) {
  const missing: Array<[string, string]> = [
    ["analyst_estimate_revisions_30_60_90d", "Finnhub premium estimates / FactSet / Bloomberg"],
    ["company_specific_kpis", "SEC 10-Q/8-K text extract + IR — not wired"],
    ["revenue_margin_fcf_quality", "Finnhub basic financials / Yahoo fundamentals / FMP"],
    ["guidance_quality", "SEC 8-K + transcript APIs — not wired"],
    ["industry_peer_confirmation", "Peer map + peer earnings — Peer Read-Through engine pending"],
    ["priced_in_expectations_options_iv", "Options chain API (Tradier/IBKR/Polygon) — not wired"],
    ["historical_price_reaction_event_study", "Point-in-time price DB around earnings — not wired"],
    ["valuation_vs_peers", "Fundamentals + peer multiples — not wired"],
    ["short_interest_float", "FINRA / Ortex / paid short-interest API — not wired"],
    ["live_vwap_opening_range_gate", "Broker realtime bars — research-only until live confirmation"],
  ];
  for (const [field, owningApi] of missing) {
    pushGap(gaps, {
      field,
      status: "unavailable",
      detail: "Required by protocol; no verified data in Revision 1 free stack",
      owningApi,
    });
  }
}

export async function researchEarningsCandidate(
  userId: string,
  symbol: string,
): Promise<CandidateResearchResult> {
  const sym = symbol.toUpperCase();
  const gaps: GapItem[] = [];
  const scoreNotes: string[] = [];

  const [nextLayer, hist, snap, ind, edgar] = await Promise.all([
    fetchEarnings(sym),
    fetchHistoricalEarnings(sym),
    getSnapshot(userId, sym).catch(() => null),
    getIndicators(userId, sym).catch(() => null),
    fetchEdgarFilings(sym).catch(() => null),
  ]);

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
  pushGap(gaps, {
    field: "sec_filing_fundamentals_extract",
    status: "unavailable",
    detail: "Filing text/KPI extraction not implemented — links only",
    owningApi: "SEC EDGAR full-text parser (pending)",
  });

  markUnavailableSections(gaps);

  // Weighted score using ONLY dimensions we can populate (rescale to 0–100 of available weight)
  const earned = histScore.points + tapeScore.points;
  const availableMax = histScore.max + tapeScore.max;
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

  let classification: CandidateClassification = "WAIT";
  if (!hist.available && !nextLayer.available) {
    classification = "BLOCKED";
    scoreNotes.push("BLOCKED — no earnings calendar or history from configured APIs");
  } else if (criticalUnavailable >= 3) {
    classification = "WAIT";
    scoreNotes.push("WAIT — critical protocol sections unavailable on free data stack");
  } else if (rawScore !== null && rawScore >= 80 && criticalUnavailable === 0) {
    classification = "STRONG_CANDIDATE";
  } else if (rawScore !== null && rawScore >= 70) {
    classification = "WATCHLIST";
  } else if (rawScore !== null && rawScore < 70 && hist.available) {
    classification = "REJECT";
    scoreNotes.push("Partial score below 70 on available factors — reject pending more data");
  }

  // With known incomplete free stack, never claim STRONG on Rev1 alone
  if (classification === "STRONG_CANDIDATE") {
    classification = "WATCHLIST";
    scoreNotes.push("Downgraded from STRONG — Rev1 free stack cannot complete all protocol gates");
  }

  const beatHistory = hist.available ? summarizeBeatHistory(hist.rows) : null;

  const reportMarkdown = formatCandidateReport({
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

  // Peer-only prompts: do not fall through into earnings candidate research on fake tickers.
  if (isPeerReadThroughRequest(text) && !isEarningsResearchProtocol(text)) {
    return {
      symbols: symbols.slice(0, 5),
      reply: peerReadThroughUnavailableReply(symbols.slice(0, 5)),
    };
  }

  // If protocol pasted with no tickers, seed from today's earnings calendar (top liquid-looking symbols)
  // — but never silently replace an explicit "on TICKER" request with calendar names.
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

    const today = resolveEarningsCalendarDate("earnings calendar today") ?? new Date().toISOString().slice(0, 10);
    const cal = await fetchEarningsCalendarForDate(today);
    symbols = cal.rows.slice(0, 5).map((r) => r.symbol);
    if (!symbols.length) {
      return {
        symbols: [],
        reply: [
          "## Revision 1 research run",
          "",
          "A research protocol was detected, but **no tickers** were found in the prompt and today's Finnhub earnings calendar is empty.",
          "",
          "Provide tickers (e.g. `Run earnings candidate research on AAPL, MSFT, NVDA`) or retry on a day with calendar coverage.",
          "",
          "Long protocol text was accepted without truncation.",
        ].join("\n"),
      };
    }
  }

  symbols = symbols.slice(0, 5);
  const results: CandidateResearchResult[] = [];
  for (const sym of symbols) {
    results.push(await researchEarningsCandidate(userId, sym));
  }

  const header = [
    "# Revision 1 — Earnings candidate research report",
    "",
    `Protocol detected. Analyzed **${results.length}** symbol(s): ${results.map((r) => r.symbol).join(", ")}.`,
    "",
    "This run uses **free connected sources only**. Incomplete sections are listed in each gap register — nothing was invented.",
    "",
    "---",
    "",
  ];

  const body = results.map((r) => r.reportMarkdown).join("\n\n---\n\n");

  const summary = [
    "",
    "---",
    "",
    "## Batch summary",
    "",
    "| Symbol | Classification | Partial score | Next earnings | Quarters hist |",
    "|--------|----------------|---------------|---------------|---------------|",
    ...results.map(
      (r) =>
        `| ${r.symbol} | ${r.classification} | ${r.rawScore ?? "n/a"} | ${r.nextEarnings.date ?? "n/a"} | ${r.historicalQuarters} |`,
    ),
    "",
    "### Next data connections to close WAIT gates",
    "1. Estimate revisions API",
    "2. Fundamentals / FCF / margins",
    "3. Options IV / implied move",
    "4. Event-study price history",
    "5. Peer read-through engine",
  ];

  return { reply: header.join("\n") + body + summary.join("\n"), symbols };
}
