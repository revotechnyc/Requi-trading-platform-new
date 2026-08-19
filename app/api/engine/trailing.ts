import { and, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { alerts, orderTickets, positions, type Position } from "@db/schema";
import { etParts } from "../marketdata/indicators";
import { isMarketHours, marketDataService } from "../marketdata/service";
import { resolveBroker, type BrokerCode } from "../brokers/registry";
import type { BrokerAdapter, OrderIntent } from "../brokers/types";
import { getAiLimits } from "../queries/autonomous";
import { atr } from "./triggers";
import {
  bookScaleOut,
  closePositionFromFire,
  getStopMode,
  listManagedPositions,
  updateTrailState,
  type StopMode,
} from "./portfolio";

/**
 * TRAILING MODULE v2 — the complete automatic exit engine.
 *
 * Manages any OPEN position that carries a governed stop (all engine and
 * Intelligence tickets do), regardless of entry path. Exits only — this
 * module can never open or add to a position.
 *
 * STOP MODES (per user, users.stopMode):
 * - CLASSIC        — flat stop until price reaches entry + 1R, then a
 *                    2.5×ATR14 trail off the highest price, ratchet-only,
 *                    with breakeven (post-T1) and T1 (post-T2) floors.
 * - IMMEDIATE_TRAIL — no flat stop at all: a percentage trail is live from
 *                    entry at the same 0.5% margin the flat stop would have
 *                    used, tightening on gain milestones (0.50% → 0.45 → 0.40
 *                    → 0.32 → 0.27 → 0.22 floor, with a 0.5×ATR14 distance
 *                    floor for jumpy names), plus a HARD BOTTOM that starts
 *                    at entry − 0.5%, moves to breakeven at +1%, and locks
 *                    40% of peak gain beyond +2%. Fire = last ≤ max(trail,
 *                    bottom). No broker-side stop-loss is used anywhere.
 *
 * SCALE-OUTS: at T1 (and T2 when the proposal carried one) the module sells
 * a tranche at market — 1/3 then 1/2 of the remainder — booking realized
 * P&L and advancing the floor stage. Positions smaller than 3 shares skip
 * scaling; the trail runs the whole position.
 *
 * BROKER-SIDE RECONCILIATION (once per position, first management cycle):
 * - Cancel-and-govern: any resting SELL stop on the same symbol that we did
 *   not create is cancelled, with a confirmation alert — the module is the
 *   single exit authority.
 * - Disaster stop: one catastrophic broker-side STP is placed far below the
 *   flat stop (buffer = max(1% of entry, ATR14)) as pure crash insurance,
 *   polled once a minute, cancelled when the position closes. Skipped on
 *   the paper adapter (which fills resting orders instantly).
 *
 * SAFETY: feed stall > one refresh cycle (>60s) → attempt to flatten AND
 * raise a CRITICAL alert (throttled 5 min per position). The per-user kill
 * switch is checked every cycle — when ON, the bot stands down entirely.
 * UNKNOWN broker states are dead ends (manual reconciliation, never
 * resubmitted). Off-hours the module sleeps; positions rest on their stops.
 */

const TICK_MS = 5_000;
const STALL_MS = 75_000;
const RETRY_MS = 60_000;
const SAFETY_THROTTLE_MS = 300_000;
const DISASTER_POLL_MS = 60_000;
const ARM_R = 1.0;
const TRAIL_ATR_MULT = 2.5;

/* IMMEDIATE_TRAIL schedule */
const IT_INITIAL_PCT = 0.005; // same margin the flat stop would use
const IT_MIN_PCT = 0.0022; // never tighter than this — ordinary noise must not kill a runner
const IT_ATR_FLOOR_MULT = 0.5; // distance never below 0.5×ATR14
const IT_BREAKEVEN_GAIN = 0.01; // hard bottom → entry at +1%
const IT_LOCKIN_GAIN = 0.02; // beyond +2% the bottom locks 40% of peak gain
const IT_LOCKIN_FRAC = 0.4;

type ExitReason = "FLAT_STOP" | "TRAIL" | "SAFETY_FLATTEN" | "MANUAL_FLATTEN" | "SCALE_T1" | "SCALE_T2";

interface FireLock { at: number; orderId: string | null; reason: ExitReason; qty: number; ref: number }
const firing = new Map<string, FireLock>();
const deadEnded = new Set<string>();
const safetyAt = new Map<string, number>();
const reconciled = new Set<string>();
const disasterPollAt = new Map<string, number>();

let loopStarted = false;
let ticking = false;
let lastTickAt: number | null = null;
let lastManagedCount = 0;
let firedDay = "";
let firedToday = 0;

export function trailingStatus(): { running: boolean; marketHours: boolean; lastTickAt: number | null; managed: number; inFlight: number; firedToday: number } {
  return { running: loopStarted, marketHours: isMarketHours(), lastTickAt, managed: lastManagedCount, inFlight: firing.size, firedToday };
}

export function ensureTrailingLoop(): void {
  if (loopStarted) return;
  loopStarted = true;
  const t = setInterval(() => { void tick(); }, TICK_MS);
  t.unref();
}

/** Manual flatten from the UI — works any time, even off-hours. Same broker path, same audit. */
export async function requestFlatten(userId: string, positionId: string): Promise<{ ok: boolean; message: string }> {
  const db = getDb();
  const [p] = await db.select().from(positions)
    .where(and(eq(positions.id, positionId), eq(positions.userId, userId), eq(positions.status, "OPEN"))).limit(1);
  if (!p) return { ok: false, message: "No open position with that id." };
  const last = marketDataService.get(p.symbol)?.indicators?.last ?? Number(p.avgEntry);
  const ref = p.trailPrice !== null ? Number(p.trailPrice) : p.stopPrice !== null ? Number(p.stopPrice) : Number(p.avgEntry);
  await submitExit(userId, p, "MANUAL_FLATTEN", p.quantity, ref, last);
  return { ok: true, message: `Flatten order submitted for ${p.symbol} (${p.quantity} sh at market) — watch the stream for the fill.` };
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    if (!isMarketHours()) return; // sleeps off-hours — positions rest on their stops
    lastTickAt = Date.now();
    const day = etParts(lastTickAt).day;
    if (day !== firedDay) { firedDay = day; firedToday = 0; }

    const rows = await listManagedPositions();
    lastManagedCount = rows.length;
    const byUser = new Map<string, Position[]>();
    for (const p of rows) {
      const list = byUser.get(p.userId) ?? [];
      list.push(p);
      byUser.set(p.userId, list);
    }
    for (const [userId, list] of byUser) {
      // KILL SWITCH — checked every cycle. When ON the human owns every exit.
      const limits = await getAiLimits(userId).catch(() => null);
      if (limits?.killSwitch === true) continue;
      const mode = await getStopMode(userId);
      for (const p of list) await evaluate(userId, p, mode).catch(() => undefined);
    }
  } finally {
    ticking = false;
  }
}

/* ---------- broker resolution (the position's own broker, from its source ticket) ---------- */

async function brokerFor(userId: string, p: Position): Promise<{ adapter: BrokerAdapter; effective: string; accountId: string }> {
  const db = getDb();
  const [ticket] = p.sourceTicketId
    ? await db.select().from(orderTickets).where(and(eq(orderTickets.userId, userId), eq(orderTickets.ticketId, p.sourceTicketId))).limit(1)
    : [undefined];
  const { adapter, effective } = resolveBroker(((ticket?.broker as BrokerCode | undefined) ?? "PAPER"));
  const accountId = ticket?.accountId ?? (await adapter.getAccounts().catch(() => []))[0]?.accountId ?? "PAPER-001";
  return { adapter, effective, accountId };
}

/* ---------- evaluation ---------- */

async function evaluate(userId: string, p: Position, mode: StopMode): Promise<void> {
  // An in-flight exit/scale order owns the position until the broker resolves it.
  const lock = firing.get(p.id);
  if (lock) {
    if (lock.orderId) await pollInFlight(userId, p, lock).catch(() => undefined);
    else if (Date.now() - lock.at > RETRY_MS) firing.delete(p.id);
    return;
  }
  if (deadEnded.has(p.id)) return;

  const { adapter, effective, accountId } = await brokerFor(userId, p);

  // Once per position: cancel foreign stops, place the disaster stop.
  if (!reconciled.has(p.id)) {
    reconciled.add(p.id);
    await reconcileBrokerSide(userId, p, adapter, effective, accountId).catch(() => undefined);
  }

  // Disaster-stop poll (once a minute): if the catastrophe order filled, the broker closed the position.
  if (p.disasterOrderId && (Date.now() - (disasterPollAt.get(p.id) ?? 0)) > DISASTER_POLL_MS) {
    disasterPollAt.set(p.id, Date.now());
    await pollDisaster(userId, p, adapter, effective, accountId).catch(() => undefined);
    const [fresh] = await getDb().select().from(positions).where(eq(positions.id, p.id)).limit(1).catch(() => []);
    if (!fresh || fresh.status !== "OPEN") return;
    p = fresh;
  }

  // MANUAL override — the human owns this exit. (Disaster insurance above stays active.)
  if (p.overrideMode === "MANUAL") return;

  const feed = marketDataService.get(p.symbol);
  const last = feed?.indicators?.last ?? null;
  const stalled = !feed
    || feed.lastRefresh === null
    || Date.now() - feed.lastRefresh > STALL_MS
    || feed.error !== null
    || last === null;

  if (stalled) {
    await safetyFlatten(userId, p, last ?? Number(p.avgEntry));
    return;
  }

  const entry = Number(p.avgEntry);
  const stop = Number(p.stopPrice);
  const risk = entry - stop;
  if (!(risk > 0)) return;

  const atr14 = atr(feed.bars, 14) ?? entry * 0.005;
  const highest = Math.max(p.highestPrice !== null ? Number(p.highestPrice) : entry, last);

  let armed = p.trailArmed === true;
  let trail = p.trailPrice !== null ? Number(p.trailPrice) : null;
  let fireLevel: number;
  let fireReason: ExitReason;

  if (mode === "IMMEDIATE_TRAIL") {
    // Trail is live from entry; distance tightens on gain milestones.
    armed = true;
    const peakGainPct = (highest - entry) / entry;
    const distPct = immediateDistPct(peakGainPct);
    const distance = Math.max(distPct * highest, IT_ATR_FLOOR_MULT * atr14);
    const candidate = highest - distance;
    trail = Math.max(trail ?? Number.NEGATIVE_INFINITY, candidate);
    trail = +trail.toFixed(4);
    // HARD BOTTOM — deterministic ratchet off the highest price.
    let bottom = entry - IT_INITIAL_PCT * entry;
    if (peakGainPct >= IT_BREAKEVEN_GAIN) bottom = Math.max(bottom, entry);
    if (peakGainPct >= IT_LOCKIN_GAIN) bottom = Math.max(bottom, entry + IT_LOCKIN_FRAC * (highest - entry));
    fireLevel = Math.max(trail, bottom);
    fireReason = "TRAIL";
  } else {
    // CLASSIC — flat stop governs until entry + 1R, then the ATR trail.
    if (!armed && last >= entry + ARM_R * risk) {
      armed = true;
      trail = highest - TRAIL_ATR_MULT * atr14;
    }
    if (armed) {
      const floor = p.scaleStage >= 2 && p.t1Price !== null
        ? Number(p.t1Price)
        : p.scaleStage >= 1 ? entry : null;
      const candidate = highest - TRAIL_ATR_MULT * atr14;
      const next = Math.max(trail ?? Number.NEGATIVE_INFINITY, candidate, floor ?? Number.NEGATIVE_INFINITY);
      trail = Number.isFinite(next) ? +next.toFixed(4) : trail;
    }
    fireLevel = armed && trail !== null ? trail : stop;
    fireReason = armed ? "TRAIL" : "FLAT_STOP";
  }

  // persist progress when anything moved
  const changed =
    highest !== (p.highestPrice !== null ? Number(p.highestPrice) : null)
    || armed !== (p.trailArmed === true)
    || trail !== (p.trailPrice !== null ? Number(p.trailPrice) : null);
  if (changed) {
    await updateTrailState(p.id, {
      highestPrice: highest.toFixed(4),
      trailArmed: armed,
      ...(trail !== null ? { trailPrice: trail.toFixed(4) } : {}),
    }).catch(() => undefined);
  }

  // 1. Protection first — the fire check always wins.
  if (last <= fireLevel) {
    await submitExit(userId, p, fireReason, p.quantity, fireLevel, last);
    return;
  }

  // 2. Scale-outs on strength — T1 sells a third, T2 sells half the remainder.
  if (p.quantity >= 3) {
    const t1 = p.t1Price !== null ? Number(p.t1Price) : null;
    const t2 = p.t2Price !== null ? Number(p.t2Price) : null;
    if (p.scaleStage === 0 && t1 !== null && last >= t1) {
      await submitExit(userId, p, "SCALE_T1", Math.max(1, Math.round(p.quantity / 3)), t1, last);
    } else if (p.scaleStage === 1 && t2 !== null && last >= t2) {
      await submitExit(userId, p, "SCALE_T2", Math.max(1, Math.floor(p.quantity / 2)), t2, last);
    }
  }
}

/** IMMEDIATE_TRAIL distance schedule: 0.50% → 0.45 → 0.40 → 0.32 → 0.27 → 0.22 (floor). */
function immediateDistPct(peakGainPct: number): number {
  let d: number;
  if (peakGainPct <= 0.01) d = 0.005 - 0.1 * peakGainPct;
  else if (peakGainPct <= 0.015) d = 0.004 - 0.16 * (peakGainPct - 0.01);
  else d = 0.0032 - 0.1 * (peakGainPct - 0.015);
  return Math.max(IT_MIN_PCT, Math.min(IT_INITIAL_PCT, d));
}

/* ---------- order submission ---------- */

/** Market-sell qty through the position's own broker. Full exits and scale tranches share this path. */
async function submitExit(userId: string, p: Position, reason: ExitReason, qty: number, refPrice: number, last: number): Promise<void> {
  if (firing.has(p.id) || deadEnded.has(p.id)) return;
  firing.set(p.id, { at: Date.now(), orderId: null, reason, qty, ref: refPrice });

  const { adapter, effective, accountId } = await brokerFor(userId, p);
  const intent: OrderIntent = {
    symbol: p.symbol,
    side: "SELL",
    quantity: qty,
    orderType: "MKT",
    tif: "DAY",
    clientOrderId: `TRAIL-${p.id}-${Date.now()}`,
    // the paper simulator fills at limitPrice — pass the mark so paper bookkeeping stays honest;
    // live brokers get a pure market order (no price fields attached)
    ...(adapter.code === "PAPER" ? { limitPrice: last } : {}),
  };

  let ack;
  try {
    ack = await adapter.placeOrder(accountId, intent);
  } catch (e) {
    firing.delete(p.id);
    await alertFire(userId, p, "CRITICAL",
      `PROTECTIVE EXIT FAILED — flatten manually`,
      `${reason} for ${p.symbol} ${qty} sh could not reach the broker (${(e as Error).message.slice(0, 160)}). entry ${Number(p.avgEntry).toFixed(2)} · reference ${refPrice.toFixed(2)} · last known ${last.toFixed(2)}. The position is still OPEN — flatten it manually now.`);
    return;
  }

  if (ack.status === "UNKNOWN") {
    firing.delete(p.id);
    deadEnded.add(p.id); // dead end — never auto-retry an unknown broker state
    await alertFire(userId, p, "CRITICAL",
      `EXIT STATE UNKNOWN — manual reconciliation required`,
      `${reason} for ${p.symbol} ${qty} sh: broker returned an unresolvable state (${(ack.message ?? "").slice(0, 140)}). The order was NOT resubmitted. Reconcile with the broker, then close position #${p.id} manually.`);
    return;
  }
  if (ack.status === "REJECTED") {
    firing.delete(p.id);
    await alertFire(userId, p, "HIGH",
      `${reason === "SCALE_T1" || reason === "SCALE_T2" ? "Scale-out" : "Protective exit"} rejected — retrying`,
      `${reason} for ${p.symbol} ${qty} sh rejected by ${effective}: ${(ack.message ?? "no reason given").slice(0, 140)}. The module will retry on the next cycle.`);
    return;
  }

  if (ack.status === "FILLED") {
    const fill = ack.averagePrice !== undefined ? Number(ack.averagePrice) : last;
    firing.delete(p.id);
    await bookExit(userId, p, reason, qty, refPrice, fill, ack.brokerOrderId, effective);
    return;
  }

  // ACKNOWLEDGED / WORKING — hold the fire lock and poll for the real fill.
  firing.set(p.id, { at: Date.now(), orderId: ack.brokerOrderId, reason, qty, ref: refPrice });
  await alertFire(userId, p, reason === "SAFETY_FLATTEN" || reason === "MANUAL_FLATTEN" ? "CRITICAL" : "HIGH",
    `${reasonLabel(reason)} fired — order working`,
    `${reason} for ${p.symbol} ${qty} sh acknowledged by ${effective} (order ${ack.brokerOrderId}) — booking when the broker reports the fill. entry ${Number(p.avgEntry).toFixed(2)} · reference at fire ${refPrice.toFixed(2)} · trigger price ${last.toFixed(2)}.`);
}

/** Poll a working exit order until the broker reports the fill, then book it. */
async function pollInFlight(userId: string, p: Position, lock: FireLock): Promise<void> {
  const { adapter, effective, accountId } = await brokerFor(userId, p);
  const status = await adapter.getOrderStatus(accountId, lock.orderId ?? "");
  if (status.status === "FILLED") {
    const fill = status.averagePrice !== undefined ? Number(status.averagePrice) : lock.ref;
    firing.delete(p.id);
    await bookExit(userId, p, lock.reason, lock.qty, lock.ref, fill, lock.orderId ?? "", effective);
  } else if (status.status === "REJECTED" || status.status === "UNKNOWN") {
    firing.delete(p.id);
    if (status.status === "UNKNOWN") deadEnded.add(p.id);
    await alertFire(userId, p, "CRITICAL",
      `Working exit ${status.status.toLowerCase()} — manual reconciliation required`,
      `${p.symbol} ${lock.qty} sh exit order ${lock.orderId} is now ${status.status} (${(status.message ?? "").slice(0, 140)}). Position #${p.id} remains OPEN — reconcile with the broker and flatten manually if needed.`);
  }
  // still WORKING → keep the lock, poll again next cycle
}

/** Book a fill: full exits close the row (and cancel the disaster stop); scale tranches split it. */
async function bookExit(userId: string, p: Position, reason: ExitReason, qty: number, refPrice: number, fill: number, brokerOrderId: string, effective: string): Promise<void> {
  if (reason === "SCALE_T1" || reason === "SCALE_T2") {
    const stage = reason === "SCALE_T1" ? 1 : 2;
    await bookScaleOut(p.id, qty, fill, stage as 1 | 2);
    firedToday += 1;
    const pnl = ((fill - Number(p.avgEntry)) * qty).toFixed(2);
    await alertFire(userId, p, "HIGH",
      `Scale-out ${stage === 1 ? "T1" : "T2"} filled — ${p.symbol}`,
      `${reason} · ${p.symbol} SOLD ${qty} @ ${fill.toFixed(2)} via ${effective} (order ${brokerOrderId}) · entry ${Number(p.avgEntry).toFixed(2)} · target ${refPrice.toFixed(2)} · realized P&L ${Number(pnl) >= 0 ? "+" : ""}${pnl} · trailing floor now ${stage === 1 ? "BREAKEVEN" : "T1 PRICE"} · trail runs the remainder.`);
    return;
  }

  await closePositionFromFire(p.id, fill, reason === "MANUAL_FLATTEN" ? "MANUAL_FLATTEN" : reason === "SAFETY_FLATTEN" ? "SAFETY_FLATTEN" : reason);
  firedToday += 1;
  const slippage = +(fill - refPrice).toFixed(4);
  const pnl = ((fill - Number(p.avgEntry)) * qty).toFixed(2);
  await alertFire(userId, p, reason === "SAFETY_FLATTEN" || reason === "MANUAL_FLATTEN" ? "CRITICAL" : "HIGH",
    `${reasonLabel(reason)} — ${p.symbol} closed`,
    `${reason} · ${p.symbol} SOLD ${qty} @ ${fill.toFixed(2)} via ${effective} (order ${brokerOrderId}) · entry ${Number(p.avgEntry).toFixed(2)} · reference at fire ${refPrice.toFixed(2)} · fill ${fill.toFixed(2)} · slippage ${slippage >= 0 ? "+" : ""}${slippage} · realized P&L ${Number(pnl) >= 0 ? "+" : ""}${pnl}.`);

  // the disaster stop's job is done — never leave orphan resting orders
  if (p.disasterOrderId) {
    const { adapter, accountId } = await brokerFor(userId, p);
    await adapter.cancelOrder(accountId, p.disasterOrderId).catch(() => undefined);
    await getDb().update(positions).set({ disasterOrderId: null }).where(eq(positions.id, p.id)).catch(() => undefined);
  }
}

/* ---------- broker-side reconciliation (once per position) ---------- */

async function reconcileBrokerSide(userId: string, p: Position, adapter: BrokerAdapter, effective: string, accountId: string): Promise<void> {
  // CANCEL-AND-GOVERN — remove any resting sell-stop we did not create.
  if (adapter.getOpenOrders) {
    try {
      const open = await adapter.getOpenOrders(accountId);
      const foreign = open.filter((o) =>
        o.side === "SELL"
        && /STP|STOP|TRAIL/.test(o.orderType)
        && o.symbol === p.symbol
        && o.brokerOrderId !== p.disasterOrderId
        && !(o.clientOrderId ?? "").startsWith("TRAIL-")
        && !(o.clientOrderId ?? "").startsWith("DSTR-"));
      for (const o of foreign) {
        const res = await adapter.cancelOrder(accountId, o.brokerOrderId).catch((e) => ({ ok: false, message: (e as Error).message }));
        await alertFire(userId, p, res.ok ? "HIGH" : "CRITICAL",
          res.ok ? `Broker-side stop canceled — trailing module governs ${p.symbol}` : `Could NOT cancel broker-side stop on ${p.symbol}`,
          res.ok
            ? `Resting ${o.orderType} sell order ${o.brokerOrderId}${o.stopPrice !== null ? ` @ ${o.stopPrice}` : ""} on ${p.symbol} was canceled so it cannot preempt the trailing module. The module now governs this exit${p.disasterPrice !== null ? ` (disaster insurance remains far below)` : ""}.`
            : `Resting ${o.orderType} sell order ${o.brokerOrderId} on ${p.symbol} could not be canceled (${res.message.slice(0, 120)}). It may fire before the trailing module — cancel it manually to avoid a double exit.`);
      }
    } catch (e) {
      await alertFire(userId, p, "HIGH",
        `Could not inspect broker-side orders for ${p.symbol}`,
        `getOpenOrders failed (${(e as Error).message.slice(0, 140)}). If you placed a stop manually at ${effective}, cancel it — the trailing module is the exit authority for this position.`);
    }
  } else if (adapter.code !== "PAPER") {
    await alertFire(userId, p, "MEDIUM",
      `Broker does not expose open orders — manual check`,
      `${effective} cannot list resting orders, so the module cannot verify no broker-side stop exists on ${p.symbol}. If you placed one manually, cancel it to avoid a double exit.`);
  }

  // DISASTER STOP — one catastrophic resting STP far below, pure crash insurance.
  if (adapter.code !== "PAPER" && !p.disasterOrderId && p.stopPrice !== null) {
    const entry = Number(p.avgEntry);
    const stop = Number(p.stopPrice);
    const feed = marketDataService.get(p.symbol);
    const atr14 = (feed ? atr(feed.bars, 14) : null) ?? entry * 0.005;
    const disaster = +(stop - Math.max(0.01 * entry, atr14)).toFixed(2);
    if (disaster > 0) {
      try {
        const ack = await adapter.placeOrder(accountId, {
          symbol: p.symbol, side: "SELL", quantity: p.quantity, orderType: "STP",
          stopPrice: disaster, tif: "GTC", clientOrderId: `DSTR-${p.id}`,
        });
        if (ack.brokerOrderId && ack.status !== "REJECTED" && ack.status !== "UNKNOWN") {
          await getDb().update(positions).set({ disasterOrderId: ack.brokerOrderId, disasterPrice: String(disaster) }).where(eq(positions.id, p.id));
          await alertFire(userId, p, "LOW",
            `Disaster stop resting — ${p.symbol}`,
            `Catastrophe insurance placed on ${p.symbol}: STP sell ${p.quantity} @ ${disaster} GTC via ${effective} (order ${ack.brokerOrderId}). Far below the working stop (${stop}) — it only fires if the module and its safety net both fail. Canceled automatically when the position closes.`);
        } else {
          await alertFire(userId, p, "MEDIUM", `Disaster stop could not rest — ${p.symbol}`, `${effective} rejected or could not place the catastrophe stop @ ${disaster} (${(ack.message ?? "").slice(0, 120)}). The module still governs the exit; you simply have no broker-side insurance layer.`);
        }
      } catch (e) {
        await alertFire(userId, p, "MEDIUM", `Disaster stop placement failed — ${p.symbol}`, `${(e as Error).message.slice(0, 140)}. The module still governs the exit.`);
      }
    }
  }
}

/** If the disaster stop filled at the broker, the position is gone — close the books honestly. */
async function pollDisaster(userId: string, p: Position, adapter: BrokerAdapter, effective: string, accountId: string): Promise<void> {
  const status = await adapter.getOrderStatus(accountId, p.disasterOrderId ?? "");
  const db = getDb();
  if (status.status === "FILLED") {
    const fill = status.averagePrice !== undefined ? Number(status.averagePrice) : Number(p.disasterPrice ?? p.stopPrice);
    await closePositionFromFire(p.id, fill, "DISASTER_STOP");
    await db.update(positions).set({ disasterOrderId: null }).where(eq(positions.id, p.id)).catch(() => undefined);
    firedToday += 1;
    await alertFire(userId, p, "CRITICAL",
      `DISASTER STOP FILLED — ${p.symbol} closed at broker`,
      `The catastrophe stop on ${p.symbol} fired @ ${fill.toFixed(2)} via ${effective} (order ${p.disasterOrderId}). This means price collapsed far below the working stop (${Number(p.stopPrice ?? 0).toFixed(2)}) faster than the module could act, or the module was impaired. entry ${Number(p.avgEntry).toFixed(2)} · realized P&L booked. Investigate the feed/module before the next session.`);
  } else if (/cancel/i.test(status.status) || status.status === "REJECTED") {
    // insurance vanished — clear it so reconciliation re-places it next session
    await db.update(positions).set({ disasterOrderId: null, disasterPrice: null }).where(eq(positions.id, p.id)).catch(() => undefined);
    reconciled.delete(p.id);
    await alertFire(userId, p, "MEDIUM", `Disaster stop gone — ${p.symbol}`, `The resting catastrophe order ${p.disasterOrderId} is ${status.status}. The module will attempt to re-place insurance; the working stop is unaffected.`);
  }
}

/* ---------- safety ---------- */

async function safetyFlatten(userId: string, p: Position, reference: number): Promise<void> {
  const prev = safetyAt.get(p.id) ?? 0;
  if (Date.now() - prev < SAFETY_THROTTLE_MS) return;
  safetyAt.set(p.id, Date.now());
  await alertFire(userId, p, "CRITICAL",
    `FEED STALL — attempting safety flatten`,
    `${p.symbol} ${p.quantity} sh: price feed stalled for more than one refresh cycle (>60s). Attempting to flatten the position now; if the broker is unreachable you will get a follow-up alert — flatten manually in that case.`);
  await submitExit(userId, p, "SAFETY_FLATTEN", p.quantity, reference, reference);
}

/* ---------- helpers ---------- */

function reasonLabel(reason: ExitReason): string {
  switch (reason) {
    case "TRAIL": return "Trailing stop";
    case "FLAT_STOP": return "Flat stop";
    case "SAFETY_FLATTEN": return "SAFETY FLATTEN";
    case "MANUAL_FLATTEN": return "Manual flatten";
    case "SCALE_T1": return "Scale-out T1";
    case "SCALE_T2": return "Scale-out T2";
  }
}

async function alertFire(userId: string, p: Position, priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW", title: string, body: string): Promise<void> {
  const db = getDb();
  await db.insert(alerts).values({
    userId,
    type: "EXECUTION",
    priority,
    title,
    body,
    symbol: p.symbol,
    state: "ACTIVE",
  }).catch(() => undefined);
}
