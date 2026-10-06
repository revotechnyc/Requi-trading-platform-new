import "../api/lib/env";
import { getSql } from "../api/queries/connection";

const sql = getSql();
const updated = await sql`
  update autonomous_sessions
  set status = 'STOPPED',
      "stoppedAt" = now(),
      "endedReason" = 'USER_STOP',
      "lastError" = 'cleared for restart — click START again'
  where status = 'BROKER_DISCONNECTED'
  returning id, status
`;
console.log("cleared", updated.length, updated);
await sql.end({ timeout: 2 });
