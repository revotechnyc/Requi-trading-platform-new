import { buildIntelligenceBundle } from "../intelligence-data/gateway";
import { bundleMeta } from "../intelligence-data/normalizer";
import type { EarningsPayload, IntelligenceBundle, LayerEnvelope, NewsPayload, SentimentPayload } from "../intelligence-data/types";
import { resolveSymbolsFromText } from "../intelligence-data/symbol-resolver";
import { tryEarningsDayCalendarReply } from "../intelligence-data/earnings-day";
import type { GatewayIndicators } from "../marketdata/gateway/indicators";
import type { MarketMeta } from "./tools";
import {
  formatVerifiedPriceReply,
  isDeterministicPriceQuery,
  isHistoricalPriceQuery,
  tryDeterministicPriceReply,
  type DeterministicPriceResult,
} from "./price-reply";
import {
  isFilingContentQuery,
  isFundamentalSeriesQuery,
  isNlScreenerQuery,
  isRiskRewardQuery,
  isDeskCompareQuery,
  isImpliedMoveQuery,
  isRatesBackdropQuery,
  isHypotheticalPortfolioQuery,
} from "./gap-intents";

export {
  isFilingContentQuery,
  isFundamentalSeriesQuery,
  isNlScreenerQuery,
  isRiskRewardQuery,
  isDeskCompareQuery,
  isImpliedMoveQuery,
  isRatesBackdropQuery,
  isHypotheticalPortfolioQuery,
} from "./gap-intents";
import { fetchImpliedMove } from "../intelligence-data/providers/massive-options";
import { fetchFredMacroBackdrop, formatFredMacroBrief } from "../intelligence-data/providers/fred";
import {
  fetchSecCompanyFacts,
  type SecCompanyFactsSummary,
} from "../intelligence-data/providers/edgar-facts";
import { fetchAlphaVantageOverview, fetchAlphaVantageEarnings } from "../intelligence-data/providers/alpha-vantage";
import { tryMarketIntelligenceReply } from "./general-market";
import { isConversationAck } from "./market-intent";
import { ensureFactPacket } from "./fact-packet";
import { buildSleeveRiskReport, formatSleeveRiskSection } from "./hyp-portfolio-risk";

const DATA_QUERY_RE =
  /\b(price|prices?|quote|trading|rsi|macd|sma|ema|earnings|filing|filings|sec|edgar|sentiment|news|indicator|overbought|oversold|compare|current|latest|worth|momentum|macro)\b/i;

const RSI_QUERY_RE = /\brsi\b/i;
const OVERBOUGHT_RE = /\boverbought\b/i;
const OVERSOLD_RE = /\boversold\b/i;
const EARNINGS_QUERY_RE = /\b(earnings|report(?:s|ing)?(?:\s+earnings)?|next earnings|earnings date|report next)\b/i;
const MACRO_QUERY_RE = /\b(macro|geopolitical|global news|technology stocks)\b/i;
const MULTI_INDICATOR_RE =
  /\b(macd|smas?|sma\s*20|sma\s*50|sma\s*200|moving\s+averages?|technical\s+analysis|support\s+(?:and|&)\s+resistance|chart)\b/i;
const FILING_QUERY_RE = /\b(filing|filings|10-?k|10-?q|8-?k|sec\b|edgar|insider)\b/i;
const SPECIFIC_FORM_RE = /\b(10-?K|10-?Q|8-?K)\b/i;
const SENTIMENT_QUERY_RE = /\b(sentiment|reddit|wsb|stocktwits|traders?|social|saying)\b/i;
const NEWS_QUERY_RE = /\b(news|headline|headlines)\b/i;
const PRICE_QUERY_RE = /\b(prices?|quote|trading at|current price|worth)\b/i;
const MOMENTUM_RE = /\bmomentum\b/i;

function gapMeta(symbols: string[], sourceName: string): MarketMeta {
  return {
    symbols,
    source: null,
    sourceName,
    stale: true,
    timestamp: new Date().toISOString(),
  };
}

export function formatNlScreenerUnavailableReply(text: string): string {
  return [
    "**Natural-language stock screener: NOT WIRED**",
    "",
    "I understood this as a *screen* (filters like SMA/RSI/sector), not as ticker symbols.",
    "",
    "I will **not** invent a matching stock list, and I will **not** treat words like ABOVE or SECTOR as tickers.",
    "",
    "Status: **WAIT** — a sector/fundamental/technical screener API is required.",
    "",
    "Until then, ask about specific tickers (e.g. `What is NVDA RSI?`) or use the earnings-day screens that are already connected.",
    "",
    `_Request kept for routing audit:_ ${text.trim().slice(0, 180)}`,
  ].join("\n");
}

export function formatFundamentalSeriesUnavailableReply(symbols: string[]): string {
  const label = symbols.length ? symbols.join(", ") : "the requested names";
  return [
    `**Fundamental time-series: UNAVAILABLE** for **${label}**.`,
    "",
    "I do not yet have a verified multi-quarter margin / valuation history series wired for side-by-side compare.",
    "",
    "Status: **WAIT** — SEC companyfacts history (or a fundamentals vendor time series) is required.",
    "",
    "I will **not** invent 8-quarter gross-margin tables or substitute a live price / filing-link dump for that series.",
    "",
    "Closest available today: latest XBRL point facts inside earnings-candidate research, or latest EDGAR filing links.",
  ].join("\n");
}

/** Parse optional explicit holdings like `AAPL 40%`, `40% MSFT`, `NVDA:25%`. */
export function parseHypotheticalHoldings(
  text: string,
): Array<{ symbol: string; weightPct: number | null }> {
  const weightBySym = new Map<string, number | null>();

  for (const m of text.matchAll(/\b([A-Za-z]{1,5})\b\s*[:=]?\s*(\d{1,3}(?:\.\d+)?)\s*%/g)) {
    const sym = m[1].toUpperCase();
    const w = Number(m[2]);
    if (sym.length >= 1 && sym.length <= 5 && Number.isFinite(w) && w > 0 && w <= 100) {
      weightBySym.set(sym, w);
    }
  }
  for (const m of text.matchAll(/\b(\d{1,3}(?:\.\d+)?)\s*%\s*\b([A-Za-z]{1,5})\b/g)) {
    const sym = m[2].toUpperCase();
    const w = Number(m[1]);
    if (sym.length >= 1 && sym.length <= 5 && Number.isFinite(w) && w > 0 && w <= 100) {
      weightBySym.set(sym, w);
    }
  }

  if (!weightBySym.size) {
    // Bare tickers without weights — only when resolver finds them.
    return resolveSymbolsFromText(text).map((symbol) => ({ symbol, weightPct: null }));
  }

  // Force resolver scan via research-list phrasing, then keep only validated symbols.
  const validated = new Set(
    resolveSymbolsFromText(`Research holdings on ${[...weightBySym.keys()].join(", ")}`),
  );
  const out: Array<{ symbol: string; weightPct: number | null }> = [];
  for (const [symbol, weightPct] of weightBySym) {
    if (!validated.has(symbol)) continue;
    out.push({ symbol, weightPct });
  }
  return out;
}

/** Parse sector sleeve weights: `40% technology`, `30% financial stocks`, `10% cash`. */
export type SectorSleeveSlice = {
  key: "technology" | "financials" | "healthcare" | "cash" | "other";
  label: string;
  weightPct: number;
};

export function parseSectorSleeve(text: string): SectorSleeveSlice[] {
  const out: SectorSleeveSlice[] = [];
  const seen = new Set<string>();
  const patterns: Array<{ key: SectorSleeveSlice["key"]; label: string; re: RegExp }> = [
    { key: "technology", label: "Technology", re: /(\d{1,3}(?:\.\d+)?)\s*%\s*(?:in\s+)?(?:technology|tech)\s*stocks?/gi },
    { key: "financials", label: "Financials", re: /(\d{1,3}(?:\.\d+)?)\s*%\s*(?:in\s+)?(?:financial|financials|finance)\s*stocks?/gi },
    { key: "healthcare", label: "Healthcare", re: /(\d{1,3}(?:\.\d+)?)\s*%\s*(?:in\s+)?(?:healthcare|health\s*care)\s*stocks?/gi },
    { key: "cash", label: "Cash", re: /(\d{1,3}(?:\.\d+)?)\s*%\s*(?:in\s+)?cash\b/gi },
  ];
  // Also support "technology stocks, 40%" / "40% technology"
  const alt: Array<{ key: SectorSleeveSlice["key"]; label: string; re: RegExp }> = [
    { key: "technology", label: "Technology", re: /(?:technology|tech)\s*stocks?[^\d%]{0,24}(\d{1,3}(?:\.\d+)?)\s*%/gi },
    { key: "financials", label: "Financials", re: /(?:financial|financials)\s*stocks?[^\d%]{0,24}(\d{1,3}(?:\.\d+)?)\s*%/gi },
    { key: "healthcare", label: "Healthcare", re: /(?:healthcare|health\s*care)\s*stocks?[^\d%]{0,24}(\d{1,3}(?:\.\d+)?)\s*%/gi },
    { key: "cash", label: "Cash", re: /\bcash[^\d%]{0,24}(\d{1,3}(?:\.\d+)?)\s*%/gi },
  ];

  const ingest = (key: SectorSleeveSlice["key"], label: string, raw: string) => {
    const w = Number(raw);
    if (!Number.isFinite(w) || w <= 0 || w > 100 || seen.has(key)) return;
    seen.add(key);
    out.push({ key, label, weightPct: w });
  };

  for (const p of patterns) {
    for (const m of text.matchAll(p.re)) ingest(p.key, p.label, m[1]!);
  }
  for (const p of alt) {
    for (const m of text.matchAll(p.re)) ingest(p.key, p.label, m[1]!);
  }
  return out;
}

function resolveRateScenarioLabel(text: string): { label: string; direction: "declining" | "rising" | "unspecified" } {
  if (/\b(declining|falling|lower(ing)?|cutting|cuts?|easing)\b.*\b(interest\s+)?rates?\b/i.test(text) ||
      /\b(interest\s+)?rates?\b.*\b(declining|falling|lower(ing)?|cuts?|easing)\b/i.test(text)) {
    return { label: "Declining interest rates", direction: "declining" };
  }
  if (/\b(rising|hikes?|higher|tightening)\b.*\b(interest\s+)?rates?\b/i.test(text) ||
      /\brate\s+hikes?\b/i.test(text)) {
    return { label: "Rising interest rates / rate hikes", direction: "rising" };
  }
  return { label: "Interest-rate scenario (direction unspecified)", direction: "unspecified" };
}

function resolveInflationLabel(text: string): string {
  if (/\bpersistent\s+inflation\b/i.test(text)) return "Persistent inflation";
  if (/\bsticky\s+inflation\b/i.test(text)) return "Sticky inflation";
  return "Inflation spike / elevated inflation";
}

function resolveRecessionLabel(text: string): string {
  if (/\b(shallow\s+downturn|mild\s+recession)\b/i.test(text)) return "Mild recession / shallow downturn";
  if (/\beconomic\s+recession\b/i.test(text)) return "Economic recession";
  return "Recession / growth contraction";
}

export function formatHypotheticalPortfolioReply(
  text: string,
  opts?: {
    fredBrief?: string[];
    holdings?: Array<{ symbol: string; weightPct: number | null }>;
    /** Pre-formatted risk lines from ETF proxy engine (coding-only). */
    riskSectionLines?: string[];
  },
): string {
  const amountMatch = text.match(/\$\s*(\d{1,3}(?:,\d{3})+|\d{4,9})\b/);
  const amountLabel = amountMatch ? `$${amountMatch[1]}` : "$100,000";
  const sleeve = parseSectorSleeve(text);
  const rate = resolveRateScenarioLabel(text);
  const inflationLabel = resolveInflationLabel(text);
  const recessionLabel = resolveRecessionLabel(text);
  const holdings = opts?.holdings?.length ? opts.holdings : parseHypotheticalHoldings(text);

  const hasTech = sleeve.some((s) => s.key === "technology") || /\b(technology|tech)\b/i.test(text);
  const hasHealth = sleeve.some((s) => s.key === "healthcare") || /\b(healthcare|health\s*care)\b/i.test(text);
  const hasFin = sleeve.some((s) => s.key === "financials") || /\b(financial|financials)\b/i.test(text);
  const hasCash = sleeve.some((s) => s.key === "cash") || /\bcash\b/i.test(text);

  const lines = [
    "**Hypothetical portfolio scenario — RESEARCH ONLY**",
    "",
    "_This is **not** your live broker book, P&L, or STATUS positions._",
    "",
  ];

  if (holdings.length) {
    lines.push(`Assumed sleeve: **${amountLabel}** with **named holdings**:`);
    for (const h of holdings) {
      lines.push(
        `- **${h.symbol}**${h.weightPct != null ? ` · ${h.weightPct}%` : " · weight **WAIT** (not specified)"}`,
      );
    }
    lines.push("");
  } else if (sleeve.length) {
    const sum = sleeve.reduce((a, s) => a + s.weightPct, 0);
    lines.push(`Assumed sleeve: **${amountLabel}** with **stated sector weights** (from your prompt):`);
    for (const s of sleeve) {
      const dollars = Math.round((amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : 100_000) * (s.weightPct / 100));
      lines.push(`- **${s.label}** · ${s.weightPct}% ≈ $${dollars.toLocaleString()}`);
    }
    if (Math.abs(sum - 100) > 0.5) {
      lines.push(`- _Weights sum to **${sum}%** (not 100%) — treat remainder as **WAIT** / unspecified._`);
    }
    lines.push("");
  } else {
    const sectors =
      hasTech && hasHealth && hasFin
        ? "technology + financials + healthcare"
        : hasTech && hasHealth
          ? "technology + healthcare"
          : hasTech
            ? "technology"
            : hasHealth
              ? "healthcare"
              : "the named sectors";
    lines.push(
      `Assumed sleeve: **${amountLabel}** across **${sectors}** (equal-weight starter — no explicit % sleeve parsed).`,
      "",
    );
  }

  // Scenario frames — match client Prompt 5 wording (declining rates, persistent inflation, recession).
  const rateBlurb =
    rate.direction === "declining"
      ? "Duration-sensitive growth/tech often benefits as discount rates fall; financials (esp. net-interest-margin banks) can face mixed pressure; cash yield declines; healthcare usually less rate-driven than multiples."
      : rate.direction === "rising"
        ? "Growth / long-duration tech multiples typically compress first; financials can be mixed (NIM vs valuation); healthcare defensives can lag but are not immune if discount rates rise broadly; cash yield rises."
        : "Rate path not specified clearly — both rising and declining paths would reprice duration assets first; mark directional P&L **WAIT** without a rate path.";

  lines.push(
    "### Scenario frames (qualitative — verified macro series not invented)",
    `- **${rate.label}:** ${rateBlurb}`,
    `- **${inflationLabel}:** Input costs and margin pressure vary by sector; real yields and multiples matter more than a single CPI print. Financials may see loan-quality stress if inflation stays sticky with higher-for-longer rates.`,
    `- **${recessionLabel}:** Cyclical tech and financial credit risk soften first; selective healthcare (necessity demand) often shows relative resilience — still subject to funding and M&A cycles; cash is the ballast but opportunity-cost rises if recovery is sharp.`,
    "",
  );

  if (opts?.fredBrief?.length) {
    lines.push("### Macro backdrop (verified FRED when available)", ...opts.fredBrief.map((l) => `- ${l}`), "");
  } else {
    lines.push(
      "### Macro backdrop",
      "- FRED series: **WAIT** on this turn — ask `rates backdrop` / macro rates for the verified FRED card.",
      "",
    );
  }

  lines.push(
    "### Economic indicators to monitor (highest priority for this sleeve)",
    "- **Federal funds rate / policy path** — drives discount rates and cash yield.",
    "- **10-year Treasury + 10Y–2Y curve** — duration and recession-signal context.",
    "- **CPI (or core inflation)** — persistent inflation vs disinflation narrative.",
    "- **Unemployment + real GDP** — recession confirmation / labor softness.",
    "- **Sector ETF relative strength** (XLK / XLF / XLV) — sleeve factor confirmation (**WAIT** for live ETF RS unless asked).",
    "",
  );

  if (opts?.riskSectionLines?.length) {
    lines.push(...opts.riskSectionLines);
    lines.push(
      "### Concentration vulnerabilities",
      hasTech ? "- Tech sleeve can factor-collapse in risk-off even if ‘diversified’ names." : null,
      hasFin ? "- Financials add credit/rates factor — not cash-like diversification." : null,
      hasCash ? "- Cash lowers path drawdown but creates drag if equities rally." : null,
      "- Single-name holdings were not provided — stock-level concentration remains **WAIT**.",
      "",
    );
  } else {
    lines.push(
      "### Correlations, drawdowns & concentration",
      hasTech
        ? "- **Technology concentration:** intra-tech correlations often spike in risk-off — a tech sleeve can behave like one factor."
        : "- Sector concentration depends on named weights above.",
      hasFin
        ? "- **Financials:** often correlated with rates and credit cycle — not a pure diversifier vs equity beta."
        : null,
      hasHealth
        ? "- **Healthcare:** can diversify vs pure tech, but does **not** eliminate equity beta."
        : null,
      hasCash
        ? "- **Cash:** reduces drawdown depth but creates cash-drag if risk assets rally."
        : null,
      "- **Historical correlation matrices / max drawdown tables** for this exact sleeve: **WAIT** on this turn (ETF proxy engine did not attach).",
      "- **Concentration risk:** largest vulnerabilities are single-sector crowding (if one sleeve dominates), factor crowding, and liquidity gaps in stress.",
      "",
    );
  }

  lines.push("### What is missing (WAIT)");

  if (!holdings.length && !sleeve.length) {
    lines.push(
      "- Named tickers / explicit sector % sleeve were **not** parsed — I will **not** invent holdings.",
    );
  } else if (!holdings.length) {
    lines.push(
      "- Named single-stock holdings were **not** provided — sector % sleeve is used; stock-level P&L remains **WAIT**.",
    );
  }
  if (opts?.riskSectionLines?.length) {
    lines.push(
      "- Single-stock correlation matrix (vs sector ETF proxies above): **WAIT** until holdings are named.",
      "- Options overlays / leverage: **WAIT**.",
    );
  } else {
    lines.push(
      "- Verified historical drawdown / correlation matrix for this custom mix: **WAIT**.",
    );
  }
  lines.push(
    "",
    "Status: **RESEARCH ONLY / NO TRADE** — hypothetical scenario only; use Status for a real connected account.",
  );

  return lines.filter((l) => l !== null).join("\n");
}

export function formatRiskRewardPartialReply(
  text: string,
  bundle: IntelligenceBundle | null,
): string {
  const symbols = resolveSymbolsFromText(text);
  const sym = symbols[0] ?? bundle?.symbols[0] ?? "the symbol";
  const lines = [
    `**Risk/reward framing — ${sym}**`,
    "",
    "Status: **PARTIAL / RESEARCH ONLY** — a full risk/reward card needs levels, implied move, and position constraints that are not all verified here.",
    "",
    "I will **not** collapse this ask into a next-earnings date alone.",
    "",
  ];

  const earn = bundle?.layers.find((l) => l.layer === "earnings" && l.available && l.payload);
  if (earn) {
    const ep = earn.payload as EarningsPayload;
    lines.push(
      "**Supporting earnings calendar (not a trade authorization)**",
      `- Next report: ${ep.reportDate ?? "unavailable"} (${ep.dateType ?? "n/a"})${ep.reportTime && ep.reportTime !== "unknown" ? ` · ${ep.reportTime}` : ""}`,
      `- EPS estimate: ${formatEps(ep.epsEstimate)}`,
      `- Source: ${earn.source}`,
      "",
    );
  }

  const price = bundle?.layers.find((l) => l.layer === "prices" && l.available && l.ticker === sym);
  if (price?.payload && typeof (price.payload as { price?: number }).price === "number") {
    lines.push(
      `**Reference price:** $${((price.payload as { price: number }).price).toFixed(2)} (${price.source})`,
      "",
    );
  }

  lines.push(
    "**Required for a data-backed R/R card (currently WAIT / incomplete)**",
    "1. Verified entry, invalidation (stop), and target levels — or explicit trader-provided levels",
    "2. Options implied move into the event (live IV), when the catalyst is earnings",
    "3. Position size / max loss in account terms",
    "4. Catalyst calendar confirmation (not estimated-only when avoidable)",
    "",
    "Decision: **NO TRADE** from this message alone. Provide levels or run earnings-candidate research for gap registers — still not a BUY authorization.",
  );
  return lines.join("\n");
}

function formatPctOrWait(n: number | null, digits = 1): string {
  if (n === null || !Number.isFinite(n)) return "**WAIT**";
  return `${(n * 100).toFixed(digits)}%`;
}

function buildEpsTrendFromAvEarnings(
  symbol: string,
  earnings: Awaited<ReturnType<typeof fetchAlphaVantageEarnings>>,
): DeskOverviewBrief["epsTrend"] {
  if (!earnings.available || !earnings.quarterly.length) return null;
  const rows = [...earnings.quarterly]
    .filter((r) => r.reportedEPS != null)
    .sort((a, b) => (a.fiscalDateEnding < b.fiscalDateEnding ? 1 : -1));
  if (rows.length < 2) return null;
  const latest = rows[0]!;
  const prior = rows[4] ?? rows[rows.length - 1]!; // ~1y ago when possible
  let yoy: number | null = null;
  if (
    latest.reportedEPS != null &&
    prior.reportedEPS != null &&
    Math.abs(prior.reportedEPS) > 1e-9
  ) {
    yoy = ((latest.reportedEPS - prior.reportedEPS) / Math.abs(prior.reportedEPS)) * 100;
  }
  const surprises = rows
    .map((r) => r.surprisePercent)
    .filter((x): x is number => x != null && Number.isFinite(x));
  const avgSurprise =
    surprises.length >= 2
      ? surprises.slice(0, 8).reduce((a, b) => a + b, 0) / Math.min(8, surprises.length)
      : null;
  return {
    quarters: rows.length,
    latestReportedEps: latest.reportedEPS,
    priorReportedEps: prior.reportedEPS,
    yoyEpsChangePct: yoy != null ? +yoy.toFixed(1) : null,
    avgSurprisePct: avgSurprise != null ? +avgSurprise.toFixed(2) : null,
    source: earnings.source,
  };
}

function formatSecFactsBrief(summary: SecCompanyFactsSummary): string[] {
  const d = summary.derived;
  const lines = [
    `**${summary.symbol}** (SEC companyfacts / XBRL${summary.cik ? ` · CIK ${summary.cik}` : ""})`,
    `- Gross margin: ${formatPctOrWait(d.grossMargin)}`,
    `- Operating margin: ${formatPctOrWait(d.operatingMargin)}`,
    `- Net margin: ${formatPctOrWait(d.netMargin)}`,
    `- Free cash flow: ${d.freeCashFlow != null && Number.isFinite(d.freeCashFlow) ? `$${d.freeCashFlow.toLocaleString()}` : "**WAIT**"}`,
    `- Current ratio: ${d.currentRatio != null && Number.isFinite(d.currentRatio) ? d.currentRatio.toFixed(2) : "**WAIT**"}`,
  ];
  if (!summary.available) {
    lines.push(`- Status: **WAIT** — ${summary.error ?? "companyfacts unavailable"}`);
  }
  return lines;
}

export type DeskOverviewBrief = {
  symbol: string;
  peRatio: number | null;
  profitMargin: number | null;
  operatingMarginTTM: number | null;
  revenueTTM: number | null;
  marketCap: number | null;
  sector: string | null;
  industry: string | null;
  source: string;
  available: boolean;
  /** Coding-only historical EPS surprise proxy from AV quarterly earnings. */
  epsTrend?: {
    quarters: number;
    latestReportedEps: number | null;
    priorReportedEps: number | null;
    yoyEpsChangePct: number | null;
    avgSurprisePct: number | null;
    source: string;
  } | null;
};

/** Multi-factor desk compare — verified layers only; WAIT where valuation/narrative missing. */
export function formatDeskCompareReply(
  text: string,
  bundle: IntelligenceBundle,
  secFactsBySymbol?: Record<string, SecCompanyFactsSummary | null>,
  overviewBySymbol?: Record<string, DeskOverviewBrief | null>,
): string {
  const symbols = resolveSymbolsFromText(text);
  const syms = symbols.length ? symbols : bundle.symbols;
  const label = syms.join(" vs ") || "names";
  const lines: string[] = [
    `**Research-desk compare — ${label}**`,
    "",
    "_Verified layers only. Missing factors are marked **WAIT** — nothing invented. This is fundamental research, not an earnings-event trade card._",
    "",
  ];

  // Price
  lines.push("### Price (verified)");
  const priceBlock = formatVerifiedPriceReply(bundle, syms);
  lines.push(priceBlock || "Price: **UNAVAILABLE**");
  lines.push("");

  // Momentum — per name when available (partial OK)
  lines.push("### Momentum");
  const indLayers = bundle.layers.filter(
    (l) => l.layer === "indicators" && (!syms.length || (l.ticker && syms.includes(l.ticker))),
  );
  const rsiBlocks = indLayers.map(formatRsiLine).filter((b): b is string => Boolean(b));
  if (rsiBlocks.length) {
    lines.push(...rsiBlocks);
    const mom = formatMomentumCompare(bundle);
    if (mom) lines.push("", mom);
    if (syms.length && rsiBlocks.length < syms.length) {
      lines.push("", `_Partial:_ indicators missing for ${syms.length - rsiBlocks.length} of ${syms.length} names.`);
    }
  } else {
    lines.push("Momentum / RSI: **WAIT** — indicators layer unavailable for one or more names.");
  }
  lines.push("");

  // Business quality — XBRL + AV overview when available
  lines.push("### Business quality / profitability");
  const factEntries = syms
    .map((s) => secFactsBySymbol?.[s] ?? null)
    .filter((f): f is SecCompanyFactsSummary => Boolean(f));
  if (factEntries.length) {
    lines.push("_Point fundamentals (SEC XBRL companyfacts — not multi-quarter growth series):_");
    for (const f of factEntries) {
      lines.push(...formatSecFactsBrief(f), "");
    }
  } else {
    lines.push(
      "SEC XBRL point facts: **WAIT** — companyfacts not attached on this turn.",
    );
  }

  const ovEntries = syms
    .map((s) => overviewBySymbol?.[s] ?? null)
    .filter((o): o is DeskOverviewBrief => Boolean(o?.available));
  if (ovEntries.length) {
    lines.push("_Vendor overview (Alpha Vantage — point TTM / profile):_");
    for (const o of ovEntries) {
      lines.push(
        `**${o.symbol}**`,
        `- Sector / industry: ${o.sector ?? "WAIT"} / ${o.industry ?? "WAIT"}`,
        `- Revenue TTM: ${o.revenueTTM != null ? `$${o.revenueTTM.toLocaleString()}` : "**WAIT**"}`,
        `- Profit margin: ${o.profitMargin != null ? `${(o.profitMargin * (o.profitMargin <= 1 ? 100 : 1)).toFixed(1)}%` : "**WAIT**"}`,
        `- Operating margin TTM: ${o.operatingMarginTTM != null ? `${(o.operatingMarginTTM * (o.operatingMarginTTM <= 1 ? 100 : 1)).toFixed(1)}%` : "**WAIT**"}`,
        `- Market cap: ${o.marketCap != null ? `$${o.marketCap.toLocaleString()}` : "**WAIT**"}`,
        `- Source: ${o.source}`,
        "",
      );
    }
  }

  lines.push(
    "_Still WAIT (do not invent):_",
    "- Multi-quarter **revenue growth** time series",
    "- Competitive moat / positioning narrative score",
  );
  const earnBlocks = bundle.layers
    .filter((l) => l.layer === "earnings" && (!syms.length || (l.ticker && syms.includes(l.ticker))))
    .map(formatEarningsLine)
    .filter((b): b is string => Boolean(b));
  if (earnBlocks.length) {
    lines.push("", "_Calendar context only (not the fundamental scorecard):_", ...earnBlocks);
  }
  lines.push("");

  // Valuation — AV PE when present; historical averages still WAIT
  lines.push("### Valuation");
  if (ovEntries.some((o) => o.peRatio != null)) {
    lines.push("_Trailing P/E (vendor overview — point-in-time):_");
    for (const o of ovEntries) {
      lines.push(
        `- **${o.symbol}** P/E: ${o.peRatio != null ? o.peRatio.toFixed(2) : "**WAIT**"} (${o.source})`,
      );
    }
    lines.push(
      "",
      "P/E vs **multi-year historical averages** / full peer EV bands: **WAIT** — long history percentile series not assembled here (will not invent “cheap/expensive”).",
    );
  } else {
    lines.push(
      "Trailing/forward multiples: **WAIT** — overview P/E not available for these names on this turn.",
    );
    lines.push("I will **not** invent P/E, EV/EBITDA, or “expensive vs cheap” from price alone.");
  }
  lines.push("");

  // Historical performance proxy from AV quarterly EPS (coding-only, existing key)
  const trends = ovEntries.filter((o) => o.epsTrend);
  lines.push("### Historical performance proxy (EPS — verified quarterly when available)");
  if (trends.length) {
    for (const o of trends) {
      const t = o.epsTrend!;
      lines.push(
        `**${o.symbol}** (${t.source})`,
        `- Quarters retrieved: ${t.quarters}`,
        `- Latest vs ~prior EPS: ${t.latestReportedEps ?? "WAIT"} → ${t.priorReportedEps ?? "WAIT"}`,
        `- Approx EPS change: ${t.yoyEpsChangePct != null ? `${t.yoyEpsChangePct.toFixed(1)}%` : "**WAIT**"}`,
        `- Avg EPS surprise % (recent quarters): ${t.avgSurprisePct != null ? `${t.avgSurprisePct.toFixed(2)}%` : "**WAIT**"}`,
        "",
      );
    }
    lines.push(
      "_Note:_ This is an **EPS history proxy**, not full multi-quarter revenue growth from income statements. Revenue growth series remains **WAIT** when not in XBRL point facts.",
      "",
    );
  } else {
    lines.push(
      "- EPS history proxy: **WAIT** — Alpha Vantage quarterly earnings not attached on this turn.",
      "",
    );
  }

  // Strongest fundamentals — only from available verified fields
  lines.push("### Relative read (available fields only)");
  if (factEntries.length || ovEntries.length) {
    lines.push(
      "Strongest **point** fundamentals among names with verified XBRL/overview rows should be judged on margins + FCF + (when present) trailing P/E — **not** on next-earnings timing.",
    );
    lines.push(
      "A single “winner” label is **WAIT** when multi-quarter growth and historical valuation averages are missing.",
    );
  } else {
    lines.push("Relative fundamental ranking: **WAIT** — insufficient verified fundamental fields on this turn.");
  }
  lines.push("");

  // Key risks
  lines.push("### Key risks");
  const newsBlocks = bundle.layers
    .filter((l) => l.layer === "news" && l.available && (!syms.length || (l.ticker && syms.includes(l.ticker))))
    .map(formatNewsLine)
    .filter((b): b is string => Boolean(b));
  if (newsBlocks.length) {
    lines.push("_Recent headline context (not a complete risk register):_", ...newsBlocks);
  } else {
    lines.push("News-derived risk context: **UNAVAILABLE** from configured feeds.");
  }
  const edgar = formatEdgarReply(
    `latest SEC filings ${syms.join(" ")}`,
    bundle,
  );
  if (edgar) {
    lines.push("", "_Filing metadata (body text not extracted):_", edgar);
  } else {
    lines.push("", "SEC filing list: **UNAVAILABLE**.");
  }
  lines.push(
    "",
    "Narrative risk factors from 10-K/10-Q text: **WAIT** — full-text extract not wired.",
  );
  lines.push("");

  lines.push("### Bottom line");
  lines.push(
    "This is a **partial fundamental desk card** from connected layers (price, indicators, XBRL/overview when available). " +
      "It is **not** an earnings-surprise trade card. " +
      "For a protocol scorecard with gap registers, say " +
      `\`Run earnings candidate research on ${syms.join(", ") || "TICKERS"}\`.`,
  );
  lines.push("Status: **RESEARCH ONLY / NO TRADE**.");

  return lines.join("\n");
}

export function formatImpliedMoveReply(
  symbol: string,
  implied: Awaited<ReturnType<typeof fetchImpliedMove>>,
  earningsLine: string | null,
): string {
  const sym = symbol.toUpperCase();
  const lines = [
    `**Implied move — ${sym}**`,
    "",
  ];

  if (implied.available && implied.impliedMovePct != null) {
    lines.push(
      `- **Implied move:** ~${implied.impliedMovePct.toFixed(2)}%` +
        (implied.mock ? " *[MOCK — not live vendor]*" : ""),
      `- **IV:** ${implied.iv != null ? implied.iv : "n/a"}`,
      `- **Expiry:** ${implied.expiry ?? "n/a"}`,
      `- **Source:** ${implied.source}`,
      `- **Detail:** ${implied.detail}`,
      "",
    );
  } else {
    lines.push(
      "Live options implied move: **UNAVAILABLE / WAIT**",
      `- **Reason:** ${implied.error ?? implied.detail ?? "options IV not retrieved"}`,
      `- **Source:** ${implied.source}`,
      "",
      "I will **not** invent an implied move from the earnings date or EPS estimate alone.",
      "",
    );
  }

  if (earningsLine) {
    lines.push(
      "**Supporting earnings calendar (not a substitute for implied move)**",
      earningsLine,
      "",
    );
  }

  lines.push("Status: **RESEARCH ONLY / NO TRADE** — implied move is not a BUY/SELL signal.");
  return lines.join("\n");
}

export function formatRatesBackdropReply(
  backdrop: Awaited<ReturnType<typeof fetchFredMacroBackdrop>>,
): string {
  const lines = [
    "**Current rates backdrop (plain English)**",
    "",
  ];

  if (!backdrop.available) {
    lines.push(
      "Status: **UNAVAILABLE / WAIT**",
      `- **Reason:** ${backdrop.error ?? "FRED series not retrieved"}`,
      `- **Source:** ${backdrop.source}`,
      "",
      "I will **not** invent fed funds, 10-year yields, or curve levels.",
      "",
      "In plain English (definitions only, not current readings):",
      "- **Fed funds:** overnight policy rate set by the Fed.",
      "- **10-year Treasury:** longer-term growth/inflation/term-premium gauge.",
      "- **Curve (e.g. 10Y–2Y):** gap between long and short yields; inverted often signals tight policy / growth concern.",
    );
    return lines.join("\n");
  }

  const byId = Object.fromEntries(backdrop.series.map((s) => [s.seriesId, s]));
  const fed = byId.FEDFUNDS;
  const dgs10 = byId.DGS10;
  const curve = byId.T10Y2Y;

  lines.push(`_Source: ${backdrop.source} · as of bundle ${backdrop.asOf}_`, "");

  if (fed?.value != null) {
    lines.push(
      `**Fed funds:** ${fed.value}% (observation date ${fed.date}). This is the overnight policy rate — how restrictive money is today.`,
    );
  } else {
    lines.push("**Fed funds:** WAIT — series not in this snapshot.");
  }

  if (dgs10?.value != null) {
    lines.push(
      `**10-year Treasury:** ${dgs10.value}% (as of ${dgs10.date}). This is what markets price for longer-term growth, inflation, and term premium — it matters for equity valuations, especially long-duration tech.`,
    );
  } else {
    lines.push("**10-year Treasury:** WAIT — series not in this snapshot.");
  }

  if (curve?.value != null) {
    const slope =
      curve.value < -0.1 ? "inverted" : curve.value < 0.3 ? "flat-to-mildly steep" : "steepening/steep";
    lines.push(
      `**Curve (10Y–2Y spread):** ${curve.value} pp (as of ${curve.date}) — currently **${slope}**. ` +
        "Inverted (short > long) often signals tight policy and growth caution; a rising long end vs short can pressure growth multiples.",
    );
  } else {
    lines.push("**Yield curve:** WAIT — spread series not in this snapshot.");
  }

  lines.push("", "**Other verified FRED readings:**");
  for (const row of formatFredMacroBrief(backdrop)) {
    lines.push(`- ${row}`);
  }
  lines.push("", "Status: **RESEARCH ONLY** — a rates backdrop is not a trade signal.");
  return lines.join("\n");
}

function countDataIntents(text: string): number {
  let n = 0;
  if (PRICE_QUERY_RE.test(text) || /\bcompare\b/i.test(text)) n++;
  if (RSI_QUERY_RE.test(text) || MULTI_INDICATOR_RE.test(text) || MOMENTUM_RE.test(text)) n++;
  if (NEWS_QUERY_RE.test(text)) n++;
  if (SENTIMENT_QUERY_RE.test(text)) n++;
  if (EARNINGS_QUERY_RE.test(text)) n++;
  if (FILING_QUERY_RE.test(text)) n++;
  return n;
}

function isCrossFeatureQuery(text: string): boolean {
  return countDataIntents(text) >= 2 && resolveSymbolsFromText(text).length >= 1;
}

function toMarketMeta(bundle: IntelligenceBundle): MarketMeta {
  const meta = bundleMeta(bundle);
  const priceLayer = bundle.layers.find((l) => l.layer === "prices" && l.available);
  const gdeltLayer = bundle.layers.find((l) => l.layer === "gdelt" && l.available);
  return {
    symbols: meta.symbols,
    source: priceLayer?.source?.toLowerCase() ?? gdeltLayer?.source?.toLowerCase() ?? meta.sources[0]?.toLowerCase() ?? null,
    sourceName: priceLayer?.source ?? gdeltLayer?.source ?? meta.sources[0] ?? null,
    stale: meta.stale,
    timestamp: gdeltLayer?.timestamp ?? meta.timestamp,
  };
}

function symbolLayersAvailable(bundle: IntelligenceBundle, symbol: string): boolean {
  return bundle.layers.some((l) => l.ticker === symbol && l.available);
}

function formatUnavailableReply(bundle: IntelligenceBundle): string {
  const symbols = bundle.symbols.length ? bundle.symbols.join(", ") : "that symbol";
  const lines = [
    `I don't have verified market data for **${symbols}**.`,
    "",
    "The following could not be retrieved from our data services:",
  ];

  const checks = [
    { layer: "prices", label: "Current price" },
    { layer: "indicators", label: "RSI / technical indicators" },
    { layer: "earnings", label: "Earnings date" },
    { layer: "edgar", label: "SEC filings" },
    { layer: "sentiment", label: "Social sentiment" },
    { layer: "news", label: "News headlines" },
  ] as const;

  for (const sym of bundle.symbols) {
    for (const check of checks) {
      const layer = bundle.layers.find((l) => l.layer === check.layer && l.ticker === sym);
      if (!layer?.available) {
        lines.push(`- **${check.label} (${sym}):** unavailable${layer?.error ? ` — ${layer.error}` : ""}`);
      }
    }
  }

  lines.push("", "I won't invent or estimate any financial figures. Please verify the ticker symbol.");
  return lines.join("\n");
}

function shouldBlockHallucination(text: string, bundle: IntelligenceBundle): boolean {
  if (!bundle.symbols.length || !DATA_QUERY_RE.test(text)) return false;
  return bundle.symbols.every((sym) => !symbolLayersAvailable(bundle, sym));
}

function formatRsiLine(layer: LayerEnvelope): string | null {
  if (layer.layer !== "indicators" || !layer.available || !layer.payload) return null;
  const ind = layer.payload as GatewayIndicators;
  if (typeof ind.rsi_14 !== "number") return null;
  const sym = layer.ticker ?? "Symbol";
  let tone = "neutral";
  if (ind.rsi_14 >= 70) tone = "overbought";
  else if (ind.rsi_14 <= 30) tone = "oversold";
  return `**${sym} RSI (14):** ${ind.rsi_14.toFixed(2)} — ${tone} zone (0–100 scale)\n- **Source:** ${layer.source}\n- **As of:** ${layer.timestamp}`;
}

function formatIndicatorBundle(layer: LayerEnvelope): string | null {
  if (layer.layer !== "indicators" || !layer.available || !layer.payload) return null;
  const ind = layer.payload as GatewayIndicators;
  const sym = layer.ticker ?? "Symbol";
  const parts: string[] = [`**${sym} technical indicators**`, ""];
  if (typeof ind.rsi_14 === "number") parts.push(`- **RSI (14):** ${ind.rsi_14.toFixed(2)}`);
  if (typeof ind.macd === "number") parts.push(`- **MACD:** ${ind.macd.toFixed(4)}`);
  if (typeof ind.macd_signal === "number") parts.push(`- **MACD Signal:** ${ind.macd_signal.toFixed(4)}`);
  if (typeof ind.sma_20 === "number") parts.push(`- **SMA 20:** $${ind.sma_20.toFixed(2)}`);
  if (typeof ind.sma_50 === "number") parts.push(`- **SMA 50:** $${ind.sma_50.toFixed(2)}`);
  if (typeof ind.sma_200 === "number") parts.push(`- **SMA 200:** $${ind.sma_200.toFixed(2)}`);
  if (typeof ind.volume === "number") parts.push(`- **Volume (session):** ${ind.volume.toLocaleString()}`);
  if (typeof ind.average_volume === "number") {
    parts.push(`- **Avg volume:** ${ind.average_volume.toLocaleString()}`);
  }
  if (typeof ind.relative_volume === "number") {
    parts.push(`- **Relative volume:** ${ind.relative_volume.toFixed(2)}x`);
  }
  if (typeof ind.atr_14 === "number") parts.push(`- **ATR (14):** $${ind.atr_14.toFixed(2)}`);
  if (typeof ind.bollinger_upper === "number" && typeof ind.bollinger_lower === "number") {
    parts.push(
      `- **Bollinger (proxy band):** $${ind.bollinger_lower.toFixed(2)} – $${ind.bollinger_upper.toFixed(2)}`,
    );
  }

  // Soft structure from verified SMAs / ATR — not a full S/R map.
  const structure: string[] = [];
  if (typeof ind.sma_20 === "number") structure.push(`near-term pivot / support-resistance proxy: SMA20 $${ind.sma_20.toFixed(2)}`);
  if (typeof ind.sma_50 === "number") structure.push(`intermediate: SMA50 $${ind.sma_50.toFixed(2)}`);
  if (typeof ind.sma_200 === "number") structure.push(`trend: SMA200 $${ind.sma_200.toFixed(2)}`);
  if (typeof ind.week_52_high === "number") structure.push(`52-week high: $${ind.week_52_high.toFixed(2)}`);
  if (typeof ind.week_52_low === "number") structure.push(`52-week low: $${ind.week_52_low.toFixed(2)}`);
  if (structure.length) {
    parts.push("", "### Support / resistance proxies (verified levels only)");
    for (const s of structure) parts.push(`- ${s}`);
    parts.push("- Discrete swing highs/lows: **WAIT** — bar-level swing map not assembled on this path.");
  }

  const setups: string[] = [];
  if (typeof ind.rsi_14 === "number") {
    if (ind.rsi_14 >= 70) setups.push("RSI ≥ 70 — stretched; pullback / mean-reversion risk elevated (not a short signal).");
    else if (ind.rsi_14 <= 30) setups.push("RSI ≤ 30 — oversold zone; bounce attempts possible but trend context still required.");
    else setups.push("RSI mid-range — no extreme overbought/oversold flag from RSI alone.");
  }
  if (typeof ind.macd === "number" && typeof ind.macd_signal === "number") {
    setups.push(
      ind.macd >= ind.macd_signal
        ? "MACD at/above signal — momentum bias constructive on this snapshot (research only)."
        : "MACD below signal — momentum bias softer on this snapshot (research only).",
    );
  }
  if (typeof ind.sma_20 === "number" && typeof ind.sma_50 === "number") {
    setups.push(
      ind.sma_20 >= ind.sma_50
        ? "SMA20 ≥ SMA50 — short-term trend stacked above intermediate."
        : "SMA20 < SMA50 — short-term trend below intermediate average.",
    );
  }
  if (setups.length) {
    parts.push("", "### Near-term scenarios (from verified indicators only)");
    for (const s of setups) parts.push(`- ${s}`);
    parts.push("- Status: **RESEARCH ONLY / NO TRADE** — levels are proxies, not entry orders.");
  }

  parts.push("", `- **Source:** ${layer.source} (gateway-computed)`);
  parts.push(`- **As of:** ${layer.timestamp}`);
  return parts.join("\n");
}

function formatOverboughtOversold(layer: LayerEnvelope): string | null {
  if (layer.layer !== "indicators" || !layer.available || !layer.payload) return null;
  const ind = layer.payload as GatewayIndicators;
  if (typeof ind.rsi_14 !== "number") return null;
  const sym = layer.ticker ?? "Symbol";
  let verdict = "neither clearly overbought nor oversold";
  if (ind.rsi_14 >= 70) verdict = "**overbought** (RSI ≥ 70)";
  else if (ind.rsi_14 <= 30) verdict = "**oversold** (RSI ≤ 30)";
  return `**${sym}** is ${verdict}.\n\n- **RSI (14):** ${ind.rsi_14.toFixed(2)}\n- **Source:** ${layer.source}\n- **As of:** ${layer.timestamp}`;
}

function formatEps(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);
  if (value && typeof value === "object" && "fmt" in value && typeof (value as { fmt?: unknown }).fmt === "string") {
    return (value as { fmt: string }).fmt;
  }
  if (value && typeof value === "object" && "raw" in value) {
    const raw = (value as { raw?: unknown }).raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw.toFixed(2);
  }
  return "n/a";
}

function formatEarningsLine(layer: LayerEnvelope): string | null {
  if (layer.layer !== "earnings" || !layer.available || !layer.payload) return null;
  const ep = layer.payload as EarningsPayload;
  const sym = layer.ticker ?? ep.symbol;
  const dateLabel = ep.dateType === "confirmed" ? "confirmed" : "estimated";
  const timeLabel = ep.reportTime && ep.reportTime !== "unknown" ? ` (${ep.reportTime})` : "";
  const lines = [
    `**${sym} next earnings:** ${ep.reportDate ?? "unavailable"} — **${dateLabel}**${timeLabel}`,
    `- **EPS estimate:** ${formatEps(ep.epsEstimate)}`,
    `- **Source:** ${layer.source}`,
  ];
  if (ep.note) lines.push(`- **Note:** ${ep.note}`);
  return lines.join("\n");
}

function formatSentimentLine(layer: LayerEnvelope): string | null {
  if (layer.layer !== "sentiment") return null;
  const sym = layer.ticker ?? "Symbol";
  if (!layer.available || !layer.payload) {
    return (
      `**${sym} social sentiment:** unavailable\n` +
      `- **Reason:** ${layer.error ?? "no ticker-relevant posts from Reddit RSS or Stocktwits"}\n` +
      `- **As of:** ${layer.timestamp}\n` +
      `I won't invent trader commentary or infer sentiment from price/RSI.`
    );
  }
  const sp = layer.payload as SentimentPayload;
  const samples = sp.samplePosts.slice(0, 4).map((p) => `- ${p.title} (${p.subreddit})`);
  const lines = [
    `**${sym} social sentiment:** **${sp.tone}**`,
    `- **Mentions sampled:** ${sp.mentionCount}`,
    `- **Source:** ${layer.source}`,
    `- **As of:** ${layer.timestamp}`,
  ];
  if (samples.length) {
    lines.push("", "Sample posts:", ...samples);
  }
  if (sp.mentionCount < 8) {
    lines.push("", "Caveat: small sample — weak signal, not a reliable market indicator.");
  }
  return lines.join("\n");
}

interface FilingPayloadItem {
  form: string;
  filedAt: string;
  title: string;
  url: string;
}

function formatEdgarReply(text: string, bundle: IntelligenceBundle): string | null {
  const edgarLayers = bundle.layers.filter((l) => l.layer === "edgar" && l.available && l.payload);
  if (!edgarLayers.length) return null;

  const contentAsk = isFilingContentQuery(text);
  const specificForm = text.match(SPECIFIC_FORM_RE)?.[0]?.toUpperCase().replace(/(\d)([KQ])/i, "$1-$2");
  const blocks: string[] = [];

  for (const layer of edgarLayers) {
    const filings = layer.payload as FilingPayloadItem[];
    if (!filings?.length) continue;
    const sym = layer.ticker ?? "Symbol";

    if (specificForm) {
      const normalized = specificForm.replace("-", "");
      const match = filings.find((f) => {
        const fn = f.form.toUpperCase().replace("-", "").replace(/\/A$/, "");
        return fn === normalized || fn === specificForm.replace("-", "");
      });
      if (match) {
        if (contentAsk) {
          blocks.push(
            `**${sym} — ${specificForm} content Q&A: UNAVAILABLE**\n` +
              `I found the filing metadata, but **full-text extract is not wired**, so I cannot answer what it *says* about guidance, concentration, risk factors, or other narrative items.\n\n` +
              `- **Filed:** ${match.filedAt}\n` +
              `- **Form:** ${match.form}\n` +
              `- **Title:** ${match.title}\n` +
              `- **Source:** SEC EDGAR\n` +
              `- **Verified:** ${layer.timestamp}\n` +
              `- [Open on sec.gov](${match.url})\n\n` +
              `Status: **WAIT** — 10-K/10-Q/8-K text extraction (or guidance API) required.\n` +
              `I will **not** invent filing language from the link alone.`,
          );
        } else {
          blocks.push(
            `**${sym}'s latest ${specificForm}**\n` +
              `- **Filed:** ${match.filedAt}\n` +
              `- **Form:** ${match.form}\n` +
              `- **Title:** ${match.title}\n` +
              `- **Source:** SEC EDGAR\n` +
              `- **Verified:** ${layer.timestamp}\n` +
              `- [View on sec.gov](${match.url})`,
          );
        }
      } else {
        const available = filings.slice(0, 3).map((f) => `${f.form} (${f.filedAt})`).join(", ");
        blocks.push(
          `**${sym}'s latest ${specificForm}** is not in the recent EDGAR filings.\n` +
            `Available recent filings: ${available}\n` +
            `- **Source:** SEC EDGAR\n` +
            `- **Verified:** ${layer.timestamp}`,
        );
      }
    } else if (contentAsk) {
      const top = filings[0];
      blocks.push(
        `**${sym} — filing content Q&A: UNAVAILABLE**\n` +
          `Recent EDGAR metadata is available, but I cannot quote or paraphrase body text without a verified extract.\n\n` +
          `- Latest listed: **${top.form}** filed ${top.filedAt} — [sec.gov](${top.url})\n` +
          `- **Verified:** ${layer.timestamp}\n\n` +
          `Status: **WAIT** — full-text filing extract required.\n` +
          `I will **not** invent what the filing said.`,
      );
    } else {
      const lines = [
        `**${sym}'s latest SEC filings**`,
        `Verified via **SEC EDGAR** on ${layer.timestamp}:`,
        "",
      ];
      for (const f of filings.slice(0, 8)) {
        lines.push(`- **${f.form}** — filed ${f.filedAt} — [sec.gov](${f.url})`);
      }
      blocks.push(lines.join("\n"));
    }
  }

  return blocks.length ? blocks.join("\n\n") : null;
}

function formatGdeltReply(bundle: IntelligenceBundle): string | null {
  const gdelt = bundle.layers.find((l) => l.layer === "gdelt");
  if (!gdelt) {
    return [
      "**Macro news (GDELT):** unavailable",
      "- **Reason:** GDELT layer was not routed",
      "I won't invent macro headlines.",
    ].join("\n");
  }
  if (!gdelt.available || !gdelt.payload || !("events" in (gdelt.payload as object))) {
    return [
      "**Macro news (GDELT):** unavailable",
      `- **Reason:** ${gdelt.error ?? "no GDELT events returned"}`,
      `- **As of:** ${gdelt.timestamp}`,
      `- **Source:** ${gdelt.source}`,
      "I won't invent macro headlines.",
    ].join("\n");
  }
  const events = (gdelt.payload as { events: Array<{ title: string; url: string; publishedAt: string }> }).events;
  if (!events.length) {
    return [
      "**Macro news (GDELT):** unavailable",
      "- **Reason:** empty event list",
      `- **As of:** ${gdelt.timestamp}`,
      `- **Source:** ${gdelt.source}`,
      "I won't invent macro headlines.",
    ].join("\n");
  }
  const lines = [
    "**Macro news (GDELT)**",
    "",
    `- **Last refresh:** ${gdelt.timestamp}`,
    `- **Source:** ${gdelt.source}`,
    "",
    ...events.slice(0, 6).map((e, i) => `${i + 1}. ${e.title}`),
  ];
  return lines.join("\n");
}

function formatNewsLine(layer: LayerEnvelope): string | null {
  if (layer.layer !== "news") return null;
  const sym = layer.ticker ?? "Symbol";
  if (!layer.available || !layer.payload) {
    return `**${sym} news:** unavailable${layer.error ? ` — ${layer.error}` : ""}`;
  }
  const news = layer.payload as NewsPayload;
  const heads = news.headlines?.slice(0, 3) ?? [];
  if (!heads.length) return `**${sym} news:** no headlines`;
  return [
    `**${sym} latest news** (source: ${layer.source})`,
    ...heads.map((h, i) => `${i + 1}. ${h.title}`),
  ].join("\n");
}

function formatMomentumCompare(bundle: IntelligenceBundle): string | null {
  const rows: Array<{ sym: string; rsi: number }> = [];
  for (const layer of bundle.layers.filter((l) => l.layer === "indicators" && l.available && l.payload)) {
    const ind = layer.payload as GatewayIndicators;
    if (typeof ind.rsi_14 === "number" && layer.ticker) rows.push({ sym: layer.ticker, rsi: ind.rsi_14 });
  }
  if (rows.length < 2) return null;
  rows.sort((a, b) => b.rsi - a.rsi);
  return (
    `**Momentum (RSI-based):** **${rows[0].sym}** shows stronger short-term momentum ` +
    `(RSI ${rows[0].rsi.toFixed(2)}) vs **${rows[1].sym}** (RSI ${rows[1].rsi.toFixed(2)}). ` +
    `This is indicator-based only — not a trade recommendation.`
  );
}

function formatCrossFeatureReply(text: string, bundle: IntelligenceBundle): string | null {
  const parts: string[] = [];
  const wantsPrice = PRICE_QUERY_RE.test(text) || /\bcompare\b/i.test(text);
  const wantsRsi = RSI_QUERY_RE.test(text) || MULTI_INDICATOR_RE.test(text) || MOMENTUM_RE.test(text);
  const wantsNews = NEWS_QUERY_RE.test(text);
  const wantsSentiment = SENTIMENT_QUERY_RE.test(text);
  const wantsEarnings = EARNINGS_QUERY_RE.test(text);
  const wantsFilings = FILING_QUERY_RE.test(text);

  if (wantsPrice) {
    const price = formatVerifiedPriceReply(bundle, resolveSymbolsFromText(text));
    if (price) parts.push(price);
  }
  if (wantsRsi) {
    const rsi = bundle.layers
      .filter((l) => l.layer === "indicators")
      .map(formatRsiLine)
      .filter((b): b is string => Boolean(b));
    if (rsi.length) parts.push(rsi.join("\n\n"));
  }
  if (wantsNews) {
    const news = bundle.layers
      .filter((l) => l.layer === "news")
      .map(formatNewsLine)
      .filter((b): b is string => Boolean(b));
    if (news.length) parts.push(news.join("\n\n"));
    else parts.push("**News:** unavailable from configured feeds.");
  }
  if (wantsSentiment) {
    const sent = bundle.layers
      .filter((l) => l.layer === "sentiment")
      .map(formatSentimentLine)
      .filter((b): b is string => Boolean(b));
    if (sent.length) parts.push(sent.join("\n\n"));
  }
  if (wantsEarnings) {
    const earn = bundle.layers
      .filter((l) => l.layer === "earnings")
      .map(formatEarningsLine)
      .filter((b): b is string => Boolean(b));
    if (earn.length) parts.push(earn.join("\n\n"));
  }
  if (wantsFilings) {
    const edgar = formatEdgarReply(text, bundle);
    if (edgar) parts.push(edgar);
  }
  if (MOMENTUM_RE.test(text) || /\bcompare\b/i.test(text)) {
    const mom = formatMomentumCompare(bundle);
    if (mom) parts.push(mom);
  }

  return parts.length ? parts.join("\n\n") : null;
}

function tryFormatFromBundle(text: string, bundle: IntelligenceBundle): string | null {
  if (MACRO_QUERY_RE.test(text) && !bundle.symbols.length) {
    return formatGdeltReply(bundle);
  }

  if (isDeskCompareQuery(text)) {
    return formatDeskCompareReply(text, bundle);
  }

  // Multi-layer compare queries must not short-circuit on "SEC filings" alone.
  if (isCrossFeatureQuery(text)) {
    const cross = formatCrossFeatureReply(text, bundle);
    if (cross) return cross;
  }

  // Risk/reward before earnings-date shortcut (Phase 0: P0-RISK-001).
  if (isRiskRewardQuery(text)) {
    return formatRiskRewardPartialReply(text, bundle);
  }

  if (isFundamentalSeriesQuery(text)) {
    return formatFundamentalSeriesUnavailableReply(resolveSymbolsFromText(text));
  }

  // Implied move must not collapse to earnings-date-only (Phase 2).
  if (isImpliedMoveQuery(text)) {
    return null; // handled async in tryDeterministicDataReply
  }

  if (FILING_QUERY_RE.test(text)) {
    const edgarReply = formatEdgarReply(text, bundle);
    if (edgarReply) return edgarReply;
    if (isFilingContentQuery(text)) {
      const syms = resolveSymbolsFromText(text);
      const label = syms.join(", ") || "that symbol";
      return [
        `**Filing content Q&A: UNAVAILABLE** for **${label}**.`,
        "",
        "No verified EDGAR metadata/extract is attached for this ask.",
        "Status: **WAIT** — I will not invent what a 10-K/8-K said.",
      ].join("\n");
    }
  }

  // Earnings date shortcut — skip when the real ask is implied move.
  if (EARNINGS_QUERY_RE.test(text) && !isImpliedMoveQuery(text)) {
    const blocks = bundle.layers
      .filter((l) => l.layer === "earnings")
      .map(formatEarningsLine)
      .filter((b): b is string => Boolean(b));
    if (blocks.length) return blocks.join("\n\n");
  }

  if (SENTIMENT_QUERY_RE.test(text)) {
    const blocks = bundle.layers
      .filter((l) => l.layer === "sentiment")
      .map(formatSentimentLine)
      .filter((b): b is string => Boolean(b));
    if (blocks.length) return blocks.join("\n\n");
  }

  if (OVERBOUGHT_RE.test(text) || OVERSOLD_RE.test(text)) {
    const blocks = bundle.layers
      .filter((l) => l.layer === "indicators")
      .map(formatOverboughtOversold)
      .filter((b): b is string => Boolean(b));
    if (blocks.length) return blocks.join("\n\n");
  }

  if (RSI_QUERY_RE.test(text) || MULTI_INDICATOR_RE.test(text)) {
    const blocks = bundle.layers
      .filter((l) => l.layer === "indicators")
      .map((l) => (MULTI_INDICATOR_RE.test(text) ? formatIndicatorBundle(l) : formatRsiLine(l)))
      .filter((b): b is string => Boolean(b));
    if (blocks.length) return blocks.join("\n\n");
  }

  if (isHistoricalPriceQuery(text)) {
    return null; // handled in tryDeterministicPriceReply / tryDeterministicDataReply
  }

  if (isDeterministicPriceQuery(text, bundle.symbols)) {
    return formatVerifiedPriceReply(bundle, resolveSymbolsFromText(text));
  }

  return null;
}

/** Broader deterministic data path — blocks hallucination and formats verified layers. */
export async function tryDeterministicDataReply(
  userId: string,
  text: string,
): Promise<DeterministicPriceResult | null> {
  const result = await tryDeterministicDataReplyInner(userId, text);
  return result ? ensureFactPacket(result, text) : null;
}

async function tryDeterministicDataReplyInner(
  userId: string,
  text: string,
): Promise<DeterministicPriceResult | null> {
  if (isConversationAck(text)) return null;

  // NL screener — never resolve ABOVE/SECTOR as tickers (Phase 0: P0-TECH-005).
  if (isNlScreenerQuery(text)) {
    return {
      reply: formatNlScreenerUnavailableReply(text),
      meta: gapMeta([], "nl-screener-gate"),
    };
  }

  // Multi-name / multi-quarter fundamental series (Phase 0: P0-FUND-003).
  if (isFundamentalSeriesQuery(text)) {
    const symbols = resolveSymbolsFromText(text);
    return {
      reply: formatFundamentalSeriesUnavailableReply(symbols),
      meta: gapMeta(symbols, "fundamental-series-gate"),
    };
  }

  // Hypothetical portfolio stress — never STATUS / live P&L (Client PDF Prompt 5).
  if (isHypotheticalPortfolioQuery(text)) {
    const holdings = parseHypotheticalHoldings(text);
    const sleeve = parseSectorSleeve(text);
    const backdrop = await fetchFredMacroBackdrop().catch((e) => ({
      available: false,
      asOf: new Date().toISOString(),
      series: [],
      source: "FRED",
      error: (e as Error).message,
    }));
    const fredBrief = formatFredMacroBrief(backdrop);
    const risk = await buildSleeveRiskReport(userId, sleeve).catch(() => null);
    const riskSectionLines = risk ? formatSleeveRiskSection(risk) : undefined;
    return {
      reply: formatHypotheticalPortfolioReply(text, {
        holdings,
        fredBrief: fredBrief.length ? fredBrief : undefined,
        riskSectionLines,
      }),
      meta: gapMeta(
        holdings.map((h) => h.symbol),
        risk?.available
          ? "hypothetical-portfolio-v1+fred+etf-risk"
          : backdrop.available
            ? "hypothetical-portfolio-v1+fred"
            : "hypothetical-portfolio-v1",
      ),
    };
  }

  // Client Rev 9/14 — US general market / discovery / movers (before LLM or GDELT-only macro).
  const marketReply = await tryMarketIntelligenceReply(userId, text).catch(() => null);
  if (marketReply) return marketReply;

  // Implied move — before earnings-day calendar so "into earnings" cannot steal (Phase 2 Pack E).
  if (isImpliedMoveQuery(text)) {
    const symbols = resolveSymbolsFromText(text);
    const sym = symbols[0];
    if (!sym) {
      return {
        reply: [
          "**Implied move: WAIT**",
          "",
          "No ticker resolved. Ask e.g. `What's the implied move for AAPL into earnings?`",
        ].join("\n"),
        meta: gapMeta([], "implied-move-gate"),
      };
    }
    const [implied, { bundle }] = await Promise.all([
      fetchImpliedMove(sym).catch((e) => ({
        available: false as const,
        mock: false,
        source: "Massive Options",
        error: (e as Error).message,
        symbol: sym,
        impliedMovePct: null,
        iv: null,
        ivRank: null,
        expiry: null,
        underlyingPrice: null,
        detail: (e as Error).message,
      })),
      buildIntelligenceBundle(userId, text, [], { includeWatchlist: false }),
    ]);
    const earnLayer = bundle.layers.find(
      (l) => l.layer === "earnings" && l.ticker === sym && l.available,
    );
    const earnLine = earnLayer ? formatEarningsLine(earnLayer) : null;
    return {
      reply: formatImpliedMoveReply(sym, implied, earnLine),
      meta: { ...toMarketMeta(bundle), symbols: [sym], sourceName: implied.source },
    };
  }

  // Rates backdrop — use FRED when available (Phase 2 Pack G).
  if (isRatesBackdropQuery(text)) {
    const backdrop = await fetchFredMacroBackdrop().catch((e) => ({
      available: false,
      asOf: new Date().toISOString(),
      series: [],
      source: "FRED",
      error: (e as Error).message,
    }));
    return {
      reply: formatRatesBackdropReply(backdrop),
      meta: gapMeta([], backdrop.source),
    };
  }

  // Day-board calendar (e.g. "Tuesday quarterly earnings") — no ticker required.
  // Bound wait so a slow Finnhub fan-out cannot freeze the whole Intelligence stream.
  const dayCalendar = await Promise.race([
    tryEarningsDayCalendarReply(text).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 55_000)),
  ]);
  if (dayCalendar) {
    let reply = dayCalendar.reply;
    // Compound screen honesty: beat-rate applied, implied-move filter not (Phase 2 Pack H).
    if (
      /\bimplied\s+move\b/i.test(text) &&
      /\b(over|above|>|greater\s+than)\s*\d/i.test(text)
    ) {
      reply += [
        "",
        "",
        "**PARTIAL / WAIT:** An **implied move** threshold was requested but **not applied** on this earnings-calendar path (options IV screen not wired here).",
        "Beat-rate / surprise screens above are what ran. For a single name: `What's the implied move for TICKER into earnings?`",
      ].join("\n");
    }
    return {
      reply,
      meta: {
        symbols: dayCalendar.meta.symbols,
        source: dayCalendar.meta.source,
        sourceName: dayCalendar.meta.sourceName,
        stale: dayCalendar.meta.stale,
        timestamp: dayCalendar.meta.timestamp,
      },
    };
  }

  // Historical close / dated price — never live quote (Phase 0: P0-TRUST-001).
  if (isHistoricalPriceQuery(text)) {
    const hist = await tryDeterministicPriceReply(userId, text).catch(() => null);
    if (hist) return hist;
  }

  // Risk/reward needs bundle context but must not be skipped by bare price path.
  if (isRiskRewardQuery(text)) {
    const symbols = resolveSymbolsFromText(text);
    if (symbols.length) {
      const { bundle } = await buildIntelligenceBundle(userId, text, [], { includeWatchlist: false });
      return {
        reply: formatRiskRewardPartialReply(text, bundle),
        meta: { ...toMarketMeta(bundle), symbols },
      };
    }
    return {
      reply: formatRiskRewardPartialReply(text, null),
      meta: gapMeta([], "risk-reward-gate"),
    };
  }

  // Desk / multi-factor compare — never price-only short-circuit (Phase 2).
  if (isDeskCompareQuery(text)) {
    const symbols = resolveSymbolsFromText(text);
    if (!symbols.length) {
      return {
        reply: [
          "**Research-desk compare: WAIT**",
          "",
          "No verified tickers were resolved from the prompt.",
          "Name the companies or tickers to compare (e.g. Apple and Microsoft).",
        ].join("\n"),
        meta: gapMeta([], "desk-compare-gate"),
      };
    }
    const { bundle } = await buildIntelligenceBundle(userId, text, [], { includeWatchlist: false });
    // Attach point SEC XBRL + Alpha Vantage overview when available (never invent multiples).
    const enriched = await Promise.all(
      symbols.slice(0, 6).map(async (s) => {
        const [facts, overview, earnings] = await Promise.all([
          fetchSecCompanyFacts(s).catch(() => null),
          fetchAlphaVantageOverview(s).catch(() => ({ available: false, payload: null })),
          fetchAlphaVantageEarnings(s).catch(() => ({
            available: false,
            symbol: s,
            annual: [],
            quarterly: [],
            source: "Alpha Vantage EARNINGS" as const,
          })),
        ]);
        const epsTrend = buildEpsTrendFromAvEarnings(s, earnings);
        const ov = overview.available && overview.payload
          ? ({
              symbol: s,
              peRatio: overview.payload.peRatio,
              profitMargin: overview.payload.profitMargin,
              operatingMarginTTM: overview.payload.operatingMarginTTM,
              revenueTTM: overview.payload.revenueTTM,
              marketCap: overview.payload.marketCap,
              sector: overview.payload.sector,
              industry: overview.payload.industry,
              source: overview.payload.source,
              available: true,
              epsTrend,
            } satisfies DeskOverviewBrief)
          : epsTrend
            ? ({
                symbol: s,
                peRatio: null,
                profitMargin: null,
                operatingMarginTTM: null,
                revenueTTM: null,
                marketCap: null,
                sector: null,
                industry: null,
                source: epsTrend.source,
                available: true,
                epsTrend,
              } satisfies DeskOverviewBrief)
            : null;
        return [s, facts, ov] as const;
      }),
    );
    const secFactsBySymbol: Record<string, SecCompanyFactsSummary | null> = {};
    const overviewBySymbol: Record<string, DeskOverviewBrief | null> = {};
    for (const [s, facts, ov] of enriched) {
      secFactsBySymbol[s] = facts;
      overviewBySymbol[s] = ov;
    }
    return {
      reply: formatDeskCompareReply(text, bundle, secFactsBySymbol, overviewBySymbol),
      meta: { ...toMarketMeta(bundle), symbols, sourceName: "desk-compare" },
    };
  }

  if (
    !SENTIMENT_QUERY_RE.test(text) &&
    !FILING_QUERY_RE.test(text) &&
    !EARNINGS_QUERY_RE.test(text) &&
    !MACRO_QUERY_RE.test(text) &&
    !isCrossFeatureQuery(text) &&
    !isDeskCompareQuery(text)
  ) {
    const price = await tryDeterministicPriceReply(userId, text).catch(() => null);
    if (price) return price;
  }

  const symbols = resolveSymbolsFromText(text);
  if (!symbols.length && !MACRO_QUERY_RE.test(text)) return null;

  const { bundle } = await buildIntelligenceBundle(userId, text, [], { includeWatchlist: false });

  if (shouldBlockHallucination(text, bundle)) {
    return { reply: formatUnavailableReply(bundle), meta: toMarketMeta(bundle) };
  }

  const formatted = tryFormatFromBundle(text, bundle);
  if (formatted) {
    return { reply: formatted, meta: toMarketMeta(bundle) };
  }

  return null;
}
