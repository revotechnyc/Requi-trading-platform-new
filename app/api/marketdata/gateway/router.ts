import type { MarketDataProvider, OhlcvBar, RawQuote } from "./types";
import { YahooMarketDataProvider } from "./providers/yahoo";
import { BrokerMarketDataProvider } from "./providers/broker";
import { validateMarketData } from "./validation";
import { currentMarketSession } from "./sessions";
import { recordEvent, recordFailure, recordSuccess } from "./persistence";

/**
 * Deterministic Market Data Router (spec §4/§5) — provider selection and
 * failover live HERE, in backend code. The AI never chooses a provider.
 *
 *   connected broker capable of market data?
 *     YES → try broker → validate → VALID: use broker
 *                                  → INVALID/ERROR/TIMEOUT: log + fall back
 *     NO  → yfinance (default)
 */

export interface RoutedQuote {
  raw: RawQuote;
  provider: MarketDataProvider;
  latencyMs: number;
  brokerAttempted: boolean;
  brokerStatus: "ok" | "failed" | "not_connected" | "unsupported";
  failover: boolean;
}

const yahoo = new YahooMarketDataProvider();

/** Which provider WOULD serve this user (for UI source visibility). */
export async function activeProviderFor(userId: string): Promise<{ code: string; sourceName: string; brokerCapable: boolean }> {
  const broker = await BrokerMarketDataProvider.forUser(userId);
  if (broker && (await broker.isAvailable().catch(() => false))) {
    return { code: broker.code, sourceName: broker.sourceName, brokerCapable: true };
  }
  return { code: yahoo.code, sourceName: yahoo.sourceName, brokerCapable: broker !== null };
}

export async function routedQuote(userId: string, symbol: string): Promise<RoutedQuote> {
  const session = currentMarketSession();
  const broker = await BrokerMarketDataProvider.forUser(userId);

  if (broker) {
    const started = Date.now();
    try {
      const raw = await broker.getQuote(symbol);
      const validation = validateMarketData(raw, symbol, session);
      if (validation.valid && !validation.stale) {
        await recordSuccess("BROKER", Date.now() - started);
        return { raw, provider: broker, latencyMs: Date.now() - started, brokerAttempted: true, brokerStatus: "ok", failover: false };
      }
      // Invalid or stale broker data → flag + fall back (spec §5).
      await recordFailure("BROKER", "quote", symbol, new Error(`validation failed: ${validation.reasons.join(", ")}`));
      await recordEvent(validation.stale ? "STALE_REJECTED" : "PROVIDER_FAILURE", {
        userId,
        provider: "BROKER",
        symbol,
        detail: { reasons: validation.reasons, fallback: "YFINANCE" },
      });
    } catch (err) {
      await recordFailure("BROKER", "quote", symbol, err);
      await recordEvent("PROVIDER_FAILURE", {
        userId,
        provider: "BROKER",
        symbol,
        detail: { error: (err as Error).message, fallback: "YFINANCE" },
      });
    }
    try {
      const raw = await yahoo.getQuote(symbol);
      await recordSuccess("YFINANCE", 0);
      await recordEvent("FAILOVER", { userId, provider: "YFINANCE", symbol, detail: { from: "BROKER" } });
      return { raw, provider: yahoo, latencyMs: 0, brokerAttempted: true, brokerStatus: "failed", failover: true };
    } catch (err) {
      await recordFailure("YFINANCE", "quote", symbol, err); // both layers down — caller returns structured unavailable
      throw err;
    }
  }

  const started = Date.now();
  try {
    const raw = await yahoo.getQuote(symbol);
    await recordSuccess("YFINANCE", Date.now() - started);
    return { raw, provider: yahoo, latencyMs: Date.now() - started, brokerAttempted: false, brokerStatus: broker ? "unsupported" : "not_connected", failover: false };
  } catch (err) {
    await recordFailure("YFINANCE", "quote", symbol, err);
    throw err;
  }
}

export async function routedHistory(userId: string, symbol: string, period: string, interval: string): Promise<{ bars: OhlcvBar[]; provider: MarketDataProvider }> {
  const broker = await BrokerMarketDataProvider.forUser(userId);
  if (broker) {
    try {
      const bars = await broker.getHistory(symbol, period, interval);
      if (bars.length > 0) return { bars, provider: broker };
      throw new Error("empty history");
    } catch (err) {
      await recordFailure("BROKER", "history", symbol, err);
      // fall through to Yahoo
    }
  }
  const bars = await yahoo.getHistory(symbol, period, interval);
  return { bars, provider: yahoo };
}
