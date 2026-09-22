import { resolveSymbolsFromText } from "../intelligence-data/symbol-resolver";
import { classifyMarketIntelligenceIntent } from "./market-intent";
import { isNonImperativeResearchAsk, type ThreadState } from "./intent";

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
  "TODAY",
  "TOMORROW",
  "NOW",
]);

/** Resolve a tradable symbol from imperative trade text (buy Apple, buy 1 share of AAPL). */
export function resolveTradeSymbol(text: string, thread: ThreadState): string | null {
  if (classifyMarketIntelligenceIntent(text)) return null;
  if (isNonImperativeResearchAsk(text)) return null;

  const shareOf = text.match(
    /\b(?:buy|sell|long|short|add to)\s+(?:\d+|one)\s+shares?\s+of\s+([A-Za-z.]{1,12})\b/i,
  );
  if (shareOf) {
    const resolved = resolveSymbolsFromText(shareOf[1]);
    if (resolved[0]) return resolved[0];
  }

  const fromText = resolveSymbolsFromText(text).filter((sym) => !TRADE_SKIP.has(sym.toUpperCase()));
  if (fromText.length === 1) return fromText[0];

  const verbMatch = /\bshort\s+(list|lineup|set|group|table|universe)\b/i.test(text)
    ? null
    : text.match(/\b(?:buy|sell|long|short|add to)\s+(?:\d+\s+)?([A-Za-z.]{1,12})\b/i);
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
    text.match(/\b(\d+)\s+shares?\b/i) ??
    // Clarification follow-up: bare "100" / "100 shares" after we asked for size
    text.match(/^\s*(\d+)\s*(?:shares?)?\s*$/i);
  if (!m) return { quantity: null, error: null };

  const q = parseInt(m[1], 10);
  if (!Number.isFinite(q) || q <= 0) {
    return { quantity: null, error: "Invalid quantity — must be a positive integer. Nothing was staged." };
  }
  return { quantity: q, error: null };
}

/** Dollar/notional size from "Buy $5000 of NVDA" or clarification "$5000" / "5000 dollars". */
export function parseTradeNotional(text: string): { notional: number | null; error: string | null } {
  const m =
    text.match(/\$\s*([\d,]+(?:\.\d+)?)/) ??
    text.match(/\b([\d,]+(?:\.\d+)?)\s*(?:dollars?|usd)\b/i);
  if (!m) return { notional: null, error: null };
  const n = Number.parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) {
    return { notional: null, error: "Invalid dollar amount — must be a positive number. Nothing was staged." };
  }
  return { notional: n, error: null };
}

export function clarificationAskSharesOrDollars(symbol: string, side: "BUY" | "SELL"): string {
  const verb = side === "SELL" ? "sell" : "buy";
  return (
    `How much **${symbol}** would you like to ${verb} — **shares** or **dollar amount**?\n\n` +
    `Examples: \`100 shares\` · \`$5,000\`\n\n` +
    `Nothing was staged — size is required before an advisory ticket path.`
  );
}
