import { getSql } from "../api/queries/connection";
import { getDb } from "../api/queries/connection";
import { autonomousSessions } from "../db/schema";
import { eq } from "drizzle-orm";

const sql = getSql();
try {
  const cols = await sql`
    select column_name, data_type
    from information_schema.columns
    where table_schema = 'public' and table_name = 'autonomous_sessions'
    order by ordinal_position
  `;
  console.log("columns:", cols.map((c) => `${c.column_name}:${c.data_type}`).join(", "));
} catch (e) {
  console.error("info_schema failed", e);
}

try {
  const rows = await sql`select * from autonomous_sessions limit 1`;
  console.log("raw select ok, rows=", rows.length);
} catch (e) {
  console.error("raw select failed:", (e as Error).message);
}

try {
  const db = getDb();
  const rows = await db.select().from(autonomousSessions).where(eq(autonomousSessions.status, "RUNNING")).limit(50);
  console.log("drizzle select ok, rows=", rows.length);
} catch (e) {
  console.error("drizzle select failed:", e);
}

await sql.end({ timeout: 2 });
