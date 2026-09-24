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
  // Multi-name fundamental / desk card (style: compare + quality factors)
  if (
    /\bcompare\b/i.test(text) &&
    /\b(revenue\s+growth|profitability|free\s+cash\s+flow|competitive\s+positioning|financial\s+reports?|margins?|multiples?)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  // "Apple vs Microsoft on valuation…" / "Meta and Amazon side by side on FCF…"
  if (
    /\b(side[- ]by[- ]side|versus|vs\.?)\b/i.test(text) &&
    /\b(valuation|profitability|free\s+cash\s+flow|fundamentals|margins?|revenue\s+growth)\b/i.test(text) &&
    (/\band\b/i.test(text) || /,/i.test(text) || /\$[A-Za-z]{1,5}/.test(text))
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

/**
 * Hypothetical multi-sector portfolio stress — not live STATUS / P&L.
 * Style-based (mock/paper/$Nx sleeve + scenarios), not exact PDF wording.
 */
export function isHypotheticalPortfolioQuery(text: string): boolean {
  if (/\b(hypothetical|mock|paper|imaginary|simulated)\s+(portfolio|allocation|book|sleeve)\b/i.test(text)) {
    return true;
  }
  if (
    /\$\s*\d{2,3}(?:,\d{3})+\b/.test(text) &&
    /\b(portfolio|allocate|allocation|invest|scenario|sleeve|stress[- ]?test)\b/i.test(text)
  ) {
    return true;
  }
  if (
    /\b(portfolio|allocation|sleeve)\b/i.test(text) &&
    /\b(technology|healthcare|tech\b|health\s*care)\b/i.test(text) &&
    /\b(inflation|recession|interest\s+rates?|rate\s+hikes?|scenarios?|correlations?|drawdowns?|concentration|stress[- ]?test)\b/i.test(
      text,
    )
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

/**
 * ChatGPT-style fundamental Q&A — one name, natural language.
 * Must reach Lucia (+ gateway/SEC bundle), NOT Revision 1 earnings protocol.
 */
export function isConversationalFundamentalQuery(text: string): boolean {
  if (/\bRun earnings candidate research on\b/i.test(text)) return false;
  if (/\b(earnings\s+candidate|candidate\s+selection|BASE\s+RESET|REQUI\s+QUARTERLY)\b/i.test(text)) {
    return false;
  }
  // Multi-name desk compare must win over single-name Lucia fundamentals.
  if (isDeskCompareQuery(text)) return false;
  if (isHypotheticalPortfolioQuery(text)) return false;
  if (/\b(screen|universe)\b/i.test(text) && /\b(earnings|candidate|tickers?)\b/i.test(text)) return false;
  // Earnings-session cohort: "quant research on those two" → Rev-1, not single-name chat.
  if (
    (/\bquant(?:itative)?\s+research\b/i.test(text) || /\bdo a quant\b/i.test(text)) &&
    /\b(those|these|them)\b/i.test(text) &&
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b/i.test(text)
  ) {
    return false;
  }

  const topic =
    /\b(revenue\s+(?:growth|trend|increase|decline|change)|sales\s+growth|top[- ]?line)\b/i.test(text) ||
    /\b(profit\s+margin|profitability|\bmargins?\b|gross\s+margin|operating\s+margin|net\s+margin)\b/i.test(text) ||
    /\b(eps\s+growth|earnings\s+growth)\b/i.test(text) ||
    (/\b(analy[sz]e|explain|tell\s+me\s+about|what\s+about|how\s+is)\b/i.test(text) &&
      /\b(revenue|margin|profit|growth|financial|fundamental)\b/i.test(text)) ||
    (/\bquant(?:itative)?\b/i.test(text) &&
      /\b(analysis|breakdown)\b/i.test(text) &&
      /\b(those|these|them|changes|margin|revenue|growth|that|numbers|fundamentals?)\b/i.test(text)) ||
    /\b(how\s+does\s+that\s+compare|compare\s+with\s+last\s+year|vs\.?\s+last\s+year|year\s+over\s+year)\b/i.test(text);

  return topic;
}

/**
 * Single-name / chart technical asks — must never rewrite into Rev-1 earnings research
 * just because a prior earnings screen left symbols in the working set.
 */
export function isTechnicalIndicatorQuery(text: string): boolean {
  const tech =
    /\b(rsi|macd|vwap|bollinger|atr|smas?|sma\s*\d+|ema\s*\d+|moving\s+averages?|volume\s+trend|support\s+(?:and|&)\s+resistance)\b/i.test(
      text,
    ) || /\b(technical\s+(?:analysis|read|chart)|chart)\b/i.test(text);
  if (!tech) return false;
  // Earnings calendar / beat screens that happen to mention RSI stay on the earnings path.
  if (
    /\bearnings\b/i.test(text) &&
    /\b(find|screen|identify|list|reporting)\b/i.test(text) &&
    /\b(next\s+(?:\d+|seven)\s+days?|within\s+the\s+next|over\s+the\s+next|upcoming|coming\s+week)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  return true;
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
    isRatesBackdropQuery(text) ||
    isHypotheticalPortfolioQuery(text) ||
    isTechnicalIndicatorQuery(text) ||
    isConversationalFundamentalQuery(text)
  );
}
