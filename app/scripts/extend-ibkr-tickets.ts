import "../api/lib/env";
import { getSql } from "../api/queries/connection";

/** Extend confirmation window on today's IBKR staged tickets so the client can Confirm. */
const sql = getSql();
const userId = "dba1bfb1-5dc6-439b-9e1c-c35bc77b8ce4";

const updated = await sql`
  update order_tickets
  set "expiresAt" = now() + interval '30 minutes'
  where "userId" = ${userId}
    and broker = 'IBKR'
    and state = 'READY_FOR_CONFIRMATION'
  returning "ticketId", symbol, side, quantity, state, "expiresAt"
`;
console.log("extended", updated);
await sql.end({ timeout: 2 });
