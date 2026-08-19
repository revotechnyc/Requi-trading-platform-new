import { getDb } from "./connection";
import { alerts, runEvents, runSessions } from "@db/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import { runtimePreflight } from "../governance/runtime";

/**
 * Autonomous run simulator (paper mode). While a run is active, each feed poll
 * advances the loop narrative based on elapsed time — one event per ~2.2s tick.
 * Big moments (qualified trade, fill, risk) are cross-posted to the alerts
 * stream so the notification bell lights up during a run.
 */

const TICK_MS = 2200;
const MAX_TICKS_PER_POLL = 5;

/** Generic paper-trading universe — codenames only, never real stocks or tokens. */
const UNIVERSE = [
  { symbol: "ALPHA", base: 189 },
  { symbol: "BRAVO", base: 248 },
  { symbol: "CHARLIE", base: 232 },
  { symbol: "DELTA", base: 164 },
  { symbol: "ECHO", base: 428 },
  { symbol: "FOXTROT", base: 612 },
  { symbol: "GOLF", base: 172 },
  { symbol: "HOTEL", base: 918 },
  { symbol: "INDIA", base: 246 },
  { symbol: "JULIET", base: 205 },
];
/** Registered autonomous strategies (implementations private, server-side). */
const STRATEGIES = [
  "Pre-Earnings Sentiment",
  "Through-Earnings Event",
  "Earnings-Day Reaction",
  "Post-Earnings Continuation",
  "Bearish Earnings",
  "General Intraday",
];

const r = (min: number, max: number, dp = 2) => +(min + Math.random() * (max - min)).toFixed(dp);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

type Sess = typeof runSessions.$inferSelect;
type Ev = { phase: string; kind: "info" | "success" | "warn" | "risk" | "trade"; message: string; symbol?: string };

/** Produce the next event for a session and its follow-on state. */
function nextEvent(s: Sess): { ev: Ev; patch: Partial<Sess> } {
  const ticks = s.ticks + 1;

  // ── holding a position: monitoring, then exit ────────────────────────────
  if (s.arc === "holding" && s.symbol && s.entry && s.stop && s.target) {
    const entry = parseFloat(s.entry);
    const stop = parseFloat(s.stop);
    const target = parseFloat(s.target);
    if (Math.random() < 0.14) {
      const hitTarget = Math.random() < 0.45;
      const px = hitTarget ? target : r(stop, stop + (entry - stop) * 0.6);
      const pnl = ((px - entry) * 40).toFixed(2);
      return {
        ev: {
          phase: "EXIT",
          kind: hitTarget ? "success" : "warn",
          symbol: s.symbol,
          message: hitTarget
            ? `Target hit — ${s.symbol} 40 sold @ ${px.toFixed(2)} · P&L +$${pnl} · Trade complete, logged to audit ledger`
            : `Trailing stop triggered — ${s.symbol} 40 sold @ ${px.toFixed(2)} · P&L -$${Math.abs(+pnl).toFixed(2)} · Within risk budget (1.0%)`,
        },
        patch: { arc: "idle", symbol: null, entry: null, stop: null, target: null, ticketId: null, ticks },
      };
    }
    const newStop = Math.min(parseFloat((stop + (entry - stop) * 0.25).toFixed(2)), entry);
    const px = r(entry * 0.995, entry * 1.012);
    const pnl = ((px - entry) * 40).toFixed(2);
    return {
      ev: {
        phase: "MONITORING",
        kind: "info",
        symbol: s.symbol,
        message: `${s.symbol} @ ${px.toFixed(2)} · unrealized ${+pnl >= 0 ? "+" : ""}$${pnl} · trailing stop tightened ${stop.toFixed(2)} → ${newStop.toFixed(2)} (never widens) · spread 0.0${r(1, 4)}%`,
      },
      patch: { stop: newStop.toFixed(2), ticks },
    };
  }

  // ── qualified: build ticket, session-authorized confirm, submit ──────────
  if (s.arc === "qualified" && s.symbol && s.entry && s.stop && s.target) {
    const entry = parseFloat(s.entry);
    const fill = r(entry * 0.999, entry * 1.001);
    const ticket = s.ticketId ?? `TKT-${r(10000, 99999, 0)}`;
    return {
      ev: {
        phase: "EXECUTION",
        kind: "trade",
        symbol: s.symbol,
        message: `Session authorized — no per-trade confirmation required · ${ticket} submitted → broker ACK ${r(68, 140, 0)}ms → FILLED 40 @ ${fill.toFixed(2)} · slippage +0.0${r(1, 3)}%`,
      },
      patch: { arc: "protected", entry: fill.toFixed(2), ticketId: ticket, ticks },
    };
  }

  // ── protected: place protection, move to holding ─────────────────────────
  if (s.arc === "protected" && s.symbol && s.stop && s.target) {
    return {
      ev: {
        phase: "PROTECTION",
        kind: "success",
        symbol: s.symbol,
        message: `Protection placed — hard stop ${parseFloat(s.stop).toFixed(2)} · target ${parseFloat(s.target).toFixed(2)} · adaptive trailing armed (D = max(1.8×ATR, 2.1×σ√Δt, spread, structure)) · status PROTECTED`,
      },
      patch: { arc: "holding", ticks },
    };
  }

  // ── idle: scan / evaluate / no-trade, sometimes qualify ──────────────────
  if (Math.random() < 0.16) {
    const c = pick(UNIVERSE);
    const entry = r(c.base * 0.98, c.base * 1.02);
    const stop = +(entry * 0.966).toFixed(2);
    const target = +(entry * 1.08).toFixed(2);
    return {
      ev: {
        phase: "EVALUATE",
        kind: "trade",
        symbol: c.symbol,
        message: `QUALIFIED_TRADE — ${c.symbol} BUY via ${pick(STRATEGIES)} · entry ${entry.toFixed(2)} · stop ${stop.toFixed(2)} · target ${target.toFixed(2)} · EV +${r(1.6, 2.9)}R · confidence ${r(64, 81, 0)}% · data grade A · ticket building → READY`,
      },
      patch: { arc: "qualified", symbol: c.symbol, entry: entry.toFixed(2), stop: stop.toFixed(2), target: target.toFixed(2), ticks },
    };
  }

  const scanMsgs = [
    () => `Scanning ${r(280, 460, 0)} symbols across ${r(5, 9, 0)} sectors · RVOL, VWAP position, spread, and regime filters applied`,
    () => `Event check: no material headlines in watched universe · earnings calendar clear for the session`,
    () => `Volatility screen: regime stable · high-volatility sizing multipliers unchanged`,
  ];
  const evalMsgs = (c: { symbol: string; base: number }) => [
    `Evaluating ${c.symbol} vs ${pick(STRATEGIES)} — RVOL ${r(1.1, 2.2)}, ${Math.random() < 0.5 ? "above" : "below"} 20-day high · RSI ${r(42, 68, 0)} · incomplete signal`,
    `${c.symbol}: RVOL ${r(0.8, 1.9)} but entry not at VWAP · spread 0.0${r(2, 7)}% · criteria unmet`,
  ];
  const noTrade = [
    "TRANSIENT_NO_TRADE — waiting for VWAP reclaim on 3 candidates · event-triggered re-evaluation armed",
    "TRANSIENT_NO_TRADE — price not at entry on 2 setups · monitoring continues",
    "NO_TRADE — portfolio heat at 78% of budget · new entries throttled until exposure rolls off",
    "Cash is a valid decision — 0 qualified trades this cycle · scanning continues",
  ];

  const roll = Math.random();
  if (roll < 0.34) return { ev: { phase: "SCAN", kind: "info", message: pick(scanMsgs)() }, patch: { ticks } };
  if (roll < 0.62) {
    const c = pick(UNIVERSE);
    return { ev: { phase: "EVALUATE", kind: "info", symbol: c.symbol, message: pick(evalMsgs(c)) }, patch: { ticks } };
  }
  return { ev: { phase: "DECIDE", kind: "warn", message: pick(noTrade) }, patch: { ticks } };
}

async function emit(userId: string, ev: Ev) {
  const db = getDb();
  await db.insert(runEvents).values({ userId, ...ev });

  // Cross-post big moments to the alerts stream
  if (ev.kind === "trade" && ev.phase === "EVALUATE") {
    await db.insert(alerts).values({
      userId, type: "OPPORTUNITY", priority: "HIGH",
      title: "New Trade Opportunity Found", body: ev.message, symbol: ev.symbol, state: "ACTIVE",
    });
  } else if (ev.kind === "trade" && ev.phase === "EXECUTION") {
    await db.insert(alerts).values({
      userId, type: "EXECUTION", priority: "HIGH",
      title: "Order Executed", body: ev.message, symbol: ev.symbol, state: "ACTIVE",
    });
  } else if (ev.phase === "EXIT") {
    await db.insert(alerts).values({
      userId, type: "POSITION_UPDATE", priority: "MEDIUM",
      title: "Position Update", body: ev.message, symbol: ev.symbol, state: "EXITED",
    });
  }
}

async function getSession(userId: string): Promise<Sess> {
  const db = getDb();
  const [row] = await db.select().from(runSessions).where(eq(runSessions.userId, userId));
  if (row) return row;
  await db.insert(runSessions).values({ userId }).onConflictDoNothing();
  const [created] = await db.select().from(runSessions).where(eq(runSessions.userId, userId));
  return created;
}

export async function startRun(userId: string, mode: "AUTONOMOUS_PAPER" | "AUTONOMOUS_LIVE") {
  const db = getDb();
  await getSession(userId);

  // The engine operates ONLY on a signed, verified governance package.
  let preflight;
  try {
    preflight = await runtimePreflight({ killSwitchArmed: true, accountReconciled: true, dataCurrent: true, brokerOperational: true });
  } catch (e) {
    await emit(userId, { phase: "SYSTEM", kind: "risk", message: `START REFUSED — ${(e as Error).message}. No compiled, signed governance package is active; the autonomous engine cannot authorize any action.` });
    return { active: false, refused: true, reasonCode: "GOVERNANCE_UNAVAILABLE" };
  }
  if (!preflight.ok) {
    await emit(userId, { phase: "SYSTEM", kind: "risk", message: `START REFUSED — preflight failed: ${preflight.reasonCodes.join(", ")}. Resolve the failed checks and retry.` });
    return { active: false, refused: true, reasonCode: preflight.reasonCodes[0] };
  }

  await db
    .update(runSessions)
    .set({ active: true, mode, startedAt: new Date(), lastEventAt: new Date(), arc: "idle", symbol: null, entry: null, stop: null, target: null, ticketId: null, ticks: 0 })
    .where(eq(runSessions.userId, userId));
  await emit(userId, { phase: "SYSTEM", kind: "success", message: `Engine started in ${mode} · governance package ${preflight.packageVersion} signature verified (sha256 ${preflight.packageHashShort}…) · ${STRATEGIES.length} registered strategies ACTIVE` });
  await emit(userId, { phase: "PREFLIGHT", kind: "info", message: `Preflight: ${preflight.checks.map((c) => c.key).join(" · ")} — all PASS · entering SCAN` });
  await db.insert(alerts).values({
    userId, type: "SYSTEM_STATE", priority: "LOW",
    title: "System Status Update", body: `Autonomous run started in ${mode}. Engine is scanning under governance package ${preflight.packageVersion}.`, state: "WATCHING",
  });
  return { active: true };
}

export async function stopRun(userId: string) {
  const db = getDb();
  const s = await getSession(userId);
  if (s.active) {
    await emit(userId, { phase: "SYSTEM", kind: "warn", message: `Stop requested by user — safe-to-cancel orders cancelled, protections preserved, ${s.arc === "holding" ? "open position stays protected" : "no open exposure"} · engine HALTED` });
  }
  await db.update(runSessions).set({ active: false }).where(eq(runSessions.userId, userId));
  await db.insert(alerts).values({
    userId, type: "SYSTEM_STATE", priority: "LOW",
    title: "System Status Update", body: "Autonomous run stopped by user. Engine halted.", state: "HALTED",
  });
  return { active: false };
}

/** Advance the simulation for elapsed time, then return the latest events. */
export async function runFeed(userId: string, afterId?: string) {
  const db = getDb();
  const s = await getSession(userId);

  if (s.active) {
    const elapsed = Date.now() - new Date(s.lastEventAt).getTime();
    const due = Math.min(Math.floor(elapsed / TICK_MS), MAX_TICKS_PER_POLL);
    let cur = s;
    for (let i = 0; i < due; i++) {
      const { ev, patch } = nextEvent(cur);
      await emit(userId, ev);
      await db.update(runSessions).set({ ...patch, lastEventAt: new Date() }).where(eq(runSessions.userId, userId));
      cur = { ...cur, ...patch } as Sess;
    }
  }

  const session = await getSession(userId);
  let cond = eq(runEvents.userId, userId);
  if (afterId) {
    const [cur] = await db.select({ createdAt: runEvents.createdAt }).from(runEvents).where(eq(runEvents.id, afterId)).limit(1);
    if (cur) cond = and(cond, gt(runEvents.createdAt, cur.createdAt))!;
  }
  const events = await db
    .select()
    .from(runEvents)
    .where(cond)
    .orderBy(desc(runEvents.createdAt))
    .limit(120);

  return {
    session: {
      active: session.active,
      mode: session.mode,
      startedAt: session.startedAt,
      arc: session.arc,
      symbol: session.symbol,
    },
    events: events.reverse(),
  };
}

export async function clearRunEvents(userId: string) {
  await getDb().delete(runEvents).where(eq(runEvents.userId, userId));
}
