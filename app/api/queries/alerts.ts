import { getDb } from "./connection";
import { alerts } from "@db/schema";
import { and, desc, eq } from "drizzle-orm";

export async function findAlertsByUser(userId: string) {
  return getDb()
    .select()
    .from(alerts)
    .where(eq(alerts.userId, userId))
    .orderBy(desc(alerts.createdAt), desc(alerts.id))
    .limit(50);
}

export async function markAlertRead(userId: string, id: string) {
  await getDb()
    .update(alerts)
    .set({ read: true })
    .where(and(eq(alerts.id, id), eq(alerts.userId, userId)));
}

export async function markAllAlertsRead(userId: string) {
  await getDb().update(alerts).set({ read: true }).where(eq(alerts.userId, userId));
}

/** Respond to a CONFIRMATION_REQUEST alert — simulated order gateway. */
export async function respondToConfirmation(userId: string, id: string, accept: boolean) {
  const db = getDb();
  const [req] = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.id, id), eq(alerts.userId, userId)))
    .limit(1);
  if (!req || req.type !== "CONFIRMATION_REQUEST") return { ok: false as const };

  await db
    .update(alerts)
    .set({ read: true, state: accept ? "EXECUTING" : "REJECTED" })
    .where(eq(alerts.id, id));

  await db.insert(alerts).values({
    userId,
    type: accept ? "EXECUTION" : "SYSTEM_STATE",
    priority: accept ? "HIGH" : "LOW",
    title: accept ? "Order Executed" : "Order Rejected by User",
    body: accept
      ? `Ticket confirmed by user · ${req.symbol ?? "Order"} submitted to paper execution simulator · Awaiting fill confirmation`
      : "Ticket rejected by user · Strategy returned to SCAN state · No order submitted",
    symbol: req.symbol ?? undefined,
    state: accept ? "EXECUTING" : "WATCHING",
  });
  return { ok: true as const, accepted: accept };
}
