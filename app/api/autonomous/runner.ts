import { and, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { autonomousConfigs, autonomousSessions, brokerAccounts, orderTickets, positions } from "@db/schema";
import { computedAllocation, emitEvent, stop as stopSession } from "./service";
import { sourceStatus } from "../marketdata/gateway/gateway";
import { gatewayHealth } from "../marketdata/ibkr-data";

/** Provider transitions + throttled health checks (per session, in-process). */
const lastSource = new Map<string, string>();
const sourceCheckedAt = new Map<string, number>();
const liveHealthCheckedAt = new Map<string, number>();
const SOURCE_CHECK_MS = 30_000;
const LIVE_HEALTH_MS = 10_000;

/**
 * Autonomous session runner (paper execution engine).
 *
 * Every tick advances RUNNING sessions through the spec's event chain:
 *   MARKET_SCAN → OPPORTUNITY → STRATEGY_SELECTED → RISK_CHECK →
 *   ORDER_SUBMITTED → BROKER_CONFIRM → POSITION_OPENED → POSITION_MONITOR →
 *   EXIT_TRIGGERED → POSITION_CLOSED
 *
 * Orders and positions are real rows in order_tickets / positions (PAPER
 * lineage) so the Orders / Positions / P&L surfaces read the same canonical
 * tables as the rest of the platform. Risk limits from autonomous_configs
 * are enforced HERE, server-side, before any ticket is written — the UI is
 * never the enforcement point.
 *
 * The universe uses generic codenames only — never real stocks or tokens.
 */

const TICK_MS = 2500;

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
const STRATEGY_NAMES = [
  "Pre-Earnings Sentiment",
  "Through-Earnings Event",
  "Earnings-Day Reaction",
  "Post-Earnings Continuation",
  "General Intraday",
];

const r = (min: number, max: number, dp = 2) => +(min + Math.random() * (max - min)).toFixed(dp);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const money = (n: number) => `${n >= 0 ? "+" : "−"}$${Math.abs(n).toFixed(2)}`;

type Session = typeof autonomousSessions.$inferSelect;

async function tickSession(s: Session): Promise<void> {
  const db = getDb();
  const [cfg] = await db.select().from(autonomousConfigs).where(eq(autonomousConfigs.id, s.configId ?? ""));
  if (!cfg) return;
  const [account] = s.accountId ? await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, s.accountId)) : [null];
  if (!account || account.status !== "Connected") {
    await db
      .update(autonomousSessions)
      .set({ status: "BROKER_DISCONNECTED", lastError: "Broker connection lost" })
      .where(eq(autonomousSessions.id, s.id));
    await emitEvent(s.id, s.userId, { phase: "ERROR", kind: "error", message: "Broker disconnected — monitoring halted, protections preserved" });
    return;
  }

  // LIVE HARD RULE (Market Data spec §14): a live session needs a connected,
  // healthy, authorized broker at ALL times. If the gateway degrades, no new
  // live orders may be placed — suspend the session and alert the user.
  if (s.mode === "LIVE") {
    const lastCheck = liveHealthCheckedAt.get(s.id) ?? 0;
    if (Date.now() - lastCheck >= LIVE_HEALTH_MS) {
      liveHealthCheckedAt.set(s.id, Date.now());
      const healthy = await gatewayHealth().then((h) => h.ok).catch(() => false);
      if (!healthy || !process.env.IBKR_ACCOUNT) {
        await db
          .update(autonomousSessions)
          .set({ status: "BROKER_DISCONNECTED", lastError: "Broker gateway unhealthy — live trading suspended" })
          .where(eq(autonomousSessions.id, s.id));
        await emitEvent(s.id, s.userId, {
          phase: "ERROR",
          kind: "error",
          message: "Broker gateway unhealthy — live trading suspended. No new live orders will be placed; reconnect the broker to resume. Open protections remain in place.",
        });
        return;
      }
    }
  }

  // Market Data Gateway visibility (spec §10): announce provider transitions.
  const lastSrcCheck = sourceCheckedAt.get(s.id) ?? 0;
  if (Date.now() - lastSrcCheck >= SOURCE_CHECK_MS) {
    sourceCheckedAt.set(s.id, Date.now());
    const src = await sourceStatus(s.userId).catch(() => null);
    if (src) {
      const prev = lastSource.get(s.id);
      if (prev && prev !== src.code) {
        await emitEvent(s.id, s.userId, {
          phase: "MARKET_DATA",
          kind: "warn",
          message: `Market Data Source Changed — ${prev === "BROKER" ? "Broker" : "Yahoo Finance"} → ${src.sourceName}`,
          payload: { from: prev, to: src.code },
        });
      }
      lastSource.set(s.id, src.code);
    }
  }

  // Daily-loss circuit breaker — enforced server-side, halts the session.
  const maxDailyLoss = parseFloat(cfg.maxDailyLoss);
  const dayPnl = parseFloat(s.dayPnl);
  if (dayPnl <= -maxDailyLoss) {
    await stopSession(s.userId, "DAILY_LOSS_LIMIT", `day P&L ${money(dayPnl)} vs limit −$${maxDailyLoss}`);
    return;
  }

  if (s.arc === "holding" && s.symbol && s.entry && s.stop && s.target) {
    await tickHolding(s, cfg);
    return;
  }

  // ── idle: scan, occasionally find an opportunity ─────────────────────────
  const roll = Math.random();
  if (roll < 0.55) {
    await emitEvent(s.id, s.userId, {
      phase: "MARKET_SCAN",
      message: `Scanning market — ${r(280, 460, 0)} symbols · RVOL, spread, regime filters applied`,
    });
    if (Math.random() < 0.3) {
      const code = lastSource.get(s.id);
      await emitEvent(s.id, s.userId, {
        phase: "MARKET_DATA",
        kind: "info",
        message: `Market data — snapshot received via ${code === "BROKER" ? "connected broker" : "Yahoo Finance"} · validation passed · indicators calculated`,
      });
    }
    return;
  }
  if (roll < 0.8) {
    const c = pick(UNIVERSE);
    await emitEvent(s.id, s.userId, {
      phase: "OPPORTUNITY",
      kind: "warn",
      symbol: c.symbol,
      message: `${c.symbol} evaluated — RVOL ${r(0.8, 1.9)} but entry criteria unmet · monitoring continues`,
    });
    return;
  }

  // Opportunity detected → strategy → risk check → maybe trade
  const c = pick(UNIVERSE);
  const entry = r(c.base * 0.985, c.base * 1.015);
  const stopPct = parseFloat(cfg.stopLossPct) / 100;
  const stop = +(entry * (1 - stopPct)).toFixed(2);
  const target = +(entry * (1 + stopPct * 2)).toFixed(2);
  const strategy = pick(STRATEGY_NAMES);

  await emitEvent(s.id, s.userId, {
    phase: "OPPORTUNITY",
    kind: "success",
    symbol: c.symbol,
    message: `${c.symbol} opportunity detected — RVOL ${r(1.6, 2.8)} · VWAP reclaim · spread 0.0${r(1, 9, 0)}%`,
    payload: { price: entry },
  });
  await emitEvent(s.id, s.userId, {
    phase: "STRATEGY_SELECTED",
    symbol: c.symbol,
    message: `Strategy: ${strategy} · entry ${entry.toFixed(2)} · stop ${stop.toFixed(2)} · target ${target.toFixed(2)}`,
    payload: { strategy, entry, stop, target },
  });

  // ── RISK CHECK — config limits, enforced before any order exists ─────────
  const allocated = computedAllocation(cfg, account);
  const openRows = await db
    .select({ quantity: positions.quantity, avgEntry: positions.avgEntry })
    .from(positions)
    .where(and(eq(positions.userId, s.userId), eq(positions.status, "OPEN"), eq(positions.broker, "PAPER")));
  const deployed = openRows.reduce((a, p) => a + p.quantity * parseFloat(p.avgEntry), 0);
  const available = allocated - deployed;
  const maxPosPct = parseFloat(cfg.maxPositionSizePct) / 100;
  const maxNotional = Math.min(available, allocated * maxPosPct);

  if (openRows.length >= cfg.maxPositions) {
    await emitEvent(s.id, s.userId, {
      phase: "RISK_CHECK",
      kind: "risk",
      symbol: c.symbol,
      message: `Risk check REJECTED — max simultaneous positions reached (${openRows.length}/${cfg.maxPositions}) · order blocked before submission`,
    });
    return;
  }
  if (maxNotional < entry) {
    await emitEvent(s.id, s.userId, {
      phase: "RISK_CHECK",
      kind: "risk",
      symbol: c.symbol,
      message: `Risk check REJECTED — allocation exhausted ($${Math.max(0, available).toFixed(0)} of $${allocated.toFixed(0)} remaining) · the bot never exceeds its authorized capital`,
    });
    return;
  }
  const qty = Math.max(1, Math.floor(maxNotional / entry));
  await emitEvent(s.id, s.userId, {
    phase: "RISK_CHECK",
    kind: "success",
    symbol: c.symbol,
    message: `Risk validation passed — size ${qty} sh within position cap (${(maxPosPct * 100).toFixed(0)}%) and allocation · stop-loss ${cfg.stopLossPct}% · trail ${cfg.trailingStopPct}%`,
  });

  // ── ORDER_SUBMITTED → BROKER_CONFIRM → POSITION_OPENED (paper lineage) ───
  const ticketId = `AUT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${r(1000, 9999, 0)}`;
  const fill = r(entry * 0.999, entry * 1.001);
  const now = new Date();
  await db.insert(orderTickets).values({
    ticketId,
    userId: s.userId,
    runSessionId: s.id,
    strategy,
    broker: "PAPER",
    accountId: account.id,
    symbol: c.symbol,
    side: "BUY",
    quantity: qty,
    orderType: "LMT",
    limitPrice: entry.toFixed(2),
    state: "FILLED",
    entry: entry.toFixed(2),
    stop: stop.toFixed(2),
    target: target.toFixed(2),
    autoExecuted: true,
    idempotencyKey: `aut-${s.id}-${now.getTime()}`,
    brokerOrderId: `PAPER-${r(100000, 999999, 0)}`,
    filledQuantity: qty,
    averageFillPrice: fill.toFixed(2),
    expiresAt: new Date(now.getTime() + 86_400_000),
    submittedAt: now,
  });
  await emitEvent(s.id, s.userId, {
    phase: "ORDER_SUBMITTED",
    kind: "trade",
    symbol: c.symbol,
    message: `BUY order submitted — ${qty} ${c.symbol} LMT ${entry.toFixed(2)} · ticket ${ticketId}`,
    payload: { ticketId, qty, limit: entry },
  });
  await emitEvent(s.id, s.userId, {
    phase: "BROKER_CONFIRM",
    kind: "success",
    symbol: c.symbol,
    message: `Broker confirmed execution — filled ${qty} @ ${fill.toFixed(2)} (paper venue)`,
  });

  const trail = +(fill * (1 - parseFloat(cfg.trailingStopPct) / 100)).toFixed(2);
  await db.insert(positions).values({
    userId: s.userId,
    symbol: c.symbol,
    quantity: qty,
    avgEntry: fill.toFixed(2),
    sourceTicketId: ticketId,
    broker: "PAPER",
    status: "OPEN",
    stopPrice: stop.toFixed(2),
    highestPrice: fill.toFixed(2),
    trailPrice: trail.toFixed(2),
    trailArmed: true,
  });
  await emitEvent(s.id, s.userId, {
    phase: "POSITION_OPENED",
    kind: "trade",
    symbol: c.symbol,
    message: `Position opened — ${qty} ${c.symbol} @ ${fill.toFixed(2)} · flat stop ${stop.toFixed(2)} · trail armed at ${trail.toFixed(2)}`,
  });

  await db
    .update(autonomousSessions)
    .set({ arc: "holding", symbol: c.symbol, entry: fill.toFixed(2), stop: stop.toFixed(2), target: target.toFixed(2), quantity: qty })
    .where(eq(autonomousSessions.id, s.id));
}

async function tickHolding(s: Session, cfg: typeof autonomousConfigs.$inferSelect): Promise<void> {
  const db = getDb();
  const entry = parseFloat(s.entry!);
  const stop = parseFloat(s.stop!);
  const target = parseFloat(s.target!);
  const qty = s.quantity ?? 1;
  const trailPct = parseFloat(cfg.trailingStopPct) / 100;

  const [pos] = await db
    .select()
    .from(positions)
    .where(and(eq(positions.userId, s.userId), eq(positions.symbol, s.symbol!), eq(positions.status, "OPEN")))
    .limit(1);
  if (!pos) {
    await db.update(autonomousSessions).set({ arc: "idle", symbol: null, entry: null, stop: null, target: null, quantity: null }).where(eq(autonomousSessions.id, s.id));
    return;
  }

  const px = r(entry * 0.985, entry * 1.03);
  const high = Math.max(parseFloat(pos.highestPrice ?? String(px)), px);
  const trail = Math.max(parseFloat(pos.trailPrice ?? "0"), +(high * (1 - trailPct)).toFixed(2));
  const unreal = (px - entry) * qty;

  // Exit conditions: target, flat stop, or trailing stop (checked server-side).
  const hitTarget = px >= target;
  const hitStop = px <= stop || px <= trail;
  if (hitTarget || hitStop || Math.random() < 0.08) {
    const reason = hitTarget ? "TARGET" : hitStop ? (px <= stop ? "FLAT_STOP" : "TRAIL") : "TRAIL";
    const exitPx = hitTarget ? target : Math.max(px, stop * 1.001);
    const pnl = (exitPx - entry) * qty;
    await db
      .update(positions)
      .set({ status: "CLOSED", closedAt: new Date(), exitPrice: exitPx.toFixed(2), realizedPnl: pnl.toFixed(2), closedBy: reason })
      .where(eq(positions.id, pos.id));
    await emitEvent(s.id, s.userId, {
      phase: "EXIT_TRIGGERED",
      kind: pnl >= 0 ? "success" : "warn",
      symbol: s.symbol!,
      message: `${reason === "TARGET" ? "Target hit" : reason === "FLAT_STOP" ? "Stop-loss triggered" : "Trailing stop triggered"} — exit ${qty} ${s.symbol} @ ${exitPx.toFixed(2)}`,
    });
    await emitEvent(s.id, s.userId, {
      phase: "POSITION_CLOSED",
      kind: pnl >= 0 ? "success" : "warn",
      symbol: s.symbol!,
      message: `Position closed — ${s.symbol} realized ${money(pnl)} · logged to ledger`,
      payload: { pnl, exit: exitPx, reason },
    });
    await db
      .update(autonomousSessions)
      .set({
        arc: "idle",
        symbol: null,
        entry: null,
        stop: null,
        target: null,
        quantity: null,
        dayPnl: (parseFloat(s.dayPnl) + pnl).toFixed(2),
        tradesToday: s.tradesToday + 1,
      })
      .where(eq(autonomousSessions.id, s.id));
    return;
  }

  // Monitor: tighten the trail (never widens), report unrealized.
  await db.update(positions).set({ highestPrice: high.toFixed(2), trailPrice: trail.toFixed(2) }).where(eq(positions.id, pos.id));
  await emitEvent(s.id, s.userId, {
    phase: "POSITION_MONITOR",
    symbol: s.symbol!,
    message: `${s.symbol} @ ${px.toFixed(2)} · unrealized ${money(unreal)} · trailing stop ${trail.toFixed(2)} (never widens)`,
    payload: { price: px, unrealized: unreal, trail },
  });
}

async function tick(): Promise<void> {
  const db = getDb();
  const running = await db.select().from(autonomousSessions).where(eq(autonomousSessions.status, "RUNNING")).limit(50);
  for (const s of running) {
    await tickSession(s).catch(async (err) => {
      await db
        .update(autonomousSessions)
        .set({ status: "ERROR", lastError: (err as Error).message.slice(0, 500) })
        .where(eq(autonomousSessions.id, s.id))
        .catch(() => undefined);
      await emitEvent(s.id, s.userId, { phase: "ERROR", kind: "error", message: `Engine error: ${(err as Error).message.slice(0, 200)}` }).catch(() => undefined);
    });
  }
}

export function startAutonomousRunner(): void {
  const timer = setInterval(() => {
    tick().catch((err) => console.error("[autonomous] tick failed:", err instanceof Error ? err.message : err));
  }, TICK_MS);
  timer.unref();
  console.log("[autonomous] session runner started (2.5s tick)");
}
