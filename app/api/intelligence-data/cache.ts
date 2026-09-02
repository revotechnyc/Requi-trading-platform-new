import { TtlCache } from "../marketdata/gateway/cache";

/** Per-layer TTLs from PDF §5. */
export const LAYER_TTL_MS = {
  prices: 60_000,
  indicators: 90_000,
  news: 60_000,
  edgar: 3_600_000,
  gdelt: 15 * 60_000,
  sentiment: 15 * 60_000,
  earnings: 24 * 3_600_000,
} as const;

export const intelligenceCache = new TtlCache();
