import { migrate } from "drizzle-orm/postgres-js/migrator";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { getDb, getSql } from "../queries/connection";

/**
 * Applies the version-controlled migrations in db/migrations (drizzle journal),
 * deterministically, at boot. Same files deploy dev → staging → production,
 * and can be applied verbatim to a Supabase project.
 *
 * Schema on a fresh Supabase project is applied with `drizzle-kit push` when
 * SQL files are not present (journal-only trees).
 */
export async function runMigrations() {
  const migrationsFolder = path.resolve(process.cwd(), "db/migrations");
  const sqlFiles = existsSync(migrationsFolder)
    ? readdirSync(migrationsFolder).filter((f) => f.endsWith(".sql"))
    : [];
  if (sqlFiles.length === 0) {
    console.warn("[db] no SQL migration files; skipping drizzle migrate (use drizzle-kit push for schema)");
    return;
  }
  await migrate(getDb(), { migrationsFolder });
  console.log("[db] migrations applied from", migrationsFolder);
}

/** Raw SQL escape hatch for one-off bootstrap statements (idempotent only). */
export async function execSql(strings: TemplateStringsArray, ...values: unknown[]) {
  return getSql()(strings as never, ...(values as never[]));
}
