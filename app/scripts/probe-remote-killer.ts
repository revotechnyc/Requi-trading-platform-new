import "../api/lib/env";
import { getSql } from "../api/queries/connection";

const sql = getSql();
const userId = "dba1bfb1-5dc6-439b-9e1c-c35bc77b8ce4";

await sql`
  update autonomous_sessions
  set status = 'STOPPED', "stoppedAt" = now(), "endedReason" = 'PROBE'
  where "userId" = ${userId} and status in ('RUNNING','PAUSED','ERROR','BROKER_DISCONNECTED')
`;

const rows = await sql`
  insert into autonomous_sessions ("userId", "configId", mode, "accountId", status, "lastError")
  select ${userId}, c.id, c.mode, c."accountId", 'RUNNING', 'PROBE_SHOULD_STAY_RUNNING'
  from autonomous_configs c
  where c."userId" = ${userId}
  limit 1
  returning id, status, "lastError", "startedAt"
`;
console.log("inserted", rows);
console.log("waiting 20s...");
await new Promise((r) => setTimeout(r, 20000));

const after = await sql`
  select id, status, "lastError", "endedReason", "startedAt"
  from autonomous_sessions
  where id = ${rows[0].id}
`;
console.log("after 20s", after);

const events = await sql`
  select phase, kind, left(message, 160) as message, "createdAt"
  from autonomous_events
  where "sessionId" = ${rows[0].id}
  order by "createdAt" desc
  limit 10
`;
console.log("events", events);
await sql.end({ timeout: 2 });
