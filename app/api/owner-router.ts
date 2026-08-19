import { desc, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as schema from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, platformQuery } from "./middleware";
import { writeAudit, auditContextFromHeaders } from "./platform/audit";
import { healthSummary, runDeepAudit, runLightChecks } from "./platform/health";
import { listFlags, setFlag } from "./platform/feature-flags";

/**
 * SaaS Owner Control Center — platform-staff-only endpoints.
 * Destructive actions require an explicit confirmation string and are always
 * written to the append-only audit log with before/after state.
 */

function requireConfirm(input: string | undefined, expected: string) {
  if (input !== expected) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Type ${expected} to confirm this action.`,
    });
  }
}

export const ownerRouter = createRouter({
  // ── Business metrics ──────────────────────────────────────────────────
  overview: platformQuery.query(async () => {
    const db = getDb();
    const [users] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users);
    const [orgs] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.organizations).where(isNull(schema.organizations.deletedAt));
    const [activeSubs] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.status, "ACTIVE"));
    const mrrRows = await db
      .select({ total: sql<number>`coalesce(sum(${schema.plans.priceMonthlyCents}), 0)::int` })
      .from(schema.subscriptions)
      .innerJoin(schema.plans, eq(schema.subscriptions.planId, schema.plans.id))
      .where(eq(schema.subscriptions.status, "ACTIVE"));
    const openIncidents = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.incidents)
      .where(ne(schema.incidents.status, "RESOLVED"));
    return {
      users: users.n,
      organizations: orgs.n,
      activeSubscriptions: activeSubs.n,
      mrrCents: mrrRows[0]?.total ?? 0,
      openIncidents: openIncidents[0]?.n ?? 0,
    };
  }),

  // ── User management ───────────────────────────────────────────────────
  searchUsers: platformQuery
    .input(z.object({ query: z.string().min(1).max(200), limit: z.number().int().min(1).max(100).default(25) }))
    .query(async ({ input }) => {
      const q = `%${input.query}%`;
      return getDb()
        .select({
          id: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,
          role: schema.users.role,
          platformRole: schema.users.platformRole,
          authProvider: schema.users.authProvider,
          emailVerified: schema.users.emailVerified,
          suspendedAt: schema.users.suspendedAt,
          deactivatedAt: schema.users.deactivatedAt,
          createdAt: schema.users.createdAt,
          lastSignInAt: schema.users.lastSignInAt,
        })
        .from(schema.users)
        .where(or(ilike(schema.users.email, q), ilike(schema.users.name, q)))
        .orderBy(desc(schema.users.createdAt))
        .limit(input.limit);
    }),

  suspendUser: platformQuery
    .input(z.object({ userId: z.string(), reason: z.string().min(3).max(500), confirm: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireConfirm(input.confirm, "SUSPEND");
      const db = getDb();
      const before = await db.select().from(schema.users).where(eq(schema.users.id, input.userId)).limit(1).then((r) => r.at(0));
      if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      if (before.platformRole === "SAAS_OWNER") {
        throw new TRPCError({ code: "FORBIDDEN", message: "SaaS owner accounts cannot be suspended." });
      }
      await db
        .update(schema.users)
        .set({ suspendedAt: new Date(), suspendedReason: input.reason, sessionsRevokedAt: new Date() })
        .where(eq(schema.users.id, input.userId));
      await writeAudit({
        actorUserId: ctx.user.id,
        organizationId: before.activeOrganizationId,
        action: "owner.user_suspended",
        targetType: "user",
        targetId: input.userId,
        before: { suspendedAt: before.suspendedAt, suspendedReason: before.suspendedReason },
        after: { suspendedAt: new Date().toISOString(), reason: input.reason },
        ...auditContextFromHeaders(ctx.req.headers),
      });
      return { ok: true };
    }),

  restoreUser: platformQuery
    .input(z.object({ userId: z.string(), confirm: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireConfirm(input.confirm, "RESTORE");
      const db = getDb();
      const before = await db.select().from(schema.users).where(eq(schema.users.id, input.userId)).limit(1).then((r) => r.at(0));
      if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      await db
        .update(schema.users)
        .set({ suspendedAt: null, suspendedReason: null, deactivatedAt: null })
        .where(eq(schema.users.id, input.userId));
      await writeAudit({
        actorUserId: ctx.user.id,
        action: "owner.user_restored",
        targetType: "user",
        targetId: input.userId,
        before: { suspendedAt: before.suspendedAt, deactivatedAt: before.deactivatedAt },
        after: { suspendedAt: null, deactivatedAt: null },
        ...auditContextFromHeaders(ctx.req.headers),
      });
      return { ok: true };
    }),

  revokeSessions: platformQuery
    .input(z.object({ userId: z.string(), confirm: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireConfirm(input.confirm, "REVOKE");
      const db = getDb();
      const before = await db.select().from(schema.users).where(eq(schema.users.id, input.userId)).limit(1).then((r) => r.at(0));
      if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      await db
        .update(schema.users)
        .set({ sessionsRevokedAt: new Date() })
        .where(eq(schema.users.id, input.userId));
      await writeAudit({
        actorUserId: ctx.user.id,
        action: "owner.sessions_revoked",
        targetType: "user",
        targetId: input.userId,
        after: { revokedAt: new Date().toISOString() },
        ...auditContextFromHeaders(ctx.req.headers),
      });
      return { ok: true };
    }),

  // ── Audit trail (read-only) ───────────────────────────────────────────
  auditTrail: platformQuery
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ input }) =>
      getDb()
        .select()
        .from(schema.auditLog)
        .orderBy(desc(schema.auditLog.createdAt))
        .limit(input.limit),
    ),

  // ── System health ─────────────────────────────────────────────────────
  health: platformQuery.query(() => healthSummary()),
  runLightChecks: platformQuery.mutation(() => runLightChecks()),
  runDeepAudit: platformQuery.mutation(() => runDeepAudit()),

  // ── Incidents ─────────────────────────────────────────────────────────
  incidents: platformQuery
    .input(z.object({ includeResolved: z.boolean().default(false), limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ input }) => {
      const db = getDb();
      const base = db.select().from(schema.incidents).orderBy(desc(schema.incidents.detectedAt)).limit(input.limit);
      return input.includeResolved ? base : base.where(ne(schema.incidents.status, "RESOLVED"));
    }),

  updateIncident: platformQuery
    .input(
      z.object({
        incidentId: z.string(),
        status: z.enum(["ACKNOWLEDGED", "INVESTIGATING", "MONITORING", "RESOLVED"]),
        note: z.string().max(1000).optional(),
        rootCause: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const before = await db.select().from(schema.incidents).where(eq(schema.incidents.id, input.incidentId)).limit(1).then((r) => r.at(0));
      if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Incident not found." });
      await db
        .update(schema.incidents)
        .set({
          status: input.status,
          assignedTo: ctx.user.id,
          ...(input.status === "ACKNOWLEDGED" ? { acknowledgedAt: new Date() } : {}),
          ...(input.status === "RESOLVED" ? { resolvedAt: new Date(), rootCause: input.rootCause ?? before.rootCause } : {}),
        })
        .where(eq(schema.incidents.id, input.incidentId));
      await db.insert(schema.incidentUpdates).values({
        incidentId: input.incidentId,
        actorUserId: ctx.user.id,
        action: `STATUS_${input.status}`,
        note: input.note,
      });
      await writeAudit({
        actorUserId: ctx.user.id,
        action: "owner.incident_updated",
        targetType: "incident",
        targetId: input.incidentId,
        before: { status: before.status },
        after: { status: input.status, note: input.note },
      });
      return { ok: true };
    }),

  // ── Feature flags ─────────────────────────────────────────────────────
  flags: platformQuery.query(() => listFlags()),
  setFlag: platformQuery
    .input(
      z.object({
        key: z.string().min(1).max(128),
        enabledGlobal: z.boolean().optional(),
        enabledEnvironments: z.array(z.string()).optional(),
        planCodes: z.array(z.string()).optional(),
        organizationIds: z.array(z.string()).optional(),
        userIds: z.array(z.string()).optional(),
        description: z.string().max(500).optional(),
        confirm: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      requireConfirm(input.confirm, "SET FLAG");
      const { confirm: _c, key, ...patch } = input;
      await setFlag(key, patch, ctx.user.id);
      await writeAudit({
        actorUserId: ctx.user.id,
        action: "owner.flag_updated",
        targetType: "feature_flag",
        targetId: key,
        after: patch,
      });
      return { ok: true };
    }),
});
