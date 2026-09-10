/**
 * Historical EPS surprises via Finnhub /stock/earnings (free tier ~4 quarters),
 * with Alpha Vantage EARNINGS as secondary backfill when history is incomplete.
 */
import { fetchWithRetry } from "../http";
import { intelligenceCache, LAYER_TTL_MS } from "../cache";
import { fetchAlphaVantageEarnings } from "./alpha-vantage";

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
  conflict?: boolean;
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

function periodKey(r: HistoricalEarningsRow): string {
  if (r.period) return r.period.slice(0, 10);
  if (r.year && r.quarter) return `${r.year}-Q${r.quarter}`;
  return `${r.year ?? ""}-${r.quarter ?? ""}`;
}

function mergeHistorical(
  primary: HistoricalEarningsRow[],
  secondary: HistoricalEarningsRow[],
): { rows: HistoricalEarningsRow[]; conflict: boolean } {
  const byKey = new Map<string, HistoricalEarningsRow>();
  let conflict = false;
  for (const row of primary) {
    byKey.set(periodKey(row), row);
  }
  for (const row of secondary) {
    const key = periodKey(row);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    // Material EPS conflict between sources — do not silently overwrite Finnhub.
    if (
      existing.actual !== null &&
      row.actual !== null &&
      Math.abs(existing.actual - row.actual) > 0.02
    ) {
      conflict = true;
    }
  }
  const rows = [...byKey.values()].sort((a, b) => (b.period ?? "").localeCompare(a.period ?? ""));
  return { rows, conflict };
}

export async function fetchHistoricalEarnings(
  symbol: string,
  opts?: { allowAlphaVantageBackfill?: boolean },
): Promise<HistoricalEarningsResult> {
  const sym = symbol.toUpperCase();
  const allowAv = opts?.allowAlphaVantageBackfill !== false;
  let finnhubRows: HistoricalEarningsRow[] = [];
  let finnhubError: string | undefined;

  try {
    finnhubRows = await intelligenceCache.through(
      `earnings-hist:${sym}:v2`,
      LAYER_TTL_MS.earnings,
      () => finnhubHistorical(sym, 8),
    );
  } catch (e) {
    finnhubError = (e as Error).message;
  }

  let source = "Finnhub /stock/earnings";
  let rows = finnhubRows;
  let conflict = false;

  // Secondary backfill when primary is empty or short of protocol 6–8 quarters.
  // Calendar day-boards disable AV — free-tier rate limits stall Promise.all enrichment.
  if (allowAv && rows.length < 6) {
    const av = await fetchAlphaVantageEarnings(sym);
    if (av.available && av.quarterly.length) {
      const avRows: HistoricalEarningsRow[] = av.quarterly.slice(0, 12).map((r) => {
        const d = r.fiscalDateEnding;
        const year = d ? Number(d.slice(0, 4)) : null;
        const month = d ? Number(d.slice(5, 7)) : null;
        const quarter =
          month === null || !Number.isFinite(month)
            ? null
            : Math.ceil(month / 3);
        return {
          period: d || null,
          year: Number.isFinite(year as number) ? year : null,
          quarter,
          actual: r.reportedEPS,
          estimate: r.estimatedEPS,
          surprise: r.surprise,
          surprisePercent: r.surprisePercent ?? epsSurprisePercent(r.reportedEPS, r.estimatedEPS),
        };
      });
      const merged = mergeHistorical(rows, avRows);
      rows = merged.rows;
      conflict = merged.conflict;
      source = finnhubRows.length
        ? "Finnhub /stock/earnings + Alpha Vantage EARNINGS (backfill)"
        : "Alpha Vantage EARNINGS";
    } else if (!finnhubRows.length && av.error) {
      finnhubError = finnhubError ?? av.error;
    }
  }

  return {
    available: rows.length > 0,
    source,
    symbol: sym,
    rows,
    incompleteForProtocol: rows.length < 6,
    conflict: conflict || undefined,
    error: rows.length ? undefined : finnhubError ?? "No historical earnings rows returned",
  };
}
