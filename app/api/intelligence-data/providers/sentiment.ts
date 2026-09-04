import { fetchWithRetry, parseFeedItems } from "../http";
import { intelligenceCache, LAYER_TTL_MS } from "../cache";
import type { LayerEnvelope, SentimentPayload } from "../types";

const SUBREDDITS = ["wallstreetbets", "stocks"] as const;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const TICKER_ALIASES: Record<string, string[]> = {
  AAPL: ["AAPL", "APPLE"],
  TSLA: ["TSLA", "TESLA"],
  NVDA: ["NVDA", "NVIDIA"],
  AMD: ["AMD"],
  MSFT: ["MSFT", "MICROSOFT"],
  GOOGL: ["GOOGL", "GOOG", "GOOGLE", "ALPHABET"],
  AMZN: ["AMZN", "AMAZON"],
  META: ["META", "FACEBOOK"],
};

export function postMentionsSymbol(title: string, url: string, sym: string): boolean {
  const hay = `${title} ${url}`.toUpperCase();
  const keys = TICKER_ALIASES[sym] ?? [sym];
  return keys.some((k) => new RegExp(`(?:\\$)?\\b${k}\\b`).test(hay));
}

function scoreTone(titles: string[]): SentimentPayload["tone"] {
  const text = titles.join(" ").toLowerCase();
  const bull = (text.match(/\b(moon|bull|calls|buy|rip|squeeze|breakout)\b/g) ?? []).length;
  const bear = (text.match(/\b(bear|puts|sell|crash|dump|bagholder|down)\b/g) ?? []).length;
  if (bull > bear + 1) return "bullish";
  if (bear > bull + 1) return "bearish";
  if (bull > 0 && bear > 0) return "mixed";
  return "neutral";
}

async function fetchRedditSentiment(sym: string): Promise<{ payload: SentimentPayload; error?: string }> {
  const samplePosts: SentimentPayload["samplePosts"] = [];
  const errors: string[] = [];
  for (const sub of SUBREDDITS) {
    const url = `https://www.reddit.com/r/${sub}/search.rss?q=${encodeURIComponent(sym)}&restrict_sr=on&sort=new`;
    try {
      const res = await fetchWithRetry(url, {
        headers: { "User-Agent": BROWSER_UA, Accept: "application/atom+xml,application/rss+xml,text/xml" },
        retries: 2,
        backoffMs: 800,
      });
      if (!res.ok) {
        errors.push(`r/${sub} HTTP ${res.status}`);
        continue;
      }
      const xml = await res.text();
      if (/blocked due to a network policy/i.test(xml)) {
        errors.push(`r/${sub} network policy`);
        continue;
      }
      for (const item of parseFeedItems(xml, 8)) {
        if (!postMentionsSymbol(item.title, item.link, sym)) continue;
        samplePosts.push({ title: item.title, url: item.link, subreddit: sub });
      }
    } catch (e) {
      errors.push(`r/${sub} ${(e as Error).message}`);
    }
  }
  const unique = samplePosts.slice(0, 6);
  return {
    payload: {
      mentionCount: unique.length,
      samplePosts: unique,
      tone: scoreTone(unique.map((p) => p.title)),
    },
    error: unique.length ? undefined : (errors[0] ?? "Reddit RSS returned no ticker-relevant posts"),
  };
}

async function fetchStocktwitsSentiment(sym: string): Promise<SentimentPayload> {
  const res = await fetchWithRetry(`https://api.stocktwits.com/api/2/streams/symbol/${sym}.json`, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "application/json",
      Referer: "https://stocktwits.com/",
    },
    retries: 1,
  });
  if (!res.ok) throw new Error(`Stocktwits HTTP ${res.status}`);
  const data = (await res.json()) as {
    messages?: Array<{ body?: string; id?: number; user?: { username?: string } }>;
  };
  const samplePosts = (data.messages ?? [])
    .slice(0, 8)
    .map((m) => ({
      title: (m.body ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
      url: m.id ? `https://stocktwits.com/message/${m.id}` : `https://stocktwits.com/symbol/${sym}`,
      subreddit: m.user?.username ? `@${m.user.username}` : "Stocktwits",
    }))
    .filter((p) => postMentionsSymbol(p.title, p.url, sym) || p.title.length > 0)
    .slice(0, 6);
  return {
    mentionCount: samplePosts.length,
    samplePosts,
    tone: scoreTone(samplePosts.map((p) => p.title)),
  };
}

export async function fetchSentiment(symbol: string): Promise<LayerEnvelope<SentimentPayload>> {
  const sym = symbol.toUpperCase();
  const now = new Date().toISOString();
  try {
    const cached = await intelligenceCache.through(`sentiment:${sym}:v3`, LAYER_TTL_MS.sentiment, async () => {
      const reddit = await fetchRedditSentiment(sym);
      if (reddit.payload.mentionCount > 0) return { payload: reddit.payload, source: "Reddit RSS" as const, error: undefined as string | undefined };

      try {
        const stocktwits = await fetchStocktwitsSentiment(sym);
        if (stocktwits.mentionCount > 0) {
          return { payload: stocktwits, source: "Stocktwits" as const, error: undefined as string | undefined };
        }
      } catch (e) {
        const stErr = (e as Error).message;
        const redditErr = reddit.error ?? "Reddit RSS empty";
        throw new Error(`${redditErr}; Stocktwits fallback: ${stErr}`);
      }

      throw new Error(reddit.error ?? "No ticker-relevant social posts");
    });

    return {
      layer: "sentiment",
      ticker: sym,
      timestamp: now,
      source: cached.source,
      available: cached.payload.mentionCount > 0,
      stale: false,
      payload: cached.payload,
      error: cached.error,
    };
  } catch (e) {
    return {
      layer: "sentiment",
      ticker: sym,
      timestamp: now,
      source: "Sentiment",
      available: false,
      stale: false,
      payload: null,
      error: (e as Error).message,
    };
  }
}
