import { and, desc, eq, lt } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { chatMessages, conversations } from "@db/schema";

/**
 * CONVERSATION MEMORY
 *
 * Persists the Intelligence chat so every new message carries the recent
 * conversation instead of starting cold. Memory is per-user, append-only,
 * and bounded — we load the last HISTORY_LIMIT exchanges and prune rows
 * beyond KEEP_ROWS so the table never grows without limit.
 *
 * Only final user text and final assistant text are stored (tool-call
 * scaffolding is not — it would pollute future context). Memory never
 * widens authority: it informs replies, it cannot change what the
 * confirmation gate requires.
 */

const HISTORY_LIMIT = 20; // messages (≈10 exchanges) injected per chat
const KEEP_ROWS = 400; // per-user retention ceiling

export interface MemoryMessage {
  role: "user" | "assistant";
  content: string;
}

export async function loadHistory(userId: string, limit = HISTORY_LIMIT, conversationId?: string): Promise<MemoryMessage[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const scope = conversationId
      ? and(eq(chatMessages.userId, userId), eq(chatMessages.conversationId, conversationId))
      : eq(chatMessages.userId, userId);
    const rows = await db
      .select({ role: chatMessages.role, content: chatMessages.content })
      .from(chatMessages)
      .where(scope)
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);
    return rows
      .reverse()
      .filter((r) => r.role === "user" || r.role === "assistant")
      .map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
  } catch {
    return []; // memory is an enhancement — never block a chat on it
  }
}

export async function saveMessage(userId: string, role: "user" | "assistant", content: string, conversationId?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const trimmed = content.trim();
  if (!trimmed) return;
  try {
    await db.insert(chatMessages).values({ userId, role, content: trimmed.slice(0, 8000), conversationId: conversationId ?? null });
    if (conversationId) {
      await db
        .update(conversations)
        .set({ lastMessageAt: new Date() })
        .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
    }
    await prune(userId);
  } catch {
    /* swallow — a memory write failure must not break the chat */
  }
}

async function prune(userId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db
    .select({ id: chatMessages.id, createdAt: chatMessages.createdAt })
    .from(chatMessages)
    .where(eq(chatMessages.userId, userId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(1000);
  if (rows.length <= KEEP_ROWS) return;
  const cutoffTs = rows[KEEP_ROWS - 1].createdAt;
  await db.delete(chatMessages).where(and(eq(chatMessages.userId, userId), lt(chatMessages.createdAt, cutoffTs)));
}

export async function clearHistory(userId: string): Promise<{ cleared: boolean }> {
  const db = await getDb();
  if (!db) return { cleared: false };
  await db.delete(chatMessages).where(eq(chatMessages.userId, userId));
  return { cleared: true };
}
