import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import {
  listNotifications,
  markAllRead,
  markRead,
} from "./platform/notifications";
import { getDb } from "./queries/connection";
import * as schema from "@db/schema";
import { and, eq, isNull } from "drizzle-orm";

export const notificationsRouter = createRouter({
  list: authedQuery
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(({ ctx, input }) => listNotifications(ctx.user.id, input?.limit ?? 50)),

  unreadCount: authedQuery.query(async ({ ctx }) => {
    const rows = await getDb()
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.userId, ctx.user.id),
          isNull(schema.notifications.readAt),
        ),
      );
    return { count: rows.length };
  }),

  markRead: authedQuery
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => markRead(ctx.user.id, input.id).then(() => ({ ok: true }))),

  markAllRead: authedQuery
    .mutation(({ ctx }) => markAllRead(ctx.user.id).then(() => ({ ok: true }))),

  getPreferences: authedQuery.query(({ ctx }) =>
    getDb()
      .select()
      .from(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.userId, ctx.user.id)),
  ),

  setPreference: authedQuery
    .input(
      z.object({
        category: z.enum(["IN_APP", "EMAIL", "OPS", "BILLING", "SECURITY", "SYSTEM"]),
        inAppEnabled: z.boolean(),
        emailEnabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .insert(schema.notificationPreferences)
        .values({ userId: ctx.user.id, ...input })
        .onConflictDoUpdate({
          target: [schema.notificationPreferences.userId, schema.notificationPreferences.category],
          set: { inAppEnabled: input.inAppEnabled, emailEnabled: input.emailEnabled },
        });
      return { ok: true };
    }),
});
