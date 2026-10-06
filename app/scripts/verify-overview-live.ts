import "../api/lib/env";
import { getState, listAutonomousOrders, listAutonomousPositions, stream } from "../api/autonomous/service";
import { ibkrPaperStatus } from "../api/brokers/ibkr-paper";

const userId = "dba1bfb1-5dc6-439b-9e1c-c35bc77b8ce4";

const [state, ibkr, positions, orders, events] = await Promise.all([
  getState(userId),
  ibkrPaperStatus(userId),
  listAutonomousPositions(userId),
  listAutonomousOrders(userId),
  stream(userId),
]);

const equity = Number(ibkr.equity || state.account?.equity || 0);
const openAtBroker = orders.filter((o) =>
  ["WORKING", "SUBMITTING", "CONFIRMED", "BROKER_ACK", "PARTIALLY_FILLED"].includes(o.state),
);
const staged = orders.filter((o) => o.state === "READY_FOR_CONFIRMATION");

const report = {
  ok: {
    navIsIbkrNotDemo: equity > 0 && Math.abs(equity - 284750.5) > 1,
    gatewayOk: ibkr.gatewayOk,
    accountId: ibkr.accountId,
    session: state.session?.status ?? null,
    mode: state.config?.mode ?? null,
    openOrdersVsAwaitingConsistent:
      openAtBroker.every((o) => o.state !== "READY_FOR_CONFIRMATION") &&
      staged.every((o) => o.state === "READY_FOR_CONFIRMATION"),
  },
  fields: {
    nav: equity,
    cash: ibkr.cash,
    buyingPower: ibkr.buyingPower,
    allocated: state.metrics?.allocated,
    deployed: state.metrics?.deployed,
    todayPnl: state.metrics?.todayPnl,
    tradesToday: state.metrics?.tradesToday,
    openPositions: positions.length,
    openOrdersAtBroker: openAtBroker.length,
    stagedAwaitingConfirm: staged.length,
    eventCount: events.length,
  },
  positions: positions.slice(0, 5).map((p) => ({
    symbol: p.symbol,
    broker: p.broker,
    qty: p.quantity,
    entry: p.avgEntry,
    strategy: p.strategy,
  })),
  stagedTickets: staged.slice(0, 5).map((t) => ({
    ticketId: t.ticketId,
    symbol: t.symbol,
    side: t.side,
    state: t.state,
  })),
  latestEvents: events.slice(0, 3).map((e) => ({
    phase: e.phase,
    message: String(e.message).slice(0, 100),
  })),
  gaps: [
    "Mark column uses highestPrice (session high), not a live IBKR last trade — labeled accordingly in UI",
    "No fake candle chart (intentional — do not invent OHLCV)",
    "Earnings swarm cards removed (were demo)",
  ],
};

console.log(JSON.stringify(report, null, 2));
process.exit(0);
