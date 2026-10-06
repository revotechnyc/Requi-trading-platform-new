import "../api/lib/env";
import { getSql } from "../api/queries/connection";
import { start, getState } from "../api/autonomous/service";
import { gatewayHealth } from "../api/marketdata/ibkr-data";

const userId = "dba1bfb1-5dc6-439b-9e1c-c35bc77b8ce4";
const sql = getSql();

const health = await gatewayHealth();
console.log("health", health);

const state = await getState(userId);
console.log("state", {
  killSwitch: state.killSwitch,
  mode: state.config?.mode,
  accountId: state.config?.accountId,
  allocation: state.config?.allocationValue,
  accountStatus: state.account?.status,
  accountBroker: state.account?.broker,
  accountEquity: state.account?.equity,
  sessionStatus: state.session?.status,
  sessionError: state.session?.lastError,
  metricsAllocated: state.metrics?.allocated,
});

try {
  const s = await start(userId);
  console.log("start OK", { id: s?.id, status: s?.status, lastError: s?.lastError });
} catch (e) {
  console.log("start FAIL:", (e as Error).message);
}

const sessions = await sql`
  select status, "lastError", "endedReason", "startedAt"
  from autonomous_sessions
  where "userId" = ${userId}
  order by "startedAt" desc
  limit 3
`;
console.log("sessions", sessions);
await sql.end({ timeout: 2 });
