/**
 * Autonomous General Intraday universe — top ~100 liquid US large-caps.
 *
 * Cap at 100 is intentional (gateway / quote rate limits). Expanding toward
 * full S&P 500 is supported by growing this list once infra allows.
 */
export const SP100_UNIVERSE: readonly string[] = [
  // Mega / large tech & growth
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "GOOG", "META", "TSLA", "AVGO", "AMD",
  "NFLX", "CRM", "ORCL", "ADBE", "INTC", "MU", "QCOM", "TXN", "AMAT", "LRCX",
  "KLAC", "ADI", "INTU", "NOW", "PANW", "CRWD", "SNOW", "DDOG", "NET", "PLTR",
  "UBER", "SHOP", "COIN", "IBM", "CSCO", "ACN", "ANET",
  // Financials
  "JPM", "BAC", "WFC", "GS", "MS", "C", "BLK", "SCHW", "AXP", "V",
  "MA", "PYPL", "USB", "PNC", "TFC", "COF",
  // Energy / materials / industrials
  "XOM", "CVX", "COP", "SLB", "EOG", "PXD", "MPC", "PSX", "LIN", "APD",
  "CAT", "DE", "BA", "GE", "HON", "UNP", "UPS", "RTX", "LMT", "MMM",
  "F", "GM", "ETN", "EMR",
  // Health / staples / consumer
  "LLY", "UNH", "JNJ", "MRK", "ABBV", "PFE", "TMO", "ABT", "DHR", "AMGN",
  "BMY", "GILD", "MDT", "ISRG", "VRTX", "REGN",
  "WMT", "COST", "PG", "KO", "PEP", "PM", "MO", "CL", "MDLZ", "KMB",
  "HD", "LOW", "NKE", "SBUX", "MCD", "TGT", "BKNG", "CMG", "TJX",
  // Comm / utilities / RE / ETFs for liquidity anchors
  "DIS", "CMCSA", "T", "VZ", "TMUS", "NEE", "SO", "DUK", "AMT", "PLD",
  "SPY", "QQQ", "IWM", "DIA",
] as const;

/** Deduped uppercase list, hard-capped at 100 for scan stability. */
export function autonomousScanUniverse(limit = 100): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of SP100_UNIVERSE) {
    const s = String(raw || "").trim().toUpperCase();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}
