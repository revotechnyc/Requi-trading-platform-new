/**
 * Client Rev 9/14 — predetermined US general-market intelligence pipeline.
 * DATA → CALC → CLASSIFICATION → formatted reply (LLM explains only when routed upstream).
 */
import { getSnapshot, getIndicators, getHistory } from "../marketdata/gateway/gateway";
import type { MarketSession, SnapshotResult } from "../marketdata/gateway/types";
import type { GatewayIndicators } from "../marketdata/gateway/indicators";
import { fetchFredMacroBackdrop, formatFredMacroBrief } from "../intelligence-data/providers/fred";
import {
  classifyMarketIntelligenceIntent,
  US_MARKET_DEFAULT,
  isDiscoveryFollowUpQuery,
  isDiscoveryRankExplainQuery,
  isDiscoveryRiskiestQuery,
  isExtendedMarketSnapshotQuery,
  isIndexDepthQuery,
  isRiskTodayQuery,
  isSectorLeadingQuery,
  type MarketIntelligenceIntent,
} from "./market-intent";
import {
  runStockDiscovery,
  runMarketMoversScan,
  runMarketBreadthScan,
  formatStockDiscoveryReply,
  formatMarketMoversReply,
  discoveryToRankedResults,
  moversToRankedResults,
  formatDiscoveryRankExplain,
  type MarketBreadthResult,
  type BreadthClassification,
} from "./stock-discovery";
import type { DeterministicPriceResult } from "./price-reply";
import type { MarketMeta } from "./tools";

export const US_INDEX_SYMBOLS = ["SPY", "QQQ", "DIA", "IWM"] as const;
export const US_SECTOR_ETFS = [
  { symbol: "XLK", label: "Technology" },
  { symbol: "XLF", label: "Financials" },
  { symbol: "XLE", label: "Energy" },
  { symbol: "XLV", label: "Health Care" },
  { symbol: "XLI", label: "Industrials" },
  { symbol: "XLY", label: "Cons. Discretionary" },
  { symbol: "XLP", label: "Cons. Staples" },
  { symbol: "XLU", label: "Utilities" },
  { symbol: "XLB", label: "Materials" },
  { symbol: "XLRE", label: "Real Estate" },
  { symbol: "XLC", label: "Communication" },
] as const;

export const VOL_PROXY_SYMBOL = "VIXY";
/** Spot CBOE VIX index (Yahoo: ^VIX). */
export const SPOT_VIX_SYMBOL = "^VIX";

export type VixClassification = "LOW" | "NORMAL" | "ELEVATED" | "HIGH" | "EXTREME";

export type SpotVixSnapshot = {
  symbol: string;
  level: number | null;
  dailyChangePct: number | null;
  classification: VixClassification | null;
  source: string | null;
  timestamp: string | null;
  stale: boolean;
  available: boolean;
};

export type MarketRegime =
  | "STRONG_BULL"
  | "BULL"
  | "CAUTIOUS_BULL"
  | "MIXED"
  | "SIDEWAYS"
  | "CAUTIOUS_BEAR"
  | "BEAR"
  | "HIGH_VOLATILITY";

export type IndexSnapshot = {
  symbol: string;
  price: number | null;
  dailyChangePct: number | null;
  source: string | null;
  timestamp: string | null;
  session: MarketSession | null;
  stale: boolean;
  available: boolean;
  rsi14: number | null;
  relativeVolume: number | null;
};

/** Pack B2 — index drill-down fields (PDF §5). */
export type IndexDepthSnapshot = IndexSnapshot & {
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  return5d: number | null;
  return20d: number | null;
  volume: number | null;
  averageVolume: number | null;
};

export type SectorSnapshot = {
  symbol: string;
  label: string;
  dailyChangePct: number | null;
  available: boolean;
};

export type MarketHealthComponents = {
  indexTrend: number;
  breadth: number;
  sector: number;
  volatility: number;
  momentum: number;
  volume: number;
  macro: number;
};

export type GeneralMarketAnalysis = {
  market: typeof US_MARKET_DEFAULT.market;
  session: MarketSession | "UNKNOWN";
  asOf: string;
  indexes: IndexSnapshot[];
  sectors: SectorSnapshot[];
  breadth: MarketBreadthResult;
  volProxy: { symbol: string; dailyChangePct: number | null; available: boolean };
  spotVix: SpotVixSnapshot;
  missingFields: string[];
  analysisConfidence: number;
  marketHealth: number;
  healthComponents: MarketHealthComponents;
  regime: MarketRegime;
  fredBrief: string[];
};

type AnalysisCacheEntry = { at: number; analysis: GeneralMarketAnalysis };
const analysisCache = new Map<string, AnalysisCacheEntry>();
const CACHE_MS = 60_000;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function dailyReturnPct(snap: SnapshotResult): number | null {
  if (!snap.market_data_available) return null;
  const prev = snap.previous_close;
  if (prev === null || prev <= 0) return null;
  return ((snap.price - prev) / prev) * 100;
}

function normalizeReturnScore(pct: number | null): number {
  if (pct === null || !Number.isFinite(pct)) return 50;
  // Map roughly -2%..+2% daily to 0..100
  return clamp(((pct + 2) / 4) * 100, 0, 100);
}

function normalizeRsiScore(rsi: number | null): number {
  if (rsi === null || !Number.isFinite(rsi)) return 50;
  // 50 RSI = neutral 50; 70 = bullish 75; 30 = bearish 25
  return clamp(50 + (rsi - 50) * 1.25, 0, 100);
}

function normalizeRelativeVolumeScore(rv: number | null): number {
  if (rv === null || !Number.isFinite(rv)) return 50;
  // 1.0x avg = 50; 2.0x = 80; 0.5x = 20
  return clamp(20 + rv * 30, 0, 100);
}

/** PDF §8 — spot VIX level bands (regime still uses health score, not VIX alone). */
export function classifySpotVixLevel(vix: number): VixClassification {
  if (!Number.isFinite(vix)) return "NORMAL";
  if (vix < 15) return "LOW";
  if (vix < 20) return "NORMAL";
  if (vix < 25) return "ELEVATED";
  if (vix < 30) return "HIGH";
  return "EXTREME";
}

function normalizeVolatilityScore(volProxyDailyPct: number | null): number {
  if (volProxyDailyPct === null || !Number.isFinite(volProxyDailyPct)) return 50;
  const abs = Math.abs(volProxyDailyPct);
  // Higher vol proxy move = lower score (more stress)
  if (abs >= 5) return 10;
  if (abs >= 3) return 25;
  if (abs >= 1.5) return 40;
  if (abs >= 0.75) return 55;
  return 70;
}

function breadthScoreFromReturns(returns: Array<number | null>): number {
  const usable = returns.filter((r): r is number => r !== null && Number.isFinite(r));
  if (!usable.length) return 50;
  const advancing = usable.filter((r) => r > 0).length;
  return (advancing / usable.length) * 100;
}

function sectorParticipationScore(sectors: SectorSnapshot[]): number {
  const usable = sectors.filter((s) => s.available && s.dailyChangePct !== null);
  if (!usable.length) return 50;
  const leading = usable.filter((s) => (s.dailyChangePct ?? 0) > 0).length;
  return (leading / usable.length) * 100;
}

function macroScoreFromFred(available: boolean): number {
  return available ? 60 : 45;
}

/** V1 weights — must sum to 100% (CLIENT_REV_914 Pack B4). */
export function calculateMarketHealthV1(input: {
  indexReturns: Array<number | null>;
  /** True liquid-universe breadth when available; falls back to index ETF proxy. */
  breadthPctAdvancing?: number | null;
  sectorSnapshots: SectorSnapshot[];
  volProxyDailyPct: number | null;
  spyRsi: number | null;
  spyRelativeVolume: number | null;
  fredAvailable: boolean;
}): { score: number; components: MarketHealthComponents } {
  const indexTrend = normalizeReturnScore(
    input.indexReturns.length
      ? input.indexReturns.reduce((a, b) => a + (b ?? 0), 0) / input.indexReturns.filter((r) => r !== null).length
      : null,
  );
  const breadth =
    input.breadthPctAdvancing !== null &&
    input.breadthPctAdvancing !== undefined &&
    Number.isFinite(input.breadthPctAdvancing)
      ? clamp(input.breadthPctAdvancing, 0, 100)
      : breadthScoreFromReturns(input.indexReturns);
  const sector = sectorParticipationScore(input.sectorSnapshots);
  const volatility = normalizeVolatilityScore(input.volProxyDailyPct);
  const momentum = normalizeRsiScore(input.spyRsi);
  const volume = normalizeRelativeVolumeScore(input.spyRelativeVolume);
  const macro = macroScoreFromFred(input.fredAvailable);

  const components: MarketHealthComponents = {
    indexTrend: round1(indexTrend),
    breadth: round1(breadth),
    sector: round1(sector),
    volatility: round1(volatility),
    momentum: round1(momentum),
    volume: round1(volume),
    macro: round1(macro),
  };

  const score =
    indexTrend * 0.25 +
    breadth * 0.2 +
    sector * 0.15 +
    volatility * 0.15 +
    momentum * 0.1 +
    volume * 0.1 +
    macro * 0.05;

  return { score: Math.round(clamp(score, 0, 100)), components };
}

export function classifyMarketRegimeV1(
  health: number,
  volProxyDailyPct: number | null,
): MarketRegime {
  const absVol = volProxyDailyPct !== null && Number.isFinite(volProxyDailyPct) ? Math.abs(volProxyDailyPct) : 0;
  if (absVol >= 4) return "HIGH_VOLATILITY";
  if (health >= 80) return "STRONG_BULL";
  if (health >= 70) return "BULL";
  if (health >= 60) return "CAUTIOUS_BULL";
  if (health >= 50) return "MIXED";
  if (health >= 40) return "SIDEWAYS";
  if (health >= 30) return "CAUTIOUS_BEAR";
  if (health >= 20) return "BEAR";
  return "BEAR";
}

function confidenceFromCoverage(available: number, total: number, staleCount: number): number {
  if (total <= 0) return 0;
  const coverage = available / total;
  const stalePenalty = staleCount > 0 ? 0.1 : 0;
  return Math.round(clamp(coverage * 100 - stalePenalty * 100, 15, 95));
}

function returnPctFromCloses(closes: number[], offsetDays: number): number | null {
  if (closes.length <= offsetDays) return null;
  const last = closes[closes.length - 1]!;
  const prior = closes[closes.length - 1 - offsetDays]!;
  if (!prior || prior <= 0) return null;
  return ((last - prior) / prior) * 100;
}

function priceVsSmaLabel(price: number | null, sma: number | null): string {
  if (price === null || sma === null || !Number.isFinite(price) || !Number.isFinite(sma)) return "WAIT";
  if (price > sma * 1.0001) return "above";
  if (price < sma * 0.9999) return "below";
  return "at";
}

async function loadIndexDepth(userId: string, symbol: string): Promise<IndexDepthSnapshot> {
  const base = await loadIndex(userId, symbol);
  const [ind, daily] = await Promise.all([
    getIndicators(userId, symbol).catch(() => ({ available: false, indicators: null })),
    getHistory(userId, symbol, "1y", "1d").catch(() => ({ available: false, bars: [] })),
  ]);
  const indicators = ind.available ? ind.indicators : null;
  const closes = daily.available ? daily.bars.map((b) => b.c) : [];
  return {
    ...base,
    sma20: indicators?.sma_20 ?? null,
    sma50: indicators?.sma_50 ?? null,
    sma200: indicators?.sma_200 ?? null,
    return5d: returnPctFromCloses(closes, 5),
    return20d: returnPctFromCloses(closes, 20),
    volume: indicators?.volume ?? null,
    averageVolume: indicators?.average_volume ?? null,
    relativeVolume: indicators?.relative_volume ?? base.relativeVolume,
  };
}

export async function loadIndexesDepth(userId: string): Promise<IndexDepthSnapshot[]> {
  return Promise.all(US_INDEX_SYMBOLS.map((s) => loadIndexDepth(userId, s)));
}

async function loadIndex(userId: string, symbol: string): Promise<IndexSnapshot> {
  const [snap, ind] = await Promise.all([
    getSnapshot(userId, symbol).catch(() => null),
    getIndicators(userId, symbol).catch(() => ({ available: false, indicators: null })),
  ]);
  if (!snap || !snap.market_data_available) {
    return {
      symbol,
      price: null,
      dailyChangePct: null,
      source: null,
      timestamp: null,
      session: null,
      stale: true,
      available: false,
      rsi14: null,
      relativeVolume: null,
    };
  }
  const indicators = ind.available ? ind.indicators : null;
  return {
    symbol,
    price: snap.price,
    dailyChangePct: dailyReturnPct(snap),
    source: snap.source_name,
    timestamp: snap.timestamp,
    session: snap.market_session,
    stale: snap.stale,
    available: true,
    rsi14: indicators?.rsi_14 ?? null,
    relativeVolume: indicators?.relative_volume ?? null,
  };
}

async function loadSpotVix(userId: string): Promise<SpotVixSnapshot> {
  const empty: SpotVixSnapshot = {
    symbol: SPOT_VIX_SYMBOL,
    level: null,
    dailyChangePct: null,
    classification: null,
    source: null,
    timestamp: null,
    stale: true,
    available: false,
  };
  for (const symbol of [SPOT_VIX_SYMBOL, "VIX"]) {
    const snap = await getSnapshot(userId, symbol).catch(() => null);
    if (!snap?.market_data_available || !Number.isFinite(snap.price)) continue;
    return {
      symbol,
      level: snap.price,
      dailyChangePct: dailyReturnPct(snap),
      classification: classifySpotVixLevel(snap.price),
      source: snap.source_name,
      timestamp: snap.timestamp,
      stale: snap.stale,
      available: true,
    };
  }
  return empty;
}

async function loadSector(userId: string, symbol: string, label: string): Promise<SectorSnapshot> {
  const snap = await getSnapshot(userId, symbol).catch(() => null);
  if (!snap || !snap.market_data_available) {
    return { symbol, label, dailyChangePct: null, available: false };
  }
  return { symbol, label, dailyChangePct: dailyReturnPct(snap), available: true };
}

export async function runGeneralMarketAnalysis(userId: string): Promise<GeneralMarketAnalysis> {
  const cacheKey = userId || "anon";
  const hit = analysisCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.analysis;

  const indexSymbols = [...US_INDEX_SYMBOLS];
  const sectorSymbols = US_SECTOR_ETFS.map((s) => s.symbol);
  const allSymbols = [...indexSymbols, ...sectorSymbols, VOL_PROXY_SYMBOL];

  const [indexes, sectorRows, volSnap, spotVix, fred, breadth] = await Promise.all([
    Promise.all(indexSymbols.map((s) => loadIndex(userId, s))),
    Promise.all(US_SECTOR_ETFS.map((s) => loadSector(userId, s.symbol, s.label))),
    getSnapshot(userId, VOL_PROXY_SYMBOL).catch(() => null),
    loadSpotVix(userId),
    fetchFredMacroBackdrop().catch(() => ({
      available: false,
      asOf: new Date().toISOString(),
      series: [],
      source: "FRED",
      error: "fetch failed",
    })),
    runMarketBreadthScan(userId).catch(() => ({
      advancing: 0,
      declining: 0,
      unchanged: 0,
      scanned: 0,
      quoted: 0,
      pctAdvancing: null,
      advanceDeclineRatio: null,
      classification: "MIXED" as BreadthClassification,
      universeLabel: "liquid US equities",
      available: false,
      asOf: new Date().toISOString(),
    })),
  ]);

  const volProxyPct =
    volSnap && volSnap.market_data_available ? dailyReturnPct(volSnap) : null;
  const spy = indexes.find((i) => i.symbol === "SPY");
  const { score, components } = calculateMarketHealthV1({
    indexReturns: indexes.map((i) => i.dailyChangePct),
    breadthPctAdvancing: breadth.available ? breadth.pctAdvancing : null,
    sectorSnapshots: sectorRows,
    volProxyDailyPct: volProxyPct,
    spyRsi: spy?.rsi14 ?? null,
    spyRelativeVolume: spy?.relativeVolume ?? null,
    fredAvailable: fred.available,
  });

  const missingFields: string[] = [];
  for (const idx of indexes) {
    if (!idx.available) missingFields.push(`${idx.symbol} quote`);
  }
  for (const sec of sectorRows) {
    if (!sec.available) missingFields.push(`${sec.symbol} sector`);
  }
  if (volProxyPct === null) missingFields.push(`${VOL_PROXY_SYMBOL} volatility proxy`);
  if (!spotVix.available) missingFields.push(`spot VIX (${SPOT_VIX_SYMBOL})`);
  if (!breadth.available) missingFields.push("market breadth (liquid universe)");
  if (!fred.available) missingFields.push("macro backdrop (FRED)");
  if (spy?.rsi14 === null) missingFields.push("SPY momentum (RSI)");
  if (spy?.relativeVolume === null) missingFields.push("SPY relative volume");

  const availableCount =
    indexes.filter((i) => i.available).length +
    sectorRows.filter((s) => s.available).length +
    (volProxyPct !== null ? 1 : 0);
  const staleCount = indexes.filter((i) => i.available && i.stale).length;
  const session = spy?.session ?? indexes.find((i) => i.session)?.session ?? "UNKNOWN";

  const analysis: GeneralMarketAnalysis = {
    market: US_MARKET_DEFAULT.market,
    session,
    asOf: new Date().toISOString(),
    indexes,
    sectors: sectorRows,
    breadth,
    volProxy: { symbol: VOL_PROXY_SYMBOL, dailyChangePct: volProxyPct, available: volProxyPct !== null },
    spotVix,
    missingFields,
    analysisConfidence: confidenceFromCoverage(availableCount, allSymbols.length + 1, staleCount),
    marketHealth: score,
    healthComponents: components,
    regime: classifyMarketRegimeV1(score, volProxyPct),
    fredBrief: formatFredMacroBrief(fred),
  };

  analysisCache.set(cacheKey, { at: Date.now(), analysis });
  return analysis;
}

function fmtPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "n/a";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function fmtPrice(price: number | null): string {
  if (price === null || !Number.isFinite(price)) return "n/a";
  return `$${price.toFixed(2)}`;
}

function regimePlainEnglish(regime: MarketRegime): string {
  const map: Record<MarketRegime, string> = {
    STRONG_BULL: "Broad risk-on — indexes and participation look strong.",
    BULL: "Constructive — more leaders than laggards.",
    CAUTIOUS_BULL: "Mildly positive, but not a clean trend everywhere.",
    MIXED: "Mixed — some indexes up, some down; stock-picking matters.",
    SIDEWAYS: "Choppy / range-bound — no clear directional edge.",
    CAUTIOUS_BEAR: "Soft — more indexes lagging than leading.",
    BEAR: "Risk-off tone — breadth and trend weak.",
    HIGH_VOLATILITY: "Elevated volatility — size down and expect wider swings.",
  };
  return map[regime];
}

function rankedSectors(sectors: SectorSnapshot[]): SectorSnapshot[] {
  return [...sectors]
    .filter((s) => s.available && s.dailyChangePct !== null)
    .sort((a, b) => (b.dailyChangePct ?? 0) - (a.dailyChangePct ?? 0));
}

export type SectorStrengthLabel = "LEADING" | "STRONG" | "NEUTRAL" | "WEAK" | "LAGGING";

/** PDF §7 — sector ETF strength taxonomy for snapshot display. */
export function classifySectorStrength(
  dailyChangePct: number | null,
  rank: number,
  total: number,
): SectorStrengthLabel {
  if (dailyChangePct === null || !Number.isFinite(dailyChangePct)) return "NEUTRAL";
  if (total > 1 && rank === 0) return "LEADING";
  if (total > 1 && rank === total - 1) return "LAGGING";
  if (dailyChangePct >= 1) return "STRONG";
  if (dailyChangePct <= -0.75) return "WEAK";
  return "NEUTRAL";
}

function formatSectorLine(s: SectorSnapshot, rank: number, total: number): string {
  const label = classifySectorStrength(s.dailyChangePct, rank, total);
  return `${s.label} (${s.symbol} ${fmtPct(s.dailyChangePct)}) · **${label}**`;
}

/** Pack B3 — true advance/decline breadth from liquid universe scan. */
export function formatBreadthSectionLines(analysis: GeneralMarketAnalysis): string[] {
  const b = analysis.breadth;
  const lines: string[] = [];
  if (!b.available || b.pctAdvancing === null) {
    lines.push("Market breadth: **WAIT** — liquid-universe scan did not return enough verified quotes.");
    lines.push("_Breadth health component falls back to major-index proxy when scan unavailable._");
    return lines;
  }
  lines.push(
    `**${b.pctAdvancing.toFixed(1)}% advancing** · ${b.advancing} up · ${b.declining} down · ${b.unchanged} flat` +
      ` · **${b.classification}** breadth`,
  );
  if (b.advanceDeclineRatio !== null) {
    lines.push(`Advance/decline ratio: **${b.advanceDeclineRatio.toFixed(2)}** (${b.quoted} names quoted)`);
  } else {
    lines.push(`Sample: **${b.quoted}** of ${b.scanned} names quoted · ${b.universeLabel}`);
  }
  lines.push("_Universe scan — not full NYSE/NASDAQ tape; research context only._");
  return lines;
}

function marketMeta(analysis: GeneralMarketAnalysis, sourceName: string, symbols?: string[]): MarketMeta {
  const syms = symbols?.length
    ? symbols
    : analysis.indexes.filter((i) => i.available).map((i) => i.symbol);
  return {
    symbols: syms,
    source: null,
    sourceName,
    stale: analysis.indexes.some((i) => i.stale),
    timestamp: analysis.asOf,
  };
}

export function formatSectorLeadingReply(analysis: GeneralMarketAnalysis): string {
  const leaders = rankedSectors(analysis.sectors).slice(0, 3);
  const laggards = rankedSectors(analysis.sectors).slice(-3).reverse();
  const lines: string[] = [
    "**What's leading — US sectors (verified ETF quotes)**",
    "",
    `_Default market: ${US_MARKET_DEFAULT.exchanges.join(" / ")} · ${US_MARKET_DEFAULT.currency}_`,
    "",
    `**Regime:** ${analysis.regime.replace(/_/g, " ")} · **Market Health:** ${analysis.marketHealth}/100`,
    "",
  ];
  if (leaders.length) {
    lines.push(
      "**Leading sectors:**",
      ...leaders.map((s) => `- **${s.label} (${s.symbol})** ${fmtPct(s.dailyChangePct)}`),
    );
  } else {
    lines.push("Sector leadership: **WAIT** — sector ETF quotes unavailable.");
  }
  if (laggards.length >= 2) {
    lines.push(
      "",
      "**Lagging sectors:**",
      ...laggards.map((s) => `- **${s.label} (${s.symbol})** ${fmtPct(s.dailyChangePct)}`),
    );
  }
  const idxLine = analysis.indexes
    .filter((i) => i.available && i.dailyChangePct !== null)
    .map((i) => `${i.symbol} ${fmtPct(i.dailyChangePct)}`)
    .join(" · ");
  if (idxLine) {
    lines.push("", `**Index context:** ${idxLine}`);
  }
  lines.push(
    "",
    regimePlainEnglish(analysis.regime),
    "",
    "_Research context only — not a trade authorization._",
  );
  return lines.join("\n");
}

export function formatRiskTodayReply(analysis: GeneralMarketAnalysis): string {
  const health = analysis.marketHealth;
  const regime = analysis.regime.replace(/_/g, " ");
  const riskLevel =
    health >= 70
      ? "MODERATE — constructive tape but still size-aware"
      : health >= 50
        ? "ELEVATED — mixed tape; selective setups only"
        : health >= 35
          ? "HIGH — soft breadth/trend; caution warranted"
          : "VERY HIGH — weak health score; defensive posture";
  const lines: string[] = [
    "**Is it risky today? — US market risk read**",
    "",
    `_Default market: ${US_MARKET_DEFAULT.exchanges.join(" / ")} · ${US_MARKET_DEFAULT.currency}_`,
    "",
    `**Verdict:** ${riskLevel}`,
    "",
    `- **Market Health:** ${health}/100 · **Regime:** ${regime}`,
    `- **Analysis confidence:** ${analysis.analysisConfidence}% (data coverage — not a win-probability)`,
    "",
    regimePlainEnglish(analysis.regime),
  ];
  const c = analysis.healthComponents;
  lines.push(
    "",
    "**Risk drivers (V1 components):**",
    `- Index trend: ${c.indexTrend}/100`,
    `- Breadth: ${c.breadth}/100`,
    `- Volatility: ${c.volatility}/100`,
    `- Momentum: ${c.momentum}/100`,
  );
  lines.push("", ...formatVolatilitySectionLines(analysis));
  lines.push(
    "",
    "**Decision:** RESEARCH ONLY — reduce size / widen stops in CAUTIOUS BEAR or sub-40 health; not a blanket no-trade rule.",
    "",
    "_Uses verified backend snapshot only — not LLM memory._",
  );
  return lines.join("\n");
}

/** Pack A2 — international override; never substitute US snapshot. */
export function formatInternationalWaitReply(text: string): string {
  const m = text.match(
    /\b(japan|nikkei|europe|ftse|dax|china|hang\s+seng|uk\s+market|india\s+nifty)\b/i,
  );
  const raw = m?.[1]?.replace(/\s+/g, " ") ?? "International";
  const label = raw.replace(/\b\w/g, (c) => c.toUpperCase());
  return [
    `**${label} market intelligence: WAIT**`,
    "",
    "Requi's market pipeline is wired for **US markets** (NYSE / NASDAQ) by default.",
    "",
    "International regional analysis is **not wired yet** — we won't substitute US data or invent prices from memory.",
    "",
    "**Try instead:**",
    "· `How's the market today?` — US health, regime, and major indexes",
    "· `What's leading?` — US sector leadership",
    "· `What should I buy today?` — US stock discovery (research only)",
    "",
    "_Research only — not buy/sell advice._",
  ].join("\n");
}

/** Pack G1 — refuse memory-only market / buy probes. */
export function formatMemoryBypassRefusal(): string {
  return [
    "**Cannot answer from memory**",
    "",
    "Requi does not invent market conditions or stock picks from model memory. Market intelligence runs through **verified backend data** (quotes, regime engine, discovery scan).",
    "",
    "Try one of these instead:",
    "· `How's the market today?`",
    "· `What should I buy today?`",
    "",
    "_Research only — not buy/sell advice._",
  ].join("\n");
}

function fmtNum(n: number | null, dp = 2): string {
  if (n === null || !Number.isFinite(n)) return "WAIT";
  return n.toFixed(dp);
}

/** Shared volatility block — spot VIX bands + VIXY fallback (PDF §8). */
export function formatVolatilitySectionLines(analysis: GeneralMarketAnalysis): string[] {
  const lines: string[] = [];
  const vix = analysis.spotVix;
  if (vix.available && vix.level !== null) {
    lines.push(
      `Spot **${vix.symbol.replace("^", "")}**: **${vix.level.toFixed(2)}**` +
        (vix.dailyChangePct !== null ? ` · daily change: ${fmtPct(vix.dailyChangePct)}` : "") +
        (vix.classification ? ` · **${vix.classification}** volatility` : "") +
        (vix.source ? ` · ${vix.source}` : "") +
        (vix.timestamp ? ` · ${vix.timestamp}` : "") +
        (vix.stale ? " _(delayed/stale)_" : ""),
    );
  } else {
    lines.push(`Spot **VIX**: **WAIT** — verified spot quote unavailable after provider fallback.`);
  }
  if (analysis.volProxy.available) {
    lines.push(
      `Volatility proxy **${analysis.volProxy.symbol}** daily change: ${fmtPct(analysis.volProxy.dailyChangePct)} (ETF proxy — supplemental).`,
    );
  } else {
    lines.push(`Volatility proxy (${VOL_PROXY_SYMBOL}): **WAIT**`);
  }
  lines.push("_Market regime uses health score — not VIX alone._");
  return lines;
}

function fmtVol(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "WAIT";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

/** Pack B2 — per-index price / SMA / return / volume drill-down. */
export function formatIndexDepthReply(
  analysis: GeneralMarketAnalysis,
  depths: IndexDepthSnapshot[],
): string {
  const lines: string[] = [
    "**US major indexes — drill-down (verified quotes + indicators)**",
    "",
    `_Default market: ${US_MARKET_DEFAULT.exchanges.join(" / ")} · ${US_MARKET_DEFAULT.currency} · ${US_MARKET_DEFAULT.timezone}_`,
    "",
    `**Session:** ${analysis.session} · **As of:** ${analysis.asOf}`,
    `**Market Health:** ${analysis.marketHealth}/100 · **Regime:** ${analysis.regime.replace(/_/g, " ")}`,
    "",
    regimePlainEnglish(analysis.regime),
    "",
  ];

  for (const idx of depths) {
    lines.push(`### ${idx.symbol}`);
    if (!idx.available) {
      lines.push(`- **Status:** WAIT — verified quote unavailable`);
      lines.push("");
      continue;
    }
    lines.push(
      `- **Price:** ${fmtPrice(idx.price)} · **Today:** ${fmtPct(idx.dailyChangePct)} · **Source:** ${idx.source ?? "WAIT"} · **As of:** ${idx.timestamp ?? "WAIT"}${idx.stale ? " _(delayed/stale)_" : ""}`,
    );
    lines.push(`- **5-day return:** ${idx.return5d !== null ? fmtPct(idx.return5d) : "WAIT"}`);
    lines.push(`- **20-day return:** ${idx.return20d !== null ? fmtPct(idx.return20d) : "WAIT"}`);
    lines.push(
      `- **SMA 20:** ${idx.sma20 !== null ? `$${fmtNum(idx.sma20)}` : "WAIT"} · price ${priceVsSmaLabel(idx.price, idx.sma20)} SMA20`,
    );
    lines.push(
      `- **SMA 50:** ${idx.sma50 !== null ? `$${fmtNum(idx.sma50)}` : "WAIT"} · price ${priceVsSmaLabel(idx.price, idx.sma50)} SMA50`,
    );
    lines.push(
      `- **SMA 200:** ${idx.sma200 !== null ? `$${fmtNum(idx.sma200)}` : "WAIT"} · price ${priceVsSmaLabel(idx.price, idx.sma200)} SMA200`,
    );
    lines.push(
      `- **Volume:** ${fmtVol(idx.volume)} · **Avg volume:** ${fmtVol(idx.averageVolume)} · **RVOL:** ${idx.relativeVolume !== null ? `${idx.relativeVolume.toFixed(2)}x` : "WAIT"}`,
    );
    lines.push("");
  }

  lines.push(
    "_Research context only — not a trade authorization. Missing fields labeled WAIT; nothing invented._",
  );
  return lines.join("\n");
}

export function formatGeneralMarketReply(
  analysis: GeneralMarketAnalysis,
  opts?: { extended?: boolean },
): string {
  const lines: string[] = [
    opts?.extended
      ? "**US market snapshot — breadth · sectors · volatility**"
      : "**US market snapshot**",
    "",
    `_Default market: ${US_MARKET_DEFAULT.exchanges.join(" / ")} · ${US_MARKET_DEFAULT.currency} · ${US_MARKET_DEFAULT.timezone}_`,
    "",
    `**Session:** ${analysis.session} · **As of:** ${analysis.asOf}`,
    `**Market Health:** ${analysis.marketHealth}/100 · **Regime:** ${analysis.regime.replace(/_/g, " ")}`,
    `**Analysis confidence:** ${analysis.analysisConfidence}% (data coverage / freshness — not a directional forecast)`,
    "",
    regimePlainEnglish(analysis.regime),
    "",
    "### Major indexes (verified quotes)",
  ];

  for (const idx of analysis.indexes) {
    if (!idx.available) {
      lines.push(`- **${idx.symbol}:** WAIT — quote unavailable`);
      continue;
    }
    lines.push(
      `- **${idx.symbol}** ${fmtPrice(idx.price)} (${fmtPct(idx.dailyChangePct)} today)` +
        `${idx.stale ? " · _stale/delayed_" : ""}` +
        `${idx.source ? ` · ${idx.source}` : ""}` +
        `${idx.timestamp ? ` · ${idx.timestamp}` : ""}`,
    );
  }

  lines.push("", "### Market breadth (liquid universe)", ...formatBreadthSectionLines(analysis));

  const ranked = rankedSectors(analysis.sectors);
  const leaders = ranked.slice(0, 3);
  const laggards = ranked.slice(-3).reverse();
  const allSectorNegative = leaders.length > 0 && leaders.every((s) => (s.dailyChangePct ?? 0) <= 0);
  const sectorLeadLabel = allSectorNegative ? "Relative strength" : "Leading";
  lines.push("", "### Sector leadership (sector ETFs)");
  if (leaders.length) {
    lines.push(
      `**${sectorLeadLabel}:** ` +
        leaders.map((s, i) => formatSectorLine(s, i, ranked.length)).join(" · "),
    );
  } else {
    lines.push("Sector ranks: **WAIT** — sector ETF quotes unavailable.");
  }
  if (laggards.length >= 2) {
    lines.push(
      "**Lagging:** " +
        laggards.map((s) => {
          const rank = ranked.findIndex((r) => r.symbol === s.symbol);
          return formatSectorLine(s, rank >= 0 ? rank : ranked.length - 1, ranked.length);
        }).join(" · "),
    );
  }

  lines.push("", "### Volatility", ...formatVolatilitySectionLines(analysis));

  lines.push("", "### Health components (V1 weights)");
  const c = analysis.healthComponents;
  lines.push(
    `- Index trend 25%: ${c.indexTrend}`,
    `- Breadth 20%: ${c.breadth}`,
    `- Sector 15%: ${c.sector}`,
    `- Volatility 15%: ${c.volatility}`,
    `- Momentum 10%: ${c.momentum}`,
    `- Volume 10%: ${c.volume}`,
    `- Macro 5%: ${c.macro}`,
  );

  if (analysis.fredBrief.length && !analysis.fredBrief[0]?.includes("unavailable")) {
    lines.push("", "### Macro backdrop (FRED)", ...analysis.fredBrief.map((b) => `- ${b}`));
  }

  if (analysis.missingFields.length) {
    lines.push(
      "",
      "**Partial data:** " + analysis.missingFields.slice(0, 6).join("; ") +
        (analysis.missingFields.length > 6 ? "…" : ""),
    );
  }

  lines.push(
    "",
    "_Research context only — not a trade authorization. Ask about a specific ticker for deeper work._",
  );
  return lines.join("\n");
}

export async function tryDiscoveryFollowUpReply(
  userId: string,
  text: string,
  ranked: Array<{ symbol: string }>,
  universeLabel?: string,
): Promise<DeterministicPriceResult | null> {
  if (universeLabel !== "stock_discovery" || !ranked.length) return null;
  if (!isDiscoveryFollowUpQuery(text)) return null;

  const analysis = await runGeneralMarketAnalysis(userId);
  const discovery = await runStockDiscovery(userId, analysis);
  const order = ranked.map((r) => r.symbol.toUpperCase());
  const fromWs = order
    .map((sym) => discovery.candidates.find((c) => c.symbol === sym))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const pool = fromWs.length ? fromWs : discovery.candidates;
  if (!pool.length) return null;

  const which = isDiscoveryRiskiestQuery(text) ? "riskiest" : "top";
  return {
    reply: formatDiscoveryRankExplain(pool, which),
    meta: marketMeta(analysis, "stock-discovery-followup", pool.map((c) => c.symbol)),
    rankedResults: discoveryToRankedResults({ ...discovery, candidates: pool }),
  };
}

export async function tryMarketIntelligenceReply(
  userId: string,
  text: string,
): Promise<DeterministicPriceResult | null> {
  const intent = classifyMarketIntelligenceIntent(text);
  if (!intent) return null;

  const analysis = await runGeneralMarketAnalysis(userId);
  const hasAnyIndex = analysis.indexes.some((i) => i.available);

  if (!hasAnyIndex) {
    return {
      reply: [
        "**US market intelligence: PARTIAL / UNAVAILABLE**",
        "",
        `_Default market assumed: ${US_MARKET_DEFAULT.exchanges.join(" / ")} · ${US_MARKET_DEFAULT.currency}_`,
        "",
        "Index quotes (SPY/QQQ/DIA/IWM) did not return verified data after provider fallback.",
        "",
        "Status: **WAIT** — broker/Yahoo quotes required before a market snapshot.",
        "",
        "I will **not** guess today's market direction from memory.",
      ].join("\n"),
      meta: marketMeta(analysis, "general-market-unavailable"),
    };
  }

  let reply: string;
  let sourceName: string;
  let rankedResults: DeterministicPriceResult["rankedResults"];
  let meta: MarketMeta;

  switch (intent) {
    case "GENERAL_MARKET":
      if (isIndexDepthQuery(text)) {
        const depths = await loadIndexesDepth(userId);
        reply = formatIndexDepthReply(analysis, depths);
        sourceName = "general-market-index-depth-v1";
      } else if (isRiskTodayQuery(text)) {
        reply = formatRiskTodayReply(analysis);
        sourceName = "general-market-risk-v1";
      } else if (isSectorLeadingQuery(text)) {
        reply = formatSectorLeadingReply(analysis);
        sourceName = "general-market-leading-v1";
      } else {
        reply = formatGeneralMarketReply(analysis, {
          extended: isExtendedMarketSnapshotQuery(text),
        });
        sourceName = isExtendedMarketSnapshotQuery(text)
          ? "general-market-extended-v1"
          : "general-market-v1";
      }
      meta = marketMeta(analysis, sourceName);
      break;
    case "STOCK_DISCOVERY": {
      const discovery = await runStockDiscovery(userId, analysis);
      reply = formatStockDiscoveryReply(analysis, discovery);
      sourceName = "stock-discovery-v2";
      rankedResults = discoveryToRankedResults(discovery);
      meta = marketMeta(
        analysis,
        sourceName,
        discovery.candidates.map((c) => c.symbol),
      );
      break;
    }
    case "MARKET_MOVERS": {
      const movers = await runMarketMoversScan(userId);
      reply = formatMarketMoversReply(analysis, movers);
      sourceName = "market-movers-v2";
      rankedResults = moversToRankedResults(movers);
      meta = marketMeta(
        analysis,
        sourceName,
        [...movers.gainers, ...movers.losers].map((c) => c.symbol),
      );
      break;
    }
    default:
      return null;
  }

  return { reply, meta, rankedResults };
}

export type { MarketIntelligenceIntent };
