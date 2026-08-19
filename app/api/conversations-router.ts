import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { chatMessages, conversations } from "@db/schema";

/**
 * Recent Conversations — every chat turn already persists to chat_messages
 * with a conversationId; this router is the read/manage surface. All queries
 * are owner-scoped by userId (RLS p_owner is the second line of defense).
 */
export const conversationsRouter = createRouter({
  /** Newest-first list of the caller's non-deleted conversations. */
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select()
      .from(conversations)
      .where(and(eq(conversations.userId, ctx.user.id), isNull(conversations.deletedAt)))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(100);
  }),

  /** Full message history for one owned conversation (chronological). */
  messages: authedQuery
    .input(z.object({ conversationId: z.string().max(64) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const owned = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, ctx.user.id), isNull(conversations.deletedAt)))
        .limit(1);
      if (!owned[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
      return db
        .select()
        .from(chatMessages)
        .where(and(eq(chatMessages.conversationId, input.conversationId), eq(chatMessages.userId, ctx.user.id)))
        .orderBy(chatMessages.createdAt)
        .limit(500);
    }),

  rename: authedQuery
    .input(z.object({ conversationId: z.string().max(64), title: z.string().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const updated = await db
        .update(conversations)
        .set({ title: input.title.trim() })
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, ctx.user.id), isNull(conversations.deletedAt)))
        .returning({ id: conversations.id });
      if (!updated[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
      return { ok: true };
    }),

  /** Soft delete — history rows stay for auditability, the thread leaves the list. */
  remove: authedQuery
    .input(z.object({ conversationId: z.string().max(64) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const updated = await db
        .update(conversations)
        .set({ deletedAt: new Date() })
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, ctx.user.id), isNull(conversations.deletedAt)))
        .returning({ id: conversations.id });
      if (!updated[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found." });
      return { ok: true };
    }),
});
