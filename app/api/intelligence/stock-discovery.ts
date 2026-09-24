/**
 * Client Rev 9/14 Phase 2 — deterministic US stock discovery & movers scan.
 * Regime → sectors → liquid universe → score/filter → ranked candidates.
 * Never invents tickers; only symbols from the code-versioned universe below.
 */
import { getSnapshot, getIndicators } from "../marketdata/gateway/gateway";
import type { MarketSession, SnapshotResult } from "../marketdata/gateway/types";
import type { GeneralMarketAnalysis, MarketRegime, SectorSnapshot } from "./general-market";
import { US_SECTOR_ETFS, formatSessionBanner } from "./general-market";
import type { ConsoleResearchDepth } from "./market-intent";
import { fetchNews } from "../intelligence-data/providers/news";

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
  /** Phase E — per-symbol session from gateway snapshot when available. */
  marketSession?: MarketSession | null;
  /** Phase D — top verified headline when news layer returns one. */
  driverHeadline?: string | null;
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
  marketSession: MarketSession | null;
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
      marketSession: null,
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
    marketSession: snap.market_session ?? null,
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
    marketSession: metrics.marketSession,
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

/** Phase D — attach top verified headline per displayed mover (additive; never invent). */
export async function enrichMoversWithNewsDrivers(
  movers: MarketMoversResult,
): Promise<MarketMoversResult> {
  const targets = [...movers.gainers, ...movers.losers];
  await Promise.all(
    targets.map(async (c) => {
      const news = await fetchNews(c.symbol).catch(() => null);
      const title = news?.available ? news.payload?.headlines?.[0]?.title ?? null : null;
      c.driverHeadline = title;
    }),
  );
  return movers;
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
  opts?: { depth?: ConsoleResearchDepth },
): string {
  const depth = opts?.depth;
  const top = discovery.candidates[0];
  const sourceHint =
    top?.source ??
    analysis.indexes.find((i) => i.available)?.source ??
    "Requi market data";

  if (depth === "simple") {
    const lines: string[] = [
      "**A simple look at today's US tape**",
      "",
      `_NYSE / NASDAQ · ${discovery.regime.replace(/_/g, " ")} · health ${discovery.marketHealth}/100_`,
      "",
      `_Data: ${sourceHint} — a brokerage account is not required for this research._`,
      "",
    ];
    if (!top) {
      lines.push(
        "The live scan did not return a name that passed filters.",
        "",
        "Status: **WAIT** — quotes on the liquid universe did not qualify anyone this pass. Nothing was invented.",
      );
      return lines.join("\n");
    }
    lines.push(
      `One name that stands out: **${top.symbol}** at ${fmtPrice(top.price)} (${fmtPct(top.dailyChangePct)}).`,
      "",
      `Score **${top.score}/100** · risk **${top.risk}**` +
        (top.rsi14 !== null ? ` · RSI ${top.rsi14.toFixed(1)}` : "") +
        (top.relativeVolume !== null ? ` · RVOL ${top.relativeVolume.toFixed(2)}x` : "") +
        ".",
    );
    if (top.reasons.length) {
      lines.push("", `Why it showed up: ${top.reasons.slice(0, 2).join("; ")}.`);
    }
    if (discovery.candidates[1]) {
      const b = discovery.candidates[1];
      lines.push("", `Backup if you want a second look: **${b.symbol}** (${fmtPct(b.dailyChangePct)}, score ${b.score}/100).`);
    }
    lines.push(
      "",
      "This is research, not a buy order. Ask if you want more names or a deeper scan.",
    );
    if (top.source) lines.push("", `_Source: ${top.source}${top.timestamp ? ` · ${top.timestamp}` : ""}_`);
    return lines.join("\n");
  }

  const lines: string[] = [
    depth === "quant"
      ? "**Quantitative US scan — engine ranked**"
      : "**Stock discovery — US equities (engine ranked)**",
    "",
    `_Default market: NYSE / NASDAQ · USD · America/New_York_`,
    "",
    `**Regime:** ${discovery.regime.replace(/_/g, " ")} · **Market Health:** ${discovery.marketHealth}/100`,
    "",
    depth === "standard"
      ? "Strongest names from a **code-versioned liquid universe** using live quotes — momentum, relative strength vs SPY, and volume. No brokerage or portfolio required."
      : "Ranked from a **code-versioned liquid universe** inside today's focus sectors — momentum, relative strength vs SPY, and volume. **Not a trade authorization.**",
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

  if (depth === "quant") {
    lines.push(
      "",
      "### Model fields on this scan",
      "- **Rank score / risk / evidence:** from the versioned discovery engine (quotes + RSI + RVOL + vs-SPY).",
      "- **Calibrated probability:** **WAIT** — this scan does not output a win-rate or probability of profit.",
      "- **Expected value (post-cost):** **WAIT** — the EV model was not executed on this pass.",
      "- **REOS / ERS:** **WAIT** — those named models are not attached to this scan.",
      "- **Portfolio / broker L1:** not required for this research ranking.",
    );
  } else if (!depth) {
    lines.push(
      "",
      "**PARTIAL / WAIT on full desk card:** forward valuation, earnings catalyst confirmation, and portfolio-level risk sizing are not wired here.",
      "",
      "**Decision: RESEARCH ONLY / NO TRADE** — explain or compare names from this list only; I will not invent tickers outside the engine output.",
    );
  } else {
    lines.push(
      "",
      "Research ranking only — not a trade authorization. Names come from the engine list above, not from memory.",
    );
  }

  if (discovery.missingFields.length) {
    lines.push("", `_Partial scan:_ ${discovery.missingFields.join("; ")}`);
  }

  return lines.join("\n");
}

function candidateSessionTag(c: StockCandidate): string {
  const bits: string[] = [];
  if (c.marketSession === "AFTER_HOURS") bits.push("after-hours");
  else if (c.marketSession === "PREMARKET") bits.push("pre-market");
  else if (c.marketSession === "CLOSED") bits.push("last RTH / closed");
  else if (c.marketSession === "REGULAR") bits.push("RTH");
  if (c.stale) bits.push("stale");
  if (c.timestamp) bits.push(`asOf ${c.timestamp}`);
  return bits.length ? ` · _${bits.join(" · ")}_` : "";
}

export function formatMarketMoversReply(
  analysis: GeneralMarketAnalysis,
  movers: MarketMoversResult,
): string {
  const anyStale =
    analysis.indexes.some((i) => i.available && i.stale) ||
    [...movers.gainers, ...movers.losers].some((c) => c.stale);
  const lines: string[] = [
    "**What's moving — US liquid stocks (verified scan)**",
    "",
    formatSessionBanner(analysis.session, {
      stale: anyStale,
      asOf: analysis.asOf,
    }),
    "",
    `_Default market: NYSE / NASDAQ · USD_`,
    "",
    `**Regime:** ${analysis.regime.replace(/_/g, " ")} · **Market Health:** ${analysis.marketHealth}/100`,
    "",
    `Scanned **${movers.scanned}** liquid names from the code-versioned universe — ranked by verified daily change × relative volume (not LLM memory).`,
    "",
    "_Unusual volume / institutional activity:_ names below surface **RVOL** when the indicators layer provides it. After-hours prints are **not** regular-session volume — treat extended-session moves as partial.",
    "",
    "### Biggest gainers",
  ];

  if (movers.gainers.length) {
    for (const c of movers.gainers) {
      lines.push(
        `- **${c.symbol}** ${fmtPct(c.dailyChangePct)} · ${fmtPrice(c.price)}` +
          `${c.relativeVolume !== null ? ` · RVOL ${c.relativeVolume.toFixed(2)}x` : ""}` +
          `${c.source ? ` · ${c.source}` : ""}` +
          candidateSessionTag(c),
      );
      if (c.driverHeadline) {
        lines.push(`  - Driver (verified headline): ${c.driverHeadline}`);
      } else {
        lines.push(`  - Driver / catalyst: **WAIT** — no verified headline attached.`);
      }
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
          `${c.source ? ` · ${c.source}` : ""}` +
          candidateSessionTag(c),
      );
      if (c.driverHeadline) {
        lines.push(`  - Driver (verified headline): ${c.driverHeadline}`);
      } else {
        lines.push(`  - Driver / catalyst: **WAIT** — no verified headline attached.`);
      }
    }
  } else {
    lines.push("- No verified decliners in scan window.");
  }

  // Phase E — empty / thin AH or closed session: disclose last RTH posture, don't go silent.
  if (
    !movers.gainers.length &&
    !movers.losers.length &&
    (analysis.session === "AFTER_HOURS" || analysis.session === "CLOSED" || analysis.session === "PREMARKET")
  ) {
    lines.push(
      "",
      `**Extended / closed session note:** Market session is **${analysis.session.replace(/_/g, " ")}**. ` +
        "No liquid-universe movers cleared the scan filters on this snapshot — this is **not** an empty market invention. " +
        "Use the latest available RTH/index context below, or ask for a named ticker (`Why is TICKER moving?`).",
    );
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

export function formatDiscoverySymbolExplain(
  c: StockCandidate,
  rank: number,
  sorted: StockCandidate[],
): string {
  const top = sorted[0];
  return [
    `**Why ${c.symbol} is ranked #${rank} in the discovery scan**`,
    "",
    `- Engine score: **${c.score}/100** · risk **${c.risk}**`,
    `- Price: ${fmtPrice(c.price)} (${fmtPct(c.dailyChangePct)})`,
    c.relativeStrengthVsSpy !== null
      ? `- vs SPY: ${c.relativeStrengthVsSpy >= 0 ? "+" : ""}${c.relativeStrengthVsSpy.toFixed(2)}%`
      : null,
    c.rsi14 !== null ? `- RSI ${c.rsi14.toFixed(1)}` : null,
    c.relativeVolume !== null ? `- Relative volume ${c.relativeVolume.toFixed(2)}x` : null,
    c.reasons.length ? `- Drivers: ${c.reasons.join("; ")}` : null,
    rank === 1
      ? `- _${c.symbol} is the top-ranked name on this fresh engine scan._`
      : top && top.symbol !== c.symbol
        ? `- _#1 on this scan is **${top.symbol}** (${top.score}/100); ${c.symbol} follows at #${rank}._`
        : null,
    "",
    "_Ranked from verified quotes/indicators only — not LLM memory._",
  ]
    .filter(Boolean)
    .join("\n");
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

export type BreadthClassification = "STRONG" | "POSITIVE" | "MIXED" | "WEAK" | "VERY_WEAK";

export type MarketBreadthResult = {
  advancing: number;
  declining: number;
  unchanged: number;
  scanned: number;
  quoted: number;
  pctAdvancing: number | null;
  advanceDeclineRatio: number | null;
  classification: BreadthClassification;
  universeLabel: string;
  available: boolean;
  asOf: string;
};

const breadthCache = new Map<string, { at: number; breadth: MarketBreadthResult }>();

/** PDF §6 — classify % advancing across liquid universe sample. */
export function classifyMarketBreadth(pctAdvancing: number | null): BreadthClassification {
  if (pctAdvancing === null || !Number.isFinite(pctAdvancing)) return "MIXED";
  if (pctAdvancing >= 70) return "STRONG";
  if (pctAdvancing >= 55) return "POSITIVE";
  if (pctAdvancing >= 45) return "MIXED";
  if (pctAdvancing >= 30) return "WEAK";
  return "VERY_WEAK";
}

/** Scan liquid universe for advance/decline breadth (PDF §6 / Pack B3). */
export async function runMarketBreadthScan(userId: string): Promise<MarketBreadthResult> {
  const cacheKey = userId || "anon";
  const hit = breadthCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.breadth;

  const symbols = buildMoversScanPool();
  const metrics = await scanSymbols(userId, symbols);
  let advancing = 0;
  let declining = 0;
  let unchanged = 0;
  let quoted = 0;

  for (const m of metrics.values()) {
    if (!m.available || m.dailyChangePct === null || !Number.isFinite(m.dailyChangePct)) continue;
    quoted++;
    if (m.dailyChangePct > 0.01) advancing++;
    else if (m.dailyChangePct < -0.01) declining++;
    else unchanged++;
  }

  const pctAdvancing = quoted > 0 ? (advancing / quoted) * 100 : null;
  const advanceDeclineRatio =
    declining > 0 ? advancing / declining : advancing > 0 ? advancing : null;

  const breadth: MarketBreadthResult = {
    advancing,
    declining,
    unchanged,
    scanned: symbols.length,
    quoted,
    pctAdvancing: pctAdvancing !== null ? Math.round(pctAdvancing * 10) / 10 : null,
    advanceDeclineRatio: advanceDeclineRatio !== null ? Math.round(advanceDeclineRatio * 100) / 100 : null,
    classification: classifyMarketBreadth(pctAdvancing),
    universeLabel: `liquid US equities (${symbols.length}-name sample)`,
    available: quoted >= Math.min(12, Math.floor(symbols.length * 0.3)),
    asOf: new Date().toISOString(),
  };

  breadthCache.set(cacheKey, { at: Date.now(), breadth });
  return breadth;
}

/** Clear cache between tests. */
export function clearStockDiscoveryCache(): void {
  cache.clear();
  breadthCache.clear();
}
