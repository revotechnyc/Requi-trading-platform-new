/**
 * Dry-run all db/console-sql/*.sql against a throwaway schema (ac_migtest).
 * Does not touch production schema `ac`.
 *
 * Usage: npx tsx scripts/validate-console-sql.ts
 */
import "dotenv/config";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const SCHEMA = "ac_migtest";

function rewriteForTestSchema(body: string): string {
  return body
    .replace(/CREATE SCHEMA IF NOT EXISTS ac\s*;/gi, `CREATE SCHEMA IF NOT EXISTS ${SCHEMA};`)
    .replace(/SET search_path TO ac,\s*public\s*;/gi, `SET search_path TO ${SCHEMA}, public;`)
    .replace(/SET search_path TO public\s*;/gi, "SET search_path TO public;")
    .replace(/\bac\._schema_migrations\b/g, `${SCHEMA}._schema_migrations`);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL missing");
    process.exit(1);
  }

  const folder = path.resolve(process.cwd(), "db/console-sql");
  if (!existsSync(folder)) {
    console.error("console-sql folder missing:", folder);
    process.exit(1);
  }

  const files = readdirSync(folder)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => {
      if (a === "seed.sql") return 1;
      if (b === "seed.sql") return -1;
      return a.localeCompare(b);
    });

  const sql = postgres(url, { max: 1, prepare: false });
  const results: { file: string; ok: boolean; error?: string }[] = [];

  try {
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await sql.unsafe(`CREATE SCHEMA ${SCHEMA}`);
    console.log(`[validate] using throwaway schema ${SCHEMA}`);

    for (const file of files) {
      const raw = readFileSync(path.join(folder, file), "utf8");
      const body = rewriteForTestSchema(raw);
      process.stdout.write(`[validate] applying ${file} ... `);
      try {
        await sql.unsafe(body);
        console.log("OK");
        results.push({ file, ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log("FAIL");
        console.error(`  → ${msg}`);
        results.push({ file, ok: false, error: msg });
        // stop — later files depend on earlier ones
        break;
      }
    }
  } finally {
    try {
      await sql.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
      console.log(`[validate] dropped ${SCHEMA}`);
    } catch (e) {
      console.warn("[validate] cleanup failed", e);
    }
    await sql.end({ timeout: 5 });
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n=== SUMMARY ===");
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.file}${r.error ? ` — ${r.error}` : ""}`);
  }
  if (failed.length || results.length < files.length) {
    const skipped = files.filter((f) => !results.some((r) => r.file === f));
    for (const f of skipped) console.log(`SKIP  ${f} — blocked by earlier failure`);
    process.exit(1);
  }
  console.log("All console-sql migrations OK.");
}

await main();
