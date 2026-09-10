/**
 * Alpha Vantage — secondary / fallback research source.
 * Free-tier rate limits apply; results are cached aggressively.
 * Never silently overwrite Finnhub/SEC when numbers disagree.
 */
import { fetchWithRetry } from "../http";
import { intelligenceCache, LAYER_TTL_MS } from "../cache";

const UA = "Mozilla/5.0 (compatible; RequiTrading/1.0)";

export type AlphaVantageOverview = {
  symbol: string;
  name: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  peRatio: number | null;
  eps: number | null;
  revenueTTM: number | null;
  grossProfitTTM: number | null;
  profitMargin: number | null;
  operatingMarginTTM: number | null;
  sharesOutstanding: number | null;
  source: "Alpha Vantage OVERVIEW";
};

export type AlphaVantageEarningsRow = {
  fiscalDateEnding: string;
  reportedDate: string | null;
  reportedEPS: number | null;
  estimatedEPS: number | null;
  surprise: number | null;
  surprisePercent: number | null;
};

export type AlphaVantageEarningsResult = {
  available: boolean;
  symbol: string;
  annual: AlphaVantageEarningsRow[];
  quarterly: AlphaVantageEarningsRow[];
  source: string;
  error?: string;
};

function avKey(): string | null {
  return process.env.ALPHA_VANTAGE_API_KEY?.trim() || null;
}

/** Strip keys / long rate-limit blurbs before they reach user-facing gap registers. */
export function sanitizeProviderError(message: string | undefined | null, fallback = "provider unavailable"): string {
  if (!message?.trim()) return fallback;
  let m = message
    .replace(/apikey=[^&\s"']+/gi, "apikey=[redacted]")
    .replace(/\b[A-Z0-9]{12,}\b/g, (tok) => (/^[A-Z0-9]+$/.test(tok) && /[0-9]/.test(tok) ? "[redacted]" : tok))
    .replace(/https?:\/\/\S+/gi, "[url]");
  if (/rate limit|25 requests|sparingly|premium plans|subscribe/i.test(m)) {
    return "Alpha Vantage rate-limited or daily quota exceeded";
  }
  if (m.length > 160) m = `${m.slice(0, 157)}...`;
  return m;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "None" || v === "-") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function avJson(params: Record<string, string>): Promise<unknown> {
  const key = avKey();
  if (!key) throw new Error("ALPHA_VANTAGE_API_KEY not configured");
  const qs = new URLSearchParams({ ...params, apikey: key });
  const url = `https://www.alphavantage.co/query?${qs.toString()}`;
  const res = await fetchWithRetry(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    retries: 2,
    backoffMs: 800,
    timeoutMs: 25_000,
  });
  if (!res.ok) throw new Error(`Alpha Vantage HTTP ${res.status}`);
  const body = await res.json();
  if (body && typeof body === "object") {
    const note = (body as { Note?: string; Information?: string; "Error Message"?: string }).Note
      ?? (body as { Information?: string }).Information
      ?? (body as { "Error Message"?: string })["Error Message"];
    if (note) throw new Error(`Alpha Vantage: ${note}`);
  }
  return body;
}

function mapEarningsRow(r: Record<string, string>): AlphaVantageEarningsRow {
  const reported = num(r.reportedEPS);
  const estimated = num(r.estimatedEPS);
  const surprise = num(r.surprise);
  let surprisePercent = num(r.surprisePercentage);
  if (surprisePercent === null && reported !== null && estimated !== null && Math.abs(estimated) > 1e-9) {
    surprisePercent = ((reported - estimated) / Math.abs(estimated)) * 100;
  }
  return {
    fiscalDateEnding: r.fiscalDateEnding ?? "",
    reportedDate: r.reportedDate ?? null,
    reportedEPS: reported,
    estimatedEPS: estimated,
    surprise,
    surprisePercent,
  };
}

export async function fetchAlphaVantageOverview(symbol: string): Promise<{
  available: boolean;
  payload: AlphaVantageOverview | null;
  error?: string;
}> {
  const sym = symbol.toUpperCase();
  if (!avKey()) {
    return { available: false, payload: null, error: "ALPHA_VANTAGE_API_KEY not configured" };
  }
  try {
    const payload = await intelligenceCache.through(
      `av:overview:${sym}:v1`,
      LAYER_TTL_MS.alphaVantage,
      async () => {
        const body = (await avJson({ function: "OVERVIEW", symbol: sym })) as Record<string, string>;
        if (!body?.Symbol && !body?.Name) throw new Error("Empty OVERVIEW payload");
        return {
          symbol: sym,
          name: body.Name || null,
          exchange: body.Exchange || null,
          sector: body.Sector || null,
          industry: body.Industry || null,
          marketCap: num(body.MarketCapitalization),
          peRatio: num(body.PERatio),
          eps: num(body.EPS),
          revenueTTM: num(body.RevenueTTM),
          grossProfitTTM: num(body.GrossProfitTTM),
          profitMargin: num(body.ProfitMargin),
          operatingMarginTTM: num(body.OperatingMarginTTM),
          sharesOutstanding: num(body.SharesOutstanding),
          source: "Alpha Vantage OVERVIEW" as const,
        };
      },
    );
    return { available: true, payload };
  } catch (e) {
    return { available: false, payload: null, error: sanitizeProviderError((e as Error).message) };
  }
}

export async function fetchAlphaVantageEarnings(symbol: string): Promise<AlphaVantageEarningsResult> {
  const sym = symbol.toUpperCase();
  if (!avKey()) {
    return {
      available: false,
      symbol: sym,
      annual: [],
      quarterly: [],
      source: "Alpha Vantage EARNINGS",
      error: "ALPHA_VANTAGE_API_KEY not configured",
    };
  }
  try {
    const data = await intelligenceCache.through(
      `av:earnings:${sym}:v1`,
      LAYER_TTL_MS.alphaVantage,
      async () => {
        const body = (await avJson({ function: "EARNINGS", symbol: sym })) as {
          annualEarnings?: Array<Record<string, string>>;
          quarterlyEarnings?: Array<Record<string, string>>;
        };
        return {
          annual: (body.annualEarnings ?? []).map(mapEarningsRow).filter((r) => r.fiscalDateEnding),
          quarterly: (body.quarterlyEarnings ?? []).map(mapEarningsRow).filter((r) => r.fiscalDateEnding),
        };
      },
    );
    return {
      available: data.quarterly.length > 0 || data.annual.length > 0,
      symbol: sym,
      annual: data.annual,
      quarterly: data.quarterly,
      source: "Alpha Vantage EARNINGS",
    };
  } catch (e) {
    return {
      available: false,
      symbol: sym,
      annual: [],
      quarterly: [],
      source: "Alpha Vantage EARNINGS",
      error: sanitizeProviderError((e as Error).message),
    };
  }
}
