import { groupRthSessions } from "../marketdata/indicators";
import { marketDataService } from "../marketdata/service";
import { loadConfig } from "./config";
import { SetupMachine, type MachineEvent, type Proposal } from "./state-machine";
import { proposeTicket, autoExecuteTicket } from "../queries/tickets";
import { sizePosition, portfolioHeatPct, returnCorrelation, GLOBAL_RISK } from "./risk";
import { isAutoExecuteEnabled, openRiskDollars, listPositions } from "./portfolio";
import type { PublicTicket } from "../queries/tickets";

/**
 * ENGINE MONITOR — module 6, execution wiring.
 *
 * The live autonomous loop for one user + symbol + strategy config:
 *
 *   feed refresh (module 0) → SetupMachine evaluates latest bar
 *   → CONFIRMED proposal → governance-clamped risk sizing
 *   → proposeTicket(...) → READY_FOR_CONFIRMATION
 *   → human types CONFIRM ORDER [TICKET_ID] → existing broker path
 *
 * Phase 1 by design: the engine NEVER auto-executes. Every proposal lands
 * in the same ticketed confirmation gate used by Intelligence — the exact
 * CONFIRM string validated against the signed governance package.
 * One proposal per symbol per day (OCO across variants is enforced by the
 * machine itself; the monitor adds the per-day idempotence).
 */

const PAPER_EQUITY = 100_000; // paper-mode account equity until a live broker account is bound

interface ActiveMonitor {
  userId: string;
  symbol: string;
  strategyId: string;
  machine: SetupMachine;
  lastProposalDay: string | null;
  lastEvents: MachineEvent[];
  startedAt: number;
}

const monitors = new Map<string, ActiveMonitor>();

function key(userId: string, symbol: string): string {
  return `${userId}:${symbol.toUpperCase()}`;
}

function etDay(t: number): string {
  return new Date(t).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export async function startMonitor(userId: string, symbol: string, strategyId: string): Promise<{ ok: boolean; detail: string }> {
  const sym = symbol.toUpperCase();
  const { config, clamps, governanceVersion } = await loadConfig(strategyId); // throws GOVERNANCE_UNAVAILABLE — by design
  const machine = new SetupMachine(sym, config);
  monitors.set(key(userId, sym), {
    userId,
    symbol: sym,
    strategyId,
    machine,
    lastProposalDay: null,
    lastEvents: [],
    startedAt: Date.now(),
  });
  const clampNote = clamps.length > 0 ? ` · clamps: ${clamps.map((c) => `${c.field} ${c.requested}→${c.applied}`).join(", ")}` : "";
  return { ok: true, detail: `monitoring ${sym} with ${config.label} under governance ${governanceVersion}${clampNote}` };
}

export function stopMonitor(userId: string, symbol: string): boolean {
  return monitors.delete(key(userId, symbol));
}

export function listMonitors(userId: string): Array<{ symbol: string; strategyId: string; state: string; timerCount: number; startedAt: number; events: MachineEvent[] }> {
  return [...monitors.values()]
    .filter((m) => m.userId === userId)
    .map((m) => ({ symbol: m.symbol, strategyId: m.strategyId, state: m.machine.state, timerCount: m.machine.timerCount, startedAt: m.startedAt, events: m.lastEvents.slice(-20) }));
}

export interface EvaluateResult {
  symbol: string;
  state: string;
  timerCount: number;
  proposal: Proposal | null;
  ticket: PublicTicket | null;
  detail: string;
}

/**
 * Evaluate one monitored symbol against its freshest bars. Called by the
 * router (manual evaluate) and intended to be invoked after each data
 * refresh tick.
 */
export async function evaluateMonitor(userId: string, symbol: string): Promise<EvaluateResult> {
  const sym = symbol.toUpperCase();
  const mon = monitors.get(key(userId, sym));
  if (!mon) return { symbol: sym, state: "NOT_MONITORED", timerCount: 0, proposal: null, ticket: null, detail: "no active monitor — start one first" };

  const feed = marketDataService.get(sym);
  if (!feed || feed.bars.length === 0) {
    return { symbol: sym, state: mon.machine.state, timerCount: mon.machine.timerCount, proposal: null, ticket: null, detail: feed?.error ?? "no bars — track the symbol in the data feed first" };
  }

  const sessions = groupRthSessions(feed.bars);
  const days = [...sessions.keys()].sort();
  const todayBars = sessions.get(days[days.length - 1]) ?? [];
  const prior = days.length > 1 ? sessions.get(days[days.length - 2])! : null;
  const priorDay = prior
    ? { high: Math.max(...prior.map((b) => b.h)), low: Math.min(...prior.map((b) => b.l)), close: prior[prior.length - 1].c }
    : null;

  const events: MachineEvent[] = [];
  const proposal = mon.machine.onBar({ session: todayBars, priorDay });
  mon.lastEvents = mon.machine.getEvents().slice(-50);
  events.push(...mon.machine.getEvents().slice(-3));

  let ticket: PublicTicket | null = null;
  let detail = `state ${mon.machine.state} · timer ${mon.machine.timerCount}`;

  if (proposal) {
    const day = etDay(proposal.t);
    if (mon.lastProposalDay === day) {
      detail = "proposal suppressed — already proposed for this symbol today (OCO per-day rule)";
    } else {
      mon.lastProposalDay = day;
      const { config } = await loadConfig(mon.strategyId);
      const size = sizePosition({
        accountEquity: PAPER_EQUITY,
        entry: proposal.entry,
        stop: proposal.stop,
        maxRiskPct: config.sizing.max_risk_pct,
        maxPositionPct: config.sizing.max_position_pct,
      });
      if (size.qty <= 0) {
        detail = "proposal blocked by risk engine — size resolved to zero";
      } else if (await (async () => {
        /* §3 gate 10 — PORTFOLIO HEAT: projected open risk must stay ≤ 10% of equity. */
        const heatNow = portfolioHeatPct(await openRiskDollars(userId), PAPER_EQUITY);
        const projected = +((heatNow + (size.dollarRisk / PAPER_EQUITY) * 100)).toFixed(2);
        if (projected > GLOBAL_RISK.portfolioHeatMaxPct) {
          detail = `proposal blocked by PORTFOLIO HEAT gate — projected ${projected}% > ${GLOBAL_RISK.portfolioHeatMaxPct}% cap (current ${heatNow}% + new $${size.dollarRisk})`;
          return true;
        }
        /* §3 gate 11 — CORRELATION: candidate vs every open position; > 0.70 or unverifiable → REJECT (§5). */
        const open = await listPositions(userId, 50);
        const candCloses = todayBars.slice(-31).map((b) => b.c);
        for (const p of open.filter((x) => x.status === "OPEN" && x.symbol !== sym)) {
          const pFeed = marketDataService.get(p.symbol);
          if (!pFeed || pFeed.bars.length < 10) {
            detail = `proposal blocked by CORRELATION gate — cannot verify vs open position ${p.symbol} (no feed data; §5 never-estimate rule)`;
            return true;
          }
          const corr = returnCorrelation(candCloses, pFeed.bars.slice(-31).map((b) => b.c));
          if (corr === null) {
            detail = `proposal blocked by CORRELATION gate — insufficient overlapping bars vs ${p.symbol} (§5 never-estimate rule)`;
            return true;
          }
          if (corr > GLOBAL_RISK.maxPairwiseCorrelation) {
            detail = `proposal blocked by CORRELATION gate — r=${corr} vs open position ${p.symbol} exceeds ${GLOBAL_RISK.maxPairwiseCorrelation}`;
            return true;
          }
        }
        return false;
      })()) {
        // detail set by the gate above — proposal dies here, deterministic REJECT
      } else {
        const result = await proposeTicket(userId, {
          strategy: proposal.strategyId.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) || "ENGINE",
          broker: "PAPER",
          symbol: sym,
          side: "BUY",
          quantity: size.qty,
          orderType: "STP",
          stopPrice: proposal.entry,
          tif: "DAY",
          entry: proposal.entry,
          stop: proposal.stop,
          target: proposal.targets[0]?.price,
          target2: proposal.targets[1]?.price,
          origin: "AUTONOMOUS",
        });
        ticket = result.ticket;
        if (await isAutoExecuteEnabled(userId)) {
          // User opted in: AUTONOMOUS proposals execute without the CONFIRM
          // string. Same ticket artifact, same broker path, louder audit.
          const exec = await autoExecuteTicket(userId, result.ticket.ticketId);
          ticket = exec.ticket ?? ticket;
          detail = exec.ok
            ? `AUTO-EXECUTED → ${exec.message} (${size.qty} sh, risk $${size.dollarRisk}, capped by ${size.cappedBy})`
            : `auto-execute failed (${exec.reasonCode}: ${exec.message}) — ticket ${result.ticket.ticketId} remains staged for manual CONFIRM`;
        } else {
          detail = `CONFIRMED → ticket ${result.ticket.ticketId} staged (${size.qty} sh, risk $${size.dollarRisk}, capped by ${size.cappedBy}) — awaiting CONFIRM ORDER ${result.ticket.ticketId}`;
        }
      }
    }
  }

  return { symbol: sym, state: mon.machine.state, timerCount: mon.machine.timerCount, proposal, ticket, detail };
}

/** Evaluate every active monitor (call after data-feed refresh ticks). */
export async function evaluateAll(): Promise<number> {
  let n = 0;
  for (const m of [...monitors.values()]) {
    await evaluateMonitor(m.userId, m.symbol).catch(() => undefined);
    n += 1;
  }
  return n;
}
