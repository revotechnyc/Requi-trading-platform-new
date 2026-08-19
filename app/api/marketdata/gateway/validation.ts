import type { MarketSession, Freshness, RawQuote, ValidationResult } from "./types";

/**
 * Deterministic market-data validation. A provider returning HTTP 200 is NOT
 * sufficient — the payload must pass structural, relational and freshness
 * checks before any module may consume it.
 */

/** Configurable freshness thresholds (seconds) by asset class and session. */
const FRESHNESS: Record<string, { fresh: number; aging: number }> = {
  "equity:REGULAR": { fresh: 15, aging: 60 },
  "equity:PREMARKET": { fresh: 30, aging: 120 },
  "equity:AFTER_HOURS": { fresh: 30, aging: 120 },
  "equity:CLOSED": { fresh: 86_400, aging: 172_800 }, // closed market: last print stays usable
  "crypto:REGULAR": { fresh: 15, aging: 60 },
  default: { fresh: 15, aging: 60 },
};

export function freshnessThresholds(assetType: string, session: MarketSession): { fresh: number; aging: number } {
  return FRESHNESS[`${assetType}:${session}`] ?? FRESHNESS[`${assetType}:REGULAR`] ?? FRESHNESS.default;
}

export function classifyFreshness(ageSeconds: number, assetType: string, session: MarketSession): Freshness {
  const t = freshnessThresholds(assetType, session);
  if (ageSeconds <= t.fresh) return "FRESH";
  if (ageSeconds <= t.aging) return "AGING";
  return "STALE";
}

/** validate_market_data() — structural + relational + freshness checks. */
export function validateMarketData(raw: RawQuote, requestedSymbol: string, session: MarketSession, now = Date.now()): ValidationResult {
  const reasons: string[] = [];

  if (!raw || typeof raw !== "object") reasons.push("empty provider response");
  if (raw.symbol?.toUpperCase() !== requestedSymbol.toUpperCase()) reasons.push("symbol mismatch");
  if (raw.price === undefined || raw.price === null || !Number.isFinite(raw.price)) reasons.push("price missing");
  else if (raw.price <= 0) reasons.push("price not positive");
  // Providers may deliver epoch ms or ISO strings — normalize before checking.
  const ts = typeof raw.timestamp === "number" ? raw.timestamp : Date.parse(String(raw.timestamp));
  if (!Number.isFinite(ts) || ts <= 0) reasons.push("timestamp missing/invalid");
  else if (ts > now + 60_000) reasons.push("timestamp in the future");

  // OHLC relationships (when present)
  const { open: o, high: h, low: l } = raw;
  if (h != null && l != null && h < l) reasons.push("high below low");
  if (h != null && raw.price > h * 1.001 && session === "REGULAR") reasons.push("price above day high");
  if (l != null && raw.price < l * 0.999 && session === "REGULAR") reasons.push("price below day low");
  if (o != null && o <= 0) reasons.push("open not positive");
  if (raw.volume != null && raw.volume < 0) reasons.push("negative volume");

  const ageSeconds = Number.isFinite(ts) ? Math.max(0, Math.round((now - ts) / 1000)) : Number.MAX_SAFE_INTEGER;
  const freshness = classifyFreshness(ageSeconds, "equity", session);
  // Staleness MARKS the data; it does not invalidate it. Consumers see
  // stale=true + reduced confidence, and the broker router uses the stale
  // flag to trigger failover. Stale is never silently relabeled fresh.
  const stale = freshness === "STALE";

  const valid = reasons.length === 0;
  return {
    valid,
    stale,
    age_seconds: ageSeconds,
    confidence: !valid ? "LOW" : stale ? "LOW" : freshness === "FRESH" ? "HIGH" : "MEDIUM",
    reasons,
  };
}
