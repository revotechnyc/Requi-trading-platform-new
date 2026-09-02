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
};

const COMPANY_ALIAS_KEYS = new Set(Object.keys(COMPANY_ALIASES));

const STOPWORDS = new Set([
  "A", "I", "AM", "AN", "AS", "AT", "BE", "BY", "DO", "GO", "IF", "IN", "IS", "IT", "ME", "MY", "NO", "OF", "OK", "ON", "OR", "SO", "TO", "UP", "US", "WE", "S",
  "THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL", "CAN", "HAS", "HER", "WAS", "ONE", "OUR", "OUT", "DAY", "GET", "HIM", "HIS", "HOW", "ITS", "MAY", "NEW", "NOW", "OLD", "SEE", "WAY", "WHO", "DID", "LET", "SAY", "SHE", "TOO", "USE",
  "BUY", "SELL", "LONG", "SHORT", "STOP", "RSI", "VWAP", "MACD", "ATR", "EMA", "SMA", "PAPER", "LIVE", "ORDER", "TRADE", "PRICE", "PRICES", "QUOTE", "CHART", "TODAY", "WHAT", "WHEN", "WITH", "THIS", "THAT", "FROM", "SHOW", "TELL", "ABOUT", "YOUR", "OPEN", "HIGH", "LOW", "LAST", "STOCK", "SHARE", "SHARES", "MARKET", "CURRENT", "RIGHT", "DOES", "DOING", "MOVE", "MOVING", "WHY", "HOW",
  "VS", "VERSUS", "MUCH", "WORTH", "SHOULD", "LATEST", "NEWS", "SIDE", "COMPARE", "APPLE", "GOOGLE", "NVIDIA", "TESLA", "AMAZON", "MICROSOFT", "NETFLIX", "FACEBOOK", "ALPHABET", "COINBASE", "PALANTIR", "BERKSHIRE", "DISNEY", "WALMART",
]);

const MARKET_QUESTION_RE =
  /\b(prices?|quote|stock|ticker|chart|market|trading at|worth|compare|side by side|rsi|macd|vwap|moving average|bollinger|52.?week|volume|analysis|analy[sz]e|technical|momentum|overbought|oversold|support|resistance|earnings|filing|sec|news|headline|sentiment|moving|why is)\b/i;

const FILING_RE = /\b(filing|10-?k|10-?q|8-?k|sec|edgar|insider)\b/i;
const NEWS_RE = /\b(news|headline|headlines|article|reported)\b/i;
const EARNINGS_RE = /\b(earnings|eps|revenue|quarterly report|beat|miss|guidance)\b/i;
const MOVEMENT_RE = /\b(why|moving|move|up today|down today|surge|drop|rally|selloff)\b/i;
const SENTIMENT_RE = /\b(sentiment|reddit|wsb|wallstreetbets|retail|buzz)\b/i;
const MACRO_RE = /\b(macro|geopolitical|fed|inflation|war|election|policy|gdp|rates)\b/i;
const INDICATOR_RE = /\b(rsi|macd|vwap|bollinger|ema|sma|atr|indicator|technical)\b/i;

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

  for (const m of text.matchAll(/\$([A-Za-z][A-Za-z0-9.-]{0,9})/g)) {
    out.add(m[1].toUpperCase());
  }

  for (const [name, sym] of Object.entries(COMPANY_ALIASES)) {
    if (new RegExp(`\\b${escapeRegex(name)}\\b`, "i").test(lower)) {
      out.add(sym);
    }
  }

  const shouldScan =
    MARKET_QUESTION_RE.test(text) || out.size > 0 || FILING_RE.test(text) || NEWS_RE.test(text);

  if (!shouldScan) return [...out].slice(0, 4);

  const scan = normalizeForSymbolScan(text);

  // Explicit uppercase tickers in the original text (AAPL, MSFT, BRK.B).
  for (const m of text.matchAll(/\b[A-Z][A-Z0-9]{0,4}(?:\.[A-Z])?\b/g)) {
    const upper = m[0].toUpperCase();
    if (upper.length >= 2 && !STOPWORDS.has(upper)) out.add(upper);
  }

  // Lowercase tickers (aapl, nvda) — not company names already mapped above.
  for (const m of scan.matchAll(/\b[a-z][a-z0-9.]{0,5}\b/g)) {
    const raw = m[0];
    if (COMPANY_ALIAS_KEYS.has(raw)) continue;
    const upper = raw.toUpperCase();
    if (STOPWORDS.has(upper)) continue;
    if (raw.length >= 2 && raw.length <= 6) out.add(upper);
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
