import { TRPCError } from "@trpc/server";
import * as schema from "@db/schema";
import { getDb } from "../queries/connection";

/**
 * Idempotency for async financial / operational actions.
 *
 * Callers pass a client-generated key (e.g. checkout, payout request,
 * subscription change). The first execution runs `fn` and stores its
 * response; replays with the same key return the stored response without
 * re-executing. Keys are per-endpoint.
 */
export async function withIdempotency<T>(
  endpoint: string,
  key: string | undefined,
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!key) return fn(); // key optional per endpoint; when supplied it is honored
  const scopedKey = `${endpoint}:${userId}:${key}`;
  const db = getDb();

  const existing = await db
    .select()
    .from(schema.idempotencyKeys)
    .where(eq0(scopedKey))
    .limit(1);
  if (existing.at(0)) {
    return existing[0].responseBody as T;
  }

  const result = await fn();
  try {
    await db
      .insert(schema.idempotencyKeys)
      .values({
        key: scopedKey,
        userId,
        endpoint,
        responseStatus: 200,
        responseBody: JSON.parse(JSON.stringify(result ?? null)),
      })
      .onConflictDoNothing({ target: schema.idempotencyKeys.key });
  } catch (e) {
    console.error("[idempotency] failed to persist response", e);
  }
  return result;
}

// local helper to avoid importing eq where unused elsewhere
import { eq as _eq } from "drizzle-orm";
function eq0(key: string) {
  return _eq(schema.idempotencyKeys.key, key);
}

export function requireIdempotencyKey(key?: string): asserts key is string {
  if (!key || key.length < 8) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "An idempotency key (8+ chars) is required for this action.",
    });
  }
}
