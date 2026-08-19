import { and, eq } from "drizzle-orm";
import { alerts, domainEvents, users } from "@db/schema";
import { getDb } from "./queries/connection";
import { getMarketSession, type MarketSession } from "./marketdata/session";

/**
 * DOMAIN EVENTS (Production Revision §4, §25, §28) — the durable event spine.
 *
 * emitDomainEvent() is idempotent by construction: the caller supplies a
 * deterministic eventId and the unique constraint on domain_events.eventId
 * decides — exactly one process/restart/tab/retry wins the insert, and only
 * the winner runs the fan-out. Retries, duplicate workers, page refreshes and
 * reconnects can never produce a second notification for the same event.
 *
 * The market-session loop derives MARKET_OPENED / MARKET_CLOSED from the
 * canonical MarketSessionService — never from browser timers.
 */

/** Returns true when this call won the insert (first occurrence of the event). */
export async function emitDomainEvent(eventId: string, type: string, payload?: unknown): Promise<boolean> {
  const db = getDb();
  try {
    await db.insert(domainEvents).values({
      eventId,
      type,
      payload: payload === undefined ? null : JSON.stringify(payload),
    });
    return true;
  } catch (e) {
    // Duplicate eventId (unique constraint) = already emitted — safe no-op.
    if ((e as { code?: string }).code === "ER_DUP_ENTRY") return false;
    throw e;
  }
}

async function fanOutMarketAlert(eventId: string, title: string, body: string): Promise<void> {
  const db = getDb();
  const allUsers = await db.select({ id: users.id }).from(users);
  for (const u of allUsers) {
    const existing = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(and(eq(alerts.userId, u.id), eq(alerts.dedupeKey, eventId)))
      .limit(1);
    if (existing.length > 0) continue;
    await db
      .insert(alerts)
      .values({ userId: u.id, type: "SYSTEM_STATE", priority: "MEDIUM", title, body, dedupeKey: eventId })
      .catch(() => undefined);
  }
}

/* ---------- market-session transition watcher (§4) ---------- */

let sessionLoopStarted = false;
let lastRegularOpen: boolean | null = null;
let ticking = false;

async function sessionTick(): Promise<void> {
  if (ticking) return; // re-entrancy guard
  ticking = true;
  try {
    const s: MarketSession = getMarketSession();
    const regularOpen = s.state === "OPEN" || s.state === "EARLY_CLOSE_SESSION";
    if (lastRegularOpen === null) {
      // First tick after boot establishes the baseline — no catch-up storm.
      lastRegularOpen = regularOpen;
      return;
    }
    if (regularOpen && !lastRegularOpen) {
      const eventId = `MARKET_OPENED:${s.tradingDate}`;
      if (await emitDomainEvent(eventId, "MARKET_OPENED", { tradingDate: s.tradingDate, source: s.source })) {
        await fanOutMarketAlert(eventId, "NYSE Market Open", "Regular trading is now open.");
      }
    } else if (!regularOpen && lastRegularOpen) {
      const eventId = `MARKET_CLOSED:${s.tradingDate}`;
      if (await emitDomainEvent(eventId, "MARKET_CLOSED", { tradingDate: s.tradingDate, source: s.source })) {
        await fanOutMarketAlert(eventId, "NYSE Market Closed", "The regular session has ended.");
      }
    }
    lastRegularOpen = regularOpen;
  } finally {
    ticking = false;
  }
}

/** 30-second watcher. Baseline on first tick; transitions only thereafter. */
export function ensureSessionLoop(): void {
  if (sessionLoopStarted) return;
  sessionLoopStarted = true;
  const t = setInterval(() => void sessionTick().catch(() => undefined), 30_000);
  if (typeof t.unref === "function") t.unref();
  void sessionTick().catch(() => undefined);
}
