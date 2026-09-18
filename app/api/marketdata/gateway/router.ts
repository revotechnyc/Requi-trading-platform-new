import type { MarketDataProvider, MarketSession, OhlcvBar, RawQuote, ValidationResult } from "./types";
import { YahooMarketDataProvider } from "./providers/yahoo";
import { BrokerMarketDataProvider } from "./providers/broker";
import { AlphaVantageMarketDataProvider } from "./providers/alpha-vantage";
import { validateMarketData } from "./validation";
import { currentMarketSession } from "./sessions";
import { recordEvent, recordFailure, recordSuccess } from "./persistence";
import { loadLastGoodQuote, saveLastGoodQuote } from "./last-good-cache";

/**
 * Deterministic Market Data Router (spec §4/§5) — provider selection and
 * failover live HERE, in backend code. The AI never chooses a provider.
 *
 * Quote chain (Rev 9/14 Step 5):
 *   Broker → Yahoo → Alpha Vantage → timestamped last-good cache → UNAVAILABLE
 */

export interface RoutedQuote {
  raw: RawQuote;
  provider: MarketDataProvider;
  latencyMs: number;
  brokerAttempted: boolean;
  brokerStatus: "ok" | "failed" | "not_connected" | "unsupported";
  failover: boolean;
  fromCache?: boolean;
}

const yahoo = new YahooMarketDataProvider();
const alphaVantage = new AlphaVantageMarketDataProvider();

const cacheProvider: MarketDataProvider = {
  code: "CACHE",
  sourceName: "Requi cached quote",
  isAvailable: async () => true,
  getQuote: async () => {
    throw new Error("cache provider is router-internal only");
  },
  getHistory: async () => {
    throw new Error("cache provider is router-internal only");
  },
};

/** Which provider WOULD serve this user (for UI source visibility). */
export async function activeProviderFor(userId: string): Promise<{ code: string; sourceName: string; brokerCapable: boolean }> {
  const broker = await BrokerMarketDataProvider.forUser(userId);
  if (broker && (await broker.isAvailable().catch(() => false))) {
    return { code: broker.code, sourceName: broker.sourceName, brokerCapable: true };
  }
  if (await alphaVantage.isAvailable()) {
    return { code: alphaVantage.code, sourceName: alphaVantage.sourceName, brokerCapable: broker !== null };
  }
  return { code: yahoo.code, sourceName: yahoo.sourceName, brokerCapable: broker !== null };
}

type QuoteAttempt = {
  provider: MarketDataProvider;
  raw: RawQuote;
  validation: ValidationResult;
  latencyMs: number;
};

function isFreshUsable(validation: ValidationResult): boolean {
  return validation.valid && !validation.stale;
}

async function attemptQuote(
  provider: MarketDataProvider,
  symbol: string,
  session: MarketSession,
): Promise<QuoteAttempt> {
  const started = Date.now();
  const raw = await provider.getQuote(symbol);
  const validation = validateMarketData(raw, symbol, session);
  return { provider, raw, validation, latencyMs: Date.now() - started };
}

async function logProviderFailure(
  userId: string,
  providerCode: string,
  symbol: string,
  err: unknown,
  fallback?: string,
): Promise<void> {
  await recordFailure(providerCode, "quote", symbol, err);
  await recordEvent("PROVIDER_FAILURE", {
    userId,
    provider: providerCode,
    symbol,
    detail: {
      error: err instanceof Error ? err.message : String(err),
      ...(fallback ? { fallback } : {}),
    },
  });
}

async function logRejectedQuote(
  userId: string,
  providerCode: string,
  symbol: string,
  validation: ValidationResult,
  fallback: string,
): Promise<void> {
  await recordFailure(providerCode, "quote", symbol, new Error(`validation failed: ${validation.reasons.join(", ")}`));
  await recordEvent(validation.stale ? "STALE_REJECTED" : "PROVIDER_FAILURE", {
    userId,
    provider: providerCode,
    symbol,
    detail: { reasons: validation.reasons, fallback },
  });
}

export async function routedQuote(userId: string, symbol: string): Promise<RoutedQuote> {
  const session = currentMarketSession();
  const sym = symbol.toUpperCase();
  let brokerAttempted = false;
  let brokerStatus: RoutedQuote["brokerStatus"] = "not_connected";
  let failover = false;

  const broker = await BrokerMarketDataProvider.forUser(userId);
  if (broker) {
    brokerAttempted = true;
    try {
      const attempt = await attemptQuote(broker, sym, session);
      if (isFreshUsable(attempt.validation)) {
        await recordSuccess("BROKER", attempt.latencyMs);
        saveLastGoodQuote(userId, sym, attempt.raw, broker);
        return {
          raw: attempt.raw,
          provider: broker,
          latencyMs: attempt.latencyMs,
          brokerAttempted: true,
          brokerStatus: "ok",
          failover: false,
        };
      }
      brokerStatus = "failed";
      await logRejectedQuote(userId, "BROKER", sym, attempt.validation, "YFINANCE");
    } catch (err) {
      brokerStatus = "failed";
      await logProviderFailure(userId, "BROKER", sym, err, "YFINANCE");
    }
    failover = true;
  } else if (broker === null) {
    brokerStatus = "not_connected";
  }

  const liveProviders: MarketDataProvider[] = [yahoo];
  if (await alphaVantage.isAvailable()) liveProviders.push(alphaVantage);

  let bestStale: QuoteAttempt | null = null;

  for (const provider of liveProviders) {
    try {
      const attempt = await attemptQuote(provider, sym, session);
      if (isFreshUsable(attempt.validation)) {
        await recordSuccess(provider.code, attempt.latencyMs);
        if (failover) {
          await recordEvent("FAILOVER", {
            userId,
            provider: provider.code,
            symbol: sym,
            detail: { from: brokerAttempted ? "BROKER" : "NONE" },
          });
        }
        saveLastGoodQuote(userId, sym, attempt.raw, provider);
        return {
          raw: attempt.raw,
          provider,
          latencyMs: attempt.latencyMs,
          brokerAttempted,
          brokerStatus,
          failover,
        };
      }
      if (attempt.validation.valid) {
        if (!bestStale || attempt.validation.age_seconds < bestStale.validation.age_seconds) {
          bestStale = attempt;
        }
      }
      const next =
        provider.code === "YFINANCE"
          ? (await alphaVantage.isAvailable()) ? "ALPHA_VANTAGE" : "CACHE"
          : "CACHE";
      await logRejectedQuote(userId, provider.code, sym, attempt.validation, next);
    } catch (err) {
      const next =
        provider.code === "YFINANCE"
          ? (await alphaVantage.isAvailable()) ? "ALPHA_VANTAGE" : "CACHE"
          : "CACHE";
      await logProviderFailure(userId, provider.code, sym, err, next);
    }
  }

  const cached = loadLastGoodQuote(userId, sym);
  if (cached) {
    await recordEvent("FAILOVER", {
      userId,
      provider: "CACHE",
      symbol: sym,
      detail: { from: "LIVE_PROVIDERS", savedAt: new Date(cached.savedAt).toISOString() },
    });
    return {
      raw: cached.raw,
      provider: cacheProvider,
      latencyMs: 0,
      brokerAttempted,
      brokerStatus,
      failover: true,
      fromCache: true,
    };
  }

  if (bestStale) {
    saveLastGoodQuote(userId, sym, bestStale.raw, bestStale.provider);
    return {
      raw: bestStale.raw,
      provider: bestStale.provider,
      latencyMs: bestStale.latencyMs,
      brokerAttempted,
      brokerStatus,
      failover: true,
    };
  }

  throw new Error(`All providers failed for ${sym}`);
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
    }
  }
  const bars = await yahoo.getHistory(symbol, period, interval);
  return { bars, provider: yahoo };
}
