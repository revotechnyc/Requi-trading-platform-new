import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import {
  findAlertsByUser,
  markAlertRead,
  markAllAlertsRead,
  respondToConfirmation,
} from "./queries/alerts";

export const alertsRouter = createRouter({
  list: authedQuery.query(({ ctx }) => findAlertsByUser(ctx.user.id)),

  unreadCount: authedQuery.query(async ({ ctx }) => {
    const rows = await findAlertsByUser(ctx.user.id);
    return { count: rows.filter((r) => !r.read).length };
  }),

  markRead: authedQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await markAlertRead(ctx.user.id, input.id);
      return { ok: true };
    }),

  markAllRead: authedQuery.mutation(async ({ ctx }) => {
    await markAllAlertsRead(ctx.user.id);
    return { ok: true };
  }),

  respond: authedQuery
    .input(z.object({ id: z.string(), accept: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return respondToConfirmation(ctx.user.id, input.id, input.accept);
    }),
});
