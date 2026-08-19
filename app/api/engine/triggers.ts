import { rsi, sessionVwap, type Bar, type DayLevels } from "../marketdata/indicators";

/**
 * TRIGGER LIBRARY — module 1 of the strategy engine.
 *
 * Every trigger is a standalone, PURE function over the session's 1-minute
 * bars. No hidden state: the same function called on the same bars returns
 * the same result — which is exactly why live mode and backtest mode agree.
 * Hold/timer logic (e.g. "30 consecutive minutes above VWAP") is derived
 * from the bar series itself: a close back below the floor makes the
 * trailing count zero — the full-reset rule falls out of the data.
 *
 * Each trigger returns { armed, evidence } where evidence is the data that
 * armed it (for logging and the audit trail).
 */

export interface TriggerContext {
  /** today's regular-hours bars, ascending, up to "now" */
  session: Bar[];
  priorDay: DayLevels | null;
  /** benchmark session bars (e.g. QQQ) for relative strength */
  benchmarkSession?: Bar[];
}

export type EvidenceValue = number | string | boolean | null;
export interface TriggerResult {
  armed: boolean;
  evidence: Record<string, EvidenceValue>;
}

export type TriggerParams = Record<string, number | string | boolean>;
export type TriggerFn = (ctx: TriggerContext, params: TriggerParams) => TriggerResult;

/* ---------- helpers ---------- */

/** Cumulative session VWAP at each bar index. */
export function rollingVwap(bars: Bar[]): number[] {
  let pv = 0;
  let vol = 0;
  return bars.map((b) => {
    pv += ((b.h + b.l + b.c) / 3) * b.v;
    vol += b.v;
    return vol > 0 ? pv / vol : b.c;
  });
}

/** Trailing count of consecutive closes at/above a floor series. */
function trailingHoldCount(bars: Bar[], floorSeries: number[]): number {
  let count = 0;
  for (let i = bars.length - 1; i >= 0; i--) {
    if (bars[i].c >= floorSeries[i]) count++;
    else break;
  }
  return count;
}

/** Local minima: bar low strictly below the `wing` neighbors on each side. */
function swingLows(bars: Bar[], wing = 2): Array<{ i: number; price: number }> {
  const out: Array<{ i: number; price: number }> = [];
  for (let i = wing; i < bars.length - wing; i++) {
    const l = bars[i].l;
    let isLow = true;
    for (let k = 1; k <= wing; k++) {
      if (bars[i - k].l <= l || bars[i + k].l <= l) { isLow = false; break; }
    }
    if (isLow) out.push({ i, price: l });
  }
  return out;
}

/** Wilder ATR over the session (falls back to whatever bars exist). */
export function atr(bars: Bar[], period = 14): number | null {
  if (bars.length < 2) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prevC = bars[i - 1].c;
    const b = bars[i];
    trs.push(Math.max(b.h - b.l, Math.abs(b.h - prevC), Math.abs(b.l - prevC)));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, x) => a + x, 0) / slice.length;
}

/** Resolve a level token ("vwap" | "session_high" | "prior_day_high" | numeric string) to a number. */
export function resolveLevel(ctx: TriggerContext, token: number | string): number | null {
  if (typeof token === "number") return token;
  const n = Number(token);
  if (Number.isFinite(n)) return n;
  const vw = sessionVwap(ctx.session);
  switch (token) {
    case "vwap": return vw;
    case "session_high": return ctx.session.length ? Math.max(...ctx.session.map((b) => b.h)) : null;
    case "session_low": return ctx.session.length ? Math.min(...ctx.session.map((b) => b.l)) : null;
    case "prior_day_high": return ctx.priorDay?.high ?? null;
    case "prior_day_low": return ctx.priorDay?.low ?? null;
    case "prior_day_close": return ctx.priorDay?.close ?? null;
    default: return null;
  }
}

/* ---------- the triggers ---------- */

const vwapReclaim: TriggerFn = (ctx, p) => {
  const holdMinutes = Number(p.hold_minutes ?? 30);
  if (ctx.session.length < holdMinutes) return { armed: false, evidence: { reason: "insufficient_bars", have: ctx.session.length, need: holdMinutes } };
  const vw = rollingVwap(ctx.session);
  const count = trailingHoldCount(ctx.session, vw);
  // "reclaim" requires price was below VWAP earlier in the session
  const wasBelow = ctx.session.some((b, i) => b.c < vw[i]);
  return {
    armed: wasBelow && count >= holdMinutes,
    evidence: { hold_count: count, hold_minutes: holdMinutes, was_below: wasBelow, vwap: vw[vw.length - 1], last: ctx.session[ctx.session.length - 1].c },
  };
};

const pullbackHold: TriggerFn = (ctx, p) => {
  const holdMinutes = Number(p.hold_minutes ?? 10);
  const zoneLow = resolveLevel(ctx, p.zone_low as number | string);
  const zoneHigh = resolveLevel(ctx, p.zone_high as number | string);
  if (zoneLow === null || zoneHigh === null) return { armed: false, evidence: { reason: "unresolved_zone" } };
  const floorToken = (p.floor as number | string) ?? "vwap";
  const floorSeries = typeof floorToken === "string" && !Number.isFinite(Number(floorToken))
    ? (floorToken === "vwap" ? rollingVwap(ctx.session) : ctx.session.map(() => resolveLevel(ctx, floorToken) ?? Infinity))
    : ctx.session.map(() => Number(floorToken));
  const inZone = ctx.session.some((b) => b.l <= zoneHigh && b.h >= zoneLow);
  const count = trailingHoldCount(ctx.session, floorSeries);
  return {
    armed: inZone && count >= holdMinutes,
    evidence: { in_zone: inZone, hold_count: count, hold_minutes: holdMinutes, zone_low: zoneLow, zone_high: zoneHigh, floor: String(floorToken) },
  };
};

const doubleBottom: TriggerFn = (ctx, p) => {
  const tolerancePct = Number(p.tolerance_pct ?? 1.0);
  const minApart = Number(p.min_minutes_apart ?? 20);
  const lows = swingLows(ctx.session);
  if (lows.length < 2) return { armed: false, evidence: { swing_lows: lows.length } };
  const second = lows[lows.length - 1];
  const first = lows[lows.length - 2];
  const gapBars = second.i - first.i;
  const diffPct = (Math.abs(second.price - first.price) / Math.min(second.price, first.price)) * 100;
  const last = ctx.session[ctx.session.length - 1];
  const stillValid = last.l > second.price * 0.995; // second low not materially broken
  const armed = diffPct <= tolerancePct && gapBars >= minApart && stillValid;
  return {
    armed,
    evidence: { first_low: first.price, second_low: second.price, diff_pct: +diffPct.toFixed(2), minutes_apart: gapBars, still_valid: stillValid },
  };
};

const breakout: TriggerFn = (ctx, p) => {
  const level = resolveLevel(ctx, (p.level as number | string) ?? "session_high");
  const chaseLimitPct = Number(p.chase_limit_pct ?? 3.0);
  if (level === null || ctx.session.length === 0) return { armed: false, evidence: { reason: "unresolved_level" } };
  const last = ctx.session[ctx.session.length - 1].c;
  const chasePct = ((last - level) / level) * 100;
  const armed = last > level && chasePct <= chaseLimitPct;
  return { armed, evidence: { level, last, chase_pct: +chasePct.toFixed(2), chase_limit_pct: chaseLimitPct } };
};

const volumeClimax: TriggerFn = (ctx, p) => {
  const mult = Number(p.multiple_of_avg ?? 3.0);
  const lookback = Math.min(20, ctx.session.length - 1);
  if (lookback < 5) return { armed: false, evidence: { reason: "insufficient_bars" } };
  const last = ctx.session[ctx.session.length - 1];
  const avg = ctx.session.slice(-1 - lookback, -1).reduce((a, b) => a + b.v, 0) / lookback;
  const ratio = avg > 0 ? last.v / avg : 0;
  const followThrough = last.c >= last.o; // climax bar closes green
  const armed = ratio >= mult && followThrough;
  return { armed, evidence: { volume_ratio: +ratio.toFixed(2), multiple_required: mult, follow_through: followThrough } };
};

const rsiDivergence: TriggerFn = (ctx, p) => {
  const rsiMax = Number(p.rsi_max ?? 35);
  const lows = swingLows(ctx.session);
  if (lows.length < 2) return { armed: false, evidence: { swing_lows: lows.length } };
  const second = lows[lows.length - 1];
  const first = lows[lows.length - 2];
  const rsiAt = (idx: number) => rsi(ctx.session.slice(0, idx + 1).map((b) => b.c), 14);
  const rsiFirst = rsiAt(first.i);
  const rsiSecond = rsiAt(second.i);
  const rsiNow = rsi(ctx.session.map((b) => b.c), 14);
  if (rsiFirst === null || rsiSecond === null || rsiNow === null) {
    return { armed: false, evidence: { reason: "insufficient_bars_for_rsi" } };
  }
  const lowerPriceLow = second.price < first.price;
  const higherRsiLow = rsiSecond > rsiFirst;
  const armed = lowerPriceLow && higherRsiLow && rsiNow < rsiMax;
  return {
    armed,
    evidence: { price_lows: `${first.price}→${second.price}`, rsi_lows: `${rsiFirst}→${rsiSecond}`, rsi_now: rsiNow, rsi_max: rsiMax },
  };
};

const relativeStrength: TriggerFn = (ctx, p) => {
  const window = Number(p.window_minutes ?? 30);
  const bench = ctx.benchmarkSession;
  if (!bench || ctx.session.length < window || bench.length < window) {
    return { armed: false, evidence: { reason: "missing_benchmark_or_bars" } };
  }
  const symRet = (ctx.session[ctx.session.length - 1].c / ctx.session[ctx.session.length - window].c - 1) * 100;
  const benchRet = (bench[bench.length - 1].c / bench[bench.length - window].c - 1) * 100;
  const rs = symRet - benchRet;
  return { armed: rs > 0, evidence: { symbol_return_pct: +symRet.toFixed(2), benchmark_return_pct: +benchRet.toFixed(2), rs_delta: +rs.toFixed(2), window_minutes: window } };
};

const priorDayHighReclaim: TriggerFn = (ctx) => {
  const pdh = ctx.priorDay?.high;
  if (!pdh || ctx.session.length === 0) return { armed: false, evidence: { reason: "no_prior_day" } };
  const last = ctx.session[ctx.session.length - 1].c;
  const wasBelow = ctx.session.some((b) => b.c < pdh);
  return { armed: wasBelow && last > pdh, evidence: { prior_day_high: pdh, last, was_below: wasBelow } };
};

const gapFill: TriggerFn = (ctx) => {
  const pdc = ctx.priorDay?.close;
  const open = ctx.session[0]?.o;
  if (!pdc || !open || ctx.session.length === 0) return { armed: false, evidence: { reason: "no_prior_day" } };
  const gappedDown = open < pdc;
  const last = ctx.session[ctx.session.length - 1].c;
  return { armed: gappedDown && last >= pdc, evidence: { prior_close: pdc, open, last, filled: last >= pdc } };
};

/**
 * OPENING RANGE BREAKOUT (REQ-001) — opening range = high/low of the first
 * `range_minutes` RTH bars. Arms when the latest close is above the range
 * high with relative-volume evidence and price within the chase limit.
 * Deterministic: same bars → same range → same decision, live or backtest.
 */
const orbBreakout: TriggerFn = (ctx, p) => {
  const rangeMinutes = Number(p.range_minutes ?? 15);
  const rvolMin = Number(p.rvol_min ?? 1.5);
  const chaseLimitPct = Number(p.chase_limit_pct ?? 3.0);
  if (ctx.session.length < rangeMinutes + 1) {
    return { armed: false, evidence: { reason: "opening_range_forming", have: ctx.session.length, need: rangeMinutes + 1 } };
  }
  const range = ctx.session.slice(0, rangeMinutes);
  const orh = Math.max(...range.map((b) => b.h));
  const orl = Math.min(...range.map((b) => b.l));
  const last = ctx.session[ctx.session.length - 1].c;
  // Relative volume: range-window volume per bar vs the session average per bar
  const rangeVolPerBar = range.reduce((a, b) => a + b.v, 0) / rangeMinutes;
  const sessionVolPerBar = ctx.session.reduce((a, b) => a + b.v, 0) / ctx.session.length;
  const rvol = sessionVolPerBar > 0 ? rangeVolPerBar / sessionVolPerBar : 0;
  const chasePct = orh > 0 ? ((last - orh) / orh) * 100 : Infinity;
  const armed = last > orh && rvol >= rvolMin && chasePct <= chaseLimitPct;
  return {
    armed,
    evidence: { opening_range_high: orh, opening_range_low: orl, last, rvol: +rvol.toFixed(2), rvol_min: rvolMin, chase_pct: +chasePct.toFixed(2), chase_limit_pct: chaseLimitPct, range_minutes: rangeMinutes },
  };
};

/* ---------- registry ---------- */

export const TRIGGERS: Record<string, { description: string; defaults: TriggerParams; evaluate: TriggerFn }> = {
  vwap_reclaim: { description: "Price reclaims VWAP and holds above it for N consecutive 1-min closes (resets on any close back below).", defaults: { hold_minutes: 30 }, evaluate: vwapReclaim },
  pullback_hold: { description: "Price pulls back into a defined zone and holds the floor for N consecutive closes (full reset on floor break).", defaults: { zone_low: "vwap", zone_high: "session_high", floor: "vwap", hold_minutes: 10 }, evaluate: pullbackHold },
  double_bottom: { description: "Two swing lows within tolerance % and at least N minutes apart; second low still intact.", defaults: { tolerance_pct: 1.0, min_minutes_apart: 20 }, evaluate: doubleBottom },
  breakout: { description: "Close above a level with price no more than chase-limit % past it.", defaults: { level: "session_high", chase_limit_pct: 3.0 }, evaluate: breakout },
  volume_climax: { description: "Last bar volume ≥ N× the 20-bar average, with green follow-through close.", defaults: { multiple_of_avg: 3.0 }, evaluate: volumeClimax },
  rsi_divergence: { description: "Lower price swing low but higher RSI low, with RSI now below the cap.", defaults: { rsi_max: 35 }, evaluate: rsiDivergence },
  relative_strength: { description: "Symbol outperforming its benchmark over the trailing window.", defaults: { window_minutes: 30 }, evaluate: relativeStrength },
  prior_day_high_reclaim: { description: "Close back above prior day high after trading below it this session.", defaults: {}, evaluate: priorDayHighReclaim },
  gap_fill: { description: "Down-gap fully filled back to prior close.", defaults: {}, evaluate: gapFill },
  orb_breakout: { description: "REQ-001: close above the opening-range high (first N RTH minutes) with rvol >= threshold and within chase limit.", defaults: { range_minutes: 15, rvol_min: 1.5, chase_limit_pct: 3.0 }, evaluate: orbBreakout },
};

export function runTrigger(name: string, ctx: TriggerContext, params: TriggerParams = {}): TriggerResult {
  const trig = TRIGGERS[name];
  if (!trig) return { armed: false, evidence: { reason: `unknown_trigger:${name}` } };
  return trig.evaluate(ctx, { ...trig.defaults, ...params });
}
