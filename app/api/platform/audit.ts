import * as schema from "@db/schema";
import { getDb } from "../queries/connection";
import { randomUUID } from "crypto";

export type AuditEntry = {
  actorUserId?: string | null;
  organizationId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  ip?: string;
  userAgent?: string;
  before?: unknown;
  after?: unknown;
  correlationId?: string;
};

/**
 * Append-only audit logging. Rows are protected at the database level:
 * the `reject_audit_mutation` trigger (0001_rls.sql) rejects UPDATE/DELETE,
 * the `app_user` role has UPDATE/DELETE revoked, and RLS limits reads to
 * platform admins. Ordinary users can never alter audit history.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await getDb()
      .insert(schema.auditLog)
      .values({
        actorUserId: entry.actorUserId ?? null,
        organizationId: entry.organizationId ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        ip: entry.ip,
        userAgent: entry.userAgent,
        before: entry.before === undefined ? null : JSON.stringify(entry.before),
        after: entry.after === undefined ? null : JSON.stringify(entry.after),
        correlationId: entry.correlationId ?? randomUUID(),
      });
  } catch (e) {
    // Audit must never break the primary flow, but failures are loud.
    console.error("[audit] failed to write", entry.action, e);
  }
}

export function auditContextFromHeaders(headers: Headers) {
  return {
    ip: headers.get("x-forwarded-for") ?? undefined,
    userAgent: headers.get("user-agent") ?? undefined,
  };
}
