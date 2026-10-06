import "../api/lib/env";
import { getSql } from "../api/queries/connection";

const sql = getSql();
const userId = "dba1bfb1-5dc6-439b-9e1c-c35bc77b8ce4";

const failed = await sql`
  select "ticketId", symbol, state, "lastMessage", "brokerOrderId"
  from order_tickets
  where "userId" = ${userId} and state in ('FAILED','REJECTED')
  order by "createdAt" desc
  limit 5
`;
console.log("failed", failed);

const openPos = await sql`
  select id, symbol, broker, status, quantity, "avgEntry", "sourceTicketId"
  from positions
  where "userId" = ${userId} and status = 'OPEN'
`;
console.log("openPos", openPos);

await sql.end({ timeout: 2 });
