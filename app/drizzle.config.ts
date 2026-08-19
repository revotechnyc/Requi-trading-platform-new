import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Drizzle migrations are version-controlled in db/migrations and are applied
 * deterministically by api/lib/migrate.ts at boot (dev → staging → production).
 * DATABASE_URL must be a PostgreSQL/Supabase connection string, e.g.:
 *   postgres://postgres:[password]@db.[project].supabase.co:5432/postgres
 * For local development against a unix socket, PG_SOCKET_DIR/PG_DATABASE/PG_USER
 * may be used instead (see api/lib/env.ts).
 */
function databaseUrl(): string {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) return url;
  if (url.includes("sslmode=")) return url;
  return url.includes("?") ? `${url}&sslmode=require` : `${url}?sslmode=require`;
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: process.env.DATABASE_URL
    ? { url: databaseUrl() }
    : {
        host: process.env.PG_SOCKET_DIR ?? "/home/kimi/pgdata",
        database: process.env.PG_DATABASE ?? "requi",
        user: process.env.PG_USER ?? "postgres",
      },
});
