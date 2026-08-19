import type { OhlcvBar } from "./types";
import { registry } from "../../indicators/registry";

/**
 * Gateway indicator composition (spec §13) — the full per-symbol indicator
 * bundle. ALL mathematics live in the Indicator Registry
 * (api/indicators/registry.ts + primitives.ts); this module only composes
 * registered indicators over normalized daily + intraday bars. No indicator
 * math may be duplicated here or anywhere else.
 */

export interface GatewayIndicators {
  sma_5: number | null;
  sma_10: number | null;
  sma_20: number | null;
  sma_50: number | null;
  sma_100: number | null;
  sma_200: number | null;
  ema_9: number | null;
  ema_12: number | null;
  ema_21: number | null;
  ema_26: number | null;
  ema_50: number | null;
  ema_200: number | null;
  rsi_14: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_histogram: number | null;
  vwap: number | null;
  bollinger_upper: number | null;
  bollinger_middle: number | null;
  bollinger_lower: number | null;
  atr_14: number | null;
  volume: number | null;
  average_volume: number | null;
  relative_volume: number | null;
  daily_change: number | null;
  daily_change_pct: number | null;
  week_52_high: number | null;
  week_52_low: number | null;
}

const round = (n: number | null, dp = 4) => (n === null || !Number.isFinite(n) ? null : +n.toFixed(dp));

/** Registered indicator ids that compose the bundle, with output rounding. */
const BUNDLE: { key: keyof GatewayIndicators; dp: number }[] = [
  { key: "sma_5", dp: 4 }, { key: "sma_10", dp: 4 }, { key: "sma_20", dp: 4 },
  { key: "sma_50", dp: 4 }, { key: "sma_100", dp: 4 }, { key: "sma_200", dp: 4 },
  { key: "ema_9", dp: 4 }, { key: "ema_12", dp: 4 }, { key: "ema_21", dp: 4 },
  { key: "ema_26", dp: 4 }, { key: "ema_50", dp: 4 }, { key: "ema_200", dp: 4 },
  { key: "rsi_14", dp: 2 }, { key: "macd", dp: 4 }, { key: "macd_signal", dp: 4 }, { key: "macd_histogram", dp: 4 },
  { key: "vwap", dp: 4 },
  { key: "bollinger_upper", dp: 4 }, { key: "bollinger_middle", dp: 4 }, { key: "bollinger_lower", dp: 4 },
  { key: "atr_14", dp: 4 }, { key: "average_volume", dp: 0 },
  { key: "week_52_high", dp: 2 }, { key: "week_52_low", dp: 2 },
];

/**
 * Compute the full indicator set via the registry.
 * @param daily  daily OHLCV bars ascending (≈1y)
 * @param intraday  today's intraday bars ascending (for VWAP / relative volume)
 * @param previousClose  prior daily close (fallback: second-to-last daily bar)
 */
export function computeGatewayIndicators(daily: OhlcvBar[], intraday: OhlcvBar[], previousClose?: number | null): GatewayIndicators {
  const out = {} as Record<keyof GatewayIndicators, number | null>;
  for (const { key, dp } of BUNDLE) {
    const def = registry.get(key);
    out[key] = round(def.calculate(daily, intraday, def.defaultParameters), dp);
  }

  // Derived fields (arithmetic over registry outputs / bar tails, not indicators).
  const closes = daily.map((b) => b.c);
  const vols = daily.map((b) => b.v);
  const last = closes.length ? closes[closes.length - 1] : null;
  const prevClose = previousClose ?? (closes.length > 1 ? closes[closes.length - 2] : null);
  const todayVol = intraday.reduce((a, b) => a + b.v, 0) || (vols.length ? vols[vols.length - 1] : null);
  const avgVol = out.average_volume;

  out.volume = todayVol ?? null;
  out.relative_volume = todayVol !== null && avgVol ? round(todayVol / avgVol, 2) : null;
  out.daily_change = last !== null && prevClose !== null ? round(last - prevClose, 2) : null;
  out.daily_change_pct = last !== null && prevClose !== null && prevClose > 0 ? round(((last - prevClose) / prevClose) * 100, 2) : null;

  return out as GatewayIndicators;
}
