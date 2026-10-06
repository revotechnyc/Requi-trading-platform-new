import "../api/lib/env";
import { gatewayHealth } from "../api/marketdata/ibkr-data";
import { ibkrPaperStatus } from "../api/brokers/ibkr-paper";
import { getSql } from "../api/queries/connection";

const h = await gatewayHealth();
console.log("health", h);
const s = await ibkrPaperStatus("dba1bfb1-5dc6-439b-9e1c-c35bc77b8ce4");
console.log("status", {
  gatewayOk: s.gatewayOk,
  connectedForUser: s.connectedForUser,
  detail: s.detail,
  configured: s.configured,
});
const sql = getSql();
const sessions = await sql`
  select status, "lastError", "endedReason"
  from autonomous_sessions
  where "userId" = ${"dba1bfb1-5dc6-439b-9e1c-c35bc77b8ce4"}
  order by "startedAt" desc
  limit 3
`;
console.log("sessions", sessions);
await sql.end({ timeout: 2 });
