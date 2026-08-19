import type { MarketDataProvider, OhlcvBar, RawQuote } from "../types";

/**
 * Yahoo Finance provider — the default market-data source (spec §2).
 *
 * Server-side HTTP against Yahoo's public chart endpoint (the same data the
 * yfinance library wraps). This is backend code only — the AI never chooses
 * or calls a provider.
 */

const UA = "Mozilla/5.0 (compatible; RequiTrading/1.0; market-data-gateway)";

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        regularMarketPrice?: number;
        regularMarketTime?: number;
        previousClose?: number;
        chartPreviousClose?: number;
        exchangeName?: string;
        fullExchangeName?: string;
        instrumentType?: string;
        dataGranularity?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
    error?: { code?: string; description?: string } | null;
  };
}

/**
 * Yahoo throttles bare datacenter requests (HTTP 403/429). Like yfinance, we
 * hold a cookie + crumb session and retry once with it on 403/429.
 */
let authSession: { cookie: string; crumb: string; at: number } | null = null;
let authInflight: Promise<{ cookie: string; crumb: string } | null> | null = null;

async function getAuth(): Promise<{ cookie: string; crumb: string } | null> {
  if (authSession && Date.now() - authSession.at < 30 * 60_000) return authSession;
  if (authInflight) return authInflight;
  authInflight = (async () => {
    try {
      const cookieRes = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "manual" }).catch(() => null);
      const cookie = cookieRes?.headers.get("set-cookie")?.split(";")[0];
      if (!cookie) return null;
      const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": UA, Cookie: cookie } });
      if (!crumbRes.ok) return null;
      const crumb = (await crumbRes.text()).trim();
      if (!crumb || crumb.includes("<")) return null;
      authSession = { cookie, crumb, at: Date.now() };
      return authSession;
    } catch {
      return null;
    } finally {
      authInflight = null;
    }
  })();
  return authInflight;
}

async function fetchChart(symbol: string, range: string, interval: string): Promise<YahooChartResponse["chart"]> {
  const base = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=true`;

  const attempt = async (auth: { cookie: string; crumb: string } | null): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const url = auth ? `${base}&crumb=${encodeURIComponent(auth.crumb)}` : base;
      return await fetch(url, {
        headers: { "User-Agent": UA, ...(auth ? { Cookie: auth.cookie } : {}) },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  let res = await attempt(null);
  if (res.status === 403 || res.status === 429) {
    const auth = await getAuth();
    if (auth) res = await attempt(auth);
  }
  if (!res.ok) throw new Error(`Yahoo chart ${symbol} → HTTP ${res.status}`);
  const body = (await res.json()) as YahooChartResponse;
  if (body.chart?.error) throw new Error(`Yahoo chart ${symbol} → ${body.chart.error.description ?? body.chart.error.code}`);
  if (!body.chart?.result?.[0]) throw new Error(`No market data returned for ${symbol}`);
  return body.chart;
}

export class YahooMarketDataProvider implements MarketDataProvider {
  readonly code = "YFINANCE" as const;
  readonly sourceName = "Yahoo Finance";

  async isAvailable(): Promise<boolean> {
    return true; // public HTTP endpoint; failures surface per-request with structured errors
  }

  async getQuote(symbol: string): Promise<RawQuote> {
    const sym = symbol.toUpperCase().trim();
    const chart = await fetchChart(sym, "1d", "1m");
    const result = chart!.result![0];
    const meta = result.meta ?? {};
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const opens = result.indicators?.quote?.[0]?.open ?? [];
    const highs = result.indicators?.quote?.[0]?.high ?? [];
    const lows = result.indicators?.quote?.[0]?.low ?? [];
    const volumes = result.indicators?.quote?.[0]?.volume ?? [];
    const ts = result.timestamp ?? [];

    // Latest non-null close (mirrors yfinance data.iloc[-1] on clean data).
    let price: number | undefined;
    let at: number | undefined;
    for (let i = closes.length - 1; i >= 0; i--) {
      if (closes[i] != null && Number.isFinite(closes[i]!)) {
        price = closes[i]!;
        at = ts[i];
        break;
      }
    }
    if (price === undefined && meta.regularMarketPrice != null) {
      price = meta.regularMarketPrice;
      at = meta.regularMarketTime;
    }
    if (price === undefined || at === undefined) throw new Error(`No market data returned for ${sym}`);

    const first = (arr: (number | null)[]) => arr.find((x) => x != null) ?? null;
    const max = (arr: (number | null)[]) => {
      const v = arr.filter((x): x is number => x != null);
      return v.length ? Math.max(...v) : null;
    };
    const min = (arr: (number | null)[]) => {
      const v = arr.filter((x): x is number => x != null);
      return v.length ? Math.min(...v) : null;
    };

    return {
      symbol: sym,
      price,
      open: first(opens),
      high: max(highs),
      low: min(lows),
      previousClose: meta.previousClose ?? meta.chartPreviousClose ?? null,
      volume: volumes.reduce<number>((a, v) => a + (v ?? 0), 0) || null,
      timestamp: at * 1000,
      exchange: meta.fullExchangeName ?? meta.exchangeName ?? null,
      isDelayed: true, // Yahoo public feed is delayed vs. direct exchange feeds
    };
  }

  async getHistory(symbol: string, period = "1y", interval = "1d"): Promise<OhlcvBar[]> {
    const sym = symbol.toUpperCase().trim();
    const chart = await fetchChart(sym, period, interval);
    const result = chart!.result![0];
    const ts = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0] ?? {};
    const bars: OhlcvBar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = q.close?.[i];
      if (c == null) continue;
      bars.push({
        t: ts[i] * 1000,
        o: q.open?.[i] ?? c,
        h: q.high?.[i] ?? c,
        l: q.low?.[i] ?? c,
        c,
        v: q.volume?.[i] ?? 0,
      });
    }
    if (bars.length === 0) throw new Error(`No historical data returned for ${sym}`);
    return bars;
  }
}
