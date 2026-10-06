import { getDb } from "./connection";
import { alerts } from "@db/schema";
import { and, desc, eq } from "drizzle-orm";
import { confirmTicket, rejectTicket } from "./tickets";

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

function extractTicketId(alert: { body?: string | null; title?: string | null }): string | null {
  const text = `${alert.title ?? ""}\n${alert.body ?? ""}`;
  const confirm = text.match(/CONFIRM ORDER\s+([A-Za-z0-9-]+)/i);
  if (confirm?.[1]) return confirm[1].toUpperCase();
  const ticket = text.match(/\bTicket\s+([A-Za-z0-9-]+)/i);
  return ticket?.[1]?.toUpperCase() ?? null;
}

/** Respond to a CONFIRMATION_REQUEST alert — routes through the real ticket gate (IBKR Paper / PAPER). */
export async function respondToConfirmation(userId: string, id: string, accept: boolean) {
  const db = getDb();
  const [req] = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.id, id), eq(alerts.userId, userId)))
    .limit(1);
  if (!req || req.type !== "CONFIRMATION_REQUEST") return { ok: false as const };

  const ticketId = extractTicketId(req);
  if (!ticketId) {
    await db.update(alerts).set({ read: true, state: "ERROR" }).where(eq(alerts.id, id));
    return { ok: false as const, accepted: accept, message: "Could not find ticket id on this confirmation alert." };
  }

  if (accept) {
    const confirmation = `CONFIRM ORDER ${ticketId}`;
    const res = await confirmTicket(userId, ticketId, confirmation);
    await db
      .update(alerts)
      .set({ read: true, state: res.ok ? "EXECUTING" : "ERROR" })
      .where(eq(alerts.id, id));
    await db.insert(alerts).values({
      userId,
      type: res.ok ? "EXECUTION" : "SYSTEM_STATE",
      priority: res.ok ? "HIGH" : "HIGH",
      title: res.ok ? "Order Submitted" : "Confirmation Failed",
      body: res.ok
        ? `Ticket ${ticketId} confirmed · ${res.message}`
        : `Ticket ${ticketId} could not be confirmed (${res.reasonCode}): ${res.message}`,
      symbol: req.symbol ?? undefined,
      state: res.ok ? "EXECUTING" : "WATCHING",
    });
    return { ok: res.ok as boolean, accepted: true as const, ticketId, message: res.message };
  }

  const res = await rejectTicket(userId, ticketId);
  await db.update(alerts).set({ read: true, state: "REJECTED" }).where(eq(alerts.id, id));
  await db.insert(alerts).values({
    userId,
    type: "SYSTEM_STATE",
    priority: "LOW",
    title: "Order Rejected by User",
    body: res.ok
      ? `Ticket ${ticketId} rejected · no order submitted`
      : `Reject failed for ${ticketId}: ${res.message}`,
    symbol: req.symbol ?? undefined,
    state: "WATCHING",
  });
  return { ok: res.ok as boolean, accepted: false as const, ticketId, message: res.message };
}
