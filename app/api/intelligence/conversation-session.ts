/**
 * Persisted Intelligence session — working set + trade thread per conversationId.
 * Transcript lives in chat_messages; this JSON is operational context ("those two").
 */
import { and, eq, isNull } from "drizzle-orm";
import { conversations } from "@db/schema";
import { getDb } from "../queries/connection";
import { execSql } from "../lib/migrate";
import type { ConversationWorkingSet, FollowUpIntentType, WorkingEntity } from "./conversation-context";
import type { GlobalIntent } from "./intent-firewall";
import { replaceWorkingSet, workingSetSnapshot } from "./conversation-context";
import type { ThreadState } from "./intent";
import { replaceThreadState, threadStateSnapshot } from "./intent";

const SESSION_VERSION = 1 as const;

export type PersistedConversationSession = {
  version: typeof SESSION_VERSION;
  workingSet?: {
    active: WorkingEntity[];
    ranked: WorkingEntity[];
    groups: Record<string, WorkingEntity[]>;
    lastIntent?: FollowUpIntentType;
    lastGlobalIntent?: GlobalIntent;
    lastHandler?: ConversationWorkingSet["lastHandler"];
    lastUniverseLabel?: string;
    displayScope?: WorkingEntity[];
    displayScopeKind?: string;
    updatedAt: number;
  };
  thread?: ThreadState;
};

let columnEnsured = false;

/** Idempotent DB column for persisted chat scope — call before conversation INSERT/SELECT. */
export async function ensureSessionStateColumn(): Promise<boolean> {
  if (columnEnsured) return true;
  try {
    await execSql`
      ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS "sessionState" jsonb NOT NULL DEFAULT '{}'::jsonb
    `;
    columnEnsured = true;
    return true;
  } catch (e) {
    console.warn("[intelligence] sessionState column unavailable — in-memory context only", e);
    return false;
  }
}

function parseSession(raw: unknown): PersistedConversationSession | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as PersistedConversationSession;
  if (o.version !== SESSION_VERSION) return null;
  return o;
}

export async function hydrateConversationSession(
  userId: string,
  conversationId: string,
): Promise<void> {
  const ready = await ensureSessionStateColumn();
  if (!ready) return;
  const db = getDb();
  try {
    const rows = await db
      .select({ sessionState: conversations.sessionState })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId),
          isNull(conversations.deletedAt),
        ),
      )
      .limit(1);
    const parsed = parseSession(rows[0]?.sessionState);
    if (!parsed) return;

    if (parsed.workingSet) {
      const ws: ConversationWorkingSet = {
        key: `c:${conversationId}`,
        userId,
        active: parsed.workingSet.active ?? [],
        ranked: parsed.workingSet.ranked ?? [],
        groups: parsed.workingSet.groups ?? {},
        lastIntent: parsed.workingSet.lastIntent,
        lastGlobalIntent: parsed.workingSet.lastGlobalIntent,
        lastHandler: parsed.workingSet.lastHandler,
        lastUniverseLabel: parsed.workingSet.lastUniverseLabel,
        displayScope: parsed.workingSet.displayScope ?? [],
        displayScopeKind: parsed.workingSet.displayScopeKind as ConversationWorkingSet["displayScopeKind"],
        updatedAt: parsed.workingSet.updatedAt ?? Date.now(),
      };
      replaceWorkingSet(ws);
    }
    if (parsed.thread) {
      replaceThreadState(userId, conversationId, parsed.thread);
    }
  } catch (e) {
    console.error("[intelligence] hydrateConversationSession failed", e);
  }
}

export async function persistConversationSession(
  userId: string,
  conversationId: string,
): Promise<void> {
  const ready = await ensureSessionStateColumn();
  if (!ready) return;
  const db = getDb();
  const wsSnap = workingSetSnapshot(userId, conversationId);
  const threadSnap = threadStateSnapshot(userId, conversationId);
  const payload: PersistedConversationSession = {
    version: SESSION_VERSION,
    ...(wsSnap
      ? {
          workingSet: {
            active: wsSnap.active,
            ranked: wsSnap.ranked,
            groups: wsSnap.groups,
            lastIntent: wsSnap.lastIntent,
            lastGlobalIntent: wsSnap.lastGlobalIntent,
            lastHandler: wsSnap.lastHandler,
            lastUniverseLabel: wsSnap.lastUniverseLabel,
            displayScope: wsSnap.displayScope,
            displayScopeKind: wsSnap.displayScopeKind,
            updatedAt: wsSnap.updatedAt,
          },
        }
      : {}),
    ...(threadSnap ? { thread: threadSnap } : {}),
  };
  if (!payload.workingSet && !payload.thread) return;
  try {
    await db
      .update(conversations)
      .set({ sessionState: payload })
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId),
          isNull(conversations.deletedAt),
        ),
      );
  } catch (e) {
    console.error("[intelligence] persistConversationSession failed", e);
  }
}

export async function clearConversationSession(userId: string, conversationId: string): Promise<void> {
  const ready = await ensureSessionStateColumn();
  if (!ready) return;
  const db = getDb();
  try {
    await db
      .update(conversations)
      .set({ sessionState: {} })
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
  } catch {
    /* swallow */
  }
}
