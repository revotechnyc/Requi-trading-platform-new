/**
 * Client Rev 9/14 Phase 2 — deterministic US stock discovery & movers scan.
 * Regime → sectors → liquid universe → score/filter → ranked candidates.
 * Never invents tickers; only symbols from the code-versioned universe below.
 */
import { getSnapshot, getIndicators } from "../marketdata/gateway/gateway";
import type { SnapshotResult } from "../marketdata/gateway/types";
import type { GeneralMarketAnalysis, MarketRegime, SectorSnapshot } from "./general-market";
import { US_SECTOR_ETFS } from "./general-market";

export type DiscoveryRisk = "LOW" | "MODERATE" | "HIGH";

export type StockCandidate = {
  symbol: string;
  sectorEtf: string;
  sectorLabel: string;
  price: number | null;
  dailyChangePct: number | null;
  relativeStrengthVsSpy: number | null;
  rsi14: number | null;
  relativeVolume: number | null;
  score: number;
  risk: DiscoveryRisk;
  reasons: string[];
  source: string | null;
  timestamp: string | null;
  stale: boolean;
  available: boolean;
};

export type StockDiscoveryResult = {
  asOf: string;
  regime: MarketRegime;
  marketHealth: number;
  focusSectors: Array<{ symbol: string; label: string; dailyChangePct: number | null }>;
  candidates: StockCandidate[];
  scanned: number;
  missingFields: string[];
};

export type MarketMoversResult = {
  asOf: string;
  gainers: StockCandidate[];
  losers: StockCandidate[];
  scanned: number;
};

/** Liquid single-name universe — code-versioned, aligned with engine seed list. */
export const LIQUID_US_STOCKS: string[] = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "AMD", "NFLX",
  "CRM", "ORCL", "ADBE", "INTC", "MU", "QCOM", "TXN", "PLTR", "UBER", "SHOP",
  "COIN", "JPM", "BAC", "WFC", "GS", "MS", "XOM", "CVX", "LLY", "UNH", "JNJ",
  "PFE", "MRNA", "WMT", "COST", "HD", "NKE", "MCD", "SBUX", "DIS", "BA", "CAT",
  "GE", "F", "GM", "RIVN", "SOFI", "HOOD", "SNOW", "DDOG", "NET", "CRWD",
];

/** Sector ETF → liquid members for discovery scan. */
export const SECTOR_LIQUID_MEMBERS: Record<string, string[]> = {
  XLK: ["AAPL", "MSFT", "NVDA", "AMD", "AVGO", "INTC", "MU", "QCOM", "TXN", "ORCL", "ADBE", "CRM", "PLTR", "SNOW", "DDOG", "NET", "CRWD"],
  XLE: ["XOM", "CVX"],
  XLF: ["JPM", "BAC", "WFC", "GS", "MS", "SOFI", "HOOD"],
  XLV: ["LLY", "UNH", "JNJ", "PFE", "MRNA"],
  XLI: ["BA", "CAT", "GE", "GM", "F"],
  XLY: ["AMZN", "TSLA", "NKE", "HD", "MCD", "SBUX", "DIS", "RIVN"],
  XLP: ["WMT", "COST"],
  XLU: [],
  XLB: ["CAT", "GE"],
  XLRE: ["HD"],
  XLC: ["GOOGL", "META", "NFLX", "DIS"],
};

const DEFENSIVE_SECTOR_ETFS = ["XLP", "XLV", "XLU"] as const;
const BEARISH_REGIMES: MarketRegime[] = ["CAUTIOUS_BEAR", "BEAR", "HIGH_VOLATILITY"];
const MIN_PRICE = 5;
const MAX_DISCOVERY_SCAN = 22;
const MAX_MOVERS_SCAN = 36;
const TOP_DISCOVERY = 5;
const BATCH = 5;

type SymbolMetrics = {
  symbol: string;
  price: number | null;
  dailyChangePct: number | null;
  rsi14: number | null;
  relativeVolume: number | null;
  source: string | null;
  timestamp: string | null;
  stale: boolean;
  available: boolean;
};

type DiscoveryCacheEntry = { at: number; discovery: StockDiscoveryResult; movers: MarketMoversResult };
const cache = new Map<string, DiscoveryCacheEntry>();
const CACHE_MS = 60_000;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function dailyReturnPct(snap: SnapshotResult): number | null {
  if (!snap.market_data_available) return null;
  const prev = snap.previous_close;
  if (prev === null || prev <= 0) return null;
  return ((snap.price - prev) / prev) * 100;
}

function sectorLabel(etf: string): string {
  return US_SECTOR_ETFS.find((s) => s.symbol === etf)?.label ?? etf;
}

function rankedSectors(sectors: SectorSnapshot[]): SectorSnapshot[] {
  return [...sectors]
    .filter((s) => s.available && s.dailyChangePct !== null)
    .sort((a, b) => (b.dailyChangePct ?? 0) - (a.dailyChangePct ?? 0));
}

export function selectFocusSectorEtfs(analysis: GeneralMarketAnalysis): string[] {
  const ranked = rankedSectors(analysis.sectors);
  const leading = ranked.slice(0, 2).map((s) => s.symbol);
  if (BEARISH_REGIMES.includes(analysis.regime)) {
    const defensive = DEFENSIVE_SECTOR_ETFS.filter((s) => !leading.includes(s));
    return [...new Set([...leading, ...defensive.slice(0, 2)])].slice(0, 3);
  }
  if (leading.length) return leading;
  return ranked.slice(0, 3).map((s) => s.symbol);
}

export function buildDiscoveryCandidatePool(sectorEtfs: string[]): string[] {
  const out = new Set<string>();
  for (const etf of sectorEtfs) {
    for (const sym of SECTOR_LIQUID_MEMBERS[etf] ?? []) {
      if (LIQUID_US_STOCKS.includes(sym)) out.add(sym);
    }
  }
  if (!out.size) {
    for (const sym of LIQUID_US_STOCKS.slice(0, MAX_DISCOVERY_SCAN)) out.add(sym);
  }
  return [...out].slice(0, MAX_DISCOVERY_SCAN);
}

export function buildMoversScanPool(): string[] {
  return [...LIQUID_US_STOCKS].slice(0, MAX_MOVERS_SCAN);
}

async function loadSymbolMetrics(userId: string, symbol: string): Promise<SymbolMetrics> {
  const [snap, ind] = await Promise.all([
    getSnapshot(userId, symbol).catch(() => null),
    getIndicators(userId, symbol).catch(() => ({ available: false, indicators: null })),
  ]);
  if (!snap || !snap.market_data_available) {
    return {
      symbol,
      price: null,
      dailyChangePct: null,
      rsi14: null,
      relativeVolume: null,
      source: null,
      timestamp: null,
      stale: true,
      available: false,
    };
  }
  const indicators = ind.available ? ind.indicators : null;
  return {
    symbol,
    price: snap.price,
    dailyChangePct: dailyReturnPct(snap),
    rsi14: indicators?.rsi_14 ?? null,
    relativeVolume: indicators?.relative_volume ?? null,
    source: snap.source_name,
    timestamp: snap.timestamp,
    stale: snap.stale,
    available: true,
  };
}

async function scanSymbols(userId: string, symbols: string[]): Promise<Map<string, SymbolMetrics>> {
  const out = new Map<string, SymbolMetrics>();
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const rows = await Promise.all(batch.map((s) => loadSymbolMetrics(userId, s)));
    for (const row of rows) out.set(row.symbol, row);
  }
  return out;
}

function classifyRisk(m: SymbolMetrics, sectorEtf: string): DiscoveryRisk {
  const rsi = m.rsi14;
  const ch = m.dailyChangePct ?? 0;
  const rv = m.relativeVolume ?? 1;
  if (rsi !== null && rsi > 70) return "HIGH";
  if (rsi !== null && rsi < 28) return "HIGH";
  if (Math.abs(ch) >= 2.5 || rv >= 2.5) return "HIGH";
  if (DEFENSIVE_SECTOR_ETFS.includes(sectorEtf as (typeof DEFENSIVE_SECTOR_ETFS)[number]) && rsi !== null && rsi >= 40 && rsi <= 62) {
    return "LOW";
  }
  if (rsi !== null && rsi >= 45 && rsi <= 60 && Math.abs(ch) <= 1.5) return "LOW";
  return "MODERATE";
}

/** Higher = riskier. Independent of discovery rank score. */
export function computeCandidateRiskScore(c: StockCandidate): number {
  let risk = 20;
  const rsi = c.rsi14;
  const ch = c.dailyChangePct ?? 0;

  if (rsi !== null) {
    if (rsi >= 70) risk += 22 + (rsi - 70) * 2;
    else if (rsi <= 28) risk += 28 + (28 - rsi) * 1.5;
    else if (rsi >= 65) risk += 12;
    else if (rsi <= 35) risk += 15;
  }

  risk += Math.min(Math.abs(ch) * 7, 28);
  if (ch <= -2) risk += 10;
  if (ch >= 2.5 && (rsi ?? 0) >= 65) risk += 8;

  if (c.risk === "HIGH") risk += 12;
  if (c.risk === "LOW") risk -= 18;

  return Math.round(clamp(risk, 0, 100));
}

export function pickRiskiestCandidate(candidates: StockCandidate[]): StockCandidate {
  const riskOrder = { HIGH: 3, MODERATE: 2, LOW: 1 };
  return [...candidates].sort((a, b) => {
    const tier = riskOrder[b.risk] - riskOrder[a.risk];
    if (tier !== 0) return tier;
    return computeCandidateRiskScore(b) - computeCandidateRiskScore(a);
  })[0]!;
}

function buildRiskExplainLines(c: StockCandidate): string[] {
  const lines: string[] = [];
  if (c.rsi14 !== null && c.rsi14 >= 68) {
    lines.push(`RSI ${c.rsi14.toFixed(1)} — elevated / potential chase risk`);
  }
  if (c.rsi14 !== null && c.rsi14 <= 32) {
    lines.push(`RSI ${c.rsi14.toFixed(1)} — deep oversold / reversal gamble`);
  }
  if (c.dailyChangePct !== null && Math.abs(c.dailyChangePct) >= 2) {
    lines.push(`Large daily move (${fmtPct(c.dailyChangePct)}) — higher swing risk`);
  }
  if (c.relativeStrengthVsSpy !== null && c.relativeStrengthVsSpy <= -1.5) {
    lines.push(`Lagging SPY by ${Math.abs(c.relativeStrengthVsSpy).toFixed(2)}% — weak relative tape`);
  }
  if (c.relativeVolume !== null && c.relativeVolume >= 1.5) {
    lines.push(`Elevated RVOL ${c.relativeVolume.toFixed(2)}x — volatile participation`);
  }
  if (!lines.length && c.reasons.length) {
    lines.push(...c.reasons.slice(0, 2));
  }
  return lines;
}

export function scoreDiscoveryCandidate(input: {
  metrics: SymbolMetrics;
  sectorEtf: string;
  sectorLeader: boolean;
  spyDailyChangePct: number | null;
  regime: MarketRegime;
}): { score: number; reasons: string[]; risk: DiscoveryRisk } {
  const { metrics: m, sectorEtf, sectorLeader, spyDailyChangePct, regime } = input;
  const reasons: string[] = [];
  let score = 50;

  const ch = m.dailyChangePct;
  if (ch !== null) {
    const rs = spyDailyChangePct !== null ? ch - spyDailyChangePct : ch;
    score += clamp(rs * 8, -20, 20);
    if (rs > 0.3) reasons.push(`outperforming SPY by ${rs.toFixed(2)}%`);
    else if (rs < -0.3) reasons.push(`lagging SPY by ${Math.abs(rs).toFixed(2)}%`);
  }

  if (m.rsi14 !== null) {
    if (m.rsi14 >= 52 && m.rsi14 <= 68) {
      score += 12;
      reasons.push(`RSI ${m.rsi14.toFixed(1)} in momentum band`);
    } else if (m.rsi14 > 75) {
      score -= 15;
      reasons.push(`RSI ${m.rsi14.toFixed(1)} stretched — chase risk`);
    } else if (m.rsi14 < 35) {
      score += 4;
      reasons.push(`RSI ${m.rsi14.toFixed(1)} oversold bounce watch`);
    }
  }

  if (m.relativeVolume !== null) {
    if (m.relativeVolume >= 1.3) {
      score += clamp((m.relativeVolume - 1) * 10, 0, 15);
      reasons.push(`relative volume ${m.relativeVolume.toFixed(2)}x`);
    } else if (m.relativeVolume < 0.7) {
      score -= 8;
      reasons.push("light volume vs average");
    }
  }

  if (sectorLeader) {
    score += 8;
    reasons.push(`in leading sector ${sectorEtf}`);
  }

  if (BEARISH_REGIMES.includes(regime) && DEFENSIVE_SECTOR_ETFS.includes(sectorEtf as (typeof DEFENSIVE_SECTOR_ETFS)[number])) {
    score += 6;
    reasons.push("defensive sector tilt for current regime");
  }

  const risk = classifyRisk(m, sectorEtf);
  if (risk === "HIGH") score -= 10;

  return { score: Math.round(clamp(score, 0, 100)), reasons, risk };
}

function mapCandidate(
  symbol: string,
  sectorEtf: string,
  metrics: SymbolMetrics,
  score: number,
  risk: DiscoveryRisk,
  reasons: string[],
): StockCandidate {
  return {
    symbol,
    sectorEtf,
    sectorLabel: sectorLabel(sectorEtf),
    price: metrics.price,
    dailyChangePct: metrics.dailyChangePct,
    relativeStrengthVsSpy: null,
    rsi14: metrics.rsi14,
    relativeVolume: metrics.relativeVolume,
    score,
    risk,
    reasons,
    source: metrics.source,
    timestamp: metrics.timestamp,
    stale: metrics.stale,
    available: metrics.available,
  };
}

export async function runStockDiscovery(
  userId: string,
  analysis: GeneralMarketAnalysis,
): Promise<StockDiscoveryResult> {
  const cacheKey = userId || "anon";
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.discovery;

  const focusEtfs = selectFocusSectorEtfs(analysis);
  const pool = buildDiscoveryCandidatePool(focusEtfs);
  const metricsMap = await scanSymbols(userId, pool);
  const spyChange = analysis.indexes.find((i) => i.symbol === "SPY")?.dailyChangePct ?? null;
  const leadingEtfs = new Set(rankedSectors(analysis.sectors).slice(0, 2).map((s) => s.symbol));

  const symbolToSector = new Map<string, string>();
  for (const etf of focusEtfs) {
    for (const sym of SECTOR_LIQUID_MEMBERS[etf] ?? []) {
      if (!symbolToSector.has(sym)) symbolToSector.set(sym, etf);
    }
  }

  const candidates: StockCandidate[] = [];
  const missingFields: string[] = [];

  for (const sym of pool) {
    const m = metricsMap.get(sym);
    if (!m) continue;
    if (!m.available) {
      missingFields.push(`${sym} quote`);
      continue;
    }
    if (m.price !== null && m.price < MIN_PRICE) continue;

    const sectorEtf = symbolToSector.get(sym) ?? focusEtfs[0] ?? "XLK";
    const scored = scoreDiscoveryCandidate({
      metrics: m,
      sectorEtf,
      sectorLeader: leadingEtfs.has(sectorEtf),
      spyDailyChangePct: spyChange,
      regime: analysis.regime,
    });
    const rs = spyChange !== null && m.dailyChangePct !== null ? m.dailyChangePct - spyChange : null;
    candidates.push({
      ...mapCandidate(sym, sectorEtf, m, scored.score, scored.risk, scored.reasons),
      relativeStrengthVsSpy: rs,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, TOP_DISCOVERY);

  const focusSectors = focusEtfs.map((etf) => {
    const row = analysis.sectors.find((s) => s.symbol === etf);
    return { symbol: etf, label: sectorLabel(etf), dailyChangePct: row?.dailyChangePct ?? null };
  });

  const result: StockDiscoveryResult = {
    asOf: new Date().toISOString(),
    regime: analysis.regime,
    marketHealth: analysis.marketHealth,
    focusSectors,
    candidates: top,
    scanned: pool.length,
    missingFields: [...new Set(missingFields)].slice(0, 8),
  };

  const existing = cache.get(cacheKey);
  cache.set(cacheKey, { at: Date.now(), discovery: result, movers: existing?.movers ?? { asOf: result.asOf, gainers: [], losers: [], scanned: 0 } });
  return result;
}

export async function runMarketMoversScan(userId: string): Promise<MarketMoversResult> {
  const cacheKey = userId || "anon";
  const hit = cache.get(cacheKey);
  if (hit?.movers.scanned && Date.now() - hit.at < CACHE_MS) return hit.movers;

  const pool = buildMoversScanPool();
  const metricsMap = await scanSymbols(userId, pool);
  const rows: StockCandidate[] = [];

  for (const sym of pool) {
    const m = metricsMap.get(sym);
    if (!m?.available || m.dailyChangePct === null || m.price === null || m.price < MIN_PRICE) continue;
    const moveScore = Math.abs(m.dailyChangePct) * (m.relativeVolume !== null ? Math.min(m.relativeVolume, 3) : 1);
    rows.push(
      mapCandidate(sym, "—", m, Math.round(moveScore * 10), classifyRisk(m, "XLK"), [
        `daily ${m.dailyChangePct >= 0 ? "+" : ""}${m.dailyChangePct.toFixed(2)}%`,
        m.relativeVolume !== null ? `RVOL ${m.relativeVolume.toFixed(2)}x` : "RVOL n/a",
      ]),
    );
  }

  const gainers = [...rows].filter((r) => (r.dailyChangePct ?? 0) > 0).sort((a, b) => (b.dailyChangePct ?? 0) - (a.dailyChangePct ?? 0)).slice(0, 5);
  const losers = [...rows].filter((r) => (r.dailyChangePct ?? 0) < 0).sort((a, b) => (a.dailyChangePct ?? 0) - (b.dailyChangePct ?? 0)).slice(0, 5);

  const result: MarketMoversResult = {
    asOf: new Date().toISOString(),
    gainers,
    losers,
    scanned: pool.length,
  };

  const existing = cache.get(cacheKey);
  cache.set(cacheKey, {
    at: Date.now(),
    discovery: existing?.discovery ?? {
      asOf: result.asOf,
      regime: "MIXED",
      marketHealth: 50,
      focusSectors: [],
      candidates: [],
      scanned: 0,
      missingFields: [],
    },
    movers: result,
  });
  return result;
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

export function formatStockDiscoveryReply(
  analysis: GeneralMarketAnalysis,
  discovery: StockDiscoveryResult,
): string {
  const lines: string[] = [
    "**Stock discovery — US equities (engine ranked)**",
    "",
    `_Default market: NYSE / NASDAQ · USD · America/New_York_`,
    "",
    `**Regime:** ${discovery.regime.replace(/_/g, " ")} · **Market Health:** ${discovery.marketHealth}/100`,
    "",
    "Ranked from a **code-versioned liquid universe** inside today's focus sectors — momentum, relative strength vs SPY, and volume. **Not a trade authorization.**",
    "",
    "### Focus sectors (from live sector ETFs)",
  ];

  if (discovery.focusSectors.length) {
    for (const s of discovery.focusSectors) {
      lines.push(`- **${s.label} (${s.symbol})** ${fmtPct(s.dailyChangePct)}`);
    }
  } else {
    lines.push("- Sector focus: **WAIT**");
  }

  lines.push("", `### Ranked candidates (top ${TOP_DISCOVERY} of ${discovery.scanned} scanned)`);

  if (!discovery.candidates.length) {
    lines.push(
      "No verified candidates passed filters.",
      "",
      "Status: **WAIT** — need live quotes + indicators on the liquid universe.",
    );
  } else {
    discovery.candidates.forEach((c, i) => {
      lines.push(
        `${i + 1}. **${c.symbol}** — score **${c.score}/100** · risk **${c.risk}** · ${fmtPrice(c.price)} (${fmtPct(c.dailyChangePct)})` +
          `${c.relativeStrengthVsSpy !== null ? ` · vs SPY ${c.relativeStrengthVsSpy >= 0 ? "+" : ""}${c.relativeStrengthVsSpy.toFixed(2)}%` : ""}` +
          `${c.rsi14 !== null ? ` · RSI ${c.rsi14.toFixed(1)}` : ""}` +
          `${c.relativeVolume !== null ? ` · RVOL ${c.relativeVolume.toFixed(2)}x` : ""}`,
      );
      if (c.reasons.length) lines.push(`   _${c.reasons.slice(0, 3).join("; ")}_`);
      if (c.source) lines.push(`   _Source: ${c.source}${c.timestamp ? ` · ${c.timestamp}` : ""}_`);
    });
  }

  lines.push(
    "",
    "**PARTIAL / WAIT on full desk card:** forward valuation, earnings catalyst confirmation, and portfolio-level risk sizing are not wired here.",
    "",
    "**Decision: RESEARCH ONLY / NO TRADE** — explain or compare names from this list only; I will not invent tickers outside the engine output.",
  );

  if (discovery.missingFields.length) {
    lines.push("", `_Partial scan:_ ${discovery.missingFields.join("; ")}`);
  }

  return lines.join("\n");
}

export function formatMarketMoversReply(
  analysis: GeneralMarketAnalysis,
  movers: MarketMoversResult,
): string {
  const lines: string[] = [
    "**What's moving — US liquid stocks (verified scan)**",
    "",
    `_Default market: NYSE / NASDAQ · USD_`,
    "",
    `**Regime:** ${analysis.regime.replace(/_/g, " ")} · **Market Health:** ${analysis.marketHealth}/100`,
    "",
    `Scanned **${movers.scanned}** liquid names from the code-versioned universe — ranked by verified daily change (not LLM memory).`,
    "",
    "### Biggest gainers",
  ];

  if (movers.gainers.length) {
    for (const c of movers.gainers) {
      lines.push(
        `- **${c.symbol}** ${fmtPct(c.dailyChangePct)} · ${fmtPrice(c.price)}` +
          `${c.relativeVolume !== null ? ` · RVOL ${c.relativeVolume.toFixed(2)}x` : ""}` +
          `${c.source ? ` · ${c.source}` : ""}`,
      );
    }
  } else {
    lines.push("- No verified gainers in scan window.");
  }

  lines.push("", "### Biggest decliners");
  if (movers.losers.length) {
    for (const c of movers.losers) {
      lines.push(
        `- **${c.symbol}** ${fmtPct(c.dailyChangePct)} · ${fmtPrice(c.price)}` +
          `${c.relativeVolume !== null ? ` · RVOL ${c.relativeVolume.toFixed(2)}x` : ""}` +
          `${c.source ? ` · ${c.source}` : ""}`,
      );
    }
  } else {
    lines.push("- No verified decliners in scan window.");
  }

  const indexLine = analysis.indexes
    .filter((i) => i.available)
    .map((i) => `${i.symbol} ${fmtPct(i.dailyChangePct)}`)
    .join(" · ");
  if (indexLine) lines.push("", `**Index context:** ${indexLine}`);

  lines.push(
    "",
    "**Decision: RESEARCH ONLY** — not a buy list. Ask `Why is TICKER moving?` for a single-name drill-down.",
  );
  return lines.join("\n");
}

export function discoveryToRankedResults(
  discovery: StockDiscoveryResult,
): Array<{ symbol: string; rawScore: number | null; classification: string | null }> {
  return discovery.candidates.map((c) => ({
    symbol: c.symbol,
    rawScore: c.score,
    classification: `${c.risk} · ${c.sectorLabel}`,
  }));
}

export function moversToRankedResults(
  movers: MarketMoversResult,
): Array<{ symbol: string; rawScore: number | null; classification: string | null }> {
  return [...movers.gainers, ...movers.losers].map((c) => ({
    symbol: c.symbol,
    rawScore: c.dailyChangePct,
    classification: (c.dailyChangePct ?? 0) >= 0 ? "GAINER" : "LOSER",
  }));
}

export function formatMoversTopExplain(
  entities: Array<{ symbol: string; score?: number | null; classification?: string | null }>,
): string {
  const top = entities.find((e) => e.classification === "GAINER") ?? entities[0];
  if (!top) {
    return "No movers in the current working set. Run `What's moving?` first.";
  }
  return [
    `**Why ${top.symbol} ranked #1 in the last movers scan**`,
    "",
    `- Verified daily change: **${fmtPct(top.score ?? null)}** (ranked by % move among the liquid universe)`,
    `- Scan class: **${top.classification ?? "GAINER"}**`,
    "",
    "_Ranked from verified quotes only — not LLM memory._",
    "",
    "_This refers to the **movers scan**, not stock-discovery candidates._",
  ].join("\n");
}

export function formatDiscoveryRankExplain(
  candidates: StockCandidate[],
  which: "top" | "riskiest" = "top",
): string {
  if (!candidates.length) {
    return "No discovery candidates in the current working set. Run `What should I buy today?` first.";
  }
  if (which === "riskiest") {
    const c = pickRiskiestCandidate(candidates);
    const riskScore = computeCandidateRiskScore(c);
    const riskLines = buildRiskExplainLines(c);
    const safest = [...candidates].sort(
      (a, b) => computeCandidateRiskScore(a) - computeCandidateRiskScore(b),
    )[0];
    return [
      `**Riskiest in the last discovery list: ${c.symbol}** (${c.risk} · risk score ${riskScore}/100)`,
      "",
      `- Discovery rank score: ${c.score}/100 (rank #1 is **not** the same as highest risk)`,
      `- Price: ${fmtPrice(c.price)} (${fmtPct(c.dailyChangePct)})`,
      c.rsi14 !== null ? `- RSI ${c.rsi14.toFixed(1)}` : null,
      ...riskLines.map((l) => `- ${l}`),
      safest && safest.symbol !== c.symbol
        ? `- _Lower risk in this list: **${safest.symbol}** (${safest.risk})_`
        : null,
      "",
      "_Risk score uses RSI extremes, daily swing, and tape — not the discovery rank formula._",
      "",
      "_Research context only — not a trade authorization._",
    ]
      .filter(Boolean)
      .join("\n");
  }
  const c = candidates[0]!;
  return [
    `**Why ${c.symbol} ranked #1 in the last discovery scan**`,
    "",
    `- Engine score: **${c.score}/100** · risk **${c.risk}**`,
    `- Price: ${fmtPrice(c.price)} (${fmtPct(c.dailyChangePct)})`,
    c.relativeStrengthVsSpy !== null ? `- vs SPY: ${c.relativeStrengthVsSpy >= 0 ? "+" : ""}${c.relativeStrengthVsSpy.toFixed(2)}%` : null,
    c.rsi14 !== null ? `- RSI ${c.rsi14.toFixed(1)}` : null,
    c.relativeVolume !== null ? `- Relative volume ${c.relativeVolume.toFixed(2)}x` : null,
    c.reasons.length ? `- Drivers: ${c.reasons.join("; ")}` : null,
    "",
    "_Ranked from verified quotes/indicators only — not LLM memory._",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Clear cache between tests. */
export function clearStockDiscoveryCache(): void {
  cache.clear();
}
