import type { MarketDataProvider, OhlcvBar, RawQuote } from "../types";

/**
 * Alpha Vantage — secondary quote provider (GLOBAL_QUOTE).
 * Used only after broker + Yahoo fail validation or error.
 */
export class AlphaVantageMarketDataProvider implements MarketDataProvider {
  readonly code = "ALPHA_VANTAGE" as const;
  readonly sourceName = "Alpha Vantage";

  async isAvailable(): Promise<boolean> {
    return Boolean(process.env.ALPHA_VANTAGE_API_KEY?.trim());
  }

  async getQuote(symbol: string): Promise<RawQuote> {
    const key = process.env.ALPHA_VANTAGE_API_KEY?.trim();
    if (!key) throw new Error("ALPHA_VANTAGE_API_KEY not configured");

    const sym = symbol.toUpperCase().trim();
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(sym)}&apikey=${encodeURIComponent(key)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; RequiTrading/1.0)" },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Alpha Vantage HTTP ${res.status}`);
      const body = (await res.json()) as Record<string, unknown>;
      const note =
        (body.Note as string | undefined) ??
        (body.Information as string | undefined) ??
        (body["Error Message"] as string | undefined);
      if (note) throw new Error(`Alpha Vantage: ${note}`);

      const q = body["Global Quote"] as Record<string, string> | undefined;
      if (!q?.["05. price"]) throw new Error(`No GLOBAL_QUOTE for ${sym}`);

      const price = Number(q["05. price"]);
      if (!Number.isFinite(price) || price <= 0) throw new Error(`Invalid Alpha Vantage price for ${sym}`);

      return {
        symbol: sym,
        price,
        open: num(q["02. open"]),
        high: num(q["03. high"]),
        low: num(q["04. low"]),
        previousClose: num(q["08. previous close"]),
        volume: num(q["06. volume"]),
        // GLOBAL_QUOTE only includes a trading day — use receive time for freshness gates.
        timestamp: Date.now(),
        exchange: null,
        isDelayed: true,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async getHistory(_symbol: string, _period: string, _interval: string): Promise<OhlcvBar[]> {
    throw new Error("Alpha Vantage history not wired in gateway — use Yahoo failover");
  }
}

function num(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
