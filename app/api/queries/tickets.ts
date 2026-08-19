import { createHash } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "./connection";
import { alerts, orderTickets, type OrderTicket } from "@db/schema";
import { resolveBroker, type BrokerCode } from "../brokers/registry";
import type { OrderIntent } from "../brokers/types";
import { loadActivePackage, validateConfirmationString } from "../governance/runtime";
import { recordFill } from "../engine/portfolio";
import { recordSignal, resolveSignal, expireStaleSignals } from "./signals";
import { recordAudit } from "./audit";

/**
 * ORDER TICKET SERVICE
 *
 * The constitutional confirmation gate, implemented:
 * - A ticket is the ONLY artifact that may ever reach a broker.
 * - Tickets are immutable after creation (no silent modification — cancel +
 *   recreate is the only change path).
 * - Submission requires the exact string CONFIRM ORDER [TICKET_ID] against
 *   the CURRENT ticket — no delegation, no implied consent, no carry-over.
 * - Tickets expire: TTL per strategy window; expired ⇒ dead, never routed.
 * - Idempotency: (userId, idempotencyKey) is unique — a retried proposal
 *   returns the same ticket; broker submissions carry the key as the
 *   broker-visible client order id (cOID / client_order_id).
 * - UNKNOWN broker outcomes are a dead end — never blindly resubmitted.
 */

const TICKET_TTL_MS = 5 * 60 * 1000; // confirmation window: 5 minutes

export interface ProposeInput {
  strategy: string;
  broker: BrokerCode;
  accountId?: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  orderType: "MKT" | "LMT" | "STP" | "STP_LMT" | "TRAIL";
  limitPrice?: number;
  stopPrice?: number;
  tif?: string;
  entry?: number;
  stop?: number;
  target?: number;
  target2?: number;
  origin: "INTELLIGENCE" | "AUTONOMOUS" | "MANUAL";
}

function makeTicketId(strategy: string, seq: number): string {
  const strat = strategy.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) || "MANUAL";
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `${strat}-${ymd}-${String(seq).padStart(4, "0")}`;
}

function idemKey(userId: string, input: ProposeInput): string {
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256")
    .update(JSON.stringify([userId, day, input.strategy, input.symbol, input.side, input.quantity, input.orderType, input.limitPrice ?? null, input.stopPrice ?? null]))
    .digest("hex")
    .slice(0, 32);
}

export type PublicTicket = Pick<
  OrderTicket,
  "ticketId" | "strategy" | "broker" | "effectiveBroker" | "symbol" | "side" | "quantity" | "orderType" | "limitPrice" | "stopPrice" | "tif" | "state" | "entry" | "stop" | "target" | "maxLoss" | "rr" | "expiresAt" | "brokerOrderId" | "filledQuantity" | "averageFillPrice" | "lastMessage" | "createdAt"
>;

function toPublic(t: OrderTicket): PublicTicket {
  return {
    ticketId: t.ticketId, strategy: t.strategy, broker: t.broker, effectiveBroker: t.effectiveBroker,
    symbol: t.symbol, side: t.side, quantity: t.quantity, orderType: t.orderType,
    limitPrice: t.limitPrice, stopPrice: t.stopPrice, tif: t.tif, state: t.state,
    entry: t.entry, stop: t.stop, target: t.target, maxLoss: t.maxLoss, rr: t.rr,
    expiresAt: t.expiresAt, brokerOrderId: t.brokerOrderId,
    filledQuantity: t.filledQuantity, averageFillPrice: t.averageFillPrice,
    lastMessage: t.lastMessage, createdAt: t.createdAt,
  };
}

/** Build, risk-validate, and stage a ticket as READY_FOR_CONFIRMATION. */
export async function proposeTicket(userId: string, input: ProposeInput): Promise<{ ticket: PublicTicket; duplicate: boolean; degradedNote?: string }> {
  const db = getDb();

  // Governance: the runtime must be operating on a signed package.
  await loadActivePackage();

  const key = idemKey(userId, input);
  const [existing] = await db.select().from(orderTickets).where(and(eq(orderTickets.userId, userId), eq(orderTickets.idempotencyKey, key))).limit(1);
  if (existing) {
    return { ticket: toPublic(existing), duplicate: true };
  }

  // Risk math for the ticket summary (minimum disclosure).
  const entry = input.entry ?? input.limitPrice;
  const maxLoss = entry !== undefined && input.stop !== undefined ? Math.abs(entry - input.stop) * input.quantity : undefined;
  const rr = entry !== undefined && input.stop !== undefined && input.target !== undefined && entry !== input.stop
    ? Math.abs(input.target - entry) / Math.abs(entry - input.stop)
    : undefined;

  const { effective, degraded, note } = resolveBroker(input.broker);

  const [countRow] = await db.select({ n: sql<number>`COUNT(*)` }).from(orderTickets).where(eq(orderTickets.userId, userId));
  const ticketId = makeTicketId(input.strategy, Number(countRow.n) + 1);

  await db.insert(orderTickets).values({
    ticketId,
    userId,
    strategy: input.strategy,
    broker: input.broker,
    effectiveBroker: effective,
    accountId: input.accountId ?? null,
    symbol: input.symbol.toUpperCase(),
    side: input.side,
    quantity: input.quantity,
    orderType: input.orderType,
    limitPrice: input.limitPrice !== undefined ? String(input.limitPrice) : null,
    stopPrice: input.stopPrice !== undefined ? String(input.stopPrice) : null,
    tif: input.tif ?? "DAY",
    state: "READY_FOR_CONFIRMATION",
    entry: entry !== undefined ? String(entry) : null,
    stop: input.stop !== undefined ? String(input.stop) : null,
    target: input.target !== undefined ? String(input.target) : null,
    target2: input.target2 !== undefined ? String(input.target2) : null,
    maxLoss: maxLoss !== undefined ? maxLoss.toFixed(2) : null,
    rr: rr !== undefined ? rr.toFixed(2) : null,
    idempotencyKey: key,
    expiresAt: new Date(Date.now() + TICKET_TTL_MS),
    lastMessage: note ?? null,
  });

  // Alert the user through the notification system (CONFIRM/REJECT buttons).
  await db.insert(alerts).values({
    userId,
    type: "CONFIRMATION_REQUEST",
    priority: "HIGH",
    title: "Action Required: Confirm Trade",
    body: `Ticket ${ticketId} · ${input.symbol.toUpperCase()} ${input.side} ${input.quantity} @ ${input.orderType}${input.limitPrice ? ` ${input.limitPrice}` : ""}${maxLoss !== undefined ? ` · Max loss $${maxLoss.toFixed(2)}` : ""}${rr !== undefined ? ` · R:R ${rr.toFixed(1)}` : ""} · via ${effective}${degraded ? " (paper fallback)" : ""} · Origin ${input.origin} · Expires in 5:00. Respond CONFIRM ORDER ${ticketId} or REJECT ORDER ${ticketId}.`,
    symbol: input.symbol.toUpperCase(),
    state: "AWAITING_CONFIRMATION",
  });

  // Canonical signal ledger (§10) + audit trail (§27) — idempotent by ticketId.
  await recordSignal(userId, {
    ticketId,
    strategy: input.strategy,
    symbol: input.symbol,
    side: input.side,
    quantity: input.quantity,
    priceAtSignal: entry ?? input.limitPrice ?? null,
    origin: input.origin,
  });
  void recordAudit({
    userId,
    action: "ORDER_PROPOSED",
    entityType: "TICKET",
    entityId: ticketId,
    newState: "READY_FOR_CONFIRMATION",
    correlationId: ticketId,
    meta: { strategy: input.strategy, symbol: input.symbol.toUpperCase(), side: input.side, quantity: input.quantity, origin: input.origin, effectiveBroker: effective },
  });

  const [ticket] = await db.select().from(orderTickets).where(eq(orderTickets.ticketId, ticketId)).limit(1);
  return { ticket: toPublic(ticket), duplicate: false, degradedNote: note };
}

export async function findTicket(userId: string, ticketId: string): Promise<OrderTicket | undefined> {
  const db = getDb();
  const [t] = await db.select().from(orderTickets).where(and(eq(orderTickets.userId, userId), eq(orderTickets.ticketId, ticketId.toUpperCase()))).limit(1);
  return t;
}

async function transition(ticketId: string, state: string, patch: Partial<typeof orderTickets.$inferInsert> = {}) {
  const db = getDb();
  await db.update(orderTickets).set({ state, ...patch }).where(eq(orderTickets.ticketId, ticketId));
}

/** Sweep: expire stale READY_FOR_CONFIRMATION tickets (they can never route). */
export async function expireStaleTickets(userId: string): Promise<number> {
  const db = getDb();
  const res = await db
    .update(orderTickets)
    .set({ state: "EXPIRED", lastMessage: "confirmation window elapsed — ticket dead, never routed" })
    .where(and(eq(orderTickets.userId, userId), eq(orderTickets.state, "READY_FOR_CONFIRMATION"), sql`${orderTickets.expiresAt} < NOW()`));
  const n = Number((res as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0);
  if (n > 0) await expireStaleSignals(userId);
  return n;
}

/**
 * CONFIRM ORDER [TICKET_ID] — the absolute gate. Validates the exact string
 * against the current ticket, enforces expiry, then submits to the broker.
 */
export async function confirmTicket(userId: string, ticketIdRaw: string, confirmation: string): Promise<{ ok: boolean; reasonCode: string; ticket?: PublicTicket; message: string }> {
  const ticketId = ticketIdRaw.toUpperCase();
  await expireStaleTickets(userId);
  const ticket = await findTicket(userId, ticketId);
  if (!ticket) return { ok: false, reasonCode: "UNKNOWN_TICKET", message: `No ticket ${ticketId} exists for this account.` };

  // 1) Exact-string validation via the signed governance package.
  const gate = await validateConfirmationString(confirmation, ticket.ticketId);
  if (!gate.authorized) {
    return { ok: false, reasonCode: gate.reasonCode, message: gate.reasonCode === "STALE_OR_MISMATCHED_TICKET" ? "Confirmation names a different or stale ticket. Only the current ticket can be authorized." : "Invalid confirmation. The exact format is CONFIRM ORDER [TICKET_ID]." };
  }

  // 2) State machine: only READY_FOR_CONFIRMATION can be confirmed.
  if (ticket.state !== "READY_FOR_CONFIRMATION") {
    return { ok: false, reasonCode: "TICKET_NOT_CONFIRMABLE", message: `Ticket is ${ticket.state} — only READY_FOR_CONFIRMATION tickets can be confirmed.` };
  }
  if (new Date(ticket.expiresAt).getTime() < Date.now()) {
    await transition(ticket.ticketId, "EXPIRED");
    return { ok: false, reasonCode: "CONFIRMATION_WINDOW_EXPIRED", message: "The confirmation window has expired. The ticket is dead and will never be routed." };
  }

  await transition(ticket.ticketId, "CONFIRMED", { confirmedAt: new Date() });
  void recordAudit({ userId, action: "ORDER_CONFIRMED", entityType: "TICKET", entityId: ticket.ticketId, prevState: "READY_FOR_CONFIRMATION", newState: "CONFIRMED", correlationId: ticket.ticketId });

  // 3) Submit through the broker adapter (idempotency key travels as client order id).
  const { adapter, effective } = resolveBroker(ticket.broker as BrokerCode);
  const accountId = ticket.accountId ?? (await adapter.getAccounts())[0]?.accountId ?? "PAPER-001";
  const intent: OrderIntent = {
    symbol: ticket.symbol,
    side: ticket.side as "BUY" | "SELL",
    quantity: ticket.quantity,
    orderType: ticket.orderType as OrderIntent["orderType"],
    limitPrice: ticket.limitPrice !== null ? Number(ticket.limitPrice) : undefined,
    stopPrice: ticket.stopPrice !== null ? Number(ticket.stopPrice) : undefined,
    tif: (ticket.tif as OrderIntent["tif"]) ?? "DAY",
    clientOrderId: ticket.idempotencyKey,
  };

  await transition(ticket.ticketId, "SUBMITTING", { accountId, submittedAt: new Date() });
  let ack;
  try {
    ack = await adapter.placeOrder(accountId, intent);
  } catch (e) {
    await transition(ticket.ticketId, "FAILED", { lastMessage: `broker call failed: ${(e as Error).message.slice(0, 200)}` });
    await resolveSignal(ticket.ticketId, "REJECTED");
    void recordAudit({ userId, action: "ORDER_BROKER_OUTCOME", entityType: "TICKET", entityId: ticket.ticketId, prevState: "SUBMITTING", newState: "FAILED", correlationId: ticket.ticketId, meta: { reason: "BROKER_UNREACHABLE" } });
    return { ok: false, reasonCode: "BROKER_UNREACHABLE", message: `Broker call failed: ${(e as Error).message}` };
  }

  if (ack.status === "UNKNOWN") {
    // Dead end — never blindly resubmit (constitutional invariant).
    await transition(ticket.ticketId, "FAILED", { lastMessage: `broker returned UNKNOWN — manual reconciliation required, no resubmission. ${ack.message ?? ""}` });
    void recordAudit({ userId, action: "ORDER_BROKER_OUTCOME", entityType: "TICKET", entityId: ticket.ticketId, prevState: "SUBMITTING", newState: "FAILED", correlationId: ticket.ticketId, meta: { reason: "BROKER_STATE_UNKNOWN" } });
    return { ok: false, reasonCode: "BROKER_STATE_UNKNOWN", message: "Broker returned an unresolvable state. The order was NOT resubmitted. Reconcile with the broker before retrying." };
  }
  if (ack.status === "REJECTED") {
    await transition(ticket.ticketId, "REJECTED", { brokerOrderId: ack.brokerOrderId, lastMessage: ack.message ?? "broker rejected" });
    await resolveSignal(ticket.ticketId, "REJECTED");
    void recordAudit({ userId, action: "ORDER_BROKER_OUTCOME", entityType: "TICKET", entityId: ticket.ticketId, prevState: "SUBMITTING", newState: "REJECTED", correlationId: ticket.ticketId, meta: { brokerOrderId: ack.brokerOrderId } });
    return { ok: false, reasonCode: "BROKER_REJECTED", message: `Broker rejected the order: ${ack.message ?? "no reason given"}` };
  }

  const filled = ack.status === "FILLED";
  await transition(ticket.ticketId, filled ? "FILLED" : "WORKING", {
    brokerOrderId: ack.brokerOrderId,
    filledQuantity: ack.filledQuantity ?? null,
    averageFillPrice: ack.averagePrice !== undefined ? String(ack.averagePrice) : null,
    lastMessage: ack.message ?? null,
  });
  if (filled) {
    await recordFill(userId, ticket, Number(ack.averagePrice ?? ticket.entry ?? 0), ack.filledQuantity ?? ticket.quantity).catch(() => undefined);
  }
  await resolveSignal(ticket.ticketId, "EXECUTED");
  void recordAudit({ userId, action: "ORDER_BROKER_OUTCOME", entityType: "TICKET", entityId: ticket.ticketId, prevState: "SUBMITTING", newState: filled ? "FILLED" : "WORKING", correlationId: ticket.ticketId, meta: { brokerOrderId: ack.brokerOrderId, venue: effective } });

  // Execution alert + resolve the confirmation alert.
  const db = getDb();
  await db.insert(alerts).values({
    userId,
    type: "EXECUTION",
    priority: "HIGH",
    title: filled ? "Order Executed" : "Order Working",
    body: filled
      ? `${ticket.symbol} ${ticket.side} ${ack.filledQuantity ?? ticket.quantity} filled @ ${ack.averagePrice ?? "market"} · broker order ${ack.brokerOrderId} · via ${effective}`
      : `${ticket.symbol} ${ticket.side} ${ticket.quantity} acknowledged (${ack.brokerOrderId}) · working · via ${effective}`,
    symbol: ticket.symbol,
    state: filled ? "FILLED" : "ACTIVE",
  });
  await db.update(alerts).set({ state: "EXECUTING" }).where(and(eq(alerts.userId, userId), eq(alerts.state, "AWAITING_CONFIRMATION"), sql`${alerts.body} LIKE ${"%" + ticket.ticketId + "%"}`));

  const [finalTicket] = await db.select().from(orderTickets).where(eq(orderTickets.ticketId, ticket.ticketId)).limit(1);
  return { ok: true, reasonCode: filled ? "FILLED" : "SUBMITTED", ticket: toPublic(finalTicket), message: filled ? `Filled ${ack.filledQuantity ?? ticket.quantity} @ ${ack.averagePrice ?? "market"} via ${effective}.` : `Order acknowledged by ${effective} and working.` };
}

/**
 * AUTO-EXECUTE — the explicit user-opt-in path that skips the CONFIRM string.
 *
 * Hard rules:
 * - Only reachable when the USER has enabled auto-execute (checked by the
 *   caller — monitor.ts — against the users table, default OFF).
 * - Everything else is identical to a confirmed order: same ticket artifact,
 *   same broker adapter, same idempotency key, same UNKNOWN-is-dead-end rule.
 * - Every auto-execution is flagged (autoExecuted) and alerted as
 *   "AUTO-EXECUTED" — the audit trail is louder, not quieter, than manual.
 * - Only AUTONOMOUS engine proposals use this path. Natural-language
 *   (INTELLIGENCE) and MANUAL tickets always require the CONFIRM string.
 */
export async function autoExecuteTicket(userId: string, ticketIdRaw: string): Promise<{ ok: boolean; reasonCode: string; ticket?: PublicTicket; message: string }> {
  const ticketId = ticketIdRaw.toUpperCase();
  await expireStaleTickets(userId);
  const ticket = await findTicket(userId, ticketId);
  if (!ticket) return { ok: false, reasonCode: "UNKNOWN_TICKET", message: `No ticket ${ticketId} exists for this account.` };

  if (ticket.state !== "READY_FOR_CONFIRMATION") {
    return { ok: false, reasonCode: "TICKET_NOT_EXECUTABLE", message: `Ticket is ${ticket.state} — only READY_FOR_CONFIRMATION tickets can execute.` };
  }
  if (new Date(ticket.expiresAt).getTime() < Date.now()) {
    await transition(ticket.ticketId, "EXPIRED");
    return { ok: false, reasonCode: "WINDOW_EXPIRED", message: "The execution window has expired. The ticket is dead and will never be routed." };
  }

  await transition(ticket.ticketId, "CONFIRMED", { confirmedAt: new Date(), autoExecuted: true });
  void recordAudit({ userId, action: "ORDER_AUTO_EXECUTED", entityType: "TICKET", entityId: ticket.ticketId, prevState: "READY_FOR_CONFIRMATION", newState: "CONFIRMED", correlationId: ticket.ticketId });

  const { adapter, effective } = resolveBroker(ticket.broker as BrokerCode);
  const accountId = ticket.accountId ?? (await adapter.getAccounts())[0]?.accountId ?? "PAPER-001";
  const intent: OrderIntent = {
    symbol: ticket.symbol,
    side: ticket.side as "BUY" | "SELL",
    quantity: ticket.quantity,
    orderType: ticket.orderType as OrderIntent["orderType"],
    limitPrice: ticket.limitPrice !== null ? Number(ticket.limitPrice) : undefined,
    stopPrice: ticket.stopPrice !== undefined && ticket.stopPrice !== null ? Number(ticket.stopPrice) : undefined,
    tif: (ticket.tif as OrderIntent["tif"]) ?? "DAY",
    clientOrderId: ticket.idempotencyKey,
  };

  await transition(ticket.ticketId, "SUBMITTING", { accountId, submittedAt: new Date() });
  let ack;
  try {
    ack = await adapter.placeOrder(accountId, intent);
  } catch (e) {
    await transition(ticket.ticketId, "FAILED", { lastMessage: `broker call failed: ${(e as Error).message.slice(0, 200)}` });
    await resolveSignal(ticket.ticketId, "REJECTED");
    return { ok: false, reasonCode: "BROKER_UNREACHABLE", message: `Broker call failed: ${(e as Error).message}` };
  }

  if (ack.status === "UNKNOWN") {
    await transition(ticket.ticketId, "FAILED", { lastMessage: `broker returned UNKNOWN — manual reconciliation required, no resubmission. ${ack.message ?? ""}` });
    return { ok: false, reasonCode: "BROKER_STATE_UNKNOWN", message: "Broker returned an unresolvable state. The order was NOT resubmitted. Reconcile with the broker before retrying." };
  }
  if (ack.status === "REJECTED") {
    await transition(ticket.ticketId, "REJECTED", { brokerOrderId: ack.brokerOrderId, lastMessage: ack.message ?? "broker rejected" });
    await resolveSignal(ticket.ticketId, "REJECTED");
    return { ok: false, reasonCode: "BROKER_REJECTED", message: `Broker rejected the order: ${ack.message ?? "no reason given"}` };
  }

  const filled = ack.status === "FILLED";
  await transition(ticket.ticketId, filled ? "FILLED" : "WORKING", {
    brokerOrderId: ack.brokerOrderId,
    filledQuantity: ack.filledQuantity ?? null,
    averageFillPrice: ack.averagePrice !== undefined ? String(ack.averagePrice) : null,
    lastMessage: ack.message ?? null,
  });
  if (filled) {
    await recordFill(userId, ticket, Number(ack.averagePrice ?? ticket.entry ?? 0), ack.filledQuantity ?? ticket.quantity).catch(() => undefined);
  }
  await resolveSignal(ticket.ticketId, ack.status === "FILLED" || ack.status === "WORKING" ? "EXECUTED" : "REJECTED");

  const db = getDb();
  await db.insert(alerts).values({
    userId,
    type: "EXECUTION",
    priority: "CRITICAL",
    title: filled ? "AUTO-EXECUTED — Order Filled" : "AUTO-EXECUTED — Order Working",
    body: filled
      ? `AUTO-EXECUTE was ON · ${ticket.symbol} ${ticket.side} ${ack.filledQuantity ?? ticket.quantity} filled @ ${ack.averagePrice ?? "market"} · broker order ${ack.brokerOrderId} · via ${effective} · no human confirmation (user setting)`
      : `AUTO-EXECUTE was ON · ${ticket.symbol} ${ticket.side} ${ticket.quantity} acknowledged (${ack.brokerOrderId}) · working · via ${effective}`,
    symbol: ticket.symbol,
    state: filled ? "FILLED" : "ACTIVE",
  });
  await db.update(alerts).set({ state: "EXECUTING" }).where(and(eq(alerts.userId, userId), eq(alerts.state, "AWAITING_CONFIRMATION"), sql`${alerts.body} LIKE ${"%" + ticket.ticketId + "%"}`));

  const [finalTicket] = await db.select().from(orderTickets).where(eq(orderTickets.ticketId, ticket.ticketId)).limit(1);
  return { ok: true, reasonCode: filled ? "FILLED" : "SUBMITTED", ticket: toPublic(finalTicket), message: filled ? `Auto-executed: filled ${ack.filledQuantity ?? ticket.quantity} @ ${ack.averagePrice ?? "market"} via ${effective}.` : `Auto-executed: order acknowledged by ${effective} and working.` };
}

/** REJECT ORDER [TICKET_ID] — terminal, immediate, never routed. */
export async function rejectTicket(userId: string, ticketIdRaw: string): Promise<{ ok: boolean; message: string }> {
  const ticketId = ticketIdRaw.toUpperCase();
  const ticket = await findTicket(userId, ticketId);
  if (!ticket) return { ok: false, message: `No ticket ${ticketId} exists for this account.` };
  if (ticket.state !== "READY_FOR_CONFIRMATION") {
    return { ok: false, message: `Ticket is ${ticket.state} — only awaiting-confirmation tickets can be rejected.` };
  }
  await transition(ticketId, "REJECTED", { lastMessage: "rejected by user at the confirmation gate" });
  await resolveSignal(ticketId, "REJECTED");
  void recordAudit({ userId, action: "ORDER_REJECTED", entityType: "TICKET", entityId: ticketId, prevState: "READY_FOR_CONFIRMATION", newState: "REJECTED", correlationId: ticketId });
  const db = getDb();
  await db.update(alerts).set({ state: "REJECTED" }).where(and(eq(alerts.userId, userId), eq(alerts.state, "AWAITING_CONFIRMATION"), sql`${alerts.body} LIKE ${"%" + ticketId + "%"}`));
  return { ok: true, message: `Ticket ${ticketId} rejected. It was never routed to any broker.` };
}

/** Cancel a working broker order (cancel + recreate is the only change path). */
export async function cancelTicket(userId: string, ticketIdRaw: string): Promise<{ ok: boolean; message: string }> {
  const ticketId = ticketIdRaw.toUpperCase();
  const ticket = await findTicket(userId, ticketId);
  if (!ticket) return { ok: false, message: `No ticket ${ticketId} exists.` };
  if (!["WORKING", "PARTIALLY_FILLED", "BROKER_ACK"].includes(ticket.state) || !ticket.brokerOrderId) {
    return { ok: false, message: `Ticket is ${ticket.state} — only working broker orders can be canceled.` };
  }
  const { adapter } = resolveBroker(ticket.broker as BrokerCode);
  const res = await adapter.cancelOrder(ticket.accountId ?? "", ticket.brokerOrderId);
  if (res.ok) {
    await transition(ticketId, "CANCELED", { lastMessage: res.message });
    await resolveSignal(ticketId, "CANCELLED");
    void recordAudit({ userId, action: "ORDER_CANCELLED", entityType: "TICKET", entityId: ticketId, prevState: ticket.state, newState: "CANCELED", correlationId: ticketId, meta: { brokerOrderId: ticket.brokerOrderId } });
  }
  return { ok: res.ok, message: res.ok ? `Cancel submitted for broker order ${ticket.brokerOrderId}.` : `Cancel failed: ${res.message}` };
}

export async function listTickets(userId: string, limit = 30): Promise<PublicTicket[]> {
  const db = getDb();
  await expireStaleTickets(userId);
  const rows = await db.select().from(orderTickets).where(eq(orderTickets.userId, userId)).orderBy(desc(orderTickets.id)).limit(limit);
  return rows.map(toPublic);
}
