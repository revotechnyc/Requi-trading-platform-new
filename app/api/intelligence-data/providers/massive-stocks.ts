/**
 * Massive/Polygon Stocks — daily bars for event studies.
 */
import { intelligenceCache, LAYER_TTL_MS } from "../cache";
import { fetchWithRetry } from "../http";
import { getDataProviderMode, isMockDataMode, resolveApiKey } from "./mode";
import { researchOk, researchUnavailable, type ResearchFetchBase } from "./types-research";

export type DailyBar = {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type StockBarsResult = ResearchFetchBase & {
  symbol: string;
  bars: DailyBar[];
};

/** Deterministic synthetic bars for event-study unit tests (open=prior close). */
export function syntheticBarsAroundEvent(
  eventDate: string,
  priorClose: number,
  gapPct: number,
  d1Pct: number,
  d5Pct: number,
  d10Pct: number,
): DailyBar[] {
  const bars: DailyBar[] = [];
  const [y, m, d] = eventDate.split("-").map(Number);
  const start = new Date(Date.UTC(y!, m! - 1, d! - 2, 17, 0, 0));
  let px = priorClose;
  for (let i = 0; i < 14; i++) {
    const dt = new Date(start);
    dt.setUTCDate(start.getUTCDate() + i);
    const ymd = dt.toISOString().slice(0, 10);
    if (ymd === eventDate) {
      const open = priorClose * (1 + gapPct / 100);
      const close = open * (1 + d1Pct / 100);
      bars.push({ date: ymd, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 1e6 });
      px = close;
      continue;
    }
    // After event: path toward d5/d10 roughly
    const dayFromEvent = Math.round((dt.getTime() - Date.parse(`${eventDate}T17:00:00Z`)) / 86_400_000);
    if (dayFromEvent === 5) px = priorClose * (1 + gapPct / 100) * (1 + d5Pct / 100);
    else if (dayFromEvent === 10) px = priorClose * (1 + gapPct / 100) * (1 + d10Pct / 100);
    else if (dayFromEvent > 0) px = px * 1.001;
    else px = priorClose;
    bars.push({ date: ymd, open: px, high: px * 1.01, low: px * 0.99, close: px, volume: 1e6 });
  }
  return bars;
}

function mockBars(symbol: string): StockBarsResult {
  const sym = symbol.toUpperCase();
  const event = "2026-01-15";
  return {
    ...researchOk("Massive Stocks", true),
    symbol: sym,
    bars: syntheticBarsAroundEvent(event, 100, 3, 1.5, 2.5, 4),
  };
}

async function liveBars(symbol: string, key: string, from: string, to: string): Promise<StockBarsResult> {
  const sym = symbol.toUpperCase();
  const source = "Massive Stocks";
  try {
    const url =
      `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(sym)}/range/1/day/${from}/${to}` +
      `?adjusted=true&sort=asc&limit=50000&apiKey=${encodeURIComponent(key)}`;
    const res = await fetchWithRetry(url, { retries: 1, timeoutMs: 15_000 });
    if (!res.ok) {
      return {
        ...researchUnavailable(source, `Aggs HTTP ${res.status}`),
        symbol: sym,
        bars: [],
      };
    }
    const data = (await res.json()) as {
      results?: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>;
    };
    const bars: DailyBar[] = (data.results ?? []).map((r) => ({
      date: new Date(r.t).toISOString().slice(0, 10),
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
      volume: r.v,
    }));
    if (!bars.length) {
      return {
        ...researchUnavailable(source, "No aggregate bars returned"),
        symbol: sym,
        bars: [],
      };
    }
    return {
      ...researchOk(source, false),
      symbol: sym,
      bars,
    };
  } catch (e) {
    return {
      ...researchUnavailable(source, (e as Error).message),
      symbol: sym,
      bars: [],
    };
  }
}

export async function fetchDailyBars(
  symbol: string,
  from: string,
  to: string,
): Promise<StockBarsResult> {
  const sym = symbol.toUpperCase();
  if (getDataProviderMode() === "mock" || isMockDataMode("MASSIVE_API_KEY")) {
    return mockBars(sym);
  }
  const key = resolveApiKey("MASSIVE_API_KEY");
  if (!key) {
    return {
      ...researchUnavailable("Massive Stocks", "MASSIVE_API_KEY not configured or DUMMY"),
      symbol: sym,
      bars: [],
    };
  }
  return intelligenceCache.through(
    `massive-bars:${sym}:${from}:${to}`,
    LAYER_TTL_MS.massiveStocks,
    () => liveBars(sym, key, from, to),
  );
}
