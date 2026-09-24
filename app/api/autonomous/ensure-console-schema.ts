import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { getSql } from "../queries/connection";

/**
 * Ensures autonomous console schema (`ac`) + seed exist on the current Postgres.
 * Idempotent: tracks applied files in ac._schema_migrations.
 */
export async function ensureAutonomousConsoleSchema(): Promise<void> {
  const sql = getSql();
  const folder = path.resolve(process.cwd(), "db/console-sql");
  if (!existsSync(folder)) {
    console.warn("[ac] console-sql folder missing; skip");
    return;
  }

  await sql`CREATE SCHEMA IF NOT EXISTS ac`;
  await sql`
    CREATE TABLE IF NOT EXISTS ac._schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const files = readdirSync(folder)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => {
      // seed last
      if (a === "seed.sql") return 1;
      if (b === "seed.sql") return -1;
      return a.localeCompare(b);
    });

  for (const file of files) {
    const rows = await sql<{ id: string }[]>`
      SELECT id FROM ac._schema_migrations WHERE id = ${file}
    `;
    if (rows.length > 0) continue;

    const body = readFileSync(path.join(folder, file), "utf8");
    try {
      // postgres.js supports simple query for multi-statement via unsafe
      await sql.unsafe(body);
      await sql`INSERT INTO ac._schema_migrations (id) VALUES (${file})`;
      console.log("[ac] applied", file);
    } catch (err) {
      // Seed may partially conflict on re-run; mark applied only on full success
      console.error("[ac] failed applying", file, err);
      throw err;
    }
  }
}
