import "../api/lib/env";
import { getSql } from "../api/queries/connection";

const sql = getSql();
const userId = "dba1bfb1-5dc6-439b-9e1c-c35bc77b8ce4";
const sessions = await sql`
  select status, "lastError", "endedReason", "startedAt"
  from autonomous_sessions
  where "userId" = ${userId}
  order by "startedAt" desc
  limit 3
`;
console.log(sessions);
await sql.end({ timeout: 2 });
