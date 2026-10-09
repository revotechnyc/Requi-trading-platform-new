import { and, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { autonomousConfigs, autonomousSessions, brokerAccounts, orderTickets, positions } from "@db/schema";
import { computedAllocation, emitEvent } from "./service";
import { proposeTicket, autoExecuteTicket } from "../queries/tickets";
import { getSnapshot } from "../marketdata/gateway/gateway";
import { gatewayHealth } from "../marketdata/ibkr-data";
import { configuredIbkrAccountId, isIbkrBrokerAccount } from "../brokers/ibkr";
import {
  earningsAutoTradeEnabled,
  getOpportunityScan,
  nextExecutablePick,
} from "./opportunity-scan";

/**
 * Paper sessions stay RUNNING through gateway blips — we only skip new orders.
 * Soft warnings every N fails so Events stays informative without killing the engine.
 */
const healthFailStreak = new Map<string, number>();
const HEALTH_WARN_EVERY = 3;
/** Avoid spamming new entries while still scanning every tick. */
const MIN_MS_BETWEEN_ENTRIES = 3 * 60 * 1000;
const lastEntryAt = new Map<string, number>();
const lastScanAnnounceAt = new Map<string, number>();

type Session = typeof autonomousSessions.$inferSelect;
type Config = typeof autonomousConfigs.$inferSelect;
type Account = typeof brokerAccounts.$inferSelect;

export function sessionUsesIbkr(account: Account | null | undefined): boolean {
  return Boolean(account && isIbkrBrokerAccount(account.broker));
}

async function ibkrVenueId(): Promise<string> {
  const id = configuredIbkrAccountId();
  if (!id) throw new Error("IBKR_ACCOUNT is not set");
  return id;
}

async function lastPrice(userId: string, symbol: string): Promise<{ price: number; source: string } | null> {
  const snap = await getSnapshot(userId, symbol);
  if (!snap.market_data_available || !(snap.price > 0)) return null;
  return { price: snap.price, source: snap.source_name };
}

export async function tickIbkrSession(s: Session, cfg: Config, account: Account): Promise<void> {
  const health = await gatewayHealth().catch((e) => ({ ok: false, detail: (e as Error).message }));
  const accountConfigured = Boolean(configuredIbkrAccountId());
  if (!health.ok || !accountConfigured) {
    const fails = (healthFailStreak.get(s.id) ?? 0) + 1;
    healthFailStreak.set(s.id, fails);
    if (fails === 1 || fails % HEALTH_WARN_EVERY === 0) {
      await emitEvent(s.id, s.userId, {
        phase: "MARKET_DATA",
        kind: "warn",
        message: !accountConfigured
          ? `IBKR_ACCOUNT missing on server — scanning paused (engine still RUNNING, fail #${fails})`
          : `IBKR gateway not ready (${health.detail || "unhealthy"}) — no new paper orders (fail #${fails}; engine stays RUNNING)`,
      });
    }
    return;
  }
  if ((healthFailStreak.get(s.id) ?? 0) > 0) {
    await emitEvent(s.id, s.userId, {
      phase: "MARKET_DATA",
      kind: "success",
      message: "IBKR Paper gateway healthy again — order flow resumed",
    });
  }
  healthFailStreak.set(s.id, 0);

  const maxDailyLoss = parseFloat(cfg.maxDailyLoss);
  const dayPnl = parseFloat(s.dayPnl);
  if (dayPnl <= -maxDailyLoss) {
    await emitEvent(s.id, s.userId, {
      phase: "RISK_CHECK",
      kind: "risk",
      message: `Daily loss limit reached — IBKR paper session will not place new orders`,
    });
    return;
  }

  if (s.arc === "holding" && s.symbol) {
    await tickIbkrHolding(s, cfg);
    return;
  }

  const db = getDb();
  const [staged] = await db
    .select({ ticketId: orderTickets.ticketId, symbol: orderTickets.symbol, state: orderTickets.state })
    .from(orderTickets)
    .where(
      and(
        eq(orderTickets.userId, s.userId),
        eq(orderTickets.runSessionId, s.id),
        eq(orderTickets.state, "READY_FOR_CONFIRMATION"),
      ),
    )
    .limit(1);
  if (staged) {
    const last = (s as { lastEventAt?: Date | string | null }).lastEventAt;
    const lastMs = last ? new Date(last).getTime() : 0;
    if (!lastMs || Date.now() - lastMs >= 30_000) {
      await emitEvent(s.id, s.userId, {
        phase: "ORDER_SUBMITTED",
        kind: "warn",
        symbol: staged.symbol,
        message: `Ticket ${staged.ticketId} is waiting — open Orders → Confirm (or reply CONFIRM ORDER ${staged.ticketId}) · nothing sent to IBKR Paper yet`,
      });
    }
    return;
  }

  const openRows = await db
    .select({ symbol: positions.symbol, quantity: positions.quantity, avgEntry: positions.avgEntry })
    .from(positions)
    .where(and(eq(positions.userId, s.userId), eq(positions.status, "OPEN"), eq(positions.broker, "IBKR")));
  const openSymbols = new Set(openRows.map((p) => p.symbol.toUpperCase()));

  if (openRows.length >= cfg.maxPositions) {
    const lastAnn = lastScanAnnounceAt.get(s.id) ?? 0;
    if (Date.now() - lastAnn >= 60_000) {
      lastScanAnnounceAt.set(s.id, Date.now());
      await emitEvent(s.id, s.userId, {
        phase: "RISK_CHECK",
        kind: "risk",
        message: `Max simultaneous positions (${openRows.length}/${cfg.maxPositions}) — scan continues, new entries paused`,
      });
    }
    return;
  }

  let scan;
  try {
    scan = await getOpportunityScan(s.userId, { excludeSymbols: [...openSymbols] });
  } catch (e) {
    await emitEvent(s.id, s.userId, {
      phase: "MARKET_DATA",
      kind: "warn",
      message: `Opportunity scan failed: ${(e as Error).message}`,
    });
    return;
  }

  const lastAnn = lastScanAnnounceAt.get(s.id) ?? 0;
  if (Date.now() - lastAnn >= 45_000) {
    lastScanAnnounceAt.set(s.id, Date.now());
    const earnNote = scan.earningsAvailable
      ? earningsAutoTradeEnabled()
        ? "earnings sleeve ON"
        : "earnings evaluate-only (auto-trade off)"
      : `earnings calendar unavailable${scan.earningsError ? `: ${scan.earningsError}` : ""}`;
    await emitEvent(s.id, s.userId, {
      phase: "MARKET_SCAN",
      message: `${scan.message} · ${earnNote}`,
    });
  }

  const pick = nextExecutablePick(scan, openSymbols);
  if (!pick) {
    // Surface top non-executable earnings evaluate-only pick occasionally.
    const evalOnly = scan.candidates.find((c) => !c.executable && !openSymbols.has(c.symbol));
    if (evalOnly && Date.now() - lastAnn >= 45_000) {
      await emitEvent(s.id, s.userId, {
        phase: "OPPORTUNITY",
        kind: "warn",
        symbol: evalOnly.symbol,
        message: `${evalOnly.symbol} · ${evalOnly.strategy} — ${evalOnly.reason}`,
      });
    }
    return;
  }

  const sinceEntry = Date.now() - (lastEntryAt.get(s.id) ?? 0);
  if (sinceEntry < MIN_MS_BETWEEN_ENTRIES) {
    return;
  }

  // Re-verify live quote immediately before ticket (scan may be up to ~90s old).
  const quote = await lastPrice(s.userId, pick.symbol);
  if (!quote) {
    await emitEvent(s.id, s.userId, {
      phase: "MARKET_DATA",
      kind: "warn",
      symbol: pick.symbol,
      message: `${pick.symbol} — no verified snapshot · skipped (will not invent a price for IBKR Paper)`,
    });
    return;
  }

  const entry = quote.price;
  const stopPct = parseFloat(cfg.stopLossPct) / 100;
  const stop = +(entry * (1 - stopPct)).toFixed(2);
  const target = +(entry * (1 + stopPct * 2)).toFixed(2);
  const strategy = pick.strategy;

  const allocated = computedAllocation(cfg, account);
  const deployed = openRows.reduce((a, p) => a + p.quantity * parseFloat(p.avgEntry), 0);
  const available = allocated - deployed;
  const maxPosPct = parseFloat(cfg.maxPositionSizePct) / 100;
  const maxNotional = Math.min(available, allocated * maxPosPct);

  if (maxNotional < entry) {
    await emitEvent(s.id, s.userId, {
      phase: "RISK_CHECK",
      kind: "risk",
      symbol: pick.symbol,
      message: `Risk check REJECTED — allocation exhausted for IBKR Paper`,
    });
    return;
  }

  const qty = Math.max(1, Math.floor(maxNotional / entry));
  await emitEvent(s.id, s.userId, {
    phase: "OPPORTUNITY",
    kind: "success",
    symbol: pick.symbol,
    message: `${pick.symbol} opportunity — ${pick.reason} · last ${entry.toFixed(2)} via ${quote.source}`,
    payload: { price: entry, venue: "IBKR", score: pick.score, sleeve: pick.sleeve },
  });
  await emitEvent(s.id, s.userId, {
    phase: "STRATEGY_SELECTED",
    symbol: pick.symbol,
    message: `Strategy: ${strategy} · entry ${entry.toFixed(2)} · stop ${stop.toFixed(2)} · target ${target.toFixed(2)}`,
  });
  await emitEvent(s.id, s.userId, {
    phase: "RISK_CHECK",
    kind: "success",
    symbol: pick.symbol,
    message: `Risk validation passed — size ${qty} sh · IBKR Paper ${await ibkrVenueId()}`,
  });

  const venueId = await ibkrVenueId();
  const result = await proposeTicket(s.userId, {
    strategy,
    broker: "IBKR",
    accountId: venueId,
    symbol: pick.symbol,
    side: "BUY",
    quantity: qty,
    orderType: "LMT",
    limitPrice: entry,
    stopPrice: stop,
    tif: "DAY",
    entry,
    stop,
    target,
    origin: "AUTONOMOUS",
    runSessionId: s.id,
  });

  const exec = await autoExecuteTicket(s.userId, result.ticket.ticketId);
  lastEntryAt.set(s.id, Date.now());
  await emitEvent(s.id, s.userId, {
    phase: "BROKER_CONFIRM",
    kind: exec.ok ? "success" : "error",
    symbol: pick.symbol,
    message: exec.ok
      ? `IBKR Paper ${exec.message} · ticket ${result.ticket.ticketId} (auto)`
      : `IBKR Paper auto-execute failed (${exec.reasonCode}): ${exec.message} · ticket ${result.ticket.ticketId}`,
  });
  if (exec.ok && (exec.ticket?.state === "FILLED" || exec.ticket?.state === "WORKING")) {
    await db
      .update(autonomousSessions)
      .set({
        arc: "holding",
        symbol: pick.symbol,
        entry: String(entry),
        stop: String(stop),
        target: String(target),
        quantity: qty,
      })
      .where(eq(autonomousSessions.id, s.id));
  }
}

async function tickIbkrHolding(s: Session, cfg: Config): Promise<void> {
  const db = getDb();
  const [pos] = await db
    .select()
    .from(positions)
    .where(and(eq(positions.userId, s.userId), eq(positions.symbol, s.symbol!), eq(positions.status, "OPEN")))
    .limit(1);
  if (!pos) {
    await db
      .update(autonomousSessions)
      .set({ arc: "idle", symbol: null, entry: null, stop: null, target: null, quantity: null })
      .where(eq(autonomousSessions.id, s.id));
    return;
  }

  const quote = await lastPrice(s.userId, s.symbol!);
  if (!quote) {
    await emitEvent(s.id, s.userId, {
      phase: "POSITION_MONITOR",
      kind: "warn",
      symbol: s.symbol!,
      message: `${s.symbol} — no verified mark · IBKR Paper position held, exit not guessed`,
    });
    return;
  }

  const px = quote.price;
  const entry = parseFloat(s.entry ?? pos.avgEntry);
  const stop = parseFloat(s.stop ?? pos.stopPrice ?? "0");
  const target = parseFloat(s.target ?? "0");
  const qty = s.quantity ?? pos.quantity;
  const trailPct = parseFloat(cfg.trailingStopPct) / 100;
  const high = Math.max(parseFloat(pos.highestPrice ?? String(px)), px);
  const trail = Math.max(parseFloat(pos.trailPrice ?? "0"), +(high * (1 - trailPct)).toFixed(2));
  const unreal = (px - entry) * qty;

  await db.update(positions).set({ highestPrice: high.toFixed(2), trailPrice: trail.toFixed(2) }).where(eq(positions.id, pos.id));
  await emitEvent(s.id, s.userId, {
    phase: "POSITION_MONITOR",
    symbol: s.symbol!,
    message: `${s.symbol} @ ${px.toFixed(2)} (${quote.source}) · unrealized ${unreal >= 0 ? "+" : "−"}$${Math.abs(unreal).toFixed(2)} · trail ${trail.toFixed(2)}`,
  });

  const hitTarget = target > 0 && px >= target;
  const hitStop = (stop > 0 && px <= stop) || (trail > 0 && px <= trail);
  if (!hitTarget && !hitStop) return;

  const reason = hitTarget ? "TARGET" : px <= stop ? "FLAT_STOP" : "TRAIL";
  const venueId = await ibkrVenueId();
  const result = await proposeTicket(s.userId, {
    strategy: "EXIT",
    broker: "IBKR",
    accountId: venueId,
    symbol: s.symbol!,
    side: "SELL",
    quantity: qty,
    orderType: "MKT",
    tif: "DAY",
    entry: px,
    origin: "AUTONOMOUS",
    runSessionId: s.id,
  });

  const exec = await autoExecuteTicket(s.userId, result.ticket.ticketId);
  await emitEvent(s.id, s.userId, {
    phase: "EXIT_TRIGGERED",
    kind: hitTarget ? "success" : "warn",
    symbol: s.symbol!,
    message: exec.ok
      ? `${reason} — IBKR Paper sell ${qty} ${s.symbol} · ${exec.message} (auto)`
      : `${reason} — IBKR Paper sell failed (${exec.reasonCode}): ${exec.message} · ticket ${result.ticket.ticketId}`,
  });
  if (exec.ok) {
    await db
      .update(autonomousSessions)
      .set({
        arc: "idle",
        symbol: null,
        entry: null,
        stop: null,
        target: null,
        quantity: null,
        tradesToday: s.tradesToday + 1,
      })
      .where(eq(autonomousSessions.id, s.id));
  }
}
