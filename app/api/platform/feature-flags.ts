import { eq } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "../queries/connection";

/**
 * Feature-flag resolution with layered targeting:
 *   user allowlist → org allowlist → plan allowlist → environment → global.
 * Any specific allowlist match wins; otherwise the broadest configured layer
 * decides. Unknown flags resolve to `false` (fail closed).
 */
export type FlagContext = {
  userId?: string;
  organizationId?: string | null;
  planCode?: string;
  environment?: string; // dev | staging | prod
};

type FlagRow = typeof schema.featureFlags.$inferSelect;

// 30s in-process cache — flags change rarely and are set via owner console.
let cache: { at: number; rows: Map<string, FlagRow> } | null = null;

async function allFlags(): Promise<Map<string, FlagRow>> {
  if (cache && Date.now() - cache.at < 30_000) return cache.rows;
  const rows = await getDb().select().from(schema.featureFlags);
  cache = { at: Date.now(), rows: new Map(rows.map((r) => [r.key, r])) };
  return cache.rows;
}

export function invalidateFlagCache() {
  cache = null;
}

function list(row: FlagRow, col: "enabledEnvironments" | "planCodes" | "organizationIds" | "userIds"): string[] {
  const v = row[col];
  return Array.isArray(v) ? (v as string[]) : [];
}

export async function flagEnabled(key: string, ctx: FlagContext = {}): Promise<boolean> {
  const flags = await allFlags();
  const row = flags.get(key);
  if (!row) return false;
  if (ctx.userId && list(row, "userIds").includes(ctx.userId)) return true;
  if (ctx.organizationId && list(row, "organizationIds").includes(ctx.organizationId)) return true;
  if (ctx.planCode && list(row, "planCodes").includes(ctx.planCode)) return true;
  const env = ctx.environment ?? process.env.NODE_ENV ?? "development";
  const envs = list(row, "enabledEnvironments");
  if (envs.length > 0) return envs.includes(env) || envs.includes("*");
  return row.enabledGlobal;
}

/** Convenience for request paths that only need the global switch. */
export async function flagEnabledGlobal(key: string): Promise<boolean> {
  const flags = await allFlags();
  return flags.get(key)?.enabledGlobal ?? false;
}

export async function setFlag(
  key: string,
  patch: Partial<Pick<FlagRow, "enabledGlobal" | "enabledEnvironments" | "planCodes" | "organizationIds" | "userIds" | "description">>,
  updatedBy: string,
) {
  await getDb()
    .insert(schema.featureFlags)
    .values({ key, ...patch, updatedBy })
    .onConflictDoUpdate({ target: schema.featureFlags.key, set: { ...patch, updatedBy } });
  invalidateFlagCache();
}

export async function listFlags() {
  return getDb().select().from(schema.featureFlags).orderBy(schema.featureFlags.key);
}

export async function deleteFlag(key: string) {
  await getDb().delete(schema.featureFlags).where(eq(schema.featureFlags.key, key));
  invalidateFlagCache();
}
