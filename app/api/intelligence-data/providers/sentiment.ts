import { fetchWithRetry, parseFeedItems } from "../http";
import { intelligenceCache, LAYER_TTL_MS } from "../cache";
import type { LayerEnvelope, SentimentPayload } from "../types";

const SUBREDDITS = ["wallstreetbets", "stocks"] as const;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function scoreTone(titles: string[]): SentimentPayload["tone"] {
  const text = titles.join(" ").toLowerCase();
  const bull = (text.match(/\b(moon|bull|calls|buy|rip|squeeze|breakout)\b/g) ?? []).length;
  const bear = (text.match(/\b(bear|puts|sell|crash|dump|bagholder|down)\b/g) ?? []).length;
  if (bull > bear + 1) return "bullish";
  if (bear > bull + 1) return "bearish";
  if (bull > 0 && bear > 0) return "mixed";
  return "neutral";
}

async function fetchRedditSentiment(sym: string): Promise<SentimentPayload> {
  const samplePosts: SentimentPayload["samplePosts"] = [];
  for (const sub of SUBREDDITS) {
    const url = `https://www.reddit.com/r/${sub}/search.rss?q=${encodeURIComponent(sym)}&restrict_sr=on&sort=new`;
    try {
      const res = await fetchWithRetry(url, {
        headers: { "User-Agent": BROWSER_UA, Accept: "application/atom+xml,application/rss+xml,text/xml" },
        retries: 1,
      });
      if (!res.ok) continue;
      const xml = await res.text();
      if (/blocked due to a network policy/i.test(xml)) continue;
      for (const item of parseFeedItems(xml, 4)) {
        samplePosts.push({ title: item.title, url: item.link, subreddit: sub });
      }
    } catch {
      /* try next subreddit */
    }
  }
  return {
    mentionCount: samplePosts.length,
    samplePosts: samplePosts.slice(0, 6),
    tone: scoreTone(samplePosts.map((p) => p.title)),
  };
}

async function fetchStocktwitsSentiment(sym: string): Promise<SentimentPayload> {
  const res = await fetchWithRetry(`https://api.stocktwits.com/api/2/streams/symbol/${sym}.json`, {
    headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
    retries: 1,
  });
  if (!res.ok) throw new Error(`Stocktwits HTTP ${res.status}`);
  const data = (await res.json()) as {
    messages?: Array<{ body?: string; id?: number; user?: { username?: string } }>;
  };
  const samplePosts = (data.messages ?? []).slice(0, 6).map((m) => ({
    title: (m.body ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
    url: m.id ? `https://stocktwits.com/message/${m.id}` : `https://stocktwits.com/symbol/${sym}`,
    subreddit: m.user?.username ? `@${m.user.username}` : "Stocktwits",
  }));
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
    const cached = await intelligenceCache.through(`sentiment:${sym}`, LAYER_TTL_MS.sentiment, async () => {
      const reddit = await fetchRedditSentiment(sym);
      if (reddit.mentionCount > 0) return { payload: reddit, source: "Reddit RSS" as const };

      const stocktwits = await fetchStocktwitsSentiment(sym);
      return { payload: stocktwits, source: "Stocktwits" as const };
    });

    return {
      layer: "sentiment",
      ticker: sym,
      timestamp: now,
      source: cached.source,
      available: cached.payload.mentionCount > 0,
      stale: false,
      payload: cached.payload,
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
