import { fetchWithRetry } from "../http";
import { intelligenceCache, LAYER_TTL_MS } from "../cache";
import type { EarningsPayload, LayerEnvelope } from "../types";
import { fetchYahooQuoteSummary } from "../yahoo-session";

const UA = "Mozilla/5.0 (compatible; RequiTrading/1.0)";

/** Yahoo often returns `{ raw, fmt }` instead of a bare number. */
function yahooNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "raw" in value) {
    const raw = (value as { raw?: unknown }).raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function inferReportTime(ts: number | undefined): EarningsPayload["reportTime"] {
  if (!ts) return "unknown";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(new Date(ts * 1000));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 12);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  if (hour < 9 || (hour === 9 && minute < 30)) return "BMO";
  if (hour >= 16) return "AMC";
  return "unknown";
}

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
    dateType: "confirmed",
    reportTime: "unknown",
  };
}

async function yahooEarningsInterim(symbol: string): Promise<EarningsPayload> {
  const res = await fetchYahooQuoteSummary(symbol, "calendarEvents,earnings");
  if (!res.ok) throw new Error(`Yahoo earnings HTTP ${res.status}`);
  const data = (await res.json()) as {
    quoteSummary?: {
      result?: Array<{
        calendarEvents?: {
          earnings?: {
            earningsDate?: Array<{ raw?: number }>;
            earningsAverage?: unknown;
            earningsLow?: unknown;
            earningsHigh?: unknown;
          };
        };
        earnings?: {
          financialsChart?: {
            quarterly?: Array<{ date?: string; revenue?: unknown; earnings?: unknown }>;
          };
        };
      }>;
    };
  };
  const r = data.quoteSummary?.result?.[0];
  const cal = r?.calendarEvents?.earnings;
  const reportTs = cal?.earningsDate?.[0]?.raw;
  const quarterly = r?.earnings?.financialsChart?.quarterly ?? [];
  const latest = quarterly[quarterly.length - 1];
  const reportDate = reportTs ? new Date(reportTs * 1000).toISOString().slice(0, 10) : latest?.date ?? null;
  if (!reportDate) throw new Error("Yahoo earnings calendar empty");
  return {
    symbol,
    reportDate,
    epsEstimate: yahooNum(cal?.earningsAverage),
    // Yahoo quarterly chart "earnings" is absolute net income, not EPS — do not map as epsActual.
    epsActual: null,
    revenueEstimate: null,
    revenueActual: yahooNum(latest?.revenue),
    surprise: "unknown",
    dateType: "estimated",
    reportTime: inferReportTime(reportTs),
    note: "Estimated date via Yahoo Finance calendar — register Finnhub for confirmed consensus calendar",
  };
}

export async function fetchEarnings(symbol: string): Promise<LayerEnvelope<EarningsPayload>> {
  const sym = symbol.toUpperCase();
  const now = new Date().toISOString();
  try {
    const payload = await intelligenceCache.through(`earnings:${sym}:v3`, LAYER_TTL_MS.earnings, async () => {
      const finnhub = await finnhubEarnings(sym);
      if (finnhub) return finnhub;
      return await yahooEarningsInterim(sym);
    });

    return {
      layer: "earnings",
      ticker: sym,
      timestamp: now,
      source: process.env.FINNHUB_API_KEY ? "Finnhub" : "Yahoo Finance (interim)",
      available: Boolean(payload.reportDate),
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
