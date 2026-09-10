/**
 * FRED API — free macroeconomic series for market-regime / backdrop checks.
 * ALFRED vintages can be added later using the same key + realtime_start/realtime_end.
 */
import { fetchWithRetry } from "../http";
import { intelligenceCache, LAYER_TTL_MS } from "../cache";

const UA = "Mozilla/5.0 (compatible; RequiTrading/1.0)";

export type FredObservation = {
  seriesId: string;
  title: string;
  date: string;
  value: number | null;
};

export type FredMacroBackdrop = {
  available: boolean;
  asOf: string;
  series: FredObservation[];
  source: string;
  error?: string;
};

const CORE_SERIES: Array<{ id: string; title: string }> = [
  { id: "FEDFUNDS", title: "Federal Funds Rate" },
  { id: "DGS10", title: "10-Year Treasury Yield" },
  { id: "T10Y2Y", title: "10Y–2Y Yield Curve Spread" },
  { id: "CPIAUCSL", title: "CPI (All Urban Consumers)" },
  { id: "UNRATE", title: "Unemployment Rate" },
  { id: "GDP", title: "Real GDP" },
];

function fredKey(): string | null {
  return process.env.FRED_API_KEY?.trim() || null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === ".") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchLatestObservation(seriesId: string): Promise<FredObservation> {
  const key = fredKey();
  if (!key) throw new Error("FRED_API_KEY not configured");
  const url =
    `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(key)}` +
    `&file_type=json&sort_order=desc&limit=1`;
  const res = await fetchWithRetry(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    retries: 2,
    backoffMs: 500,
    timeoutMs: 20_000,
  });
  if (!res.ok) throw new Error(`FRED ${seriesId} HTTP ${res.status}`);
  const body = (await res.json()) as {
    observations?: Array<{ date?: string; value?: string }>;
  };
  const obs = body.observations?.[0];
  const meta = CORE_SERIES.find((s) => s.id === seriesId);
  return {
    seriesId,
    title: meta?.title ?? seriesId,
    date: obs?.date ?? "",
    value: num(obs?.value),
  };
}

export async function fetchFredMacroBackdrop(): Promise<FredMacroBackdrop> {
  const asOf = new Date().toISOString();
  if (!fredKey()) {
    return {
      available: false,
      asOf,
      series: [],
      source: "FRED",
      error: "FRED_API_KEY not configured",
    };
  }
  try {
    const series = await intelligenceCache.through(
      "fred:macro-backdrop:v1",
      LAYER_TTL_MS.fred,
      async () => {
        const out: FredObservation[] = [];
        // Sequential to stay polite on free tier; cached for hours after first hit.
        for (const s of CORE_SERIES) {
          out.push(await fetchLatestObservation(s.id));
        }
        return out;
      },
    );
    const usable = series.filter((s) => s.value !== null);
    return {
      available: usable.length > 0,
      asOf,
      series,
      source: "FRED",
      error: usable.length ? undefined : "No usable FRED observations",
    };
  } catch (e) {
    return {
      available: false,
      asOf,
      series: [],
      source: "FRED",
      error: (e as Error).message,
    };
  }
}

export function formatFredMacroBrief(backdrop: FredMacroBackdrop): string[] {
  if (!backdrop.available) {
    return [`Macro backdrop unavailable (${backdrop.error ?? "FRED"})`];
  }
  return backdrop.series
    .filter((s) => s.value !== null)
    .map((s) => `${s.title}: ${s.value} (as of ${s.date})`);
}
