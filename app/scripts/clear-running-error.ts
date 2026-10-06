import "../api/lib/env";
import { getSql } from "../api/queries/connection";

const sql = getSql();
await sql`update autonomous_sessions set "lastError" = null where status = 'RUNNING'`;
const r = await sql`select id, status, "lastError" from autonomous_sessions where status = 'RUNNING'`;
console.log(r);
await sql.end({ timeout: 2 });
