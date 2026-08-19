/**
 * INDICATOR ENGINE — pure functions over 1-minute OHLCV bars.
 *
 * Everything the strategy engine needs per symbol per session:
 *   - session VWAP (resets daily — computed only over today's RTH bars)
 *   - RSI(14) on 1-minute closes (Wilder smoothing)
 *   - prior day high / low / close
 *   - session high / low
 *
 * Bars are filtered to US regular trading hours (09:30–16:00 America/New_York)
 * and grouped by ET calendar day. No external dependencies — the same module
 * is reused by the live feed, the backtester, and the what-if simulator so
 * all three modes compute identical values.
 */

export interface Bar {
  /** epoch ms */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface DayLevels {
  high: number;
  low: number;
  close: number;
}

export interface Indicators {
  symbol: string;
  asOf: number;
  barCount: number;
  last: number | null;
  vwap: number | null;
  rsi14: number | null;
  sessionHigh: number | null;
  sessionLow: number | null;
  priorDay: DayLevels | null;
  sessionDate: string | null;
}

const ET_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** ET calendar day (YYYY-MM-DD) and minutes-since-midnight for a timestamp. */
export function etParts(t: number): { day: string; minutes: number } {
  const parts = ET_FORMATTER.formatToParts(t);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** Regular trading hours: bars starting 09:30 through 15:59 ET. */
const RTH_START = 9 * 60 + 30;
const RTH_END = 16 * 60;

/** Keep only regular-hours bars, grouped by ET session day, ascending. */
export function groupRthSessions(bars: Bar[]): Map<string, Bar[]> {
  const sessions = new Map<string, Bar[]>();
  for (const b of [...bars].sort((a, z) => a.t - z.t)) {
    const { day, minutes } = etParts(b.t);
    if (minutes < RTH_START || minutes >= RTH_END) continue;
    const list = sessions.get(day);
    if (list) list.push(b);
    else sessions.set(day, [b]);
  }
  return sessions;
}

/** Session VWAP: Σ(typical × vol) / Σvol, typical = (H+L+C)/3. Resets per session by construction. */
export function sessionVwap(bars: Bar[]): number | null {
  let pv = 0;
  let vol = 0;
  for (const b of bars) {
    const typical = (b.h + b.l + b.c) / 3;
    pv += typical * b.v;
    vol += b.v;
  }
  if (vol <= 0) return null;
  return +(pv / vol).toFixed(4);
}

/** Wilder's RSI on closes. Needs at least period+1 closes. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(2);
}

export function highLow(bars: Bar[]): { high: number; low: number } | null {
  if (bars.length === 0) return null;
  let high = -Infinity;
  let low = Infinity;
  for (const b of bars) {
    if (b.h > high) high = b.h;
    if (b.l < low) low = b.l;
  }
  return { high: +high.toFixed(4), low: +low.toFixed(4) };
}

/**
 * Compute the full indicator set for one symbol from its raw 1-min bars.
 * The most recent session day is "the session"; the day before it supplies
 * prior-day levels.
 */
export function computeIndicators(symbol: string, bars: Bar[]): Indicators {
  const sessions = groupRthSessions(bars);
  const days = [...sessions.keys()].sort();
  const today = days.length > 0 ? sessions.get(days[days.length - 1])! : [];
  const prior = days.length > 1 ? sessions.get(days[days.length - 2])! : [];

  const hl = highLow(today);
  const priorHl = highLow(prior);
  const lastBar = today.length > 0 ? today[today.length - 1] : null;

  return {
    symbol,
    asOf: lastBar?.t ?? Date.now(),
    barCount: today.length,
    last: lastBar?.c ?? null,
    vwap: sessionVwap(today),
    rsi14: rsi(today.map((b) => b.c), 14),
    sessionHigh: hl?.high ?? null,
    sessionLow: hl?.low ?? null,
    priorDay: priorHl && prior.length > 0
      ? { high: priorHl.high, low: priorHl.low, close: prior[prior.length - 1].c }
      : null,
    sessionDate: days.length > 0 ? days[days.length - 1] : null,
  };
}
