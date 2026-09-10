/**
 * Nasdaq Trader trade-halt RSS — free, no API key.
 * If HALTED = TRUE → research/execution should BLOCK new entry.
 */
import { fetchWithRetry, parseFeedItems } from "../http";
import { intelligenceCache } from "../cache";

const HALT_FEED_URL =
  "https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts";

export type HaltStatus = {
  available: boolean;
  symbol: string;
  halted: boolean;
  reason: string | null;
  title: string | null;
  link: string | null;
  publishedAt: string | null;
  source: string;
  retrievedAt: string;
  error?: string;
};

export async function fetchNasdaqHaltStatus(symbol: string): Promise<HaltStatus> {
  const sym = symbol.toUpperCase();
  const retrievedAt = new Date().toISOString();
  try {
    const items = await intelligenceCache.through(
      "nasdaq:halts:rss:v1",
      60_000,
      async () => {
        const res = await fetchWithRetry(HALT_FEED_URL, {
          headers: { Accept: "application/rss+xml, application/xml, text/xml" },
          retries: 2,
          backoffMs: 400,
          timeoutMs: 15_000,
        });
        if (!res.ok) throw new Error(`Nasdaq halt RSS HTTP ${res.status}`);
        const xml = await res.text();
        return parseFeedItems(xml, 100);
      },
    );

    const match = items.find((it) => {
      const hay = `${it.title} ${it.link}`.toUpperCase();
      return new RegExp(`\\b${sym}\\b`).test(hay);
    });

    return {
      available: true,
      symbol: sym,
      halted: Boolean(match),
      reason: match?.title ?? null,
      title: match?.title ?? null,
      link: match?.link ?? null,
      publishedAt: match?.pubDate ?? null,
      source: "Nasdaq Trader Trade Halt RSS",
      retrievedAt,
    };
  } catch (e) {
    return {
      available: false,
      symbol: sym,
      halted: false,
      reason: null,
      title: null,
      link: null,
      publishedAt: null,
      source: "Nasdaq Trader Trade Halt RSS",
      retrievedAt,
      error: (e as Error).message,
    };
  }
}
