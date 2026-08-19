import { eq, sql } from "drizzle-orm";
import { getDb } from "../../queries/connection";
import { marketDataErrors, marketDataEvents, marketDataProviderHealth, marketSnapshots } from "@db/schema";
import type { GatewayIndicators } from "./indicators";
import type { UnifiedMarketSnapshot } from "./types";

/**
 * Gateway persistence — provider health, failures/failovers (never silently
 * lose the original error, spec §5), and snapshots served to consumers.
 * Failures here must never break market data delivery.
 */

export async function recordSuccess(provider: string, latencyMs: number): Promise<void> {
  try {
    await getDb()
      .insert(marketDataProviderHealth)
      .values({ provider, status: "HEALTHY", lastSuccessAt: new Date(), latencyMs, failureCount: 0, detail: null })
      .onConflictDoUpdate({
        target: marketDataProviderHealth.provider,
        set: { status: "HEALTHY", lastSuccessAt: new Date(), latencyMs, failureCount: 0, detail: null },
      });
  } catch (e) {
    console.error("[marketdata] health write failed:", (e as Error).message);
  }
}

export async function recordFailure(provider: string, operation: string, symbol: string | null, err: unknown): Promise<void> {
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
  try {
    const db = getDb();
    await db.insert(marketDataErrors).values({ provider, symbol, operation, message });
    await db
      .insert(marketDataProviderHealth)
      .values({ provider, status: "DEGRADED", lastFailureAt: new Date(), failureCount: 1, detail: message })
      .onConflictDoUpdate({
        target: marketDataProviderHealth.provider,
        set: {
          lastFailureAt: new Date(),
          detail: message,
          failureCount: sql`${marketDataProviderHealth.failureCount} + 1`,
          status: sql`CASE WHEN ${marketDataProviderHealth.failureCount} + 1 >= 5 THEN 'UNAVAILABLE' ELSE 'DEGRADED' END`,
        },
      });
  } catch (e) {
    console.error("[marketdata] failure write failed:", (e as Error).message);
  }
}

export async function recordEvent(
  kind: "PROVIDER_FAILURE" | "FAILOVER" | "SOURCE_CHANGED" | "STALE_REJECTED" | "UNAVAILABLE",
  opts: { userId?: string; provider?: string; symbol?: string; detail?: unknown },
): Promise<void> {
  try {
    await getDb()
      .insert(marketDataEvents)
      .values({
        userId: opts.userId ?? null,
        kind,
        provider: opts.provider ?? null,
        symbol: opts.symbol ?? null,
        detail: opts.detail === undefined ? null : JSON.stringify(opts.detail),
      });
  } catch (e) {
    console.error("[marketdata] event write failed:", (e as Error).message);
  }
}

/** Durable record of a snapshot actually served to a consumer (what the AI saw). */
export async function recordSnapshot(
  userId: string,
  snapshot: UnifiedMarketSnapshot,
  indicators: GatewayIndicators | null,
  consumedBy: "INTELLIGENCE" | "AUTONOMOUS",
): Promise<void> {
  try {
    await getDb()
      .insert(marketSnapshots)
      .values({
        userId,
        symbol: snapshot.symbol,
        source: snapshot.source,
        sourceName: snapshot.source_name,
        snapshot: JSON.stringify(snapshot),
        indicators: indicators ? JSON.stringify(indicators) : null,
        validation: JSON.stringify(snapshot.validation),
        consumedBy,
      });
  } catch (e) {
    console.error("[marketdata] snapshot write failed:", (e as Error).message);
  }
}

export async function providerHealth(): Promise<(typeof marketDataProviderHealth.$inferSelect)[]> {
  try {
    return await getDb().select().from(marketDataProviderHealth);
  } catch {
    return [];
  }
}

export async function recentEvents(userId: string, limit = 20) {
  try {
    return await getDb()
      .select()
      .from(marketDataEvents)
      .where(eq(marketDataEvents.userId, userId))
      .orderBy(marketDataEvents.createdAt)
      .limit(limit);
  } catch {
    return [];
  }
}
