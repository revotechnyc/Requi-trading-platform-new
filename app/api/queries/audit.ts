import { auditEvents } from "@db/schema";
import { getDb } from "./connection";

/**
 * AUDIT TRAIL (Production Revision §27) — append-only record of sensitive
 * activity. Application console logs are NOT the financial audit record;
 * this table is. Writes are fire-and-forget by design (auditing must never
 * break the money path) but every failure is swallowed with the row lost —
 * accepted trade-off documented in the gap analysis until a durable outbox
 * ships. Meta is minimum-disclosure: never secrets, never governance content.
 */

export type AuditAction =
  | "ORDER_PROPOSED"
  | "ORDER_CONFIRMED"
  | "ORDER_AUTO_EXECUTED"
  | "ORDER_REJECTED"
  | "ORDER_CANCELLED"
  | "ORDER_BROKER_OUTCOME"
  | "STRATEGY_DISABLED"
  | "STRATEGY_ENABLED"
  | "SETTING_CHANGED"
  | "MARKET_SESSION_EVENT"
  | "LEGAL_ACCEPTED"
  | "CONSENT_PREF_CHANGED"
  | "ACCOUNT_DEACTIVATED"
  | "PRIVACY_REQUEST"
  | "LEGAL_DOC_TRANSITION";

export async function recordAudit(e: {
  userId: string | null;
  action: AuditAction;
  entityType: "TICKET" | "STRATEGY" | "SETTING" | "SIGNAL" | "SESSION";
  entityId?: string | null;
  prevState?: string | null;
  newState?: string | null;
  correlationId?: string | null;
  meta?: unknown;
}): Promise<void> {
  const db = getDb();
  await db
    .insert(auditEvents)
    .values({
      userId: e.userId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      prevState: e.prevState ?? null,
      newState: e.newState ?? null,
      correlationId: e.correlationId ?? null,
      meta: e.meta === undefined ? null : JSON.stringify(e.meta),
    })
    .catch(() => undefined);
}
