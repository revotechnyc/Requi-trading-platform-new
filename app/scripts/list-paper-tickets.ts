import "../api/lib/env";
import { getSql } from "../api/queries/connection";

const sql = getSql();
const userId = "dba1bfb1-5dc6-439b-9e1c-c35bc77b8ce4";

const tickets = await sql`
  select "ticketId", symbol, side, quantity, state, broker, "accountId", "limitPrice", "createdAt"
  from order_tickets
  where "userId" = ${userId}
  order by "createdAt" desc
  limit 10
`;
console.log("tickets", tickets);

const events = await sql`
  select phase, kind, left(message, 140) as message, "createdAt"
  from autonomous_events
  where "userId" = ${userId}
  order by "createdAt" desc
  limit 8
`;
console.log("events", events);

const sess = await sql`
  select id, status, "lastError", "startedAt" from autonomous_sessions
  where "userId" = ${userId} and status = 'RUNNING'
`;
console.log("running", sess);
await sql.end({ timeout: 2 });
