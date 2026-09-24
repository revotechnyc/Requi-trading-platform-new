/**
 * Resolve tickers from natural language — company names, lowercase tickers, $TICKER.
 */

import { classifyConsoleResearchDepth, isConversationAck } from "../intelligence/market-intent";

const COMPANY_ALIASES: Record<string, string> = {
  apple: "AAPL",
  microsoft: "MSFT",
  google: "GOOGL",
  alphabet: "GOOGL",
  amazon: "AMZN",
  tesla: "TSLA",
  nvidia: "NVDA",
  meta: "META",
  facebook: "META",
  netflix: "NFLX",
  amd: "AMD",
  intel: "INTC",
  broadcom: "AVGO",
  disney: "DIS",
  walmart: "WMT",
  jpmorgan: "JPM",
  "jp morgan": "JPM",
  "bank of america": "BAC",
  coinbase: "COIN",
  palantir: "PLTR",
  berkshire: "BRK.B",
  unity: "U",
};

const COMPANY_ALIAS_KEYS = new Set(Object.keys(COMPANY_ALIASES));

const STOPWORDS = new Set([
  "A", "I", "AM", "AN", "AS", "AT", "BE", "BY", "DO", "GO", "IF", "IN", "IS", "IT", "ME", "MY", "NO", "OF", "OK", "OKAY", "ON", "OR", "SO", "TO", "UP", "US", "WE", "S",
  "GOTCHA", "THANKS", "THX", "TY", "YEP", "YEAH", "YES", "SURE", "COOL", "GREAT",
  "THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL", "CAN", "HAS", "HER", "WAS", "ONE", "OUR", "OUT", "DAY", "GET", "HIM", "HIS", "HOW", "ITS", "MAY", "NEW", "NOW", "OLD", "SEE", "WAY", "WHO", "DID", "LET", "SAY", "SHE", "TOO", "USE",
  "BUY", "SELL", "LONG", "SHORT", "STOP", "RSI", "VWAP", "MACD", "ATR", "EMA", "SMA", "PAPER", "LIVE", "ORDER", "TRADE", "PRICE", "PRICES", "QUOTE", "CHART", "TODAY", "WHAT", "WHEN", "WITH", "THIS", "THAT", "FROM", "SHOW", "TELL", "ABOUT", "YOUR", "OPEN", "HIGH", "LOW", "LAST", "STOCK", "SHARE", "SHARES", "MARKET", "CURRENT", "RIGHT", "DOES", "DOING", "MOVE", "MOVING", "WHY", "HOW",
  "VS", "VERSUS", "MUCH", "WORTH", "SHOULD", "LATEST", "NEWS", "SIDE", "COMPARE", "SOCIAL", "REDDIT", "STOCKTWITS", "TRADERS", "SAYING", "SENTIMENT", "APPLE", "GOOGLE", "NVIDIA", "TESLA", "AMAZON", "MICROSOFT", "NETFLIX", "FACEBOOK", "ALPHABET", "COINBASE", "PALANTIR", "BERKSHIRE", "DISNEY", "WALMART",
  "NEXT", "DATE", "DATES", "REPORT", "EARNINGS", "ESTIMATE", "ESTIMATED", "CONFIRMED", "AVERAGE", "QUARTER", "QUARTERLY", "CALENDAR",
  "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY", "TOMORROW", "WEEK",
  "MAJOR", "MACRO", "COULD", "AFFECT", "GLOBAL", "EVENTS", "EVENT", "STOCKS", "EQUITIES", "TODAY", "THEMES", "THEME",
  "THEIR", "SEC", "FILINGS", "FILING", "BOTH", "THEM", "THESE", "THOSE", "MOMENTUM", "STRONGER", "SHOWING", "WHICH", "GIVE", "ADD", "WATCHLIST",
  // Cardinal / quantity words — never tickers in "five strongest", "top three", etc.
  "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "COUPLE", "FEW",
  // Common English in earnings-selection prompts — "based on", "available evidence", etc.
  "BASED", "AVAILABLE", "EVIDENCE", "CANDIDATES", "UNIVERSE", "FULL", "ISOLATE", "REMAINING",
  "HISTORICAL", "REACTIONS", "FAVORABLE", "ORIGINAL", "COMPANIES", "NAMES", "GROUP", "AUDIT",
  "RETAINED", "REMOVED", "STATUS", "EXECUTIVE", "DECISION", "BLOCKED", "QUALIFIED",
  // Protocol / research vocabulary — never treat as tickers (e.g. "PEER READ-THROUGH")
  "PEER", "PEERS", "READ", "THROUGH", "RELEVANCE", "DIVERGENCE", "SENSITIVITY", "RESET", "BASE", "TIER",
  "ENGINE", "MANDATORY", "OBJECTIVE", "ANALYSIS", "RANKING", "PROTOCOL", "CANDIDATE", "SELECTION",
  "STRONG", "POSITIVE", "NEGATIVE", "NEUTRAL", "MIXED", "MODERATE", "CLASSIFICATION", "CONVICTION",
  "UNAVAILABLE", "VERIFIED", "BLOCKED", "REJECT", "WATCH", "QUALIFIED", "WAITING", "WAIT",
  "HAVE", "HAD", "HAS", "SEASON", "SCORE", "SCORES", "ONLY", "MARK", "DATA", "EACH", "MOST",
  "INTO", "ALREADY", "REPORTED", "PROVIDE", "IDENTIFY", "RELEVANT", "ECONOMIC", "MISSING",
  "INVENT", "TREAT", "WORDS", "TICKER", "TICKERS", "FINAL", "ANSWER", "LIST", "USING",
  // Follow-up / context verbs that appear in rewritten research prompts
  "RUN", "ANALYZE", "ANALYSE", "COMPARE", "RANK", "FOCUS", "DEEPER", "REMAINING", "STRONGEST",
  "WEAKEST", "RISKIEST", "RESEARCH", "FRAMEWORK", "METHODOLOGY",
  // Protocol headers / instructions (e.g. REQUI … SMALL-CAP …)
  "REQUI", "SMALL", "CAP", "APPLY", "RULES", "FIGURES", "NUMBERS", "CLASSIFY", "GATES",
  "LIQUIDITY", "DILUTION", "RUNWAY", "CASH", "DO", "NOT", "IF", "CRITICAL",
  // Trader-NL nouns that poisoned working sets in Phase 0 baseline
  // ("risk/reward of buying", "stocks above SMA … sector", "best between them")
  "RISK", "REWARD", "REWARDS", "BUYING", "SELLING", "ABOVE", "BELOW", "SECTOR", "INDUSTRY",
  "BETWEEN", "BEST", "WORST", "FIND", "MATCHING", "CONDITIONS", "CONDITION", "SCREEN",
  "SCREENER", "LEVELS", "LEVEL", "SUPPORT", "RESISTANCE", "SWING", "TREND", "TRENDS",
  "MARGIN", "MARGINS", "GROSS", "VALUATION", "EXPENSIVE", "CHEAP", "PROBABILITY", "CLOSES",
  "HIGHER", "LOWER", "TOMORROW", "YESTERDAY", "ANALOG", "ANALOGS", "RATES", "RISING",
  "FALLING", "ELEVATED", "LEADERSHIP", "MONITOR", "ALERT", "ALERTS", "GAPS", "GAP",
  "UNUSUAL", "OPPORTUNITIES", "OPPORTUNITY", "MORNING", "SUMMARY", "SUMMARIZE", "COVERED",
  "CALL", "DELTA", "WEEKLY", "POSITION", "POSITIONS", "PORTFOLIO", "LEDGER", "BUSINESS",
  "MODEL", "CONCENTRATION", "GUIDANCE", "CHANGED", "CHANGE", "EXACT", "CLOSING", "CLOSE",
  "HISTORY", "OVER", "THEM", "THAN", "AMONG", "ACROSS", "QUARTERS", "YEARS", "YEAR",
  "ENTRY", "EXIT", "TARGET", "TARGETS", "STOPS", "INVALIDATION", "SETUP", "SETUPS",
  "CANDIDATE", "CANDIDATES", "IMPLIED", "MOVE", "MOVES", "OPTIONS", "OPTION", "CHAIN",
  "GREEKS", "PREMIUM", "PREMIUMS", "CONTRACT", "CONTRACTS", "SHARES", "SHARE",
  // Phase 2 desk-compare prose — "like a research desk", "key risks", "this month", "ping me"
  "LIKE", "DESK", "RISKS", "MONTH", "PING", "QUALITY", "GROWTH", "STORY", "CLEANER",
  "FACTOR", "FACTORS", "RELATIVE", "NARRATIVE", "BINARY", "DRIVERS", "DRIVER", "ASSUMPTIONS",
  "MEASURABLE", "OPERATING", "DIVERSIFIED", "VISIBILITY", "SPECULATIVE", "CONVEXITY",
  // English auxiliaries / prepositions harvested from NL ("if you were me", "before the close")
  "WOULD", "WERE", "WILL", "SHALL", "SHOULD", "COULD", "MIGHT", "MUST", "BEEN", "BEING",
  "BEFORE", "AFTER", "UNDER", "ABOVE", "BELOW", "DURING", "UNTIL", "WHILE", "SINCE",
  "VIBE", "LOOK", "LOOKS", "LOOKING", "SIMPLE", "ANYTHING", "WATCHING", "WORTH", "TODAY",
  "RESEARCH", "OPPORTUNITY", "OPPORTUNITIES", "TRADING", "TRADER", "BEGINNER",
  // "quantitative research" prose — not a ticker
  "QUANTITATIVE",
  // Client PDF 9/22 failures — English harvested as tickers → earnings rewrite
  "VOLUME", "VOLUMES", "UNUSUAL", "INSTITUTIONAL", "ACTIVITY", "WITHIN", "DAYS", "POST",
  "OFF", "HOURS", "AFTER", "POTENTIAL", "STRENGTH", "SUPPORTING", "PUBLICLY", "TRADED",
  "REPORTING", "EXCEEDING", "EXPECTATIONS", "ANNOUNCEMENT", "PREVIOUS", "FOLLOWING",
  "PROBABILITY", "ESTIMATE", "ESTIMATES", "REVISIONS", "SURPRISES", "REACTIONS",
  "IMPLIED", "VOLATILITY", "OPTIONS", "ANALYST", "COMPANIES", "COMPANY", "STOCKS",
  "MOMENTUM", "SIGNIFICANT", "DRIVING", "EVALUATE", "RANK", "RANKS",
  "RESEARCH", "EVIDENCE", "CURRENT", "LATEST", "AVAILABLE", "FINANCIAL", "REPORTS",
  "REPORT", "FREE", "CASH", "FLOW", "MULTIPLES", "HISTORICAL", "AVERAGES", "AVERAGE",
  "COMPETITIVE", "POSITIONING", "FUNDAMENTALS", "PROFITABILITY", "VALUATION",
  "HYPOTHETICAL", "PORTFOLIO", "TECHNOLOGY", "HEALTHCARE", "INFLATION", "RECESSION",
  "INTEREST", "SCENARIOS", "SCENARIO", "CORRELATIONS", "DRAWDOWNS", "CONCENTRATION",
  "VULNERABILITIES", "INDICATORS", "MACROECONOMIC", "ECONOMIC", "SECTORS", "SECTOR",
  // Technical-analysis prose ("short-term", "price action")
  "TERM", "ACTION", "TECHNICAL", "AVERAGES", "OUTLINE", "POSSIBLE", "SCENARIOS",
  // Style-paraphrase prose
  "ELEVATED", "LIQUID", "NAMES", "EXTENDED", "SESSION", "CONSENSUS", "SLEEVE",
  "SHALLOW", "DOWNTURN", "STICKY", "HIKES", "MOCK", "PAPER", "IMAGINARY", "SIMULATED",
  "CLEANER", "SKETCH", "TAPE", "NEAR", "SETUPS", "CHART",
  "HARD", "BIG", "MONEY", "FLOW", "FLOWS", "OWN", "LIKELY", "BEAT", "REACT", "PAST",
  "HANDFUL", "SURPRISES", "SURPRISE",
  "HOTTEST", "EQUITIES", "PARTICIPATION", "RIPPERS", "PRINTS", "EXTENDED",
  "HISTORICALLY", "ESTIMATES", "PRIOR", "REPORTS", "OUTLINE", "PAPER", "HIGHER",
  "DRAWDOWN", "QUALITY", "AGAINST", "FLAG", "BEATS", "NOTE", "USUALLY", "SHARES",
  "TEND", "PRINT", "PRINTS", "TYPICAL", "POST", "HORIZON", "WALK", "SUGGEST",
  "SIMULATED", "SPLIT", "ACROSS", "ABOVE", "AVERAGE", "QUOTES", "BIGGEST",
]);

/** Real tickers that are also common English — keep only when explicitly ticker-like. */
const AMBIGUOUS_TICKERS = new Set(["KEY"]);

const MARKET_QUESTION_RE =
  /\b(prices?|quote|stock|ticker|chart|market|trading at|worth|compare|side by side|rsi|macd|vwap|moving average|bollinger|52.?week|volume|analysis|analy[sz]e|technical|momentum|overbought|oversold|support|resistance|earnings|filing|sec|news|headline|sentiment|reddit|stocktwits|traders?|saying|social|moving|why is)\b/i;

const FILING_RE = /\b(filing|10-?k|10-?q|8-?k|sec|edgar|insider)\b/i;
const NEWS_RE = /\b(news|headline|headlines|article|reported)\b/i;
const EARNINGS_RE = /\b(earnings|eps|revenue|quarterly report|beat|miss|guidance|report(?:s|ing)?(?:\s+next|\s+earnings)?|when does .+ report)\b/i;
const MOVEMENT_RE = /\b(why|moving|move|up today|down today|surge|drop|rally|selloff)\b/i;
const SENTIMENT_RE = /\b(sentiment|reddit|wsb|wallstreetbets|retail|buzz|stocktwits|traders?|social|saying)\b/i;
const MACRO_RE = /\b(macro|geopolitical|fed|inflation|war|election|policy|gdp|rates|global news|us equities|market today|technology stocks)\b/i;
const INDICATOR_RE = /\b(rsi|macd|vwap|bollinger|ema|sma|atr|indicator|technical|overbought|oversold)\b/i;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "quant research", "do a quant analysis" — depth/methodology, not symbol QUANT. */
export function isResearchMethodologyTicker(sym: string, text: string): boolean {
  const upper = sym.toUpperCase();
  if (upper === "STYLE") {
    if (new RegExp(`\\$${upper}\\b`, "i").test(text)) return false;
    return (
      /\b(rev-?\s*1|revision\s*1)\s+style\b/i.test(text) ||
      /\bstyle\s+research\b/i.test(text) ||
      /\bstyle\s+analy[sz]e\b/i.test(text)
    );
  }
  if (upper !== "QUANT" && upper !== "QUANTITATIVE") return false;
  if (new RegExp(`\\$${upper}\\b`, "i").test(text)) return false;
  if (/Run earnings candidate research on /i.test(text) && new RegExp(`\\b${upper}\\b`).test(text)) {
    return false;
  }
  return (
    /\bquant(?:itative)?\s+(?:research|analysis)\b/i.test(text) ||
    /\b(?:do|run)\s+(?:a\s+)?quant(?:itative)?\s+(?:research|analysis)\b/i.test(text) ||
    /\bquant\s+research\b/i.test(text)
  );
}

/** True when KEY (etc.) appears as English, not as an explicit ticker. */
export function isAmbiguousTickerEnglishContext(sym: string, text: string): boolean {
  const upper = sym.toUpperCase();
  if (!AMBIGUOUS_TICKERS.has(upper)) return false;
  // Explicit ticker forms always win.
  if (new RegExp(`\\$${upper}\\b`, "i").test(text)) return false;
  if (new RegExp(`\\b(?:ticker|symbol)\\s+${upper}\\b`, "i").test(text)) return false;
  if (new RegExp(`\\b(?:on|for)\\s+${upper}\\b`).test(text)) return false;
  if (/Run earnings candidate research on /i.test(text) && new RegExp(`\\b${upper}\\b`).test(text)) {
    return false;
  }
  if (upper === "KEY") {
    // "key risks", "key levels", "and key risks", lowercase-only "key"
    if (/\bkey\s+(risks?|points?|levels?|drivers?|factors?|takeaways?|question|questions|metrics?)\b/i.test(text)) {
      return true;
    }
    if (/\band\s+key\b/i.test(text)) return true;
    // Lowercase prose "key" without an uppercase KEY token.
    if (/\bkey\b/i.test(text) && !/\bKEY\b/.test(text)) return true;
  }
  return false;
}

/** Desk / multi-factor compare prose — do not harvest English words as tickers. */
function isDeskOrCompareProse(text: string): boolean {
  return (
    /\blike a research desk\b/i.test(text) ||
    /\bresearch desk\b/i.test(text) ||
    (/\bcompare\b/i.test(text) &&
      /\b(valuation|momentum|business quality|key risks|fundamentals|growth story)\b/i.test(text)) ||
    /\b(cleaner growth|growth story into)\b/i.test(text)
  );
}

/** Strip compare connectors and possessives so token scans do not invent tickers (vs → VS, Tesla's → S). */
export function normalizeForSymbolScan(text: string): string {
  return text
    .replace(/\bvs\.?\b/gi, " ")
    .replace(/\bversus\b/gi, " ")
    .replace(/([A-Za-z]{2,})['']s\b/g, "$1")
    .replace(/['']s\b/gi, " ");
}

export function resolveSymbolsFromText(text: string, extraSymbols: string[] = []): string[] {
  // Chitchat / clarifications — never harvest tickers from "gotcha is not a stock".
  if (isConversationAck(text)) {
    return extraSymbols.map((s) => s.toUpperCase()).filter(Boolean);
  }
  // Console research chips have no tickers — never harvest SCAN/VALUE from the prompt.
  if (classifyConsoleResearchDepth(text)) {
    return extraSymbols.map((s) => s.toUpperCase()).filter(Boolean);
  }
  const out = new Set<string>(extraSymbols.map((s) => s.toUpperCase()));
  const lower = text.toLowerCase();
  // Allow larger batches for research / conversation-context follow-ups (was hard-capped at 4).
  const maxSymbols =
    /\b(research|candidate|protocol|analy[sz]e|earnings\s+screen)\b/i.test(text) || extraSymbols.length > 4
      ? 12
      : 6;

  // "What is AAPL trading at?" / "What is XYZFAKE123 trading at right now?"
  const tradingAt = text.match(/\bwhat(?:'s| is)\s+([A-Za-z][A-Za-z0-9.-]{0,11})\s+trading\b/i);
  if (tradingAt) {
    const token = tradingAt[1];
    const alias = COMPANY_ALIASES[token.toLowerCase()];
    if (alias) {
      out.add(alias);
      return filterLikelyFalsePositiveTickers([...out], text).slice(0, maxSymbols);
    }
    out.add(token.toUpperCase());
    return filterLikelyFalsePositiveTickers([...out], text).slice(0, maxSymbols);
  }

  for (const m of text.matchAll(/\$([A-Za-z][A-Za-z0-9.-]{0,9})/g)) {
    out.add(m[1].toUpperCase());
  }

  let aliasHits = 0;
  for (const [name, sym] of Object.entries(COMPANY_ALIASES)) {
    if (new RegExp(`\\b${escapeRegex(name)}\\b`, "i").test(lower)) {
      out.add(sym);
      aliasHits++;
    }
  }

  // Prefer explicit "on/for TICKER, TICKER" lists in research prompts.
  // Require length >= 2 so "on AAPL. Use verified…" does not treat "U" from "Use" as Unity (U).
  // Single-letter tickers (e.g. $U) still resolve via $TICKER or company alias.
  for (const m of text.matchAll(
    /\b(?:on|for)\s+([A-Z][A-Z0-9.]{0,4}(?:\s*,\s*|\s+and\s+|\s+)[A-Z][A-Z0-9.]{0,4}(?:(?:\s*,\s*|\s+and\s+|\s+)[A-Z][A-Z0-9.]{0,4})*)/g,
  )) {
    for (const part of m[1].split(/\s*,\s*|\s+and\s+|\s+/i)) {
      const upper = part.trim().replace(/\.+$/, "").toUpperCase();
      if (upper.length >= 2 && upper.length <= 6 && !STOPWORDS.has(upper)) out.add(upper);
    }
  }

  const researchIntent =
    /\b(research|protocol|candidate\s+selection|earnings\s+screen|small-?cap)\b/i.test(text);

  const shouldScan =
    MARKET_QUESTION_RE.test(text) ||
    out.size > 0 ||
    FILING_RE.test(text) ||
    NEWS_RE.test(text) ||
    researchIntent;

  if (!shouldScan) {
    return filterLikelyFalsePositiveTickers([...out], text).slice(0, maxSymbols);
  }

  const scan = normalizeForSymbolScan(text);

  // Explicit uppercase tickers in the original text (AAPL, MSFT, BRK.B).
  for (const m of text.matchAll(/\b[A-Z][A-Z0-9]{0,4}(?:\.[A-Z])?\b/g)) {
    const upper = m[0].toUpperCase();
    if (upper.length >= 2 && !STOPWORDS.has(upper)) {
      if (isResearchMethodologyTicker(upper, text)) continue;
      out.add(upper);
    }
  }

  // Lowercase tickers (aapl, nvda) — skip on long research-protocol prose so English
  // words like "have" / "season" / "scores" are not mistaken for tickers.
  // Also skip when company aliases already anchored a desk/compare sentence
  // ("Compare Apple and Microsoft like a research desk…") — prevents LIKE/DESK/KEY.
  const researchProse =
    /\bPEER\s*READ|\bCANDIDATE\s+SELECTION\b|\bBASE\s+RESET\b|\bScore each company\b|\bread-through\b|\bSMALL-?CAP\s+CANDIDATE\b/i.test(
      text,
    );
  const skipLowercaseProse =
    researchProse || (aliasHits >= 1 && isDeskOrCompareProse(text)) || (aliasHits >= 2 && /\bcompare\b/i.test(text));

  if (!skipLowercaseProse) {
    for (const m of scan.matchAll(/\b[a-z][a-z0-9.]{0,5}\b/g)) {
      const raw = m[0];
      if (COMPANY_ALIAS_KEYS.has(raw)) continue;
      const upper = raw.toUpperCase();
      if (STOPWORDS.has(upper)) continue;
      if (raw === "quant" && /\bresearch\b/i.test(text)) continue;
      if (raw.length >= 2 && raw.length <= 6) out.add(upper);
    }
  }

  return filterLikelyFalsePositiveTickers([...out], text).slice(0, maxSymbols);
}

const WORD_NUMBER_TO_SYM = new Set([
  "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN",
]);

/** Strip quantity/context false positives before conversation follow-up routing. */
export function filterLikelyFalsePositiveTickers(symbols: string[], text: string): string[] {
  if (!symbols.length) return symbols;
  if (isConversationAck(text)) return [];
  const lower = text.toLowerCase();
  const colonList = text.match(/:\s*([A-Z][A-Z0-9.,\s-]+)/i)?.[1]?.toUpperCase() ?? "";

  return symbols.filter((sym) => {
    const upper = sym.toUpperCase();
    if (colonList.includes(upper)) return true;
    if (new RegExp(`\\$${upper}\\b`, "i").test(text)) return true;
    // Always drop lexicon stopwords unless explicitly $-tagged or in a colon universe list.
    if (STOPWORDS.has(upper)) return false;
    // Ambiguous real tickers (KEY) in English phrases — not KeyCorp unless explicit.
    if (isAmbiguousTickerEnglishContext(upper, text)) return false;
    if (/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(lower)) {
      const qtyWord = upper.toLowerCase();
      if (WORD_NUMBER_TO_SYM.has(upper) && new RegExp(`\\b${qtyWord}\\b`).test(lower)) return false;
    }
    if (upper === "BASED" && /\bbased\s+on\b/i.test(lower)) return false;
    if (upper === "AVAILABLE" && /\bavailable\b/i.test(lower)) return false;
    if (upper === "EVIDENCE" && /\bevidence\b/i.test(lower)) return false;
    if (upper === "CANDIDATES" && /\bcandidates?\b/i.test(lower)) return false;
    if (upper === "EVERY" && /\bevery\s+(ticker|symbol|name|one)\b/i.test(lower)) return false;
    if (upper === "STILL" && /\bstill\b/i.test(lower)) return false;
    if (upper === "ENDS" && (!/\bENDS\b/.test(text) || /\bends?\b/i.test(lower))) return false;
    if (upper === "TICKER" && /\bticker(s)?\b/i.test(lower)) return false;
    if (isResearchMethodologyTicker(upper, text)) return false;
    return true;
  });
}

/** Conversation-context resolver — same as resolveSymbolsFromText but drops NL false positives. */
export function resolveContextSymbolsFromText(text: string): string[] {
  return filterLikelyFalsePositiveTickers(resolveSymbolsFromText(text), text);
}

/**
 * User clearly named a ticker (not scraped from prose). Used when referential
 * follow-ups must not treat methodology words as explicit symbols.
 */
export function isExplicitlyNamedTicker(sym: string, text: string): boolean {
  const upper = sym.toUpperCase();
  if (new RegExp(`\\$${upper}\\b`, "i").test(text)) return true;
  if (/:\s*[A-Z][A-Z0-9.,\s-]+/i.test(text) && text.toUpperCase().includes(upper)) return true;
  if (/Run earnings candidate research on /i.test(text) && new RegExp(`\\b${upper}\\b`).test(text)) {
    return true;
  }
  if (new RegExp(`\\b(?:on|for)\\s+${upper}\\b`, "i").test(text)) return true;
  // Uppercase token in the original message (e.g. AAPL, not lowercased prose).
  if (new RegExp(`\\b${upper}\\b`).test(text) && text.includes(upper)) return true;
  for (const [name, alias] of Object.entries(COMPANY_ALIASES)) {
    if (alias === upper && new RegExp(`\\b${escapeRegex(name)}\\b`, "i").test(text)) return true;
  }
  return false;
}

export type LayerRoute = {
  layers: import("./types").IntelligenceLayer[];
  reason: string;
};

export function routeLayers(text: string, symbols: string[]): LayerRoute {
  const layers = new Set<import("./types").IntelligenceLayer>();
  const hasSymbols = symbols.length > 0;

  if (hasSymbols) layers.add("prices");

  if (FILING_RE.test(text)) layers.add("edgar");
  if (NEWS_RE.test(text) || MOVEMENT_RE.test(text)) layers.add("news");
  if (EARNINGS_RE.test(text)) layers.add("earnings");
  if (SENTIMENT_RE.test(text) || MOVEMENT_RE.test(text)) layers.add("sentiment");
  if (MACRO_RE.test(text) || MOVEMENT_RE.test(text)) layers.add("gdelt");
  if (INDICATOR_RE.test(text) || /\b(price|chart|technical|momentum)\b/i.test(text)) layers.add("indicators");

  // Desk / multi-factor compare needs more than a live quote.
  if (
    /\blike a research desk\b/i.test(text) ||
    (/\bcompare\b/i.test(text) &&
      /\b(valuation|momentum|business quality|key risks|fundamentals)\b/i.test(text))
  ) {
    layers.add("prices");
    layers.add("indicators");
    layers.add("earnings");
    layers.add("edgar");
    layers.add("news");
  }

  if (layers.size === 0 && hasSymbols) {
    layers.add("indicators");
    if (MOVEMENT_RE.test(text)) {
      layers.add("news");
      layers.add("sentiment");
    }
  }

  if (layers.size === 0 && !hasSymbols) {
    return { layers: [], reason: "no_symbols_or_layers" };
  }

  return { layers: [...layers], reason: "keyword_router" };
}
