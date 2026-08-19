import net from "node:net";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../lib/env";
import * as schema from "@db/schema";

/**
 * PostgreSQL connection (Supabase-compatible).
 * - Production/staging: DATABASE_URL (pooled connection string; use the Supabase
 *   transaction pooler for serverless and the session pooler for long-lived workers).
 * - Local dev: unix socket via PG_SOCKET_DIR (embedded Postgres).
 *
 * Node 22 happy-eyeballs tries NAT64 IPv6 first; the Supabase pooler then
 * ETIMEDOUT. Force IPv4. Port 6543 does not support prepared statements.
 */
if (typeof net.setDefaultAutoSelectFamily === "function") {
  net.setDefaultAutoSelectFamily(false);
}

let sqlClient: ReturnType<typeof postgres> | undefined;

export function getSql() {
  if (!sqlClient) {
    sqlClient = env.databaseUrl
      ? postgres(env.databaseUrl, {
          prepare: false,
          max: 10,
          idle_timeout: 20,
          connect_timeout: 30,
          ssl: "require",
        })
      : postgres({
          host: env.pgSocketDir,
          database: env.pgDatabase,
          user: env.pgUser,
          max: 10,
          idle_timeout: 20,
        });
  }
  return sqlClient;
}

let instance: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (!instance) {
    instance = drizzle(getSql(), { schema });
  }
  return instance;
}

/**
 * Run `fn` inside a transaction with RLS claims set (defense layer 2 on top of
 * query-level scoping). Claims are transaction-local (set_config …, true).
 */
export async function withTenantClaims<T>(
  claims: { userId?: string; organizationId?: string; platformRole?: string },
  fn: (tx: ReturnType<typeof drizzle<typeof schema>>) => Promise<T>,
): Promise<T> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const sqlc = getSql();
    // set_config is session-scoped on the pooled connection; the transaction wrapper
    // pins one connection, and `true` makes the setting transaction-local.
    await sqlc`select set_config('app.current_user', ${claims.userId ?? ""}, true)`;
    await sqlc`select set_config('app.current_org', ${claims.organizationId ?? ""}, true)`;
    await sqlc`select set_config('app.platform_role', ${claims.platformRole ?? "NONE"}, true)`;
    return fn(tx as never);
  });
}
