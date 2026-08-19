/**
 * REQUI INDICATOR ENGINE — primitives.
 *
 * Pure, deterministic, point-in-time safe: every function derives its value
 * from the tail of the supplied series only — no future data is ever read.
 * These are the ONLY implementations of indicator mathematics in the codebase;
 * the gateway, the strategy engine, backtests and Intelligence all consume
 * them through the IndicatorRegistry (./registry.ts). The AI never calculates.
 *
 * Conventions: series are ascending; functions return null when the lookback
 * is insufficient rather than fabricating a value.
 */

export function sma(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/** Full EMA series (seeded with the SMA of the first `period` values). */
export function emaSeries(values: number[], period: number): number[] {
  if (period <= 0 || values.length < period) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function ema(values: number[], period: number): number | null {
  const s = emaSeries(values, period);
  return s.length ? s[s.length - 1] : null;
}

/** Wilder's RSI on closes. */
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
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export interface BarLike {
  h: number;
  l: number;
  c: number;
  v: number;
}

/** Average True Range (Wilder). */
export function atr(bars: BarLike[], period = 14): number | null {
  if (bars.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].h;
    const l = bars[i].l;
    const pc = bars[i - 1].c;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  if (trs.length < period) return null;
  let prev = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) prev = (prev * (period - 1) + trs[i]) / period;
  return prev;
}

export function stdev(values: number[]): number | null {
  if (values.length === 0) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}

/** Bollinger Bands (SMA mid, ± k·σ, population stdev). */
export function bollinger(closes: number[], period = 20, k = 2): { upper: number; middle: number; lower: number } | null {
  const middle = sma(closes, period);
  const slice = closes.slice(-period);
  const sd = slice.length >= period ? stdev(slice) : null;
  if (middle === null || sd === null) return null;
  return { upper: middle + k * sd, middle, lower: middle - k * sd };
}

/** MACD line / signal / histogram from closes (12/26/9 EMAs). */
export function macd(closes: number[], fast = 12, slow = 26, signal = 9): { macd: number; signal: number | null; histogram: number | null } | null {
  const ef = emaSeries(closes, fast);
  const es = emaSeries(closes, slow);
  if (!ef.length || !es.length) return null;
  const offset = ef.length - es.length;
  const line = es.map((v, i) => ef[i + offset] - v);
  const macdValue = line[line.length - 1];
  const sig = emaSeries(line, signal);
  const signalValue = sig.length ? sig[sig.length - 1] : null;
  return { macd: macdValue, signal: signalValue, histogram: signalValue !== null ? macdValue - signalValue : null };
}

/** Session VWAP from intraday bars (typical price × volume). */
export function vwap(bars: BarLike[]): number | null {
  if (bars.length === 0) return null;
  let pv = 0;
  let vol = 0;
  for (const b of bars) {
    pv += ((b.h + b.l + b.c) / 3) * b.v;
    vol += b.v;
  }
  return vol > 0 ? pv / vol : null;
}
