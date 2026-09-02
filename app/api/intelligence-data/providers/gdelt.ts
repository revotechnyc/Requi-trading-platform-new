import https from "node:https";
import { fetchWithRetry } from "../http";
import { intelligenceCache, LAYER_TTL_MS } from "../cache";
import type { GdeltPayload, LayerEnvelope } from "../types";

const UA = "Mozilla/5.0 (compatible; RequiTrading/1.0; intelligence-gdelt)";

/** GDELT can take 30s+; Node fetch often aborts ~10s — HTTPS fallback for reliability. */
async function fetchGdeltJson(url: string): Promise<{
  articles?: Array<{ title?: string; url?: string; tone?: number; seendate?: string }>;
}> {
  try {
    const res = await fetchWithRetry(url, { retries: 1, timeoutMs: 45_000, headers: { "User-Agent": UA } });
    if (res.ok) return (await res.json()) as { articles?: Array<{ title?: string; url?: string; tone?: number; seendate?: string }> };
  } catch {
    /* try HTTPS */
  }

  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": UA }, timeout: 45_000 }, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if ((res.statusCode ?? 500) >= 400) {
          reject(new Error(`GDELT HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("GDELT request timed out"));
    });
    req.on("error", reject);
  });
}

export async function fetchGdeltMacro(query = "stock market economy"): Promise<LayerEnvelope<GdeltPayload>> {
  const now = new Date().toISOString();
  try {
    const events = await intelligenceCache.through(`gdelt:${query}`, LAYER_TTL_MS.gdelt, async () => {
      const url =
        `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}` +
        "&mode=ArtList&format=json&maxrecords=8&sort=DateDesc";
      const data = await fetchGdeltJson(url);
      return (data.articles ?? []).slice(0, 8).map((a) => ({
        title: a.title ?? "Event",
        url: a.url ?? "",
        tone: typeof a.tone === "number" ? a.tone : null,
        publishedAt: a.seendate ?? now,
      }));
    });

    return {
      layer: "gdelt",
      ticker: null,
      timestamp: now,
      source: "GDELT Project",
      available: events.length > 0,
      stale: false,
      payload: { events },
    };
  } catch (e) {
    return {
      layer: "gdelt",
      ticker: null,
      timestamp: now,
      source: "GDELT Project",
      available: false,
      stale: false,
      payload: null,
      error: (e as Error).message,
    };
  }
}

export async function fetchGdeltForSymbol(symbol: string): Promise<LayerEnvelope<GdeltPayload>> {
  return fetchGdeltMacro(`${symbol} stock market`);
}
