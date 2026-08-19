import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as schema from "@db/schema";
import { getDb } from "./queries/connection";
import { createRouter, authedQuery, platformQuery } from "./middleware";
import { writeAudit, auditContextFromHeaders } from "./platform/audit";
import { notify } from "./platform/notifications";
import { withIdempotency } from "./platform/idempotency";

/**
 * Customer-facing billing. Platform billing (Requi subscription) is kept
 * strictly separate from customer trading data. Card details are never
 * stored — payment_methods holds brand/last4/exp metadata only.
 */
function requireOrg(ctx: { user: { activeOrganizationId: string | null } }): string {
  if (!ctx.user.activeOrganizationId) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No active organization." });
  }
  return ctx.user.activeOrganizationId;
}

export const billingRouter = createRouter({
  mySubscription: authedQuery.query(async ({ ctx }) => {
    const orgId = requireOrg(ctx);
    const db = getDb();
    const sub = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.organizationId, orgId))
      .orderBy(desc(schema.subscriptions.createdAt))
      .limit(1)
      .then((r) => r.at(0));
    if (!sub) {
      return { subscription: null, plan: null };
    }
    const plan = await db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.id, sub.planId))
      .limit(1)
      .then((r) => r.at(0));
    return { subscription: sub, plan: plan ?? null };
  }),

  myInvoices: authedQuery.query(async ({ ctx }) => {
    const orgId = requireOrg(ctx);
    return getDb()
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.organizationId, orgId))
      .orderBy(desc(schema.invoices.issuedAt))
      .limit(24);
  }),

  myPaymentMethods: authedQuery.query(async ({ ctx }) => {
    const orgId = requireOrg(ctx);
    // Metadata only — brand/last4/expiry. PAN/CVV never touch this system.
    return getDb()
      .select({
        id: schema.paymentMethods.id,
        brand: schema.paymentMethods.brand,
        last4: schema.paymentMethods.last4,
        expMonth: schema.paymentMethods.expMonth,
        expYear: schema.paymentMethods.expYear,
        isDefault: schema.paymentMethods.isDefault,
      })
      .from(schema.paymentMethods)
      .where(eq(schema.paymentMethods.organizationId, orgId));
  }),

  // Request Cancellation workflow (Legal Revision): never instant-delete;
  // a reviewed request with audit trail.
  requestCancellation: authedQuery
    .input(z.object({ reason: z.string().max(1000).optional(), idempotencyKey: z.string().min(8).max(128).optional() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = requireOrg(ctx);
      return withIdempotency("billing.requestCancellation", input.idempotencyKey, ctx.user.id, async () => {
        const db = getDb();
        const existing = await db
          .select()
          .from(schema.cancellationRequests)
          .where(
            and(
              eq(schema.cancellationRequests.organizationId, orgId),
              eq(schema.cancellationRequests.status, "PENDING"),
            ),
          )
          .limit(1)
          .then((r) => r.at(0));
        if (existing) return { request: existing, duplicate: true };

        const sub = await db
          .select()
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.organizationId, orgId))
          .orderBy(desc(schema.subscriptions.createdAt))
          .limit(1)
          .then((r) => r.at(0));

        const [request] = await db
          .insert(schema.cancellationRequests)
          .values({
            organizationId: orgId,
            userId: ctx.user.id,
            subscriptionId: sub?.id,
            reason: input.reason,
          })
          .returning();
        await writeAudit({
          actorUserId: ctx.user.id,
          organizationId: orgId,
          action: "billing.cancellation_requested",
          targetType: "cancellation_request",
          targetId: request.id,
          after: { reason: input.reason, subscriptionId: sub?.id },
          ...auditContextFromHeaders(ctx.req.headers),
        });
        await notify({
          userId: ctx.user.id,
          organizationId: orgId,
          category: "BILLING",
          type: "cancellation_requested",
          title: "Cancellation request received",
          body: "Your cancellation request has been received and is pending review. Your access continues unchanged until the request is processed.",
        });
        return { request, duplicate: false };
      });
    }),

  myCancellationRequest: authedQuery.query(async ({ ctx }) => {
    const orgId = requireOrg(ctx);
    return getDb()
      .select()
      .from(schema.cancellationRequests)
      .where(eq(schema.cancellationRequests.organizationId, orgId))
      .orderBy(desc(schema.cancellationRequests.requestedAt))
      .limit(1)
      .then((r) => r.at(0) ?? null);
  }),

  // ── Platform staff: review queue ──────────────────────────────────────
  cancellationQueue: platformQuery.query(() =>
    getDb()
      .select()
      .from(schema.cancellationRequests)
      .orderBy(desc(schema.cancellationRequests.requestedAt))
      .limit(100),
  ),

  resolveCancellation: platformQuery
    .input(
      z.object({
        requestId: z.string(),
        decision: z.enum(["APPROVED", "DENIED", "COMPLETED"]),
        resolution: z.string().max(1000).optional(),
        confirm: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.confirm !== "RESOLVE") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Type RESOLVE to confirm this action." });
      }
      const db = getDb();
      const before = await db
        .select()
        .from(schema.cancellationRequests)
        .where(eq(schema.cancellationRequests.id, input.requestId))
        .limit(1)
        .then((r) => r.at(0));
      if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found." });
      await db
        .update(schema.cancellationRequests)
        .set({
          status: input.decision,
          assignedTo: ctx.user.id,
          resolution: input.resolution,
          resolvedAt: new Date(),
        })
        .where(eq(schema.cancellationRequests.id, input.requestId));
      // Cancellation takes effect at period end on the subscription itself.
      if ((input.decision === "APPROVED" || input.decision === "COMPLETED") && before.subscriptionId) {
        await db
          .update(schema.subscriptions)
          .set({ cancelAtPeriodEnd: true })
          .where(eq(schema.subscriptions.id, before.subscriptionId));
      }
      await writeAudit({
        actorUserId: ctx.user.id,
        organizationId: before.organizationId,
        action: "billing.cancellation_resolved",
        targetType: "cancellation_request",
        targetId: input.requestId,
        before: { status: before.status },
        after: { status: input.decision, resolution: input.resolution },
      });
      await notify({
        userId: before.userId,
        organizationId: before.organizationId,
        category: "BILLING",
        type: "cancellation_resolved",
        title: `Cancellation request ${input.decision.toLowerCase()}`,
        body: input.resolution ?? `Your cancellation request was ${input.decision.toLowerCase()}.`,
      });
      return { ok: true };
    }),
});
