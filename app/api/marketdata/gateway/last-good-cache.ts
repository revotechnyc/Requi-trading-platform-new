import { gatewayCache } from "./cache";
import type { MarketDataProvider, RawQuote } from "./types";

const LAST_GOOD_TTL_MS = 24 * 3_600_000;

export type LastGoodQuote = {
  raw: RawQuote;
  provider: MarketDataProvider;
  savedAt: number;
};

export function saveLastGoodQuote(userId: string, symbol: string, raw: RawQuote, provider: MarketDataProvider): void {
  gatewayCache.set(
    lastGoodKey(userId, symbol),
    { raw, provider, savedAt: Date.now() } satisfies LastGoodQuote,
    LAST_GOOD_TTL_MS,
  );
}

export function loadLastGoodQuote(userId: string, symbol: string): LastGoodQuote | null {
  return gatewayCache.get<LastGoodQuote>(lastGoodKey(userId, symbol));
}

function lastGoodKey(userId: string, symbol: string): string {
  return `lastgood:${userId}:${symbol.toUpperCase()}`;
}
