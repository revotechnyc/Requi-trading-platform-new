import { fetchWithRetry, parseRssItems } from "../http";
import { intelligenceCache, LAYER_TTL_MS } from "../cache";
import type { LayerEnvelope, NewsPayload } from "../types";

const UA = "Mozilla/5.0 (compatible; RequiTrading/1.0; intelligence-news)";

async function googleNewsRss(symbol: string): Promise<NewsPayload["headlines"]> {
  const q = encodeURIComponent(`${symbol} stock`);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetchWithRetry(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Google News RSS HTTP ${res.status}`);
  const xml = await res.text();
  return parseRssItems(xml, 8).map((item) => ({
    title: item.title,
    source: "Google News",
    publishedAt: item.pubDate || new Date().toISOString(),
    url: item.link,
  }));
}

async function yahooNewsFallback(symbol: string): Promise<NewsPayload["headlines"]> {
  const res = await fetchWithRetry(
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=1&newsCount=8`,
    { headers: { "User-Agent": UA } },
  );
  if (!res.ok) throw new Error(`Yahoo news HTTP ${res.status}`);
  const data = (await res.json()) as {
    news?: Array<{ title?: string; publisher?: string; link?: string; providerPublishTime?: number }>;
  };
  return (data.news ?? []).slice(0, 8).map((n) => ({
    title: n.title ?? "Untitled",
    source: n.publisher ?? "Yahoo Finance",
    publishedAt: n.providerPublishTime
      ? new Date(n.providerPublishTime * 1000).toISOString()
      : new Date().toISOString(),
    url: n.link ?? "",
  }));
}

export async function fetchNews(symbol: string): Promise<LayerEnvelope<NewsPayload>> {
  const sym = symbol.toUpperCase();
  const now = new Date().toISOString();
  try {
    const headlines = await intelligenceCache.through(`news:${sym}`, LAYER_TTL_MS.news, async () => {
      try {
        return await googleNewsRss(sym);
      } catch {
        return await yahooNewsFallback(sym);
      }
    });

    return {
      layer: "news",
      ticker: sym,
      timestamp: now,
      source: headlines[0]?.source?.includes("Yahoo") ? "Yahoo Finance (fallback)" : "Google News RSS",
      available: headlines.length > 0,
      stale: false,
      payload: { headlines },
    };
  } catch (e) {
    return {
      layer: "news",
      ticker: sym,
      timestamp: now,
      source: "Google News RSS",
      available: false,
      stale: false,
      payload: null,
      error: (e as Error).message,
    };
  }
}
