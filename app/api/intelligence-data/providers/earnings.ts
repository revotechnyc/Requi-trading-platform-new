import { fetchWithRetry } from "../http";
import { intelligenceCache, LAYER_TTL_MS } from "../cache";
import type { EarningsPayload, LayerEnvelope } from "../types";
import { fetchYahooQuoteSummary } from "../yahoo-session";

const UA = "Mozilla/5.0 (compatible; RequiTrading/1.0)";

async function finnhubEarnings(symbol: string): Promise<EarningsPayload | null> {
  const key = process.env.FINNHUB_API_KEY?.trim();
  if (!key) return null;
  const from = new Date();
  from.setDate(from.getDate() - 7);
  const to = new Date();
  to.setDate(to.getDate() + 60);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url =
    `https://finnhub.io/api/v1/calendar/earnings?symbol=${symbol}` +
    `&from=${fmt(from)}&to=${fmt(to)}&token=${key}`;
  const res = await fetchWithRetry(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    earningsCalendar?: Array<{
      date?: string;
      epsActual?: number | null;
      epsEstimate?: number | null;
      revenueActual?: number | null;
      revenueEstimate?: number | null;
      symbol?: string;
    }>;
  };
  const row = data.earningsCalendar?.find((e) => e.symbol?.toUpperCase() === symbol) ?? data.earningsCalendar?.[0];
  if (!row) return null;
  const epsA = row.epsActual ?? null;
  const epsE = row.epsEstimate ?? null;
  let surprise: EarningsPayload["surprise"] = "unknown";
  if (epsA !== null && epsE !== null) {
    if (epsA > epsE) surprise = "beat";
    else if (epsA < epsE) surprise = "miss";
    else surprise = "met";
  }
  return {
    symbol,
    reportDate: row.date ?? null,
    epsEstimate: epsE,
    epsActual: epsA,
    revenueEstimate: row.revenueEstimate ?? null,
    revenueActual: row.revenueActual ?? null,
    surprise,
  };
}

async function yahooEarningsInterim(symbol: string): Promise<EarningsPayload> {
  const res = await fetchYahooQuoteSummary(symbol, "calendarEvents,earnings");
  if (!res.ok) throw new Error(`Yahoo earnings HTTP ${res.status}`);
  const data = (await res.json()) as {
    quoteSummary?: {
      result?: Array<{
        calendarEvents?: { earnings?: { earningsDate?: Array<{ raw?: number }>; earningsAverage?: number; earningsLow?: number; earningsHigh?: number } };
        earnings?: { financialsChart?: { quarterly?: Array<{ date?: string; revenue?: number; earnings?: number }> } };
      }>;
    };
  };
  const r = data.quoteSummary?.result?.[0];
  const cal = r?.calendarEvents?.earnings;
  const reportTs = cal?.earningsDate?.[0]?.raw;
  const quarterly = r?.earnings?.financialsChart?.quarterly ?? [];
  const latest = quarterly[quarterly.length - 1];
  return {
    symbol,
    reportDate: reportTs ? new Date(reportTs * 1000).toISOString().slice(0, 10) : latest?.date ?? null,
    epsEstimate: cal?.earningsAverage ?? null,
    epsActual: latest?.earnings ?? null,
    revenueEstimate: null,
    revenueActual: latest?.revenue ?? null,
    surprise: "unknown",
    note: "Interim Yahoo calendar — register Finnhub for full consensus calendar",
  };
}

export async function fetchEarnings(symbol: string): Promise<LayerEnvelope<EarningsPayload>> {
  const sym = symbol.toUpperCase();
  const now = new Date().toISOString();
  try {
    const payload = await intelligenceCache.through(`earnings:${sym}`, LAYER_TTL_MS.earnings, async () => {
      const finnhub = await finnhubEarnings(sym);
      if (finnhub) return finnhub;
      return await yahooEarningsInterim(sym);
    });

    return {
      layer: "earnings",
      ticker: sym,
      timestamp: now,
      source: process.env.FINNHUB_API_KEY ? "Finnhub" : "Yahoo Finance (interim)",
      available: true,
      stale: false,
      payload,
    };
  } catch (e) {
    return {
      layer: "earnings",
      ticker: sym,
      timestamp: now,
      source: "Earnings calendar",
      available: false,
      stale: false,
      payload: null,
      error: (e as Error).message,
    };
  }
}
