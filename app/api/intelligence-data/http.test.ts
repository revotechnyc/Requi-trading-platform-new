import { describe, expect, it } from "vitest";
import { parseFeedItems } from "./http";
import { postMentionsSymbol } from "./providers/sentiment";
import { normalizeWatchlistSymbol } from "./watchlist";

describe("parseFeedItems", () => {
  it("parses RSS items", () => {
    const xml = `<?xml version="1.0"?><rss><channel><item><title>Hello</title><link>https://a</link><pubDate>Mon</pubDate></item></channel></rss>`;
    expect(parseFeedItems(xml)).toEqual([{ title: "Hello", link: "https://a", pubDate: "Mon" }]);
  });

  it("parses Atom entries when RSS empty", () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom post</title><link href="https://b"/><updated>2026-01-01</updated></entry></feed>`;
    expect(parseFeedItems(xml)).toEqual([{ title: "Atom post", link: "https://b", pubDate: "2026-01-01" }]);
  });
});

describe("normalizeWatchlistSymbol", () => {
  it("maps GOOGLE to GOOGL", () => {
    expect(normalizeWatchlistSymbol("google")).toBe("GOOGL");
  });
});

describe("postMentionsSymbol", () => {
  it("keeps ticker-relevant titles and drops off-topic posts", () => {
    expect(postMentionsSymbol("NVDA calls printing", "", "NVDA")).toBe(true);
    expect(postMentionsSymbol("NVIDIA earnings beat", "", "NVDA")).toBe(true);
    expect(postMentionsSymbol("What about TSLA today", "", "NVDA")).toBe(false);
  });
});
