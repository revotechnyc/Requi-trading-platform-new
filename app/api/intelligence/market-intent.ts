/**
 * Client Rev 9/14 — predetermined market-intelligence intents.
 * Separate from trade/advisory intent in intent.ts.
 */

export const US_MARKET_DEFAULT = {
  market: "US",
  exchanges: ["NYSE", "NASDAQ"],
  currency: "USD",
  timezone: "America/New_York",
} as const;

export type MarketIntelligenceIntent = "GENERAL_MARKET" | "STOCK_DISCOVERY" | "MARKET_MOVERS";

const GENERAL_MARKET_PATTERNS = [
  /\bhow(?:'s|\s+is|\s+are)\s+the\s+market\b/i,
  /\bhow\s+is\s+the\s+market\b/i,
  /\bwhat\s+is\s+the\s+market\s+doing\b/i,
  /\bwhat(?:'s|\s+is)\s+happening\s+in\s+the\s+market\b/i,
  /\bis\s+today\s+a\s+good\s+trading\s+day\b/i,
  /\bis\s+the\s+market\s+good\s+today\b/i,
  /\bmarket\s+today\b/i,
  /\bhow\s+are\s+us\s+equities\b/i,
  /\bhow\s+are\s+stocks\s+doing\b/i,
  /\bis\s+it\s+risky\s+today\b/i,
  /\bmarket\s+health\b/i,
  /\bwhat(?:'s|\s+is)\s+leading\b/i,
  /\bwhat\s+sectors?\s+(?:are\s+)?leading\b/i,
  /\bwho(?:'s|\s+is)\s+leading\b/i,
];

const STOCK_DISCOVERY_PATTERNS = [
  /\bwhat\s+(?:stock\s+)?should\s+i\s+buy\b/i,
  /\bwhat\s+should\s+i\s+buy\s+today\b/i,
  /\bwhat\s+stock\s+should\s+i\s+buy\b/i,
  /\bgive\s+me\s+stocks?\s+to\s+watch\b/i,
  /\bwhat\s+looks\s+good\b/i,
  /\bfind\s+me\s+a\s+stock\b/i,
  /\bwhere\s+should\s+i\s+put\s+my\s+money\b/i,
  /\bwhat(?:'s|\s+is)\s+good\s+today\b/i,
];

const MARKET_MOVERS_PATTERNS = [
  /\bwhat(?:'s|\s+is)\s+moving\b/i,
  /\bwhat(?:'s|\s+is)\s+hot\b/i,
  /\bwhat\s+stocks?\s+are\s+running\b/i,
  /\bbiggest\s+movers\b/i,
  /\bwhat(?:'s|\s+is)\s+crashing\b/i,
  /\bwhat\s+is\s+going\s+up\b/i,
  /\bwhat\s+is\s+going\s+down\b/i,
];

/** Named international override — not US default. */
const INTERNATIONAL_OVERRIDE =
  /\b(japan|nikkei|europe|ftse|dax|china|hang\s+seng|uk\s+market|india\s+nifty)\b/i;

export function isInternationalMarketQuery(text: string): boolean {
  return INTERNATIONAL_OVERRIDE.test(text);
}

export function isGeneralMarketQuery(text: string): boolean {
  if (isInternationalMarketQuery(text)) return false;
  return GENERAL_MARKET_PATTERNS.some((re) => re.test(text));
}

export function isStockDiscoveryQuery(text: string): boolean {
  if (isInternationalMarketQuery(text)) return false;
  return STOCK_DISCOVERY_PATTERNS.some((re) => re.test(text));
}

export function isMarketMoversQuery(text: string): boolean {
  if (isInternationalMarketQuery(text)) return false;
  return MARKET_MOVERS_PATTERNS.some((re) => re.test(text));
}

/**
 * Classify beginner market-intelligence intent.
 * Priority: discovery > movers > general (combined prompts lean discovery if buy language).
 */
export function classifyMarketIntelligenceIntent(text: string): MarketIntelligenceIntent | null {
  if (isInternationalMarketQuery(text)) return null;
  const hasBuy = isStockDiscoveryQuery(text);
  const hasMovers = isMarketMoversQuery(text);
  const hasGeneral = isGeneralMarketQuery(text);

  if (hasBuy) return "STOCK_DISCOVERY";
  if (hasMovers) return "MARKET_MOVERS";
  if (hasGeneral) return "GENERAL_MARKET";
  return null;
}

/** Follow-up on a prior stock-discovery ranked list (Pack D2). */
export function isDiscoveryFollowUpQuery(text: string): boolean {
  return isDiscoveryRankExplainQuery(text) || isDiscoveryRiskiestQuery(text);
}

export function isDiscoveryRankExplainQuery(text: string): boolean {
  return (
    /\bwhy\s+(is|was)\s+the\s+(top|first|#?1|one)\b/i.test(text) ||
    /\bwhy\s+(is|was)\s+.+\s+ranked\s+(first|#?1|top)\b/i.test(text) ||
    /\bwhy\s+(those|these|them)\b/i.test(text) && /\b(rank|ranked|first|top)\b/i.test(text)
  );
}

export function isRiskTodayQuery(text: string): boolean {
  return /\bis\s+it\s+risky\s+today\b/i.test(text);
}

export function isSectorLeadingQuery(text: string): boolean {
  return (
    /\bwhat(?:'s|\s+is)\s+leading\b/i.test(text) ||
    /\bwhat\s+sectors?\s+(?:are\s+)?leading\b/i.test(text) ||
    /\bwho(?:'s|\s+is)\s+leading\b/i.test(text)
  );
}

export function isDiscoveryRiskiestQuery(text: string): boolean {
  return (
    /\bwhich\s+of\s+(those|these|them)\s+is\s+(the\s+)?riskiest\b/i.test(text) ||
    /\bwhich\s+(one|name)\s+is\s+(the\s+)?riskiest\b/i.test(text) ||
    /\b(riskiest|highest\s+risk)\s+(of|among)\s+(those|these|them)\b/i.test(text)
  );
}
