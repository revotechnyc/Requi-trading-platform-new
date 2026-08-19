import { and, desc, eq, gte, sql } from "drizzle-orm";
import { signals } from "@db/schema";
import { getDb } from "./connection";
import { etParts } from "../marketdata/indicators";
import { etWallToUtcMs } from "../marketdata/session";

/**
 * CANONICAL SIGNAL LEDGER (Production Revision §10).
 *
 * One row per generated signal, 1:1 with its order ticket — the ticketId
 * unique constraint makes signal creation naturally idempotent (a retried
 * proposal can never double-count). "Signals Today" is computed against the
 * user's trading session (ET calendar day), and rows are durable: they
 * survive reloads and deployments because they are database state, not UI.
 *
 * Status lifecycle: GENERATED → EXECUTED | REJECTED | EXPIRED | CANCELLED.
 */

export type SignalStatus = "GENERATED" | "EXECUTED" | "REJECTED" | "EXPIRED" | "CANCELLED";

/** Called by the ticket service after a non-duplicate ticket is staged. */
export async function recordSignal(
  userId: string,
  t: {
    ticketId: string;
    strategy: string;
    symbol: string;
    side: "BUY" | "SELL";
    quantity: number;
    priceAtSignal?: number | null;
    origin: "INTELLIGENCE" | "AUTONOMOUS" | "MANUAL";
  },
): Promise<void> {
  const db = getDb();
  await db
    .insert(signals)
    .values({
      signalId: `SIG-${t.ticketId}`,
      userId,
      strategyId: t.strategy,
      symbol: t.symbol.toUpperCase(),
      side: t.side,
      signalType: "ENTRY_PROPOSAL",
      quantity: t.quantity,
      priceAtSignal: t.priceAtSignal !== undefined && t.priceAtSignal !== null ? String(t.priceAtSignal) : null,
      origin: t.origin,
      status: "GENERATED",
      ticketId: t.ticketId,
    })
    .catch((e) => {
      // ER_DUP_ENTRY = retried proposal for the same ticket — correct no-op.
      if ((e as { code?: string }).code !== "ER_DUP_ENTRY") throw e;
    });
}

/** Resolve a signal when its ticket reaches a terminal/decided state. */
export async function resolveSignal(ticketId: string, status: SignalStatus): Promise<void> {
  const db = getDb();
  await db
    .update(signals)
    .set({ status, resolvedAt: new Date() })
    .where(and(eq(signals.ticketId, ticketId), eq(signals.status, "GENERATED")))
    .catch(() => undefined);
}

/** Sweep: signals whose tickets expired are EXPIRED (called after the ticket sweep). */
export async function expireStaleSignals(userId: string): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    UPDATE signals s JOIN order_tickets t ON t.ticketId = s.ticketId
    SET s.status = 'EXPIRED', s.resolvedAt = NOW()
    WHERE s.userId = ${userId} AND s.status = 'GENERATED' AND t.state = 'EXPIRED'
  `).catch(() => undefined);
}

function etDayStartMs(): number {
  return etWallToUtcMs(etParts(Date.now()).day, 0);
}

export async function listSignals(userId: string, limit = 100) {
  const db = getDb();
  return db.select().from(signals).where(eq(signals.userId, userId)).orderBy(desc(signals.id)).limit(limit);
}

export async function listSignalsToday(userId: string) {
  const db = getDb();
  const dayStart = new Date(etDayStartMs());
  return db
    .select()
    .from(signals)
    .where(and(eq(signals.userId, userId), gte(signals.createdAt, dayStart)))
    .orderBy(desc(signals.id))
    .limit(200);
}

export async function countSignalsToday(userId: string): Promise<number> {
  const db = getDb();
  const dayStart = new Date(etDayStartMs());
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(signals)
    .where(and(eq(signals.userId, userId), gte(signals.createdAt, dayStart)));
  return Number(row?.n ?? 0);
}
