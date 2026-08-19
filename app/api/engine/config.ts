import { loadActivePackage } from "../governance/runtime";
import type { TriggerParams } from "./triggers";

/**
 * STRATEGY CONFIG SYSTEM — the "library" (config-driven design).
 *
 * A strategy is DATA, not code: entry variants, stop rule, targets, hold
 * timer, sizing limits, schedule blocks. Adding a strategy = adding a
 * config. The engine (state machine, backtester, simulator, live monitor)
 * runs any config on any symbol the scanner feeds it.
 *
 * GOVERNANCE CLAMPING: every config is validated against the signed
 * governance package at load. Values that exceed constitutional ceilings
 * (e.g. risk limits from the compiled package) are CLAMPED DOWN and the
 * clamp is recorded — configs can tighten the constitution, never loosen
 * it.
 */

export interface EntryVariant {
  id: string;
  priority: number;
  trigger_type: string;
  params: TriggerParams;
  /** extra signal-stack requirement: at least N of `signals` armed */
  min_signals_armed: number;
  signals: string[];
  chase_limit_pct: number;
  /** BUY_STOP offset above the trigger price, in dollars */
  entry_offset: number;
}

export interface StrategyConfig {
  strategy_id: string;
  version: string;
  label: string;
  entry_variants: EntryVariant[];
  stop: { type: "vwap" | "swing_low" | "atr"; offset_atr?: number; offset_pct?: number };
  targets: Array<{ r_multiple: number; sell_fraction: number }>;
  hold_timer: { minutes: number; floor: "vwap" | number };
  sizing: { max_risk_pct: number; max_position_pct: number };
  schedule: { no_entries_after: string; flatten_by: string };
}

export interface ClampNote {
  field: string;
  requested: number;
  applied: number;
  reason: string;
}

export interface LoadedConfig {
  config: StrategyConfig;
  clamps: ClampNote[];
  governanceVersion: string;
}

/* ---------- built-in generic configs (no tickers, no hardcoded trades) ---------- */

export const BUILTIN_CONFIGS: StrategyConfig[] = [
  {
    strategy_id: "post_earnings_continuation",
    version: "1.0.0",
    label: "Post-Earnings Continuation",
    entry_variants: [
      { id: "A", priority: 1, trigger_type: "vwap_reclaim", params: { hold_minutes: 10 }, min_signals_armed: 2, signals: ["volume_climax", "relative_strength"], chase_limit_pct: 3.0, entry_offset: 0.05 },
      { id: "B", priority: 2, trigger_type: "breakout", params: { level: "session_high", chase_limit_pct: 3.0 }, min_signals_armed: 1, signals: ["volume_climax"], chase_limit_pct: 3.0, entry_offset: 0.05 },
      { id: "C", priority: 3, trigger_type: "prior_day_high_reclaim", params: {}, min_signals_armed: 1, signals: ["relative_strength"], chase_limit_pct: 3.0, entry_offset: 0.05 },
    ],
    stop: { type: "vwap", offset_pct: 0.1 },
    targets: [
      { r_multiple: 1.5, sell_fraction: 0.5 },
      { r_multiple: 3.0, sell_fraction: 0.3 },
      { r_multiple: 4.5, sell_fraction: 0.2 },
    ],
    hold_timer: { minutes: 10, floor: "vwap" },
    sizing: { max_risk_pct: 0.5, max_position_pct: 25 },
    schedule: { no_entries_after: "15:30", flatten_by: "15:55" },
  },
  {
    strategy_id: "bottom_fish_reversal",
    version: "1.0.0",
    label: "Down-Gap Bottom-Fish Reversal",
    entry_variants: [
      { id: "A", priority: 1, trigger_type: "double_bottom", params: { tolerance_pct: 1.0, min_minutes_apart: 20 }, min_signals_armed: 1, signals: ["rsi_divergence"], chase_limit_pct: 3.0, entry_offset: 0.05 },
      { id: "B", priority: 2, trigger_type: "vwap_reclaim", params: { hold_minutes: 30 }, min_signals_armed: 1, signals: ["volume_climax"], chase_limit_pct: 3.0, entry_offset: 0.05 },
      { id: "C", priority: 3, trigger_type: "gap_fill", params: {}, min_signals_armed: 1, signals: ["rsi_divergence"], chase_limit_pct: 3.0, entry_offset: 0.05 },
    ],
    stop: { type: "swing_low", offset_atr: 0.5 },
    targets: [
      { r_multiple: 1.5, sell_fraction: 0.5 },
      { r_multiple: 3.0, sell_fraction: 0.5 },
    ],
    hold_timer: { minutes: 10, floor: "vwap" },
    sizing: { max_risk_pct: 0.5, max_position_pct: 25 },
    schedule: { no_entries_after: "15:30", flatten_by: "15:55" },
  },
  {
    strategy_id: "general_intraday_momentum",
    version: "1.0.0",
    label: "General Intraday Momentum",
    entry_variants: [
      { id: "A", priority: 1, trigger_type: "pullback_hold", params: { zone_low: "vwap", zone_high: "session_high", floor: "vwap", hold_minutes: 10 }, min_signals_armed: 2, signals: ["relative_strength", "volume_climax"], chase_limit_pct: 3.0, entry_offset: 0.05 },
      { id: "B", priority: 2, trigger_type: "breakout", params: { level: "prior_day_high", chase_limit_pct: 3.0 }, min_signals_armed: 1, signals: ["volume_climax"], chase_limit_pct: 3.0, entry_offset: 0.05 },
    ],
    stop: { type: "atr", offset_atr: 1.0 },
    targets: [
      { r_multiple: 1.0, sell_fraction: 0.5 },
      { r_multiple: 2.0, sell_fraction: 0.5 },
    ],
    hold_timer: { minutes: 10, floor: "vwap" },
    sizing: { max_risk_pct: 0.5, max_position_pct: 25 },
    schedule: { no_entries_after: "15:30", flatten_by: "15:55" },
  },
  /* ---------- Strategy Specification v1.0 executable mappings ---------- */
  {
    strategy_id: "req_001_orb_long",
    version: "1.0.0",
    label: "REQ-001 Opening Range Breakout Long",
    entry_variants: [
      { id: "A", priority: 1, trigger_type: "orb_breakout", params: { range_minutes: 15, rvol_min: 1.5, chase_limit_pct: 3.0 }, min_signals_armed: 1, signals: ["volume_climax"], chase_limit_pct: 3.0, entry_offset: 0.05 },
      { id: "B", priority: 2, trigger_type: "breakout", params: { level: "session_high", chase_limit_pct: 3.0 }, min_signals_armed: 1, signals: ["volume_climax"], chase_limit_pct: 3.0, entry_offset: 0.05 },
    ],
    stop: { type: "swing_low", offset_atr: 0.5 }, // MIN(ORL, structure, ATR) — conservative structure stop
    targets: [
      { r_multiple: 1.5, sell_fraction: 0.5 }, // spec: T1 = +1.5R
      { r_multiple: 2.5, sell_fraction: 0.5 }, // spec: T2 = +2.5R
    ],
    hold_timer: { minutes: 10, floor: "vwap" },
    sizing: { max_risk_pct: 0.5, max_position_pct: 25 },
    schedule: { no_entries_after: "15:30", flatten_by: "15:55" },
  },
  {
    strategy_id: "req_003_vwap_reclaim",
    version: "1.0.0",
    label: "REQ-003 VWAP Reclaim Long",
    entry_variants: [
      { id: "A", priority: 1, trigger_type: "vwap_reclaim", params: { hold_minutes: 10 }, min_signals_armed: 1, signals: ["volume_climax"], chase_limit_pct: 3.0, entry_offset: 0.05 },
      { id: "B", priority: 2, trigger_type: "pullback_hold", params: { zone_low: "vwap", zone_high: "session_high", floor: "vwap", hold_minutes: 10 }, min_signals_armed: 1, signals: ["relative_strength"], chase_limit_pct: 3.0, entry_offset: 0.05 },
    ],
    stop: { type: "swing_low", offset_atr: 0.5 }, // below reclaim swing low
    targets: [
      { r_multiple: 1.5, sell_fraction: 0.5 },
      { r_multiple: 2.5, sell_fraction: 0.5 },
    ],
    hold_timer: { minutes: 10, floor: "vwap" },
    sizing: { max_risk_pct: 0.5, max_position_pct: 25 },
    schedule: { no_entries_after: "15:30", flatten_by: "15:55" },
  },
];

export function getConfig(strategyId: string): StrategyConfig | undefined {
  return BUILTIN_CONFIGS.find((c) => c.strategy_id === strategyId);
}

/* ---------- governance clamping ---------- */

function packageValue(artifact: Record<string, Record<string, { value: unknown }>>, fullKey: string): unknown {
  for (const pack of Object.values(artifact)) {
    if (pack[fullKey]) return pack[fullKey].value;
  }
  return undefined;
}

/**
 * Validate + clamp a config against the signed governance package.
 * Never throws for over-risk — clamps down and records. Throws only if
 * governance itself is unavailable (the constitution is load-bearing).
 */
export async function loadConfig(strategyId: string): Promise<LoadedConfig> {
  const found = getConfig(strategyId);
  if (!found) throw new Error(`Unknown strategy config "${strategyId}"`);
  const config: StrategyConfig = JSON.parse(JSON.stringify(found)) as StrategyConfig;
  const clamps: ClampNote[] = [];

  const pkg = await loadActivePackage(); // throws GOVERNANCE_UNAVAILABLE if none — by design
  const rawLimits = packageValue(pkg.artifact, "sizing.riskLimitsPct");
  let ceiling = 0.5;
  if (rawLimits && typeof rawLimits === "object") {
    const initial = (rawLimits as { initial?: string }).initial;
    const parsed = initial ? Number(initial.replace("%", "")) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) ceiling = parsed;
  }
  if (config.sizing.max_risk_pct > ceiling) {
    clamps.push({
      field: "sizing.max_risk_pct",
      requested: config.sizing.max_risk_pct,
      applied: ceiling,
      reason: `clamped to constitutional ceiling ${ceiling}% (signed package ${pkg.version})`,
    });
    config.sizing.max_risk_pct = ceiling;
  }

  // Rescan cadence ceiling: hold timer may not exceed the intraday rescan ceiling.
  const cadence = packageValue(pkg.artifact, "rescan.cadence.intradayMinutes");
  const cadenceCeiling = Array.isArray(cadence) ? Math.max(...(cadence as number[])) : typeof cadence === "number" ? cadence : null;
  if (cadenceCeiling !== null && config.hold_timer.minutes > cadenceCeiling * 3) {
    clamps.push({
      field: "hold_timer.minutes",
      requested: config.hold_timer.minutes,
      applied: cadenceCeiling * 3,
      reason: `clamped to 3× intraday rescan ceiling (${cadenceCeiling} min)`,
    });
    config.hold_timer.minutes = cadenceCeiling * 3;
  }

  return { config, clamps, governanceVersion: pkg.version };
}
