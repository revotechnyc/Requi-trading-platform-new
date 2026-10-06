import "../api/lib/env";
import { getSql } from "../api/queries/connection";
import { gatewayHealth } from "../api/marketdata/ibkr-data";

const sql = getSql();
const userId = "dba1bfb1-5dc6-439b-9e1c-c35bc77b8ce4";

const health = await gatewayHealth();
console.log("health", health);

const sessions = await sql`
  select id, status, "lastError", "startedAt"
  from autonomous_sessions
  where "userId" = ${userId}
  order by "startedAt" desc
  limit 5
`;
console.log("sessions", sessions);

const events = await sql`
  select phase, kind, left(message, 140) as message, "createdAt"
  from autonomous_events
  where "userId" = ${userId}
  order by "createdAt" desc
  limit 20
`;
console.log("events", events);
await sql.end({ timeout: 2 });
