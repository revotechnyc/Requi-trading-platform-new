import { and, desc, eq } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "../queries/connection";

/**
 * Notification service: renders a template, records the notification,
 * and queues deliveries per user preferences. Email delivery requires the
 * email provider env (SMTP/EMAIL_*) — without it, email deliveries are
 * recorded as QUEUED and skipped, never fabricated as sent.
 */
function render(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, k) =>
    data[k] === undefined || data[k] === null ? "" : String(data[k]),
  );
}

async function preferenceFor(userId: string, category: string) {
  const rows = await getDb()
    .select()
    .from(schema.notificationPreferences)
    .where(
      and(
        eq(schema.notificationPreferences.userId, userId),
        eq(schema.notificationPreferences.category, category),
      ),
    )
    .limit(1);
  return rows.at(0) ?? { inAppEnabled: true, emailEnabled: true };
}

export async function notify(opts: {
  userId: string;
  organizationId?: string | null;
  category: "IN_APP" | "EMAIL" | "OPS" | "BILLING" | "SECURITY" | "SYSTEM";
  templateCode?: string;
  type: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
}) {
  const db = getDb();
  let title = opts.title ?? opts.type;
  let body = opts.body ?? "";
  if (opts.templateCode) {
    const tpl = await db
      .select()
      .from(schema.notificationTemplates)
      .where(eq(schema.notificationTemplates.code, opts.templateCode))
      .limit(1)
      .then((r) => r.at(0));
    if (tpl) {
      title = render(tpl.subject, opts.data ?? {});
      body = render(tpl.body, opts.data ?? {});
    }
  }

  const prefs = await preferenceFor(opts.userId, opts.category);
  const [row] = await db
    .insert(schema.notifications)
    .values({
      userId: opts.userId,
      organizationId: opts.organizationId ?? null,
      category: opts.category,
      type: opts.type,
      title,
      body,
    })
    .returning();

  const deliveries: (typeof schema.notificationDeliveries.$inferInsert)[] = [];
  if (prefs.inAppEnabled) {
    deliveries.push({ notificationId: row.id, channel: "IN_APP", status: "SENT", attemptedAt: new Date() });
  }
  if (prefs.emailEnabled && opts.category !== "IN_APP") {
    deliveries.push({ notificationId: row.id, channel: "EMAIL", status: "QUEUED" });
  }
  if (deliveries.length) {
    await db.insert(schema.notificationDeliveries).values(deliveries);
  }
  return row;
}

export async function listNotifications(userId: string, limit = 50) {
  return getDb()
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, userId))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);
}

export async function markRead(userId: string, id: string) {
  await getDb()
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, userId)));
}

export async function markAllRead(userId: string) {
  await getDb()
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, userId)));
}
