import { getSql } from "../api/queries/connection";

const sql = getSql();
const brokers = await sql`select id, "userId", broker, label, equity, status from broker_accounts limit 10`;
console.log("broker_accounts count", brokers.length);
for (const b of brokers) console.log(JSON.stringify(b));
const sessions = await sql`select id, status, "lastError", "accountId" from autonomous_sessions order by "startedAt" desc limit 5`;
console.log("sessions", sessions.length, sessions);
const configs = await sql`select id, "userId", "accountId", mode, "allocationValue" from autonomous_configs limit 5`;
console.log("configs", configs);
await sql.end({ timeout: 2 });
