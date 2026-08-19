import { etParts, sessionVwap, type Bar } from "../marketdata/indicators";
import { atr, rollingVwap, runTrigger, type EvidenceValue, type TriggerContext } from "./triggers";
import type { EntryVariant, StrategyConfig } from "./config";

/**
 * SETUP STATE MACHINE — module 2, the "Brain".
 *
 *   IDLE → WATCHING → CONFIRMED → IN_POSITION → OUT
 *     └──────────────→ NO_TRADE        └────────→ KILLED (kill switch)
 *
 * Core invariants (from the spec, non-negotiable):
 *   - WATCHING starts when price closes at/above the zone floor.
 *   - Timer = consecutive 1-min closes above the floor. ANY close below
 *     the floor resets the timer to 0 — full reset, never a pause.
 *   - Timer ≥ threshold AND variant trigger armed AND signal stack met
 *     → CONFIRMED → exactly one proposal (buy-stop entry).
 *   - Variants are a ranked ladder: chase-limit breach invalidates the
 *     current variant and moves to the next. All invalidated → NO_TRADE.
 *     Missing a trade is a valid outcome.
 *   - At most ONE confirmation per symbol per day (OCO across variants).
 *
 * The SAME machine runs live and in the backtester: live, a broker fills
 * the entry stop; in backtest, the replay engine calls notifyFill(). The
 * machine only ever sees bars up to "now" — no lookahead by construction.
 */

export type SetupState = "IDLE" | "WATCHING" | "CONFIRMED" | "IN_POSITION" | "OUT" | "KILLED" | "NO_TRADE";

export interface MachineEvent {
  t: number;
  type: "STATE_CHANGE" | "TIMER_RESET" | "CONFIRMED" | "FILL" | "EXIT" | "INVALIDATED" | "NO_TRADE" | "KILLED" | "BLOCKED";
  detail: string;
  data?: Record<string, EvidenceValue>;
}

export interface Proposal {
  symbol: string;
  strategyId: string;
  variantId: string;
  t: number;
  entry: number;
  stop: number;
  targets: Array<{ price: number; sellFraction: number }>;
  signalsArmed: string[];
  triggerEvidence: Record<string, EvidenceValue>;
}

interface Position {
  entry: number;
  stop: number;
  targets: Array<{ price: number; sellFraction: number; hit: boolean }>;
  filledAt: number;
}

function minutesOf(t: number): number {
  return etParts(t).minutes;
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export class SetupMachine {
  readonly symbol: string;
  private config: StrategyConfig;
  private events: MachineEvent[] = [];
  private emit: (e: MachineEvent) => void;

  state: SetupState = "IDLE";
  timerCount = 0;
  private variantIdx = 0;
  private proposal: Proposal | null = null;
  private position: Position | null = null;
  exits: Array<{ t: number; price: number; fraction: number; reason: string }> = [];

  constructor(symbol: string, config: StrategyConfig, onEvent?: (e: MachineEvent) => void) {
    this.symbol = symbol;
    this.config = config;
    this.emit = onEvent ?? (() => undefined);
  }

  private transition(to: SetupState, detail: string, data?: Record<string, EvidenceValue>): void {
    if (this.state === to) return;
    const e: MachineEvent = { t: Date.now(), type: "STATE_CHANGE", detail: `${this.state} → ${to}: ${detail}`, data };
    this.state = to;
    this.events.push(e);
    this.emit(e);
  }

  private log(type: MachineEvent["type"], detail: string, data?: Record<string, EvidenceValue>): void {
    const e: MachineEvent = { t: Date.now(), type, detail, data };
    this.events.push(e);
    this.emit(e);
  }

  getEvents(): MachineEvent[] {
    return this.events;
  }

  get currentVariant(): EntryVariant | null {
    return this.config.entry_variants[this.variantIdx] ?? null;
  }

  /** Resolve the floor series for the hold timer ("vwap" or a fixed level). */
  private floorSeries(ctx: TriggerContext): number[] {
    const floor = this.config.hold_timer.floor;
    if (floor === "vwap") return rollingVwap(ctx.session);
    return ctx.session.map(() => floor);
  }

  private resolveStop(ctx: TriggerContext, entry: number): number | null {
    const s = this.config.stop;
    const a = atr(ctx.session) ?? entry * 0.005;
    const last = ctx.session[ctx.session.length - 1];
    switch (s.type) {
      case "vwap": {
        const vw = sessionVwap(ctx.session);
        return vw === null ? null : +(vw * (1 - (s.offset_pct ?? 0) / 100)).toFixed(4);
      }
      case "swing_low": {
        const recent = Math.min(...ctx.session.slice(-20).map((b) => b.l));
        return +(recent - (s.offset_atr ?? 0.5) * a).toFixed(4);
      }
      case "atr":
      default:
        return +(last.c - (s.offset_atr ?? 1.0) * a).toFixed(4);
    }
  }

  /**
   * Feed one bar. `ctx` must contain the session UP TO AND INCLUDING this bar.
   * Returns a Proposal exactly once, on the IDLE/WATCHING → CONFIRMED transition.
   */
  onBar(ctx: TriggerContext): Proposal | null {
    const bar = ctx.session[ctx.session.length - 1];
    if (!bar) return null;
    const mins = minutesOf(bar.t);

    if (this.state === "KILLED" || this.state === "NO_TRADE" || this.state === "OUT") return null;

    // ── position management (IN_POSITION) ──
    if (this.state === "IN_POSITION" && this.position) {
      this.managePosition(bar, mins);
      return null;
    }

    // ── schedule gate: no new entries after the cutoff ──
    if (mins >= hhmmToMinutes(this.config.schedule.no_entries_after)) {
      if (this.state === "WATCHING") this.transition("IDLE", "past entry cutoff — stood down");
      return null;
    }

    const variant = this.currentVariant;
    if (!variant) {
      if (this.state !== "NO_TRADE") {
        this.transition("NO_TRADE", "all entry variants invalidated — missing the trade is a valid outcome");
        this.log("NO_TRADE", "no viable variant remains");
      }
      return null;
    }

    // ── hold timer: consecutive closes at/above floor, FULL reset below ──
    const floors = this.floorSeries(ctx);
    const floorNow = floors[floors.length - 1];
    if (bar.c >= floorNow) {
      this.timerCount += 1;
      if (this.state === "IDLE") this.transition("WATCHING", `price closed above floor (${floorNow.toFixed(2)}) — timer started`);
    } else {
      if (this.timerCount > 0) this.log("TIMER_RESET", `close ${bar.c.toFixed(2)} below floor ${floorNow.toFixed(2)} — timer reset ${this.timerCount} → 0`);
      this.timerCount = 0;
      if (this.state === "WATCHING") this.transition("IDLE", "floor lost — back to scanning");
    }

    // ── chase-limit invalidation → next variant (OCO ladder) ──
    const ref = ctx.session[0]?.o ?? bar.c;
    const runPct = ((bar.c - ref) / ref) * 100;
    if (this.timerCount > 0 && runPct > variant.chase_limit_pct + 3) {
      this.log("INVALIDATED", `variant ${variant.id} invalidated — price ran ${runPct.toFixed(1)}% past reference, chase limit ${variant.chase_limit_pct}%`);
      this.variantIdx += 1;
      this.timerCount = 0;
      this.transition("IDLE", `moving to next variant in ladder`);
      return null;
    }

    if (this.timerCount < this.config.hold_timer.minutes) return null;

    // ── timer threshold met: trigger + signal stack must also arm ──
    const trig = runTrigger(variant.trigger_type, ctx, variant.params);
    if (!trig.armed) return null;

    const signalsArmed = variant.signals.filter((name) => runTrigger(name, ctx).armed);
    if (signalsArmed.length < variant.min_signals_armed) return null;

    const entry = +(bar.c + variant.entry_offset).toFixed(4);
    const stop = this.resolveStop(ctx, entry);
    if (stop === null || stop >= entry) return null;

    this.proposal = {
      symbol: this.symbol,
      strategyId: this.config.strategy_id,
      variantId: variant.id,
      t: bar.t,
      entry,
      stop,
      targets: this.config.targets.map((tg) => ({
        price: +(entry + tg.r_multiple * (entry - stop)).toFixed(4),
        sellFraction: tg.sell_fraction,
      })),
      signalsArmed,
      triggerEvidence: trig.evidence,
    };
    this.transition("CONFIRMED", `timer ${this.timerCount} ≥ ${this.config.hold_timer.minutes} · trigger ${variant.trigger_type} armed · signals [${signalsArmed.join(", ")}]`);
    this.log("CONFIRMED", `proposal: entry ${entry} stop ${stop} targets ${this.proposal.targets.map((x) => x.price).join("/")}`, { entry, stop });
    return this.proposal;
  }

  /** Called by the fill source (backtest replay or broker fill event). */
  notifyFill(price: number, t: number): void {
    if (this.state !== "CONFIRMED" || !this.proposal) return;
    this.position = {
      entry: price,
      stop: this.proposal.stop,
      targets: this.proposal.targets.map((x) => ({ ...x, hit: false })),
      filledAt: t,
    };
    this.transition("IN_POSITION", `filled at ${price}`);
    this.log("FILL", `entry fill ${price} · protective stop ${this.position.stop} placed immediately`, { price, stop: this.position.stop });
  }

  private managePosition(bar: Bar, mins: number): void {
    const pos = this.position;
    if (!pos) return;

    // flatten-by time: market exit
    if (mins >= hhmmToMinutes(this.config.schedule.flatten_by)) {
      this.exits.push({ t: bar.t, price: bar.c, fraction: 1, reason: "time_flatten" });
      this.log("EXIT", `time-based flatten at ${bar.c.toFixed(2)}`);
      this.transition("OUT", "flattened by schedule");
      return;
    }

    // stop: fills if the bar trades through it (checked before targets — conservative)
    if (bar.l <= pos.stop) {
      this.exits.push({ t: bar.t, price: pos.stop, fraction: 1, reason: "stop" });
      this.log("EXIT", `stop hit at ${pos.stop}`);
      this.transition("OUT", "protective stop filled");
      return;
    }

    // targets in order
    let remaining = 1 - this.exits.filter((e) => e.reason === "target").reduce((a, e) => a + e.fraction, 0);
    for (const tg of pos.targets) {
      if (!tg.hit && bar.h >= tg.price && remaining > 0) {
        tg.hit = true;
        const frac = Math.min(tg.sellFraction, remaining);
        this.exits.push({ t: bar.t, price: tg.price, fraction: frac, reason: "target" });
        this.log("EXIT", `target ${tg.price} filled (${(frac * 100).toFixed(0)}% of position)`);
        remaining -= frac;
        // ratchet stop to breakeven after first target — tightening only
        if (pos.stop < pos.entry) {
          pos.stop = pos.entry;
          this.log("EXIT", `stop tightened to breakeven ${pos.entry} (tightening-only rule)`);
        }
      }
    }
    if (remaining <= 0.0001) this.transition("OUT", "all targets filled");
  }

  kill(reason: string): void {
    if (this.state === "OUT" || this.state === "KILLED") return;
    this.transition("KILLED", reason);
    this.log("KILLED", reason);
  }
}
