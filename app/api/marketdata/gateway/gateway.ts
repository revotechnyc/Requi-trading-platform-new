import { CACHE_TTL, gatewayCache } from "./cache";
import { computeGatewayIndicators, type GatewayIndicators } from "./indicators";
import { recordEvent, recordSnapshot } from "./persistence";
import { activeProviderFor, routedHistory, routedQuote } from "./router";
import { currentMarketSession } from "./sessions";
import { validateMarketData } from "./validation";
import type { MarketDataUnavailable, OhlcvBar, SnapshotResult, UnifiedMarketSnapshot } from "./types";

/**
 * RTI MARKET DATA GATEWAY — the single entry point for all market data.
 *
 *   Market Data Source → Validation → Normalization → Indicator Engine
 *     → Intelligence / Autonomous → AI Reasoning
 *
 * Both Intelligence and Autonomous consume THIS service. Neither module may
 * fetch market data independently, and the AI never sees raw provider
 * payloads — only the unified snapshot + computed indicators.
 */

const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,11}$/;

function normalizeQuote(routed: Awaited<ReturnType<typeof routedQuote>>, symbol: string): UnifiedMarketSnapshot {
  const session = currentMarketSession();
  const validation = validateMarketData(routed.raw, symbol, session);
  const now = Date.now();
  return {
    symbol: symbol.toUpperCase(),
    price: routed.raw.price,
    open: routed.raw.open ?? null,
    high: routed.raw.high ?? null,
    low: routed.raw.low ?? null,
    previous_close: routed.raw.previousClose ?? null,
    volume: routed.raw.volume ?? null,
    source: routed.provider.code,
    source_name: routed.provider.sourceName,
    timestamp: new Date(routed.raw.timestamp).toISOString(),
    received_at: new Date(now).toISOString(),
    market_session: session,
    asset_type: "equity",
    exchange: routed.raw.exchange ?? null,
    is_delayed: routed.raw.isDelayed ?? false,
    stale: validation.stale,
    freshness: validation.stale ? "STALE" : validation.age_seconds <= 15 ? "FRESH" : "AGING",
    age_seconds: validation.age_seconds,
    validation,
  };
}

function unavailable(symbol: string, brokerAttempted: boolean, brokerStatus: RoutedBrokerStatus, yahooFailed: boolean): MarketDataUnavailable {
  return {
    market_data_available: false,
    symbol: symbol.toUpperCase(),
    broker_attempted: brokerAttempted,
    broker_status: brokerStatus,
    yfinance_attempted: true,
    yfinance_status: yahooFailed ? "failed" : "ok",
    reason: "No valid market data source available.",
  };
}
type RoutedBrokerStatus = "ok" | "failed" | "not_connected" | "unsupported";

/** Unified market snapshot for one symbol (spec §7/§8). Never throws. */
export async function getSnapshot(userId: string, rawSymbol: string): Promise<SnapshotResult> {
  const symbol = rawSymbol.toUpperCase().trim();
  if (!SYMBOL_RE.test(symbol)) {
    return {
      market_data_available: false,
      symbol,
      broker_attempted: false,
      broker_status: "not_connected",
      yfinance_attempted: false,
      yfinance_status: "failed",
      reason: `Invalid symbol "${rawSymbol}".`,
    };
  }
  const cacheKey = `quote:${userId}:${symbol}`;
  const cached = gatewayCache.get<SnapshotResult>(cacheKey);
  if (cached) return cached;

  let brokerAttempted = false;
  let brokerStatus: RoutedBrokerStatus = "not_connected";
  try {
    const routed = await routedQuote(userId, symbol);
    brokerAttempted = routed.brokerAttempted;
    brokerStatus = routed.brokerStatus;
    const snapshot = normalizeQuote(routed, symbol);
    if (!snapshot.validation.valid) {
      // Both layers failed validation — structured unavailable, no fabrication.
      await recordEvent("UNAVAILABLE", { userId, provider: routed.provider.code, symbol, detail: snapshot.validation.reasons });
      const out = unavailable(symbol, brokerAttempted, brokerStatus, true);
      gatewayCache.set(cacheKey, out, CACHE_TTL.quoteMs);
      return out;
    }
    const out: SnapshotResult = { market_data_available: true, ...snapshot };
    gatewayCache.set(cacheKey, out, CACHE_TTL.quoteMs);
    return out;
  } catch (err) {
    await recordEvent("UNAVAILABLE", { userId, provider: "YFINANCE", symbol, detail: { error: (err as Error).message } });
    const out = unavailable(symbol, brokerAttempted, brokerAttempted ? "failed" : brokerStatus, true);
    gatewayCache.set(cacheKey, out, CACHE_TTL.quoteMs);
    return out;
  }
}

/** Normalized OHLCV history (daily by default). */
export async function getHistory(
  userId: string,
  symbol: string,
  period = "1y",
  interval = "1d",
): Promise<{ available: boolean; bars: OhlcvBar[]; source?: string }> {
  const sym = symbol.toUpperCase().trim();
  const ttl = interval === "1d" ? CACHE_TTL.dailyMs : CACHE_TTL.intradayMs;
  try {
    const { bars, provider } = await gatewayCache.through(`hist:${userId}:${sym}:${period}:${interval}`, ttl, () =>
      routedHistory(userId, sym, period, interval),
    );
    return { available: true, bars, source: provider.code };
  } catch {
    return { available: false, bars: [] };
  }
}

/** Full indicator set for a symbol, computed internally (spec §13). */
export async function getIndicators(userId: string, symbol: string): Promise<{ available: boolean; indicators: GatewayIndicators | null; source?: string }> {
  const sym = symbol.toUpperCase().trim();
  return gatewayCache.through(`ind:${userId}:${sym}`, CACHE_TTL.indicatorsMs, async () => {
    const daily = await getHistory(userId, sym, "1y", "1d");
    const intraday = await getHistory(userId, sym, "1d", "1m");
    if (!daily.available) return { available: false, indicators: null };
    const indicators = computeGatewayIndicators(daily.bars, intraday.available ? intraday.bars : []);
    return { available: true, indicators, source: daily.source };
  });
}

/**
 * The AI context bundle (spec §15): snapshot + indicators + source metadata,
 * persisted for traceability. This exact object is attached to the model
 * request as authoritative market context.
 */
export interface MarketContext {
  market_context: {
    symbol: string;
    price: number;
    source: string;
    source_name: string;
    market_session: string;
    timestamp: string;
    stale: boolean;
    indicators: GatewayIndicators | null;
  };
}

export async function getMarketContext(
  userId: string,
  symbol: string,
  consumedBy: "INTELLIGENCE" | "AUTONOMOUS",
): Promise<{ available: boolean; context?: MarketContext; error?: MarketDataUnavailable }> {
  const snap = await getSnapshot(userId, symbol);
  if (!snap.market_data_available) return { available: false, error: snap };
  const ind = await getIndicators(userId, symbol);
  const context: MarketContext = {
    market_context: {
      symbol: snap.symbol,
      price: snap.price,
      source: snap.source.toLowerCase(),
      source_name: snap.source_name,
      market_session: snap.market_session.toLowerCase(),
      timestamp: snap.timestamp,
      stale: snap.stale,
      indicators: ind.indicators,
    },
  };
  await recordSnapshot(userId, snap, ind.indicators, consumedBy);
  return { available: true, context };
}

/** Which provider is serving this user right now (frontend source chip). */
export async function sourceStatus(userId: string) {
  return activeProviderFor(userId);
}

/** Note a provider transition event (Autonomous stream: "Yahoo → Broker"). */
export async function noteSourceChanged(userId: string, from: string, to: string) {
  await recordEvent("SOURCE_CHANGED", { userId, detail: { from, to } });
}
