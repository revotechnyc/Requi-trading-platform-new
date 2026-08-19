import type { Bar } from "../marketdata/indicators";
import type { StrategyConfig } from "./config";
import { runBacktest } from "./backtest";

/**
 * WHAT-IF SIMULATOR — module 4.
 *
 * Before going live on a candidate, every entry variant is simulated
 * against the available 1-minute history (same config, same machine, same
 * fill model — the backtester restricted to one variant at a time).
 * Variants are ranked by expectancy; negative-expectancy variants are
 * dropped. The resulting ranking IS the fallback ladder the live monitor
 * uses.
 */

export interface VariantSimResult {
  variantId: string;
  triggerType: string;
  trades: number;
  winRate: number | null;
  expectancyR: number | null;
  profitFactor: number | null;
  maxDrawdownR: number;
  totalPnl: number;
  kept: boolean;
  dropReason: string | null;
}

export interface SimulationReport {
  strategyId: string;
  symbol: string;
  sampleDays: number;
  variants: VariantSimResult[];
  rankedLadder: string[]; // variant ids in priority order after simulation
  recommendation: string;
}

export function simulateVariants(input: {
  config: StrategyConfig;
  symbol: string;
  bars: Bar[];
  minTrades?: number;
}): SimulationReport {
  const minTrades = input.minTrades ?? 2;
  const variants: VariantSimResult[] = input.config.entry_variants.map((v) => {
    const report = runBacktest({ config: input.config, symbol: input.symbol, bars: input.bars, variantOnly: v.id });
    const insufficient = report.totalTrades < minTrades;
    const negative = report.expectancyR !== null && report.expectancyR < 0;
    const kept = !insufficient && !negative;
    return {
      variantId: v.id,
      triggerType: v.trigger_type,
      trades: report.totalTrades,
      winRate: report.winRate,
      expectancyR: report.expectancyR,
      profitFactor: report.profitFactor,
      maxDrawdownR: report.maxDrawdownR,
      totalPnl: report.totalPnl,
      kept,
      dropReason: insufficient
        ? `insufficient sample (${report.totalTrades} trades < ${minTrades})`
        : negative
          ? `negative expectancy (${report.expectancyR}R)`
          : null,
    };
  });

  const kept = variants.filter((v) => v.kept).sort((a, b) => (b.expectancyR ?? -Infinity) - (a.expectancyR ?? -Infinity));
  const rankedLadder = [...kept.map((v) => v.variantId), ...variants.filter((v) => !v.kept).map((v) => v.variantId)];

  const best = kept[0];
  const recommendation = best
    ? `Lead with variant ${best.variantId} (${best.triggerType}) — expectancy ${best.expectancyR}R over ${best.trades} simulated trades. ${variants.length - kept.length} variant(s) dropped.`
    : "No variant survived simulation — stand down on this candidate. Missing the trade is a valid outcome.";

  return {
    strategyId: input.config.strategy_id,
    symbol: input.symbol,
    sampleDays: 0,
    variants,
    rankedLadder,
    recommendation,
  };
}
