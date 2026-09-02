const DEFAULT_UA =
  process.env.SEC_EDGAR_USER_AGENT?.trim() ||
  "Requi Trading Intelligence requi@requitrading.com";

export async function fetchWithRetry(
  url: string,
  init: RequestInit & { retries?: number; backoffMs?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const { retries = 2, backoffMs = 400, timeoutMs = 12_000, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", DEFAULT_UA);

  let lastErr: Error | null = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { ...rest, headers, signal: controller.signal });
      clearTimeout(timeout);
      if (res.status === 429 || res.status === 503) {
        await sleep(backoffMs * (i + 1));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e as Error;
      if (i < retries) await sleep(backoffMs * (i + 1));
    }
  }
  throw lastErr ?? new Error(`fetch failed: ${url}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** RSS `<item>` and Atom `<entry>` feed parser — no extra XML dependency. */
export function parseFeedItems(xml: string, limit = 8): Array<{ title: string; link: string; pubDate: string }> {
  const rss = parseRssItems(xml, limit);
  if (rss.length > 0) return rss;

  const items: Array<{ title: string; link: string; pubDate: string }> = [];
  const blocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
  for (const block of blocks.slice(0, limit)) {
    const title = decodeXml(block.match(/<title(?:\s[^>]*)?>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] ?? "");
    const link =
      block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1]?.trim() ??
      block.match(/<link>([^<]+)<\/link>/i)?.[1]?.trim() ??
      "";
    const pubDate =
      block.match(/<updated>([^<]+)<\/updated>/i)?.[1]?.trim() ??
      block.match(/<published>([^<]+)<\/published>/i)?.[1]?.trim() ??
      "";
    if (title) items.push({ title, link, pubDate });
  }
  return items;
}

export function parseRssItems(xml: string, limit = 8): Array<{ title: string; link: string; pubDate: string }> {
  const items: Array<{ title: string; link: string; pubDate: string }> = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks.slice(0, limit)) {
    const title = decodeXml(block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] ?? "");
    const link = block.match(/<link>([^<]+)<\/link>/i)?.[1]?.trim() ?? "";
    const pubDate = block.match(/<pubDate>([^<]+)<\/pubDate>/i)?.[1]?.trim() ?? "";
    if (title) items.push({ title, link, pubDate });
  }
  return items;
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
