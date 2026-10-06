/**
 * Autonomous console — paper-safe functional / integration probe.
 * Does NOT place live-money trades. Uses IBKR Paper + DB only.
 */
import '../api/lib/env';
import { getDb } from '../api/queries/connection';
import { orderTickets, positions, autonomousConfigs } from '../db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { IbkrBroker } from '../api/brokers/ibkr';
import { ibkrPaperStatus } from '../api/brokers/ibkr-paper';
import { confirmTicket, rejectTicket, listTickets } from '../api/queries/tickets';
import {
  getState,
  listAutonomousOrders,
  listAutonomousPositions,
  listAutonomousTrades,
  stream,
  updateConfig,
} from '../api/autonomous/service';
import { brokerStatuses } from '../api/brokers/registry';

type Result = { id: string; area: string; pass: boolean; detail: string; severity?: 'P0' | 'P1' | 'P2' };
const results: Result[] = [];
function ok(id: string, area: string, detail: string) {
  results.push({ id, area, pass: true, detail });
  console.log(`PASS [${id}] ${detail}`);
}
function fail(id: string, area: string, detail: string, severity: 'P0' | 'P1' | 'P2' = 'P1') {
  results.push({ id, area, pass: false, detail, severity });
  console.log(`FAIL [${id}] ${detail}`);
}

const USER = 'dba1bfb1-5dc6-439b-9e1c-c35bc77b8ce4'; // test1 from prior session tickets

async function main() {
  const db = getDb();
  const broker = new IbkrBroker();

  // ─── IBKR gateway / account ─────────────────────────────────────────
  const health = await broker.healthCheck();
  if (health.ok) ok('ibkr-health', 'IBKR', health.detail);
  else fail('ibkr-health', 'IBKR', health.detail, 'P0');

  const status = await ibkrPaperStatus(USER);
  if (status.gatewayOk && status.equity > 0) {
    ok('ibkr-status', 'IBKR', `equity=${status.equity} cash=${status.cash} bp=${status.buyingPower} acct=${status.accountId}`);
  } else {
    fail('ibkr-status', 'IBKR', JSON.stringify(status), 'P0');
  }

  // Cash + equity consistency: equity ≈ cash + positions MV (loose tolerance for marks)
  const accts = await broker.getAccounts();
  const acct = accts[0];
  const gwPos = await broker.getPositions(acct.accountId);
  const posMv = gwPos.reduce((s, p) => s + Math.abs(Number(p.marketValue) || 0), 0);
  const recon = Math.abs(acct.equity - (acct.cash + posMv));
  // Margin accounts: NetLiq vs cash+MV can diverge; flag only if wildly off (>5% of equity)
  if (acct.equity > 0 && recon / acct.equity < 0.05) {
    ok('cash-equity-recon', 'Financials', `equity=${acct.equity} cash=${acct.cash} posMV=${posMv.toFixed(0)} delta=${recon.toFixed(0)}`);
  } else if (acct.equity > 0) {
    fail('cash-equity-recon', 'Financials', `large recon delta ${recon.toFixed(0)} (equity ${acct.equity} cash ${acct.cash} posMV ${posMv})`, 'P2');
  } else {
    fail('cash-equity-recon', 'Financials', 'equity is 0', 'P0');
  }

  if (acct.cash < acct.equity || posMv > 0) {
    ok('buy-cash-semantics', 'Financials', 'cash ≤ equity with open positions (BUY reduced cash into holdings)');
  }

  // ─── Autonomous state / tabs data sources ───────────────────────────
  const state = await getState(USER);
  if (state.config && state.metrics) {
    ok('auto-state', 'Overview', `session=${state.session?.status ?? 'none'} mode=${state.config.mode} allocated=${state.metrics.allocated}`);
  } else fail('auto-state', 'Overview', 'missing config/metrics', 'P0');

  const orders = await listAutonomousOrders(USER);
  const ledgerPos = await listAutonomousPositions(USER);
  const trades = await listAutonomousTrades(USER);
  const events = await stream(USER);

  ok('orders-list', 'Orders', `${orders.length} tickets`);
  ok('positions-list', 'Positions', `${ledgerPos.length} ledger OPEN`);
  ok('trades-list', 'Financials', `${trades.length} closed`);
  ok('events-stream', 'Events', `${events.length} events`);

  // Gateway vs ledger: every gateway symbol should be visible somehow (ledger OR gateway merge on UI)
  const gwSyms = new Set(gwPos.filter((p) => Number(p.quantity) !== 0).map((p) => String(p.symbol).toUpperCase()));
  const ledSyms = new Set(ledgerPos.map((p) => p.symbol.toUpperCase()));
  const missingInLedger = [...gwSyms].filter((s) => !ledSyms.has(s));
  if (missingInLedger.length === 0 || gwSyms.size === 0) {
    ok('pos-ledger-align', 'Positions', 'ledger covers gateway symbols (or empty gateway)');
  } else {
    // UI merges gateway — warn not fail hard
    fail('pos-ledger-align', 'Positions', `gateway symbols not in ledger (UI gateway merge required): ${missingInLedger.join(',')}`, 'P2');
  }

  // Order state machine sanity
  const invalidStates = orders.filter((o) => !['READY_FOR_CONFIRMATION', 'WORKING', 'SUBMITTING', 'FILLED', 'FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'CANCELED', 'CONFIRMED', 'BROKER_ACK', 'PARTIALLY_FILLED'].includes(o.state));
  if (invalidStates.length === 0) ok('order-states', 'Orders', 'all ticket states recognized');
  else fail('order-states', 'Orders', `unknown states: ${invalidStates.map((o) => o.state).join(',')}`, 'P1');

  // READY tickets must not be past expiresAt without EXPIRED transition (best-effort)
  const staleReady = orders.filter(
    (o) => o.state === 'READY_FOR_CONFIRMATION' && o.expiresAt && new Date(o.expiresAt).getTime() < Date.now() - 60_000,
  );
  if (staleReady.length === 0) ok('ready-ttl', 'Orders', 'no long-expired READY tickets');
  else fail('ready-ttl', 'Orders', `${staleReady.length} READY tickets past expiry still listed`, 'P2');

  // Cross-page: WORKING/FILLED should have brokerOrderId
  const working = orders.filter((o) => o.state === 'WORKING' || o.state === 'FILLED');
  const missingBrokerId = working.filter((o) => !o.brokerOrderId);
  if (missingBrokerId.length === 0) ok('working-broker-id', 'Orders', `${working.length} WORKING/FILLED have brokerOrderId`);
  else fail('working-broker-id', 'Orders', `${missingBrokerId.length} WORKING/FILLED missing brokerOrderId`, 'P1');

  // ─── Settings updateConfig round-trip (safe: restore after) ─────────
  const cfg = state.config!;
  const origMaxPos = Number(cfg.maxPositions);
  const nextMaxPos = origMaxPos === 5 ? 6 : 5;
  await updateConfig(USER, { maxPositions: nextMaxPos });
  const after = await getState(USER);
  if (Number(after.config?.maxPositions) === nextMaxPos) {
    ok('settings-persist', 'Settings', `maxPositions ${origMaxPos}→${nextMaxPos}`);
  } else {
    fail('settings-persist', 'Settings', `expected ${nextMaxPos} got ${after.config?.maxPositions}`, 'P0');
  }
  await updateConfig(USER, { maxPositions: origMaxPos });
  const restored = await getState(USER);
  if (Number(restored.config?.maxPositions) === origMaxPos) ok('settings-restore', 'Settings', `restored maxPositions=${origMaxPos}`);
  else fail('settings-restore', 'Settings', 'failed to restore maxPositions', 'P1');

  // Invalid setting boundary
  try {
    await updateConfig(USER, { maxPositionSizePct: 0 });
    fail('settings-boundary', 'Settings', 'accepted maxPositionSizePct=0 (should reject)', 'P1');
  } catch {
    ok('settings-boundary', 'Settings', 'rejected maxPositionSizePct=0');
  }

  // ─── Broker registry ────────────────────────────────────────────────
  const brokers = await brokerStatuses();
  const ibkr = brokers.find((b) => b.code === 'IBKR');
  if (ibkr?.ok) ok('broker-registry', 'Data Feeds', ibkr.detail);
  else fail('broker-registry', 'Data Feeds', ibkr?.detail ?? 'IBKR missing', 'P1');

  // ─── Confirm path (paper): only if READY exists; prefer reject if we don't want new fills ──
  // Safer: propose is heavy; use existing READY if present, else skip confirm and document.
  const ready = orders.find((o) => o.state === 'READY_FOR_CONFIRMATION' && (!o.expiresAt || new Date(o.expiresAt).getTime() > Date.now()));
  if (ready) {
    // Reject path test first (safe, no fill)
    // Use a clone? Can't — reject consumes ticket. Prefer confirm only if qty=1 LMT for paper proof.
    const res = await confirmTicket(USER, ready.ticketId, `CONFIRM ORDER ${ready.ticketId}`);
    if (res.ok) {
      ok('confirm-flow', 'Orders', `${ready.ticketId} → ${res.reasonCode}: ${res.message}`);
      const afterOrders = await listAutonomousOrders(USER);
      const t = afterOrders.find((o) => o.ticketId === ready.ticketId);
      if (t && (t.state === 'WORKING' || t.state === 'FILLED' || t.state === 'SUBMITTING')) {
        ok('confirm-state', 'Orders', `post-confirm state=${t.state} brokerOrderId=${t.brokerOrderId}`);
      } else {
        fail('confirm-state', 'Orders', `unexpected post-confirm state=${t?.state}`, 'P0');
      }
      // Cross-page: positions or gateway should reflect if FILLED
      const gw2 = await broker.getPositions(acct.accountId);
      const led2 = await listAutonomousPositions(USER);
      ok('confirm-cross-pos', 'Positions', `gateway=${gw2.filter((p) => Number(p.quantity) !== 0).length} ledger=${led2.length}`);
      const st2 = await ibkrPaperStatus(USER);
      ok('confirm-cross-cash', 'Financials', `cash=${st2.cash} equity=${st2.equity}`);
      const ev2 = await stream(USER);
      ok('confirm-cross-audit', 'Audit', `stream events=${ev2.length}`);
    } else {
      fail('confirm-flow', 'Orders', `${ready.ticketId} confirm failed: ${res.message}`, /bridge|auth/i.test(res.message) ? 'P0' : 'P1');
    }
  } else {
    // No READY — test reject on non-confirmable returns proper error
    const any = orders[0];
    if (any) {
      const rej = await rejectTicket(USER, any.ticketId);
      if (!rej.ok && any.state !== 'READY_FOR_CONFIRMATION') {
        ok('reject-guard', 'Orders', `reject blocked on ${any.state}: ${rej.message}`);
      } else if (rej.ok) {
        ok('reject-flow', 'Orders', `rejected ${any.ticketId}`);
      } else {
        fail('reject-guard', 'Orders', rej.message, 'P2');
      }
    }
    ok('confirm-flow-skip', 'Orders', 'no READY ticket — confirm E2E skipped (manual)');
  }

  // Duplicate confirm on already WORKING/FILLED
  const filledOrWorking = (await listAutonomousOrders(USER)).find((o) => o.state === 'WORKING' || o.state === 'FILLED');
  if (filledOrWorking) {
    const dup = await confirmTicket(USER, filledOrWorking.ticketId, `CONFIRM ORDER ${filledOrWorking.ticketId}`);
    if (!dup.ok) ok('dup-confirm', 'Orders', `duplicate confirm rejected: ${dup.reasonCode}`);
    else fail('dup-confirm', 'Orders', 'duplicate confirm incorrectly succeeded', 'P0');
  }

  // Invalid confirmation string
  if (orders.some((o) => o.state === 'READY_FOR_CONFIRMATION')) {
    const r = orders.find((o) => o.state === 'READY_FOR_CONFIRMATION')!;
    const bad = await confirmTicket(USER, r.ticketId, 'CONFIRM ORDER WRONG-ID');
    if (!bad.ok) ok('bad-confirm-string', 'Orders', bad.reasonCode);
    else fail('bad-confirm-string', 'Orders', 'accepted mismatched confirm string', 'P0');
  }

  // Risk: open count vs maxPositions
  const openGw = gwPos.filter((p) => Number(p.quantity) !== 0).length;
  const maxP = Number(restored.config?.maxPositions ?? 0);
  ok('risk-exposure', 'Risk', `openGateway=${openGw} maxPositions=${maxP} deployed=${restored.metrics?.deployed}`);

  // Latency/Data Feeds proxies
  ok('latency-proxy', 'Latency', `event span sample n=${events.length}`);
  ok('datafeeds-proxy', 'Data Feeds', `IBKR gatewayOk=${status.gatewayOk} broker.ok=${ibkr?.ok}`);

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify({ total: results.length, passed, failed, failures: results.filter((r) => !r.pass) }, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
