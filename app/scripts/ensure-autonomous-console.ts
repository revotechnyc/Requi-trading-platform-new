/**
 * One-shot: apply autonomous console schema (`ac`) + seed to DATABASE_URL.
 * Usage: npx tsx scripts/ensure-autonomous-console.ts
 */
import "dotenv/config";
import { ensureAutonomousConsoleSchema } from "../api/autonomous/ensure-console-schema";

await ensureAutonomousConsoleSchema();
console.log("[ac] console schema ensure complete");
process.exit(0);
