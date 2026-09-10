/**
 * Resolve tickers from natural language — company names, lowercase tickers, $TICKER.
 */

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
  "A", "I", "AM", "AN", "AS", "AT", "BE", "BY", "DO", "GO", "IF", "IN", "IS", "IT", "ME", "MY", "NO", "OF", "OK", "ON", "OR", "SO", "TO", "UP", "US", "WE", "S",
  "THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL", "CAN", "HAS", "HER", "WAS", "ONE", "OUR", "OUT", "DAY", "GET", "HIM", "HIS", "HOW", "ITS", "MAY", "NEW", "NOW", "OLD", "SEE", "WAY", "WHO", "DID", "LET", "SAY", "SHE", "TOO", "USE",
  "BUY", "SELL", "LONG", "SHORT", "STOP", "RSI", "VWAP", "MACD", "ATR", "EMA", "SMA", "PAPER", "LIVE", "ORDER", "TRADE", "PRICE", "PRICES", "QUOTE", "CHART", "TODAY", "WHAT", "WHEN", "WITH", "THIS", "THAT", "FROM", "SHOW", "TELL", "ABOUT", "YOUR", "OPEN", "HIGH", "LOW", "LAST", "STOCK", "SHARE", "SHARES", "MARKET", "CURRENT", "RIGHT", "DOES", "DOING", "MOVE", "MOVING", "WHY", "HOW",
  "VS", "VERSUS", "MUCH", "WORTH", "SHOULD", "LATEST", "NEWS", "SIDE", "COMPARE", "SOCIAL", "REDDIT", "STOCKTWITS", "TRADERS", "SAYING", "SENTIMENT", "APPLE", "GOOGLE", "NVIDIA", "TESLA", "AMAZON", "MICROSOFT", "NETFLIX", "FACEBOOK", "ALPHABET", "COINBASE", "PALANTIR", "BERKSHIRE", "DISNEY", "WALMART",
  "NEXT", "DATE", "DATES", "REPORT", "EARNINGS", "ESTIMATE", "ESTIMATED", "CONFIRMED", "AVERAGE", "QUARTER", "QUARTERLY", "CALENDAR",
  "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY", "TOMORROW", "WEEK",
  "MAJOR", "MACRO", "COULD", "AFFECT", "GLOBAL", "EVENTS", "EVENT", "STOCKS", "EQUITIES", "TODAY", "THEMES", "THEME",
  "THEIR", "SEC", "FILINGS", "FILING", "BOTH", "THEM", "THESE", "MOMENTUM", "STRONGER", "SHOWING", "WHICH", "GIVE", "ADD", "WATCHLIST",
  // Protocol / research vocabulary — never treat as tickers (e.g. "PEER READ-THROUGH")
  "PEER", "PEERS", "READ", "THROUGH", "RELEVANCE", "DIVERGENCE", "SENSITIVITY", "RESET", "BASE", "TIER",
  "ENGINE", "MANDATORY", "OBJECTIVE", "ANALYSIS", "RANKING", "PROTOCOL", "CANDIDATE", "SELECTION",
  "STRONG", "POSITIVE", "NEGATIVE", "NEUTRAL", "MIXED", "MODERATE", "CLASSIFICATION", "CONVICTION",
  "UNAVAILABLE", "VERIFIED", "BLOCKED", "REJECT", "WATCH", "QUALIFIED", "WAITING", "WAIT",
  "HAVE", "HAD", "HAS", "SEASON", "SCORE", "SCORES", "ONLY", "MARK", "DATA", "EACH", "MOST",
  "INTO", "ALREADY", "REPORTED", "PROVIDE", "IDENTIFY", "RELEVANT", "ECONOMIC", "MISSING",
  "INVENT", "TREAT", "WORDS", "TICKER", "TICKERS", "FINAL", "ANSWER", "LIST", "USING",
  // Protocol headers / instructions (e.g. REQUI … SMALL-CAP …)
  "REQUI", "SMALL", "CAP", "APPLY", "RULES", "FIGURES", "NUMBERS", "CLASSIFY", "GATES",
  "LIQUIDITY", "DILUTION", "RUNWAY", "CASH", "DO", "NOT", "IF", "CRITICAL",
]);

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

/** Strip compare connectors and possessives so token scans do not invent tickers (vs → VS, Tesla's → S). */
export function normalizeForSymbolScan(text: string): string {
  return text
    .replace(/\bvs\.?\b/gi, " ")
    .replace(/\bversus\b/gi, " ")
    .replace(/([A-Za-z]{2,})['']s\b/g, "$1")
    .replace(/['']s\b/gi, " ");
}

export function resolveSymbolsFromText(text: string, extraSymbols: string[] = []): string[] {
  const out = new Set<string>(extraSymbols.map((s) => s.toUpperCase()));
  const lower = text.toLowerCase();

  // "What is AAPL trading at?" / "What is XYZFAKE123 trading at right now?"
  const tradingAt = text.match(/\bwhat(?:'s| is)\s+([A-Za-z][A-Za-z0-9.-]{0,11})\s+trading\b/i);
  if (tradingAt) {
    const token = tradingAt[1];
    const alias = COMPANY_ALIASES[token.toLowerCase()];
    if (alias) {
      out.add(alias);
      return [...out].slice(0, 4);
    }
    out.add(token.toUpperCase());
    return [...out].slice(0, 4);
  }

  for (const m of text.matchAll(/\$([A-Za-z][A-Za-z0-9.-]{0,9})/g)) {
    out.add(m[1].toUpperCase());
  }

  for (const [name, sym] of Object.entries(COMPANY_ALIASES)) {
    if (new RegExp(`\\b${escapeRegex(name)}\\b`, "i").test(lower)) {
      out.add(sym);
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

  if (!shouldScan) return [...out].slice(0, 4);

  const scan = normalizeForSymbolScan(text);

  // Explicit uppercase tickers in the original text (AAPL, MSFT, BRK.B).
  for (const m of text.matchAll(/\b[A-Z][A-Z0-9]{0,4}(?:\.[A-Z])?\b/g)) {
    const upper = m[0].toUpperCase();
    if (upper.length >= 2 && !STOPWORDS.has(upper)) out.add(upper);
  }

  // Lowercase tickers (aapl, nvda) — skip on long research-protocol prose so English
  // words like "have" / "season" / "scores" are not mistaken for tickers.
  const researchProse =
    /\bPEER\s*READ|\bCANDIDATE\s+SELECTION\b|\bBASE\s+RESET\b|\bScore each company\b|\bread-through\b|\bSMALL-?CAP\s+CANDIDATE\b/i.test(
      text,
    );
  if (!researchProse) {
    for (const m of scan.matchAll(/\b[a-z][a-z0-9.]{0,5}\b/g)) {
      const raw = m[0];
      if (COMPANY_ALIAS_KEYS.has(raw)) continue;
      const upper = raw.toUpperCase();
      if (STOPWORDS.has(upper)) continue;
      if (raw.length >= 2 && raw.length <= 6) out.add(upper);
    }
  }

  return [...out].slice(0, 4);
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
  if (INDICATOR_RE.test(text) || /\b(price|chart|technical)\b/i.test(text)) layers.add("indicators");

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
