import { ensureAutonomousTradingSchema } from "../api/autonomous/ensure-trading-schema";
import { getSql } from "../api/queries/connection";

await ensureAutonomousTradingSchema();
const sql = getSql();
const rows = await sql`select to_regclass('public.autonomous_sessions') as t`;
console.log("autonomous_sessions =", rows[0]?.t);
const rows2 = await sql`select to_regclass('public.autonomous_configs') as t`;
console.log("autonomous_configs =", rows2[0]?.t);
await sql.end({ timeout: 2 });
