/**
 * Historical EPS surprises via Finnhub /stock/earnings (free tier ~4 quarters).
 */
import { fetchWithRetry } from "../http";
import { intelligenceCache, LAYER_TTL_MS } from "../cache";

const UA = "Mozilla/5.0 (compatible; RequiTrading/1.0)";

export type HistoricalEarningsRow = {
  period: string | null;
  year: number | null;
  quarter: number | null;
  actual: number | null;
  estimate: number | null;
  surprise: number | null;
  surprisePercent: number | null;
};

export type HistoricalEarningsResult = {
  available: boolean;
  source: string;
  symbol: string;
  rows: HistoricalEarningsRow[];
  error?: string;
  /** Free Finnhub typically returns ≤4 quarters — flag incompleteness vs 6–8 requirement. */
  incompleteForProtocol: boolean;
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function epsSurprisePercent(actual: number | null, estimate: number | null): number | null {
  if (actual === null || estimate === null) return null;
  const den = Math.abs(estimate);
  if (den < 1e-9) return null; // unstable near-zero consensus
  return ((actual - estimate) / den) * 100;
}

export function summarizeBeatHistory(rows: HistoricalEarningsRow[]): {
  quarters: number;
  epsBeatCount: number;
  epsBeatRate: number | null;
  avgSurprisePct: number | null;
  medianSurprisePct: number | null;
  nearZeroConsensusCount: number;
} {
  const usable = rows.filter((r) => r.actual !== null && r.estimate !== null);
  let beats = 0;
  const surprises: number[] = [];
  let nearZero = 0;
  for (const r of usable) {
    const pct =
      r.surprisePercent ??
      epsSurprisePercent(r.actual, r.estimate);
    if (pct === null) {
      nearZero++;
      if ((r.actual as number) > (r.estimate as number)) beats++;
      continue;
    }
    surprises.push(pct);
    if ((r.actual as number) > (r.estimate as number)) beats++;
  }
  const avg =
    surprises.length > 0 ? surprises.reduce((a, b) => a + b, 0) / surprises.length : null;
  const sorted = [...surprises].sort((a, b) => a - b);
  const median =
    sorted.length === 0
      ? null
      : sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  return {
    quarters: usable.length,
    epsBeatCount: beats,
    epsBeatRate: usable.length ? (beats / usable.length) * 100 : null,
    avgSurprisePct: avg,
    medianSurprisePct: median,
    nearZeroConsensusCount: nearZero,
  };
}

async function finnhubHistorical(symbol: string, limit = 8): Promise<HistoricalEarningsRow[]> {
  const key = process.env.FINNHUB_API_KEY?.trim();
  if (!key) throw new Error("FINNHUB_API_KEY not configured");
  const url = `https://finnhub.io/api/v1/stock/earnings?symbol=${encodeURIComponent(symbol)}&limit=${limit}&token=${key}`;
  const res = await fetchWithRetry(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Finnhub stock/earnings HTTP ${res.status}`);
  const data = (await res.json()) as Array<{
    actual?: number | null;
    estimate?: number | null;
    period?: string;
    quarter?: number;
    surprise?: number | null;
    surprisePercent?: number | null;
    year?: number;
  }>;
  if (!Array.isArray(data)) return [];
  return data.map((r) => ({
    period: r.period ?? null,
    year: typeof r.year === "number" ? r.year : null,
    quarter: typeof r.quarter === "number" ? r.quarter : null,
    actual: num(r.actual),
    estimate: num(r.estimate),
    surprise: num(r.surprise),
    surprisePercent: num(r.surprisePercent) ?? epsSurprisePercent(num(r.actual), num(r.estimate)),
  }));
}

export async function fetchHistoricalEarnings(symbol: string): Promise<HistoricalEarningsResult> {
  const sym = symbol.toUpperCase();
  try {
    const rows = await intelligenceCache.through(
      `earnings-hist:${sym}:v1`,
      LAYER_TTL_MS.earnings,
      () => finnhubHistorical(sym, 8),
    );
    return {
      available: rows.length > 0,
      source: "Finnhub /stock/earnings",
      symbol: sym,
      rows,
      incompleteForProtocol: rows.length < 6,
      error: rows.length ? undefined : "No historical earnings rows returned",
    };
  } catch (e) {
    return {
      available: false,
      source: "Finnhub /stock/earnings",
      symbol: sym,
      rows: [],
      incompleteForProtocol: true,
      error: (e as Error).message,
    };
  }
}
