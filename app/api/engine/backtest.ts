import { groupRthSessions, type Bar, type DayLevels } from "../marketdata/indicators";
import type { StrategyConfig } from "./config";
import { SetupMachine, type MachineEvent, type Proposal } from "./state-machine";
import { sizePosition } from "./risk";

/**
 * BACKTEST MODULE — module 3.
 *
 * Replays 1-minute bars day-by-day through the SAME SetupMachine the live
 * monitor uses. No lookahead, by construction:
 *   - the machine only ever receives bars up to the current index;
 *   - a CONFIRMED proposal's buy-stop is evaluated for a fill on the NEXT
 *     bar (fills at the stop price, or the open if gapped through);
 *   - stops fill before targets within a bar (conservative).
 *
 * Report: per-trade log, win rate, profit factor, expectancy (R), max
 * drawdown on the cumulative-R curve.
 */

export interface BacktestTrade {
  day: string;
  variantId: string;
  entryTime: number;
  exitTime: number;
  entry: number;
  avgExit: number;
  qty: number;
  stop: number;
  pnl: number;
  r: number;
  exitReason: string;
}

export interface BacktestReport {
  strategyId: string;
  symbol: string;
  days: number;
  trades: BacktestTrade[];
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  profitFactor: number | null;
  expectancyR: number | null;
  maxDrawdownR: number;
  totalPnl: number;
  noTradeDays: number;
  events: MachineEvent[];
}

interface SessionDay {
  date: string;
  bars: Bar[];
  priorDay: DayLevels | null;
}

export function sessionsFromBars(bars: Bar[]): SessionDay[] {
  const grouped = groupRthSessions(bars);
  const days = [...grouped.keys()].sort();
  return days.map((date, i) => {
    const dayBars = grouped.get(date)!;
    const prior = i > 0 ? grouped.get(days[i - 1])! : null;
    return {
      date,
      bars: dayBars,
      priorDay: prior
        ? { high: Math.max(...prior.map((b) => b.h)), low: Math.min(...prior.map((b) => b.l)), close: prior[prior.length - 1].c }
        : null,
    };
  });
}

export function runBacktest(input: {
  config: StrategyConfig;
  symbol: string;
  bars: Bar[];
  accountEquity?: number;
  variantOnly?: string | null;
}): BacktestReport {
  const equity = input.accountEquity ?? 100000;
  const days = sessionsFromBars(input.bars);
  const trades: BacktestTrade[] = [];
  const allEvents: MachineEvent[] = [];
  let noTradeDays = 0;

  const config: StrategyConfig = input.variantOnly
    ? { ...input.config, entry_variants: input.config.entry_variants.filter((v) => v.id === input.variantOnly) }
    : input.config;

  for (const day of days) {
    const machine = new SetupMachine(input.symbol, config, (e) => allEvents.push(e));
    let pending: Proposal | null = null;
    let pendingQty = 0;

    for (let i = 0; i < day.bars.length; i++) {
      const bar = day.bars[i];

      // 1) fill check for a pending entry stop — BEFORE feeding this bar's close
      if (pending && machine.state === "CONFIRMED") {
        const chasePct = ((bar.o - pending.entry) / pending.entry) * 100;
        if (chasePct > config.entry_variants.find((v) => v.id === pending!.variantId)?.chase_limit_pct!) {
          machine.kill(`chase-cancel: open gapped ${chasePct.toFixed(1)}% past trigger`);
          pending = null;
        } else if (bar.h >= pending.entry) {
          const fill = Math.max(pending.entry, bar.o);
          machine.notifyFill(fill, bar.t);
          pendingQty = sizePosition({
            accountEquity: equity,
            entry: fill,
            stop: pending.stop,
            maxRiskPct: config.sizing.max_risk_pct,
            maxPositionPct: config.sizing.max_position_pct,
          }).qty;
          pending = { ...pending, entry: fill };
        }
      }

      // 2) feed the bar (machine sees only up-to-now)
      const ctx = { session: day.bars.slice(0, i + 1), priorDay: day.priorDay };
      const proposal = machine.onBar(ctx);
      if (proposal) pending = proposal;
    }

    // 3) settle the day
    if (machine.state === "IN_POSITION" || machine.exits.length > 0) {
      const exits = machine.exits;
      if (machine.state === "IN_POSITION") {
        // machine flattens at 15:55 by schedule; if bars ended early, close at last bar
        const last = day.bars[day.bars.length - 1];
        exits.push({ t: last.t, price: last.c, fraction: 1, reason: "eod" });
      }
      const pos = (machine as unknown as { proposal: Proposal | null }).proposal;
      if (pos && pendingQty > 0 && exits.length > 0) {
        let remaining = 1;
        let weighted = 0;
        for (const ex of exits) {
          const f = Math.min(ex.fraction, remaining);
          weighted += f * ex.price;
          remaining -= f;
        }
        if (remaining > 0.0001) weighted += remaining * day.bars[day.bars.length - 1].c;
        const perShareRisk = pos.entry - pos.stop;
        const pnl = (weighted - pos.entry) * pendingQty;
        trades.push({
          day: day.date,
          variantId: pos.variantId,
          entryTime: pos.t,
          exitTime: exits[exits.length - 1].t,
          entry: pos.entry,
          avgExit: +weighted.toFixed(4),
          qty: pendingQty,
          stop: pos.stop,
          pnl: +pnl.toFixed(2),
          r: perShareRisk > 0 ? +((weighted - pos.entry) / perShareRisk).toFixed(2) : 0,
          exitReason: exits[exits.length - 1].reason,
        });
      }
    } else if (machine.state === "NO_TRADE" || machine.state === "IDLE" || machine.state === "WATCHING") {
      noTradeDays += 1;
    }
  }

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  let cum = 0;
  let peak = 0;
  let maxDd = 0;
  for (const t of trades) {
    cum += t.r;
    peak = Math.max(peak, cum);
    maxDd = Math.max(maxDd, peak - cum);
  }

  return {
    strategyId: config.strategy_id,
    symbol: input.symbol,
    days: days.length,
    trades,
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? +((wins.length / trades.length) * 100).toFixed(1) : null,
    profitFactor: grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : null,
    expectancyR: trades.length ? +(trades.reduce((a, t) => a + t.r, 0) / trades.length).toFixed(3) : null,
    maxDrawdownR: +maxDd.toFixed(2),
    totalPnl: +trades.reduce((a, t) => a + t.pnl, 0).toFixed(2),
    noTradeDays,
    events: allEvents.slice(-200),
  };
}
