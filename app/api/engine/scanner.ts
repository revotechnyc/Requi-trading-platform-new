import type { SymbolFeed } from "../marketdata/service";
import { computeIndicators } from "../marketdata/indicators";
import { BUILTIN_CONFIGS } from "./config";

/**
 * SCANNER HOOK — module 5.
 *
 * Scans the tracked watchlist feeds and emits candidates with metadata:
 * gap %, relative volume, position vs VWAP, and the best-fit strategy
 * config selected by simple, auditable rules:
 *   - down-gap below VWAP        → bottom-fish reversal config
 *   - up-gap / strength > VWAP   → continuation config
 *   - everything else liquid     → general intraday momentum
 *
 * A broad 500–2,000 symbol universe scan requires a market-wide data
 * source; this hook scans whatever the data service tracks (module 0)
 * and plugs into the same loop: SCAN → SIMULATE → RANK → MONITOR.
 */

export interface Candidate {
  symbol: string;
  last: number | null;
  gapPct: number | null;
  relativeVolume: number | null;
  vsVwapPct: number | null;
  rsi14: number | null;
  suggestedConfig: string;
  suggestedLabel: string;
  reason: string;
  confidence: number;
  reasons: string[];
}

const MIN_RVOL = 1.5;
const MIN_GAP_PCT = 2.0;

/**
 * STRATEGY SELF-IDENTIFICATION.
 *
 * Classifies a symbol's current tape into the best-fit strategy config,
 * with a confidence score and an auditable reason list. Used by the
 * scanner, by monitorStart("AUTO"), and exposed to Intelligence — the
 * system names its own strategy and can explain why.
 */
export interface StrategyIdentification {
  strategyId: string;
  label: string;
  confidence: number; // 0–100
  reasons: string[];
}

export function identifyStrategy(f: {
  gapPct: number | null;
  vsVwapPct: number | null;
  rsi14: number | null;
  relativeVolume: number | null;
}): StrategyIdentification {
  const reasons: string[] = [];
  let strategyId = "general_intraday_momentum";
  let confidence = 40;

  const gap = f.gapPct;
  const vsVwap = f.vsVwapPct;
  const rsi = f.rsi14;
  const rvol = f.relativeVolume;

  if (gap !== null && gap <= -MIN_GAP_PCT && (vsVwap ?? 0) < 0) {
    strategyId = "bottom_fish_reversal";
    confidence = 55;
    reasons.push(`down-gap ${gap}% and trading below VWAP — capitulation profile`);
    if (rsi !== null && rsi < 35) { confidence += 20; reasons.push(`RSI ${rsi} oversold — reversal setup strengthens`); }
    if (rvol !== null && rvol >= MIN_RVOL) { confidence += 10; reasons.push(`relative volume ${rvol}x — capitulation volume confirms interest`); }
    if (rsi !== null && rsi > 50) { confidence -= 15; reasons.push(`RSI ${rsi} not oversold — reversal evidence weakens`); }
  } else if ((gap !== null && gap >= MIN_GAP_PCT) || ((vsVwap ?? 0) > 0 && (rvol ?? 0) >= MIN_RVOL)) {
    strategyId = "post_earnings_continuation";
    confidence = 55;
    if (gap !== null && gap >= MIN_GAP_PCT) reasons.push(`up-gap ${gap}% — event-strength profile`);
    if ((vsVwap ?? 0) > 0) reasons.push(`holding ${vsVwap}% above VWAP — buyers in control`);
    if (rsi !== null && rsi >= 55 && rsi <= 70) { confidence += 15; reasons.push(`RSI ${rsi} in the momentum band — trend room without exhaustion`); }
    if (rvol !== null && rvol >= 2) { confidence += 15; reasons.push(`relative volume ${rvol}x — institutional-size interest`); }
    if (rsi !== null && rsi > 75) { confidence -= 20; reasons.push(`RSI ${rsi} overbought — chase risk, confidence reduced`); }
  } else {
    reasons.push("liquid mover without a clear gap/reversal signature — default momentum config");
    if ((vsVwap ?? 0) > 0) { confidence += 10; reasons.push("above VWAP — mild bullish tilt"); }
    if (rsi !== null && rsi < 30) { confidence += 10; reasons.push(`RSI ${rsi} deeply oversold — watch for reversal upgrade`); }
  }

  const cfg = BUILTIN_CONFIGS.find((c) => c.strategy_id === strategyId);
  return {
    strategyId,
    label: cfg?.label ?? strategyId,
    confidence: Math.max(5, Math.min(95, confidence)),
    reasons,
  };
}

export function scanFeeds(feeds: SymbolFeed[]): Candidate[] {
  const out: Candidate[] = [];
  for (const f of feeds) {
    if (!f.indicators || f.bars.length < 30) continue;
    const ind = f.indicators;
    const gapPct = ind.priorDay && ind.priorDay.close > 0 && f.bars.length > 0
      ? +(((f.bars[0].o - ind.priorDay.close) / ind.priorDay.close) * 100).toFixed(2)
      : null;

    // RVOL: today's volume so far vs prior-day volume over the same bar count
    const todayVol = f.bars.slice(-ind.barCount).reduce((a, b) => a + b.v, 0);
    const prior = computeIndicators(f.symbol, f.bars.slice(0, Math.max(f.bars.length - ind.barCount, 0)));
    const priorVolSameWindow = prior.barCount > 0
      ? f.bars.slice(0, f.bars.length - ind.barCount).slice(-Math.min(ind.barCount, prior.barCount)).reduce((a, b) => a + b.v, 0)
      : 0;
    const relativeVolume = priorVolSameWindow > 0 ? +(todayVol / priorVolSameWindow).toFixed(2) : null;

    const vsVwapPct = ind.vwap && ind.last ? +(((ind.last - ind.vwap) / ind.vwap) * 100).toFixed(2) : null;

    const isGap = gapPct !== null && Math.abs(gapPct) >= MIN_GAP_PCT;
    const isHot = relativeVolume !== null && relativeVolume >= MIN_RVOL;
    if (!isGap && !isHot) continue;

    const id = identifyStrategy({ gapPct, vsVwapPct, rsi14: ind.rsi14, relativeVolume });
    out.push({
      symbol: f.symbol,
      last: ind.last,
      gapPct,
      relativeVolume,
      vsVwapPct,
      rsi14: ind.rsi14,
      suggestedConfig: id.strategyId,
      suggestedLabel: id.label,
      reason: id.reasons[0] ?? "candidate",
      confidence: id.confidence,
      reasons: id.reasons,
    });
  }
  return out.sort((a, b) => (b.relativeVolume ?? 0) - (a.relativeVolume ?? 0));
}
