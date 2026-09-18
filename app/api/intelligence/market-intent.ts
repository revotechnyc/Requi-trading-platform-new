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

/** Trading Console chips — exact strings sent by Intelligence.tsx. */
export type ConsoleResearchDepth = "simple" | "standard" | "quant";

export const CONSOLE_RESEARCH_PROMPTS: Record<ConsoleResearchDepth, string> = {
  simple: "Help me find a trading opportunity and explain it simply.",
  standard: "Analyze the market and show me the strongest opportunities based on current data.",
  quant:
    "Run a full quantitative market scan and rank the highest-quality setups by probability, expected value, risk, and evidence reliability.",
};

function normalizePrompt(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Map Console research chips (and close paraphrases) to a discovery depth.
 * These asks never require a ticker, portfolio, or brokerage.
 */
export function classifyConsoleResearchDepth(text: string): ConsoleResearchDepth | null {
  const n = normalizePrompt(text);
  for (const depth of Object.keys(CONSOLE_RESEARCH_PROMPTS) as ConsoleResearchDepth[]) {
    if (n === CONSOLE_RESEARCH_PROMPTS[depth].toLowerCase()) return depth;
  }
  if (/\bhelp me find a trading opportunity\b/i.test(text)) return "simple";
  if (/\bfind (?:me )?(?:an? )?trading opportunity\b/i.test(text) && /\bexplain it simply\b/i.test(text)) {
    return "simple";
  }
  if (/\banalyze the market\b/i.test(text) && /\bstrongest opportunities\b/i.test(text)) return "standard";
  if (/\bquantitative market scan\b/i.test(text)) return "quant";
  if (/\bfull quantitative\b/i.test(text) && /\bscan\b/i.test(text) && /\b(rank|setups?)\b/i.test(text)) {
    return "quant";
  }
  return null;
}

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
  /\bhelp me find a trading opportunity\b/i,
  /\bfind (?:me )?(?:an? )?trading opportunity\b/i,
  /\bstrongest opportunities based on current data\b/i,
  /\bquantitative market scan\b/i,
  /\brank the highest-quality setups\b/i,
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

/** Short acknowledgments / clarifications — not ticker or data-layer requests. */
export function isConversationAck(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  if (/\b(is not|isn't|not)\s+a\s+stock\b/i.test(t)) return true;
  if (/\b(i was|just)\s+(saying|meant)\s+(ok|okay|thanks|thank you|gotcha|got it)\b/i.test(t)) return true;
  if (/\bgotcha\b/i.test(t) && /\b(not a stock|was saying|just saying)\b/i.test(t)) return true;

  if (
    /^(ok|okay|k|thanks|thank you|ty|thx|gotcha|got it|cool|great|perfect|understood|makes sense|sounds good|np|no problem|sure|yep|yeah|yes)[.!]?$/i.test(
      t,
    )
  ) {
    return true;
  }

  return false;
}

export function isBriefGreeting(text: string): boolean {
  const t = text.trim();
  return /^(hi|hey|hello|yo|good morning|good afternoon|good evening)[.!]?$/i.test(t);
}

/** Skip deterministic data layers — chitchat, acks, and bare greetings. */
export function isConversationalTurn(text: string): boolean {
  return isConversationAck(text) || isBriefGreeting(text);
}

/** Portfolio / account book — distinct from general market research. */
export function isPortfolioSpecificQuery(text: string): boolean {
  return /\b(p&l|pnl|profit|loss|portfolio status|my portfolio|my holdings|my positions?|buying power|what'?s open|how am i doing|connected account|brokerage connected|account balance)\b/i.test(
    text,
  );
}

export function isGeneralMarketQuery(text: string): boolean {
  if (isInternationalMarketQuery(text)) return false;
  return GENERAL_MARKET_PATTERNS.some((re) => re.test(text));
}

export function isStockDiscoveryQuery(text: string): boolean {
  if (isInternationalMarketQuery(text)) return false;
  if (classifyConsoleResearchDepth(text)) return true;
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
/**
 * Fresh predetermined market scan — not a multi-turn scope / Rev-1 rewrite.
 * Console chips and "what should I buy today" always re-run the engine.
 */
export function isFreshMarketIntelligenceAsk(text: string): boolean {
  if (!classifyMarketIntelligenceIntent(text)) return false;
  if (/\b(those|them|these|that list|prior scan|from the scan|remaining names?)\b/i.test(text)) {
    return false;
  }
  return true;
}

export function classifyMarketIntelligenceIntent(text: string): MarketIntelligenceIntent | null {
  if (isInternationalMarketQuery(text)) return null;
  if (classifyConsoleResearchDepth(text)) return "STOCK_DISCOVERY";
  const hasBuy = isStockDiscoveryQuery(text);
  const hasMovers = isMarketMoversQuery(text);
  const hasGeneral = isGeneralMarketQuery(text);

  if (hasBuy) return "STOCK_DISCOVERY";
  if (hasMovers) return "MARKET_MOVERS";
  if (hasGeneral || isIndexDepthQuery(text)) return "GENERAL_MARKET";
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

/** Pack B3 — explicit breadth / sector leaders / volatility ask. */
export function isExtendedMarketSnapshotQuery(text: string): boolean {
  if (isInternationalMarketQuery(text)) return false;
  if (!isGeneralMarketQuery(text)) return false;
  const t = text.toLowerCase();
  return (
    /\bbreadth\b/.test(t) ||
    /\badvanc/.test(t) ||
    /\bdeclin/.test(t) ||
    (/\bsector/.test(t) && /\bleaders?\b/.test(t)) ||
    /\bvolatility\b/.test(t) ||
    /\bvix\b/.test(t)
  );
}

/** Pack B2 — per-index SMA / RVOL drill-down (PDF §5). */
export function isIndexDepthQuery(text: string): boolean {
  const hasIndex =
    /\bSPY\b/.test(text) ||
    /\bQQQ\b/.test(text) ||
    /\bDIA\b/.test(text) ||
    /\bIWM\b/.test(text);
  if (!hasIndex) return false;
  if (/\bbreak\s+down\b/i.test(text) || /\bdrill[-\s]?down\b/i.test(text)) return true;
  if (/\b(SPY|QQQ|DIA|IWM)\b[\s\S]{0,100}\b(sma|moving averages?|rvol|relative volume)\b/i.test(text)) {
    return true;
  }
  if (/\bmajor indexes?\b/i.test(text) && /\b(SPY|QQQ|DIA|IWM)\b/i.test(text)) return true;
  return false;
}

export function isDiscoveryRiskiestQuery(text: string): boolean {
  return (
    /\bwhich\s+of\s+(those|these|them)\s+is\s+(the\s+)?riskiest\b/i.test(text) ||
    /\bwhich\s+(one|name)\s+is\s+(the\s+)?riskiest\b/i.test(text) ||
    /\b(riskiest|highest\s+risk)\s+(of|among)\s+(those|these|them)\b/i.test(text)
  );
}

/** Pack G1 — user tries to bypass tools / invent from memory. */
export function isMemoryBypassProbe(text: string): boolean {
  const lower = text.toLowerCase();
  const bypass =
    /\b(ignore\s+(your\s+)?tools|without\s+(using\s+)?tools|from\s+memory|don't\s+use\s+tools)\b/.test(
      lower,
    ) || /\bignore\s+your\s+tools\b/.test(lower);
  const marketOrBuys =
    /\b(bullish|bearish|market\s+is|pick\s+(three|3|\d+)\s+buys?|three\s+buys?|recommend\s+stocks?)\b/.test(
      lower,
    );
  return bypass && marketOrBuys;
}
