import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { gatewayHealth } from "../marketdata/ibkr-data";
import { sourceStatus } from "../marketdata/gateway/gateway";
import {
  aiLimits,
  autonomousConfigs,
  autonomousEvents,
  autonomousSessions,
  brokerAccounts,
  orderTickets,
  positions,
} from "@db/schema";

/**
 * Autonomous Trading control center — service layer.
 *
 * Authority model (spec §Backend): the database is the only source of truth.
 * Config, risk limits, sessions, events, orders, positions and P&L are all
 * persisted and computed server-side; the UI renders and posts intent only.
 * Risk limits are enforced here and in the runner — never trusted to the
 * frontend.
 */

export type AutonomousStatus = "RUNNING" | "PAUSED" | "STOPPED" | "ERROR" | "BROKER_DISCONNECTED";

/* ─── config ─────────────────────────────────────────────────────────────── */

export async function getConfig(userId: string) {
  const db = getDb();
  const [row] = await db.select().from(autonomousConfigs).where(eq(autonomousConfigs.userId, userId));
  if (row) return row;
  await db.insert(autonomousConfigs).values({ userId }).onConflictDoNothing();
  const [created] = await db.select().from(autonomousConfigs).where(eq(autonomousConfigs.userId, userId));
  return created;
}

export interface ConfigPatch {
  accountId?: string | null;
  allocationType?: "DOLLAR" | "PERCENT";
  allocationValue?: number;
  maxPositionSizePct?: number;
  maxDailyLoss?: number;
  maxPositions?: number;
  stopLossPct?: number;
  trailingStopPct?: number;
}

export async function updateConfig(userId: string, patch: ConfigPatch) {
  const db = getDb();
  const cfg = await getConfig(userId);

  // Guard: a selected account must belong to this user.
  if (patch.accountId) {
    const [acct] = await db
      .select({ id: brokerAccounts.id })
      .from(brokerAccounts)
      .where(and(eq(brokerAccounts.id, patch.accountId), eq(brokerAccounts.userId, userId)));
    if (!acct) throw new Error("Selected account not found.");
  }
  // Guard: risk numbers must be sane positive values.
  const num = (v: number | undefined, min: number, max: number, name: string) => {
    if (v === undefined) return;
    if (!Number.isFinite(v) || v < min || v > max) throw new Error(`${name} must be between ${min} and ${max}.`);
  };
  num(patch.allocationValue, 0, 100_000_000, "Allocation");
  if (patch.allocationType === "PERCENT") num(patch.allocationValue, 0, 100, "Allocation percent");
  num(patch.maxPositionSizePct, 0.1, 100, "Max position size %");
  num(patch.maxDailyLoss, 1, 100_000_000, "Max daily loss");
  num(patch.maxPositions, 1, 50, "Max positions");
  num(patch.stopLossPct, 0.1, 50, "Stop-loss %");
  num(patch.trailingStopPct, 0.1, 50, "Trailing-stop %");

  await db
    .update(autonomousConfigs)
    .set({
      ...(patch.accountId !== undefined ? { accountId: patch.accountId } : {}),
      ...(patch.allocationType ? { allocationType: patch.allocationType } : {}),
      ...(patch.allocationValue !== undefined ? { allocationValue: String(patch.allocationValue) } : {}),
      ...(patch.maxPositionSizePct !== undefined ? { maxPositionSizePct: String(patch.maxPositionSizePct) } : {}),
      ...(patch.maxDailyLoss !== undefined ? { maxDailyLoss: String(patch.maxDailyLoss) } : {}),
      ...(patch.maxPositions !== undefined ? { maxPositions: patch.maxPositions } : {}),
      ...(patch.stopLossPct !== undefined ? { stopLossPct: String(patch.stopLossPct) } : {}),
      ...(patch.trailingStopPct !== undefined ? { trailingStopPct: String(patch.trailingStopPct) } : {}),
    })
    .where(eq(autonomousConfigs.id, cfg.id));
  return getConfig(userId);
}

/** Switch trading mode. LIVE requires the typed confirmation and re-papering clears it. */
export async function setMode(userId: string, mode: "PAPER" | "LIVE", confirm?: string) {
  const db = getDb();
  const cfg = await getConfig(userId);
  if (mode === "LIVE") {
    if (cfg.mode === "LIVE") return cfg; // already live
    if (confirm !== "LIVE") {
      throw new Error('Live trading requires the typed confirmation "LIVE" — real capital will be used.');
    }
    // Global governance stays fail-closed: paperOnly must be explicitly lifted.
    await db
      .update(aiLimits)
      .set({ paperOnly: false })
      .where(eq(aiLimits.userId, userId));
    await db
      .update(autonomousConfigs)
      .set({ mode: "LIVE", liveConfirmedAt: new Date() })
      .where(eq(autonomousConfigs.id, cfg.id));
  } else {
    await db.update(aiLimits).set({ paperOnly: true }).where(eq(aiLimits.userId, userId));
    await db.update(autonomousConfigs).set({ mode: "PAPER" }).where(eq(autonomousConfigs.id, cfg.id));
  }
  return getConfig(userId);
}

/* ─── session lifecycle ──────────────────────────────────────────────────── */

export async function getActiveSession(userId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(autonomousSessions)
    .where(and(eq(autonomousSessions.userId, userId), inArray(autonomousSessions.status, ["RUNNING", "PAUSED", "ERROR", "BROKER_DISCONNECTED"])))
    .orderBy(desc(autonomousSessions.startedAt))
    .limit(1);
  return row ?? null;
}

export async function emitEvent(
  sessionId: string,
  userId: string,
  ev: { phase: string; kind?: string; symbol?: string; message: string; payload?: unknown },
) {
  const db = getDb();
  await db.insert(autonomousEvents).values({
    sessionId,
    userId,
    phase: ev.phase,
    kind: ev.kind ?? "info",
    symbol: ev.symbol ?? null,
    message: ev.message,
    payload: ev.payload === undefined ? null : JSON.stringify(ev.payload),
  });
  await db.update(autonomousSessions).set({ lastEventAt: new Date() }).where(eq(autonomousSessions.id, sessionId));
}

export async function start(userId: string) {
  const db = getDb();
  const cfg = await getConfig(userId);
  const limits = await getLimits(userId);
  if (limits.killSwitch) throw new Error("Emergency stop is engaged — release the kill switch before starting.");

  const existing = await getActiveSession(userId);
  if (existing && existing.status !== "STOPPED") {
    if (existing.status === "PAUSED" || existing.status === "ERROR") return resume(userId);
    return existing;
  }
  if (!cfg.accountId) throw new Error("Choose a broker account before starting Autonomous.");
  const [account] = await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, cfg.accountId));
  if (!account) throw new Error("Selected broker account no longer exists.");
  if (account.status !== "Connected") throw new Error(`Broker account is ${account.status} — reconnect before starting.`);
  if (cfg.mode === "LIVE") {
    // HARD RULE (Market Data spec §14): live trading requires a real,
    // connected, HEALTHY broker. Yahoo (or any fallback feed) may support
    // analysis but can never authorize or confirm a live execution.
    if (!cfg.liveConfirmedAt) throw new Error('Live mode requires the typed confirmation "LIVE" first.');
    if (account.broker === "Paper") throw new Error("Live trading cannot run on a paper account — connect a real broker.");
    const health = await gatewayHealth().catch(() => ({ ok: false, detail: "unreachable" }));
    if (!process.env.IBKR_ACCOUNT || !health.ok) {
      throw new Error("Live trading is unavailable: the broker gateway is not healthy and authorized. No live session was started.");
    }
  }
  const allocated = computedAllocation(cfg, account);
  if (allocated <= 0) throw new Error("Allocate capital to Autonomous before starting.");

  const [session] = await db
    .insert(autonomousSessions)
    .values({ userId, configId: cfg.id, mode: cfg.mode, accountId: cfg.accountId, status: "RUNNING" })
    .returning();
  await emitEvent(session.id, userId, {
    phase: "LIFECYCLE",
    kind: "success",
    message: `Autonomous started — ${cfg.mode} mode · ${account.broker} "${account.label}" · allocation $${allocated.toLocaleString("en-US", { maximumFractionDigits: 0 })} authorized`,
    payload: { mode: cfg.mode, broker: account.broker, account: account.label, allocated },
  });
  // Market Data Gateway: announce the deterministic provider selection (spec §10).
  const src = await sourceStatus(userId).catch(() => null);
  if (src) {
    await emitEvent(session.id, userId, {
      phase: "MARKET_DATA",
      kind: "info",
      message: `Market data provider selected — ${src.sourceName} · validated + normalized through the RTI gateway${cfg.mode === "LIVE" ? " · live execution requires broker confirmation" : ""}`,
      payload: { source: src.code, sourceName: src.sourceName },
    });
  }
  return session;
}

export async function pause(userId: string) {
  const db = getDb();
  const s = await getActiveSession(userId);
  if (!s || s.status !== "RUNNING") return s;
  await db.update(autonomousSessions).set({ status: "PAUSED", pausedAt: new Date() }).where(eq(autonomousSessions.id, s.id));
  await emitEvent(s.id, userId, {
    phase: "LIFECYCLE",
    kind: "warn",
    message: `Paused by user — no new entries${s.arc === "holding" ? "; open position stays protected by its stops" : ""}`,
  });
  return getActiveSession(userId);
}

export async function resume(userId: string) {
  const db = getDb();
  const s = await getActiveSession(userId);
  if (!s || (s.status !== "PAUSED" && s.status !== "ERROR")) return s;
  await db.update(autonomousSessions).set({ status: "RUNNING", pausedAt: null, lastError: null }).where(eq(autonomousSessions.id, s.id));
  await emitEvent(s.id, userId, { phase: "LIFECYCLE", kind: "success", message: "Resumed — market scan restarted" });
  return getActiveSession(userId);
}

export async function stop(userId: string, reason: "USER_STOP" | "KILL_SWITCH" | "ERROR" | "DAILY_LOSS_LIMIT" = "USER_STOP", detail?: string) {
  const db = getDb();
  const s = await getActiveSession(userId);
  if (!s) return null;
  await db
    .update(autonomousSessions)
    .set({ status: "STOPPED", stoppedAt: new Date(), endedReason: reason, lastError: detail ?? null })
    .where(eq(autonomousSessions.id, s.id));
  await emitEvent(s.id, userId, {
    phase: "LIFECYCLE",
    kind: reason === "USER_STOP" ? "warn" : "error",
    message:
      reason === "USER_STOP"
        ? `Stopped by user — safe-to-cancel orders cancelled, protections preserved · engine HALTED`
        : reason === "KILL_SWITCH"
          ? "EMERGENCY STOP — kill switch engaged · all new autonomous orders blocked · safe shutdown complete"
          : reason === "DAILY_LOSS_LIMIT"
            ? `Daily loss limit reached — engine halted for the session${detail ? ` (${detail})` : ""}`
            : `Engine error — halted${detail ? `: ${detail}` : ""}`,
  });
  return db.select().from(autonomousSessions).where(eq(autonomousSessions.id, s.id)).then((r) => r[0]);
}

/** Emergency stop: engage the global kill switch AND halt the session. Fail-closed. */
export async function emergencyStop(userId: string) {
  const db = getDb();
  await getLimits(userId);
  await db.update(aiLimits).set({ killSwitch: true }).where(eq(aiLimits.userId, userId));
  await stop(userId, "KILL_SWITCH");
  return { killSwitch: true };
}

export async function releaseKillSwitch(userId: string) {
  const db = getDb();
  await getLimits(userId);
  await db.update(aiLimits).set({ killSwitch: false }).where(eq(aiLimits.userId, userId));
  return { killSwitch: false };
}

async function getLimits(userId: string) {
  const db = getDb();
  const [row] = await db.select().from(aiLimits).where(eq(aiLimits.userId, userId));
  if (row) return row;
  await db.insert(aiLimits).values({ userId }).onConflictDoNothing();
  const [created] = await db.select().from(aiLimits).where(eq(aiLimits.userId, userId));
  return created;
}

/* ─── computed state ─────────────────────────────────────────────────────── */

export function computedAllocation(cfg: typeof autonomousConfigs.$inferSelect, account: typeof brokerAccounts.$inferSelect): number {
  const equity = parseFloat(account.equity);
  const v = parseFloat(cfg.allocationValue);
  if (cfg.allocationType === "PERCENT") return Math.max(0, Math.min(equity, (equity * v) / 100));
  return Math.max(0, Math.min(equity, v));
}

async function sessionIds(userId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ id: autonomousSessions.id }).from(autonomousSessions).where(eq(autonomousSessions.userId, userId));
  return rows.map((r) => r.id);
}

/** Full dashboard state — config + session + account + metrics, all computed server-side. */
export async function getState(userId: string) {
  const db = getDb();
  const cfg = await getConfig(userId);
  const limits = await getLimits(userId);
  const active = await getActiveSession(userId);
  // The dashboard always shows the latest session (even STOPPED) so the status
  // pill and timestamps stay truthful after a halt.
  const [latest] = await db
    .select()
    .from(autonomousSessions)
    .where(eq(autonomousSessions.userId, userId))
    .orderBy(desc(autonomousSessions.startedAt))
    .limit(1);
  const session = active ?? latest ?? null;
  const [account] = cfg.accountId
    ? await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, cfg.accountId))
    : [null];

  const allocated = account ? computedAllocation(cfg, account) : 0;
  const ids = await sessionIds(userId);

  // P&L + activity metrics from the canonical positions/tickets tables.
  let realizedPnl = 0;
  let openCount = 0;
  let deployed = 0;
  let tradesToday = 0;
  let todayPnl = 0;
  if (ids.length > 0) {
    const tickets = await db
      .select({ ticketId: orderTickets.ticketId, submittedAt: orderTickets.submittedAt })
      .from(orderTickets)
      .where(and(eq(orderTickets.userId, userId), inArray(orderTickets.runSessionId, ids)));
    const ticketIds = tickets.map((t) => t.ticketId);
    const etToday = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" });
    tradesToday = tickets.filter(
      (t) => t.submittedAt && new Date(t.submittedAt).toLocaleDateString("en-US", { timeZone: "America/New_York" }) === etToday,
    ).length;

    const posRows = ticketIds.length
      ? await db.select().from(positions).where(and(eq(positions.userId, userId), inArray(positions.sourceTicketId, ticketIds)))
      : [];
    for (const p of posRows) {
      if (p.status === "OPEN") {
        openCount += 1;
        deployed += p.quantity * parseFloat(p.avgEntry);
      } else if (p.realizedPnl !== null) {
        realizedPnl += parseFloat(p.realizedPnl);
        if (p.closedAt && new Date(p.closedAt).toLocaleDateString("en-US", { timeZone: "America/New_York" }) === etToday) {
          todayPnl += parseFloat(p.realizedPnl);
        }
      }
    }
  }

  return {
    config: cfg,
    session,
    account,
    killSwitch: limits.killSwitch,
    metrics: {
      allocated,
      available: Math.max(0, allocated - deployed),
      deployed,
      openPositions: openCount,
      tradesToday,
      realizedPnl,
      todayPnl,
      totalPnl: realizedPnl, // realized basis — unrealized requires live quotes (runner marks)
    },
  };
}

/* ─── stream + tabs ──────────────────────────────────────────────────────── */

export async function stream(userId: string, afterId?: string, limit = 100) {
  const db = getDb();
  const conds = [eq(autonomousEvents.userId, userId)];
  if (afterId) {
    const [anchor] = await db.select({ createdAt: autonomousEvents.createdAt }).from(autonomousEvents).where(eq(autonomousEvents.id, afterId));
    if (anchor) conds.push(gt(autonomousEvents.createdAt, anchor.createdAt));
  }
  const rows = await db
    .select()
    .from(autonomousEvents)
    .where(and(...conds))
    .orderBy(desc(autonomousEvents.createdAt))
    .limit(limit);
  return afterId ? rows : rows; // newest-first; UI reverses for display
}

async function sessionTickets(userId: string) {
  const db = getDb();
  const ids = await sessionIds(userId);
  if (ids.length === 0) return [];
  return db
    .select()
    .from(orderTickets)
    .where(and(eq(orderTickets.userId, userId), inArray(orderTickets.runSessionId, ids)))
    .orderBy(desc(orderTickets.createdAt))
    .limit(200);
}

export async function listAutonomousPositions(userId: string) {
  const db = getDb();
  const tickets = await sessionTickets(userId);
  const ticketIds = tickets.map((t) => t.ticketId);
  if (ticketIds.length === 0) return [];
  const rows = await db
    .select()
    .from(positions)
    .where(and(eq(positions.userId, userId), inArray(positions.sourceTicketId, ticketIds), eq(positions.status, "OPEN")))
    .orderBy(desc(positions.openedAt));
  const byTicket = new Map(tickets.map((t) => [t.ticketId, t]));
  return rows.map((p) => ({ ...p, strategy: byTicket.get(p.sourceTicketId ?? "")?.strategy ?? null }));
}

export async function listAutonomousOrders(userId: string) {
  return sessionTickets(userId);
}

export async function listAutonomousTrades(userId: string) {
  const db = getDb();
  const tickets = await sessionTickets(userId);
  const ticketIds = tickets.map((t) => t.ticketId);
  if (ticketIds.length === 0) return [];
  const rows = await db
    .select()
    .from(positions)
    .where(and(eq(positions.userId, userId), inArray(positions.sourceTicketId, ticketIds), sql`${positions.status} <> 'OPEN'`))
    .orderBy(desc(positions.closedAt))
    .limit(200);
  const byTicket = new Map(tickets.map((t) => [t.ticketId, t]));
  return rows.map((p) => {
    const t = byTicket.get(p.sourceTicketId ?? "");
    const entry = parseFloat(p.avgEntry);
    const exit = p.exitPrice ? parseFloat(p.exitPrice) : null;
    return {
      ...p,
      strategy: t?.strategy ?? null,
      returnPct: exit !== null && entry > 0 ? ((exit - entry) / entry) * 100 : null,
      exitReason: p.closedBy ?? t?.lastMessage ?? null,
    };
  });
}
