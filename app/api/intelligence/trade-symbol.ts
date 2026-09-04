import { resolveSymbolsFromText } from "../intelligence-data/symbol-resolver";
import type { ThreadState } from "./intent";

const TRADE_SKIP = new Set([
  "SHARE",
  "SHARES",
  "OF",
  "AT",
  "LIMIT",
  "MARKET",
  "STOCK",
  "STOCKS",
  "IT",
  "THAT",
  "THIS",
  "THE",
  "MY",
  "SOME",
  "MORE",
]);

/** Resolve a tradable symbol from imperative trade text (buy Apple, buy 1 share of AAPL). */
export function resolveTradeSymbol(text: string, thread: ThreadState): string | null {
  const shareOf = text.match(
    /\b(?:buy|sell|long|short|add to)\s+(?:\d+|one)\s+shares?\s+of\s+([A-Za-z.]{1,12})\b/i,
  );
  if (shareOf) {
    const resolved = resolveSymbolsFromText(shareOf[1]);
    if (resolved[0]) return resolved[0];
  }

  const fromText = resolveSymbolsFromText(text);
  if (fromText.length === 1) return fromText[0];

  const verbMatch = text.match(/\b(?:buy|sell|long|short|add to)\s+(?:\d+\s+)?([A-Za-z.]{1,12})\b/i);
  if (verbMatch) {
    const token = verbMatch[1].toUpperCase();
    if (!TRADE_SKIP.has(token)) {
      const resolved = resolveSymbolsFromText(verbMatch[1]);
      if (resolved[0]) return resolved[0];
      if (/^[A-Z][A-Z0-9.-]{0,11}$/.test(token)) return token;
    }
  }

  const bare = text.match(/\b([A-Z]{2,5})\b/);
  if (bare) return bare[1];

  if (/\b(it|that|this one)\b/i.test(text) && thread.advisory) return thread.advisory.symbol;
  return null;
}

export function parseTradeQuantity(text: string): { quantity: number | null; error: string | null } {
  if (/\b(?:buy|sell)\s*-\s*\d+/i.test(text) || /\b-\d+\s+shares?\b/i.test(text)) {
    return { quantity: null, error: "Invalid quantity — negative share counts are not allowed. Nothing was staged." };
  }
  if (/\bzero\s+shares?\b/i.test(text) || /\b(?:buy|sell)\s+zero\b/i.test(text)) {
    return { quantity: null, error: "Invalid quantity — zero shares are not allowed. Nothing was staged." };
  }

  const m =
    text.match(/\b(?:buy|sell|add)\s+(\d+)\s+shares?\s+of\b/i) ??
    text.match(/\b(?:buy|sell|add)\s+(\d+)\b/i) ??
    text.match(/\b(\d+)\s+shares?\b/i);
  if (!m) return { quantity: null, error: null };

  const q = parseInt(m[1], 10);
  if (!Number.isFinite(q) || q <= 0) {
    return { quantity: null, error: "Invalid quantity — must be a positive integer. Nothing was staged." };
  }
  return { quantity: q, error: null };
}
