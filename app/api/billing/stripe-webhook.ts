import type { Context } from "hono";
import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "../queries/connection";
import { env } from "../lib/env";

/**
 * Stripe webhook receiver — verified, idempotent, logged.
 *
 * Rules implemented here:
 *  - Signature is ALWAYS verified against STRIPE_WEBHOOK_SECRET; the browser
 *    is never an authoritative source of payment status.
 *  - Events are deduped via webhook_events(provider, eventId) — replays are
 *    acknowledged without reprocessing.
 *  - Processing failures are recorded on the event row and surfaced through
 *    the health platform's webhook-backlog check.
 *  - Never stores PAN/CVV — only Stripe identifiers and status transitions.
 */

function verifyStripeSignature(rawBody: string, header: string, secret: string): boolean {
  // Stripe signs: `${t}.${payload}` with HMAC-SHA256, v1 signature(s).
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const idx = kv.indexOf("=");
      return [kv.slice(0, idx), kv.slice(idx + 1)];
    }),
  );
  const t = parts.t;
  const v1s = header
    .split(",")
    .filter((kv) => kv.startsWith("v1="))
    .map((kv) => kv.slice(3));
  if (!t || v1s.length === 0) return false;

  // 5-minute tolerance against replay.
  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(Number(t)) || age > 300) return false;

  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return v1s.some((v1) => {
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
    } catch {
      return false;
    }
  });
}

type StripeEvent = {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, any> };
};

async function processEvent(event: StripeEvent): Promise<void> {
  const db = getDb();
  const obj = event.data.object;

  switch (event.type) {
    case "payment_intent.succeeded":
    case "payment_intent.payment_failed": {
      const intentId = obj.id as string;
      const succeeded = event.type.endsWith("succeeded");
      await db
        .update(schema.payments)
        .set({
          status: succeeded ? "SUCCEEDED" : "FAILED",
          ...(succeeded ? {} : { failureCode: obj.last_payment_error?.code ?? null, failureMessage: obj.last_payment_error?.message ?? null }),
        })
        .where(eq(schema.payments.providerPaymentId, intentId));
      break;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoiceId = obj.id as string;
      const paid = event.type === "invoice.paid";
      await db
        .update(schema.invoices)
        .set({
          status: paid ? "PAID" : "OPEN",
          ...(paid ? { paidAt: new Date() } : {}),
        })
        .where(eq(schema.invoices.providerInvoiceId, invoiceId));
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subId = obj.id as string;
      const statusMap: Record<string, string> = {
        active: "ACTIVE",
        past_due: "PAST_DUE",
        canceled: "CANCELED",
        trialing: "TRIALING",
        incomplete: "INCOMPLETE",
      };
      await db
        .update(schema.subscriptions)
        .set({
          status: statusMap[obj.status as string] ?? "INCOMPLETE",
          cancelAtPeriodEnd: Boolean(obj.cancel_at_period_end),
          currentPeriodEnd: obj.current_period_end ? new Date(obj.current_period_end * 1000) : undefined,
          ...(event.type.endsWith("deleted") ? { canceledAt: new Date() } : {}),
        })
        .where(eq(schema.subscriptions.providerSubscriptionId, subId));
      break;
    }
    default:
      // Unhandled types are stored for audit and acknowledged.
      break;
  }
}

export function createStripeWebhookHandler() {
  return async (c: Context) => {
    if (!env.stripeWebhookSecret) {
      return c.json(
        { error: "Stripe webhooks not configured on this environment." },
        501,
      );
    }
    const signature = c.req.header("stripe-signature") ?? "";
    const rawBody = await c.req.text();

    if (!verifyStripeSignature(rawBody, signature, env.stripeWebhookSecret)) {
      return c.json({ error: "Invalid signature." }, 400);
    }

    let event: StripeEvent;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return c.json({ error: "Malformed payload." }, 400);
    }

    const db = getDb();
    // Idempotency: unique (provider, eventId) — replays short-circuit.
    const inserted = await db
      .insert(schema.webhookEvents)
      .values({ provider: "STRIPE", eventId: event.id, type: event.type, payload: event as unknown as Record<string, unknown> })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) {
      return c.json({ received: true, duplicate: true });
    }

    try {
      await processEvent(event);
      await db
        .update(schema.webhookEvents)
        .set({ processedAt: new Date() })
        .where(eq(schema.webhookEvents.eventId, event.id));
    } catch (e) {
      await db
        .update(schema.webhookEvents)
        .set({ processError: (e as Error).message })
        .where(eq(schema.webhookEvents.eventId, event.id));
      return c.json({ error: "Processing failed; recorded for retry." }, 500);
    }
    return c.json({ received: true });
  };
}
