import { and, desc, eq, ne, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { positions, orderTickets, users, alerts, type OrderTicket } from "@db/schema";
import { marketDataService } from "../marketdata/service";

/**
 * PORTFOLIO — order history, positions, and P&L.
 *
 * Every fill (manual CONFIRM or auto-execute) lands here via recordFill:
 *   BUY  → open a position (or average into an existing open one)
 *   SELL → close matching open position(s), booking realized P&L
 *
 * Unrealized P&L marks open positions to the live feed's last price when
 * available, and honestly reports when a mark is unavailable (no feed)
 * instead of inventing a price.
 */

/* ---------- auto-execute preference ---------- */

export async function isAutoExecuteEnabled(userId: string): Promise<boolean> {
  try {
    const db = getDb();
    const [u] = await db.select({ autoExecute: users.autoExecute }).from(users).where(eq(users.id, userId)).limit(1);
    return u?.autoExecute === true;
  } catch {
    return false; // fail CLOSED — if we can't read the flag, confirmation is required
  }
}

export async function setAutoExecute(userId: string, enabled: boolean): Promise<{ enabled: boolean }> {
  const db = getDb();
  await db.update(users).set({ autoExecute: enabled }).where(eq(users.id, userId));
  return { enabled };
}

/* ---------- auto-universe preference (Strategy Spec §3 stages 1–2) ---------- */

export async function isAutoUniverseEnabled(userId: string): Promise<{ enabled: boolean; maxMonitors: number }> {
  try {
    const db = getDb();
    const [u] = await db.select({ autoUniverse: users.autoUniverse, autoUniverseMax: users.autoUniverseMax }).from(users).where(eq(users.id, userId)).limit(1);
    return { enabled: u?.autoUniverse === true, maxMonitors: u?.autoUniverseMax ?? 5 };
  } catch {
    return { enabled: false, maxMonitors: 5 }; // fail CLOSED — manual tracking only
  }
}

export async function setAutoUniverse(userId: string, enabled: boolean, maxMonitors?: number): Promise<{ enabled: boolean; maxMonitors: number }> {
  const db = getDb();
  const current = await isAutoUniverseEnabled(userId);
  const max = Math.min(Math.max(maxMonitors ?? current.maxMonitors, 1), 20);
  await db.update(users).set({ autoUniverse: enabled, autoUniverseMax: max }).where(eq(users.id, userId));
  return { enabled, maxMonitors: max };
}

/** Every user who opted in to the auto-universe engine (drives the heartbeat cycles). */
export async function listAutoUniverseUsers(): Promise<Array<{ id: string; autoUniverseMax: number }>> {
  try {
    const db = getDb();
    const rows = await db.select({ id: users.id, autoUniverseMax: users.autoUniverseMax }).from(users).where(eq(users.autoUniverse, true));
    return rows.map((r) => ({ id: r.id, autoUniverseMax: r.autoUniverseMax ?? 5 }));
  } catch {
    return []; // fail CLOSED — no auto-universe cycles without a readable roster
  }
}

/**
 * Open-risk dollars per open position for the portfolio-heat gate (§3 gate 10).
 * Risk = qty × (mark/entry − protective stop), floored at 0. Positions with
 * no protective stop are counted at FULL notional risk — an unprotected
 * position is the most conservative possible heat contribution.
 */
export async function openRiskDollars(userId: string): Promise<number[]> {
  try {
    const db = getDb();
    const rows = await db.select().from(positions).where(and(eq(positions.userId, userId), eq(positions.status, "OPEN")));
    return rows.map((p) => {
      const entry = Number(p.avgEntry);
      const stop = p.stopPrice !== null ? Number(p.stopPrice) : null;
      if (stop === null) return p.quantity * entry; // unprotected → full notional at risk
      return Math.max(p.quantity * (entry - stop), 0);
    });
  } catch {
    return [];
  }
}

/* ---------- fill recording ---------- */

export async function recordFill(userId: string, ticket: OrderTicket, fillPrice: number, fillQty: number): Promise<void> {
  if (!(fillPrice > 0) || fillQty <= 0) return;
  const db = getDb();
  try {
    if (ticket.side === "BUY") {
      const [open] = await db
        .select()
        .from(positions)
        .where(and(eq(positions.userId, userId), eq(positions.symbol, ticket.symbol), eq(positions.status, "OPEN")))
        .limit(1);
      if (open) {
        const totalQty = open.quantity + fillQty;
        const newAvg = (Number(open.avgEntry) * open.quantity + fillPrice * fillQty) / totalQty;
        const highest = Math.max(open.highestPrice !== null ? Number(open.highestPrice) : 0, fillPrice);
        await db.update(positions).set({ quantity: totalQty, avgEntry: newAvg.toFixed(4), highestPrice: highest.toFixed(4) }).where(eq(positions.id, open.id));
      } else {
        await db.insert(positions).values({
          userId,
          symbol: ticket.symbol,
          quantity: fillQty,
          avgEntry: String(fillPrice),
          sourceTicketId: ticket.ticketId,
          broker: ticket.broker, // mode lineage: PAPER | live broker — reporting splits on this
          status: "OPEN",
          // seed the trailing-stop state from the ticket's governed levels
          stopPrice: ticket.stop !== null ? String(ticket.stop) : null,
          t1Price: ticket.target !== null ? String(ticket.target) : null,
          t2Price: ticket.target2 !== null ? String(ticket.target2) : null,
          highestPrice: String(fillPrice),
        });
      }
    } else {
      // SELL — close against the oldest open position for the symbol
      const [open] = await db
        .select()
        .from(positions)
        .where(and(eq(positions.userId, userId), eq(positions.symbol, ticket.symbol), eq(positions.status, "OPEN")))
        .limit(1);
      if (!open) return; // sell without a tracked position — nothing to match (manual external position)
      const closingQty = Math.min(fillQty, open.quantity);
      const realized = (fillPrice - Number(open.avgEntry)) * closingQty;
      if (closingQty >= open.quantity) {
        await db.update(positions).set({
          status: "CLOSED",
          closedAt: new Date(),
          exitPrice: String(fillPrice),
          realizedPnl: realized.toFixed(2),
        }).where(eq(positions.id, open.id));
      } else {
        // partial close = scale-out → advance the trailing floor stage on the remainder
        await db.update(positions).set({ quantity: open.quantity - closingQty, scaleStage: open.scaleStage + 1 }).where(eq(positions.id, open.id));
        await db.insert(positions).values({
          userId,
          symbol: open.symbol,
          quantity: closingQty,
          avgEntry: open.avgEntry,
          sourceTicketId: ticket.ticketId,
          broker: open.broker, // scale-out child keeps the ORIGINAL position's mode, not the sell ticket's
          status: "CLOSED",
          closedAt: new Date(),
          exitPrice: String(fillPrice),
          realizedPnl: realized.toFixed(2),
        });
      }
    }
  } catch {
    /* position tracking must never break execution */
  }
}

/* ---------- order history ---------- */

export interface OrderHistoryRow {
  ticketId: string;
  symbol: string;
  side: string;
  broker: string; // PAPER | live broker name — execution venue / mode
  strategy: string;
  accountId: string | null;
  quantity: number;
  orderType: string;
  state: string;
  autoExecuted: boolean;
  entry: number | null;
  stop: number | null;
  target: number | null;
  limitPrice: number | null;
  stopPrice: number | null;
  filledQuantity: number | null;
  averageFillPrice: number | null;
  createdAt: Date;
  submittedAt: Date | null;
  lastMessage: string | null;
}

export async function listOrders(userId: string, limit = 50): Promise<OrderHistoryRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(orderTickets)
    .where(and(eq(orderTickets.userId, userId), ne(orderTickets.state, "CREATED")))
    .orderBy(desc(orderTickets.id))
    .limit(Math.min(limit, 200));
  return rows.map((t) => ({
    ticketId: t.ticketId,
    symbol: t.symbol,
    side: t.side,
    broker: t.broker ?? "PAPER",
    strategy: t.strategy,
    accountId: t.accountId ?? null,
    quantity: t.quantity,
    orderType: t.orderType,
    state: t.state,
    autoExecuted: t.autoExecuted === true,
    entry: t.entry !== null ? Number(t.entry) : null,
    stop: t.stop !== null ? Number(t.stop) : null,
    target: t.target !== null ? Number(t.target) : null,
    limitPrice: t.limitPrice !== null ? Number(t.limitPrice) : null,
    stopPrice: t.stopPrice !== null ? Number(t.stopPrice) : null,
    filledQuantity: t.filledQuantity ?? null,
    averageFillPrice: t.averageFillPrice !== null ? Number(t.averageFillPrice) : null,
    createdAt: t.createdAt,
    submittedAt: t.submittedAt ?? null,
    lastMessage: t.lastMessage ?? null,
  }));
}

/* ---------- positions & P&L ---------- */

export interface PositionRow {
  id: string;
  symbol: string;
  quantity: number;
  avgEntry: number;
  broker: string; // PAPER | live broker name — the mode this position belongs to
  status: string;
  openedAt: Date;
  closedAt: Date | null;
  exitPrice: number | null;
  realizedPnl: number | null;
  mark: number | null; // live last price when the feed has one
  unrealizedPnl: number | null; // null when no mark available
  /* trailing-stop state */
  stopPrice: number | null;
  highestPrice: number | null;
  trailPrice: number | null;
  trailArmed: boolean;
  scaleStage: number;
  closedBy: string | null;
  t2Price: number | null;
  overrideMode: string | null;
  disasterPrice: number | null;
}

function toPositionRow(p: typeof positions.$inferSelect): PositionRow {
  const feed = marketDataService.get(p.symbol);
  const mark = feed?.indicators?.last ?? null;
  const isOpen = p.status === "OPEN";
  return {
    id: p.id,
    symbol: p.symbol,
    quantity: p.quantity,
    avgEntry: Number(p.avgEntry),
    broker: p.broker ?? "PAPER",
    status: p.status,
    openedAt: p.openedAt,
    closedAt: p.closedAt ?? null,
    exitPrice: p.exitPrice !== null ? Number(p.exitPrice) : null,
    realizedPnl: p.realizedPnl !== null ? Number(p.realizedPnl) : null,
    mark,
    unrealizedPnl: isOpen && mark !== null ? +((mark - Number(p.avgEntry)) * p.quantity).toFixed(2) : null,
    stopPrice: p.stopPrice !== null ? Number(p.stopPrice) : null,
    highestPrice: p.highestPrice !== null ? Number(p.highestPrice) : null,
    trailPrice: p.trailPrice !== null ? Number(p.trailPrice) : null,
    trailArmed: p.trailArmed === true,
    scaleStage: p.scaleStage,
    closedBy: p.closedBy ?? null,
    t2Price: p.t2Price !== null ? Number(p.t2Price) : null,
    overrideMode: p.overrideMode ?? null,
    disasterPrice: p.disasterPrice !== null ? Number(p.disasterPrice) : null,
  };
}

export async function listPositions(userId: string, limit = 50): Promise<PositionRow[]> {
  const db = getDb();
  const rows = await db.select().from(positions).where(eq(positions.userId, userId)).orderBy(desc(positions.id)).limit(Math.min(limit, 200));
  return rows.map(toPositionRow);
}

export interface PnlSummary {
  realizedTotal: number;
  unrealizedTotal: number;
  unmarkedPositions: number; // open positions with no live mark
  openCount: number;
  closedCount: number;
  winCount: number;
  lossCount: number;
  /** Mode-aware split: paper and live P&L are always separable (positions carry broker lineage from the source ticket). */
  byMode: { paper: ModePnl; live: ModePnl };
  note: string;
}

export interface ModePnl {
  realizedTotal: number;
  unrealizedTotal: number;
  openCount: number;
  closedCount: number;
  winCount: number;
  lossCount: number;
}

function summarize(rows: PositionRow[]): ModePnl {
  const closed = rows.filter((r) => r.status === "CLOSED");
  const open = rows.filter((r) => r.status === "OPEN");
  return {
    realizedTotal: +closed.reduce((a, r) => a + (r.realizedPnl ?? 0), 0).toFixed(2),
    unrealizedTotal: +open.reduce((a, r) => a + (r.unrealizedPnl ?? 0), 0).toFixed(2),
    openCount: open.length,
    closedCount: closed.length,
    winCount: closed.filter((r) => (r.realizedPnl ?? 0) > 0).length,
    lossCount: closed.filter((r) => (r.realizedPnl ?? 0) <= 0).length,
  };
}

export async function getPnlSummary(userId: string): Promise<PnlSummary> {
  const rows = await listPositions(userId, 200);
  const closed = rows.filter((r) => r.status === "CLOSED");
  const open = rows.filter((r) => r.status === "OPEN");
  const realizedTotal = +closed.reduce((a, r) => a + (r.realizedPnl ?? 0), 0).toFixed(2);
  const unrealizedTotal = +open.reduce((a, r) => a + (r.unrealizedPnl ?? 0), 0).toFixed(2);
  const unmarkedPositions = open.filter((r) => r.unrealizedPnl === null).length;
  /* Mode-aware reporting: paper and live P&L are ALWAYS separable.
   * Combined totals above remain for back-compat; the byMode split is the
   * authoritative view — a position's mode is fixed at fill time from its
   * source ticket's broker (PAPER | live broker name). */
  const byMode = {
    paper: summarize(rows.filter((r) => r.broker.toUpperCase() === "PAPER")),
    live: summarize(rows.filter((r) => r.broker.toUpperCase() !== "PAPER")),
  };
  return {
    realizedTotal,
    unrealizedTotal,
    unmarkedPositions,
    openCount: open.length,
    closedCount: closed.length,
    winCount: closed.filter((r) => (r.realizedPnl ?? 0) > 0).length,
    lossCount: closed.filter((r) => (r.realizedPnl ?? 0) <= 0).length,
    byMode,
    note: unmarkedPositions > 0
      ? `${unmarkedPositions} open position(s) have no live mark — unrealized P&L excludes them (track the symbol in the data feed).`
      : "All open positions marked to live feed prices.",
  };
}

/* ---------- trailing-stop support ---------- */

/** Every OPEN position carrying a governed stop, across all users — the trailing module's universe. */
export async function listManagedPositions(): Promise<Array<typeof positions.$inferSelect>> {
  const db = getDb();
  return db.select().from(positions).where(and(eq(positions.status, "OPEN"), sql`${positions.stopPrice} IS NOT NULL`));
}

/** Book a trailing-module exit: close the row at the actual fill with the fire reason. */
export async function closePositionFromFire(positionId: string, fillPrice: number, reason: "FLAT_STOP" | "TRAIL" | "SAFETY_FLATTEN" | "MANUAL_FLATTEN" | "DISASTER_STOP"): Promise<void> {
  const db = getDb();
  const [p] = await db.select().from(positions).where(eq(positions.id, positionId)).limit(1);
  if (!p || p.status !== "OPEN") return;
  const realized = (fillPrice - Number(p.avgEntry)) * p.quantity;
  await db.update(positions).set({
    status: "CLOSED",
    closedAt: new Date(),
    exitPrice: String(fillPrice),
    realizedPnl: realized.toFixed(2),
    closedBy: reason,
  }).where(eq(positions.id, positionId));
}

/** Persist trailing-state progress (highest / trail / armed) after each evaluation. */
export async function updateTrailState(positionId: string, fields: { highestPrice?: string; trailPrice?: string; trailArmed?: boolean }): Promise<void> {
  const db = getDb();
  await db.update(positions).set(fields).where(eq(positions.id, positionId));
}

/** Book a T1/T2 scale-out: split qty off the open row into a CLOSED row, advance the trailing floor stage. */
export async function bookScaleOut(positionId: string, qty: number, fillPrice: number, stage: 1 | 2): Promise<void> {
  const db = getDb();
  const [p] = await db.select().from(positions).where(eq(positions.id, positionId)).limit(1);
  if (!p || p.status !== "OPEN") return;
  const closingQty = Math.min(qty, p.quantity);
  if (closingQty <= 0) return;
  const realized = (fillPrice - Number(p.avgEntry)) * closingQty;
  if (closingQty >= p.quantity) {
    await db.update(positions).set({
      status: "CLOSED", closedAt: new Date(), exitPrice: String(fillPrice),
      realizedPnl: realized.toFixed(2), closedBy: stage === 1 ? "SCALE_T1" : "SCALE_T2", scaleStage: stage,
    }).where(eq(positions.id, p.id));
    return;
  }
  await db.update(positions).set({ quantity: p.quantity - closingQty, scaleStage: stage }).where(eq(positions.id, p.id));
  await db.insert(positions).values({
    userId: p.userId, symbol: p.symbol, quantity: closingQty, avgEntry: p.avgEntry,
    sourceTicketId: p.sourceTicketId, status: "CLOSED", closedAt: new Date(),
    exitPrice: String(fillPrice), realizedPnl: realized.toFixed(2),
    closedBy: stage === 1 ? "SCALE_T1" : "SCALE_T2",
  });
}

/* ---------- stop mode (per user) ---------- */

export type StopMode = "CLASSIC" | "IMMEDIATE_TRAIL";

export async function getStopMode(userId: string): Promise<StopMode> {
  try {
    const db = getDb();
    const [u] = await db.select({ stopMode: users.stopMode }).from(users).where(eq(users.id, userId)).limit(1);
    return u?.stopMode === "IMMEDIATE_TRAIL" ? "IMMEDIATE_TRAIL" : "CLASSIC";
  } catch {
    return "CLASSIC"; // fail to the conservative mode
  }
}

export async function setStopMode(userId: string, mode: StopMode): Promise<{ mode: StopMode }> {
  const db = getDb();
  await db.update(users).set({ stopMode: mode }).where(eq(users.id, userId));
  return { mode };
}

/* ---------- manual overrides ---------- */

async function ownedOpen(userId: string, positionId: string): Promise<typeof positions.$inferSelect | null> {
  const db = getDb();
  const [p] = await db.select().from(positions)
    .where(and(eq(positions.id, positionId), eq(positions.userId, userId), eq(positions.status, "OPEN"))).limit(1);
  return p ?? null;
}

async function overrideAlert(userId: string, symbol: string, title: string, body: string): Promise<void> {
  const db = getDb();
  await db.insert(alerts).values({ userId, type: "POSITION_UPDATE", priority: "HIGH", title, body, symbol, state: "ACTIVE" }).catch(() => undefined);
}

/** Tighten the flat stop upward (toward price). Never lowers it — loosening requires manual control. */
export async function tightenStop(userId: string, positionId: string, newStop: number): Promise<{ ok: boolean; message: string }> {
  const p = await ownedOpen(userId, positionId);
  if (!p) return { ok: false, message: "No open position with that id." };
  if (!(newStop > 0)) return { ok: false, message: "Stop must be positive." };
  const mark = marketDataService.get(p.symbol)?.indicators?.last ?? null;
  if (mark !== null && newStop >= mark) return { ok: false, message: `Stop ${newStop} is at/above the current mark ${mark} — use Flatten if you want out now.` };
  const cur = p.stopPrice !== null ? Number(p.stopPrice) : null;
  if (cur !== null && newStop <= cur) return { ok: false, message: `New stop must be ABOVE the current ${cur} — tightening only. Take manual control to loosen.` };
  const db = getDb();
  await db.update(positions).set({ stopPrice: newStop.toFixed(4) }).where(eq(positions.id, p.id));
  await overrideAlert(userId, p.symbol, `Stop tightened — ${p.symbol}`, `Flat stop moved ${cur !== null ? `${cur} → ` : "to "}${newStop} by the user. Note: changing the stop changes 1R, which moves the trail's arm threshold (CLASSIC mode).`);
  return { ok: true, message: `Stop tightened to ${newStop}.` };
}

/** Tighten the trail upward. Setting a trail on an unarmed position arms it at that level. */
export async function tightenTrail(userId: string, positionId: string, newTrail: number): Promise<{ ok: boolean; message: string }> {
  const p = await ownedOpen(userId, positionId);
  if (!p) return { ok: false, message: "No open position with that id." };
  if (!(newTrail > 0)) return { ok: false, message: "Trail must be positive." };
  const mark = marketDataService.get(p.symbol)?.indicators?.last ?? null;
  if (mark !== null && newTrail >= mark) return { ok: false, message: `Trail ${newTrail} is at/above the current mark ${mark} — use Flatten if you want out now.` };
  const cur = p.trailPrice !== null ? Number(p.trailPrice) : null;
  if (cur !== null && newTrail <= cur) return { ok: false, message: `New trail must be ABOVE the current ${cur} — the ratchet never moves down. Take manual control to loosen.` };
  const db = getDb();
  await db.update(positions).set({ trailPrice: newTrail.toFixed(4), trailArmed: true }).where(eq(positions.id, p.id));
  await overrideAlert(userId, p.symbol, `Trail tightened — ${p.symbol}`, `Trail ${cur !== null ? `${cur} → ` : "set at "}${newTrail} by the user${p.trailArmed !== true ? " (trail now armed at your level)" : ""}. The module ratchets upward from here.`);
  return { ok: true, message: `Trail set to ${newTrail}.` };
}

/** Take or return manual control of a position's exit. MANUAL = the module stands down entirely. */
export async function setPositionOverride(userId: string, positionId: string, manual: boolean): Promise<{ ok: boolean; message: string }> {
  const p = await ownedOpen(userId, positionId);
  if (!p) return { ok: false, message: "No open position with that id." };
  const db = getDb();
  await db.update(positions).set({ overrideMode: manual ? "MANUAL" : null }).where(eq(positions.id, p.id));
  await overrideAlert(userId, p.symbol,
    manual ? `MANUAL CONTROL — ${p.symbol}` : `Module control resumed — ${p.symbol}`,
    manual
      ? `Position #${p.id} (${p.symbol} ${p.quantity} sh) exit is now HUMAN-MANAGED — no trail updates, no automatic fires, no scale-outs, no safety flatten. Any resting disaster stop stays in place as insurance. Return control to resume automatic protection.`
      : `Position #${p.id} (${p.symbol}) returned to the trailing module — automatic protection resumes next cycle.`);
  return { ok: true, message: manual ? "You now own this exit — the module has stood down." : "Automatic protection resumed." };
}

/* ---------- live activity stream ---------- */

export interface ActivityEvent {
  id: string;
  kind: string; // alert type
  priority: string;
  title: string;
  body: string | null;
  symbol: string | null;
  at: Date;
}

/** The live trade stream: execution-relevant alerts, newest first. */
export async function streamActivity(userId: string, limit = 30): Promise<ActivityEvent[]> {
  const db = getDb();
  const rows = await db.select().from(alerts)
    .where(and(eq(alerts.userId, userId), sql`${alerts.type} IN ('EXECUTION','PROTECTION','POSITION_UPDATE','CONFIRMATION_REQUEST','RISK')`))
    .orderBy(desc(alerts.id))
    .limit(Math.min(limit, 100));
  return rows.map((a) => ({
    id: a.id,
    kind: a.type,
    priority: a.priority,
    title: a.title,
    body: a.body ?? null,
    symbol: a.symbol ?? null,
    at: a.createdAt,
  }));
}
