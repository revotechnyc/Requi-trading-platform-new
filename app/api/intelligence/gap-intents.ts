/**
 * Shared Phase-0 / honesty intent detectors.
 * Kept free of gateway imports so conversation-context can bypass rewrites
 * without pulling the data stack.
 */

/** NL stock screener — not a ticker lookup. */
const NL_SCREENER_RE =
  /\b(find\s+stocks?|screen\s+for|stocks?\s+matching|stocks?\s+above|stocks?\s+below|stocks?\s+with\b|names?\s+matching|filter\s+for\s+stocks?|in\s+the\s+\w+\s+sector\b.+\b(rsi|sma|ema|above|below|between)\b|\b(rsi|sma|ema)\b.+\bin\s+the\s+\w+\s+sector\b)/i;

/** Multi-quarter / multi-name fundamental time series not wired on free stack. */
const FUNDAMENTAL_SERIES_RE =
  /\b((gross\s+)?margins?\s+trends?|margin\s+trends?|over\s+the\s+last\s+\d+\s+quarters?|last\s+\d+\s+quarters?|8\s+quarters?|quarterly\s+(gross\s+)?margins?|revenue\s+trends?\s+over|eps\s+trends?\s+over|fundamental\s+trends?)\b/i;

/** Asks what a filing *says* — not merely for the filing link list. */
const FILING_CONTENT_QA_RE =
  /\b(what\s+did\s+(the\s+)?(latest\s+)?(10-?k|10-?q|8-?k|filing)\b|what\s+does\s+(the\s+)?(latest\s+)?(10-?k|10-?q|8-?k)\b|say\s+about|said\s+about|revenue\s+concentration|change(?:d)?\s+guidance|guidance\s+change|ceo\s+letter|risk\s+factors?|itemize[sd]?\s+risk|change\s+anything\s+material|material\s+(?:for|to|change)|azure\s+growth)\b/i;

const FILING_QUERY_RE = /\b(filing|filings|10-?k|10-?q|8-?k|sec\b|edgar|insider)\b/i;

/** Options implied move — must not collapse to next-earnings date alone. */
const IMPLIED_MOVE_RE =
  /\b(implied\s+move|implied\s+volatility|\biv\b(?!\s+dn)|options?\s+implied)\b/i;

/** Plain-English rates / FRED backdrop. */
const RATES_BACKDROP_RE =
  /\b(rates?\s+backdrop|fed\s+funds|federal\s+funds|10-?year|10y\b|yield\s+curve|treasury\s+yield|current\s+rates?\b|rates?\s+in\s+plain\s+english)\b/i;

/** Risk/reward framing — must not collapse to next-earnings date alone. */
const RISK_REWARD_RE =
  /\b(risk\s*\/\s*reward|risk-reward|risk\s+and\s+reward|risk\s+reward|r\s*\/\s*r)\b/i;

/**
 * Multi-factor / desk-style compare — must NOT become earnings-candidate research
 * just because the user said "research desk" or "key risks".
 */
export function isDeskCompareQuery(text: string): boolean {
  if (/\bRun earnings candidate research on\b/i.test(text)) return false;
  if (/\blike a research desk\b/i.test(text)) return true;
  if (/\bresearch desk\b/i.test(text) && /\bcompare\b/i.test(text)) return true;
  if (
    /\bcompare\b/i.test(text) &&
    /\b(valuation|momentum|business quality|key risks|fundamentals)\b/i.test(text)
  ) {
    return true;
  }
  if (/\bbetween\b/i.test(text) && /\b(cleaner growth|growth story|which is the cleaner)\b/i.test(text)) {
    return true;
  }
  if (
    /\brank\b/i.test(text) &&
    /\b(not earnings only|technicals and news|include technicals)\b/i.test(text)
  ) {
    return true;
  }
  return false;
}

const PRICE_INTENT_RE =
  /\b(prices?|quote|trading at|worth|how much|stock prices?|share prices?|current price|trading for|last price|side by side|what is .+ trading)\b/i;
const ISO_DATE_RE = /\b(?:19|20)\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\b/;
const NAMED_DATE_RE =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+(?:19|20)\d{2}\b/i;
const HISTORICAL_PRICE_INTENT_RE =
  /\b(exact\s+clos(?:e|ing)|clos(?:e|ing)\s+price|historical\s+(?:close|price|quote)|price\s+on\s+|what\s+was\s+.+?\s+(?:clos(?:e|ing)|price|trading\s+at)|traded\s+at\s+on)\b/i;

export function isNlScreenerQuery(text: string): boolean {
  return NL_SCREENER_RE.test(text);
}

export function isFundamentalSeriesQuery(text: string): boolean {
  return FUNDAMENTAL_SERIES_RE.test(text);
}

export function isFilingContentQuery(text: string): boolean {
  if (FILING_CONTENT_QA_RE.test(text)) return true;
  // "Did Microsoft's last 8-K change anything material for Azure…"
  if (
    FILING_QUERY_RE.test(text) &&
    /\b(did|does|what)\b/i.test(text) &&
    /\b(change|material|guidance|azure|concentration|say|said|mean|imply)\b/i.test(text)
  ) {
    return true;
  }
  return (
    FILING_QUERY_RE.test(text) &&
    /\b(what\s+did|what\s+does|say\s+about|said\s+about|guidance|concentration|risk\s+factor|ceo\s+letter)\b/i.test(
      text,
    )
  );
}

export function isImpliedMoveQuery(text: string): boolean {
  if (!IMPLIED_MOVE_RE.test(text)) return false;
  // Pack H compound screens — "implied move" is a filter, not the primary ask.
  if (
    /\b(beat\s+rate|earnings\s+this\s+week|show\s+me\s+earnings|find\s+stocks?|screen\s+for|names?\s+with)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  return true;
}

export function isRatesBackdropQuery(text: string): boolean {
  return RATES_BACKDROP_RE.test(text);
}

export function isRiskRewardQuery(text: string): boolean {
  return RISK_REWARD_RE.test(text);
}

export function isHistoricalPriceQuery(text: string): boolean {
  if (!PRICE_INTENT_RE.test(text) && !HISTORICAL_PRICE_INTENT_RE.test(text) && !/\bclos(?:e|ing)\b/i.test(text)) {
    return false;
  }
  if (HISTORICAL_PRICE_INTENT_RE.test(text) && (ISO_DATE_RE.test(text) || NAMED_DATE_RE.test(text))) {
    return true;
  }
  if (/\bwhat\s+was\b/i.test(text) && (ISO_DATE_RE.test(text) || NAMED_DATE_RE.test(text))) {
    return true;
  }
  if (/\bclos(?:e|ing)\s+price\b/i.test(text) && (ISO_DATE_RE.test(text) || NAMED_DATE_RE.test(text))) {
    return true;
  }
  return false;
}

/** Asks that must never be rewritten into earnings-research / scope-compare templates. */
export function shouldPassthroughGapGateAsk(text: string): boolean {
  return (
    isNlScreenerQuery(text) ||
    isFundamentalSeriesQuery(text) ||
    isRiskRewardQuery(text) ||
    isFilingContentQuery(text) ||
    isHistoricalPriceQuery(text) ||
    isDeskCompareQuery(text) ||
    isImpliedMoveQuery(text) ||
    isRatesBackdropQuery(text)
  );
}
