import { desc, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { tradeOutcomes, type TradeOutcome } from "@db/schema";
import type { BacktestReport, BacktestTrade } from "./backtest";

/**
 * LEARNING LOOP — "learn from mistakes," implemented honestly.
 *
 * This is NOT neural-network training and it does not reweight any model.
 * It is a deterministic feedback layer that does three things:
 *
 *   1. RECORD — every completed trade (backtest today; paper/live as those
 *      paths produce closed outcomes) is logged with its full decision
 *      context: strategy, variant, entry/exit, R-multiple, exit reason.
 *   2. DIAGNOSE — outcomes are aggregated into per-variant performance and
 *      classified mistakes (stop-outs, stalls, flatten losses), plus a
 *      divergence flag when live results drift from backtest expectations
 *      — the exact "if live results diverge from backtest, flag it" rule
 *      from the engine build spec.
 *   3. FEED BACK — the distilled lessons are injected into the Intelligence
 *      snapshot (so the AI advises from OUR outcomes, not generic theory)
 *      and exposed to the simulator so variant ranking can see live stats.
 *
 * What this deliberately does NOT do: change sizing, loosen clamps, or
 * alter governance. Learning adjusts RANKING and ADVICE. Authority stays
 * exactly where the constitution put it.
 */

/* ---------- 1. RECORD ---------- */

function classifyLesson(t: BacktestTrade): string {
  const reason = t.exitReason.toLowerCase();
  if (t.r > 0) {
    if (reason.includes("target")) return "plan worked: target ladder paid";
    if (reason.includes("flatten")) return "held to close: modest gain, no target hit";
    return "winner: " + t.exitReason;
  }
  if (reason.includes("stop")) return "mistake candidate: stopped out — entry quality or stop placement";
  if (reason.includes("stall") || reason.includes("timer")) return "mistake candidate: stalled — trigger fired but no follow-through";
  if (reason.includes("flatten")) return "mistake candidate: faded into the close — late entry or weak trend";
  if (reason.includes("chase")) return "avoided: chase-cancel invalidated entry";
  return "loser: " + t.exitReason;
}

export async function recordBacktestOutcomes(
  userId: string,
  symbol: string,
  strategyId: string,
  report: BacktestReport
): Promise<{ recorded: number }> {
  const db = await getDb();
  if (!db || report.trades.length === 0) return { recorded: 0 };
  const rows = report.trades.map((t) => ({
    userId,
    symbol,
    strategyId,
    variantId: t.variantId,
    source: "BACKTEST" as const,
    entry: String(t.entry),
    exitPrice: String(t.avgExit),
    qty: t.qty,
    pnl: String(t.pnl.toFixed(2)),
    rMultiple: String(t.r.toFixed(3)),
    exitReason: t.exitReason,
    lesson: classifyLesson(t),
  }));
  try {
    await db.insert(tradeOutcomes).values(rows);
    return { recorded: rows.length };
  } catch {
    return { recorded: 0 }; // learning is additive — never fail a backtest over it
  }
}

/* ---------- 2. DIAGNOSE ---------- */

export interface VariantStats {
  strategyId: string;
  variantId: string | null;
  source: string;
  trades: number;
  wins: number;
  winRate: number | null;
  expectancyR: number | null;
  profitFactor: number | null;
  totalPnl: number;
}

export interface DivergenceFlag {
  strategyId: string;
  variantId: string | null;
  backtestExpectancyR: number;
  liveExpectancyR: number;
  liveTrades: number;
  message: string;
}

export interface LearningReport {
  totalOutcomes: number;
  byVariant: VariantStats[];
  divergences: DivergenceFlag[];
  mistakePatterns: { category: string; count: number; shareOfLosses: number }[];
  worstVariant: { strategyId: string; variantId: string | null; expectancyR: number; trades: number } | null;
  lessons: string[];
}

function aggregate(rows: TradeOutcome[]): VariantStats[] {
  const groups = new Map<string, TradeOutcome[]>();
  for (const r of rows) {
    const key = `${r.strategyId}|${r.variantId ?? "-"}|${r.source}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  const stats: VariantStats[] = [];
  for (const [key, arr] of groups) {
    const [strategyId, variantId, source] = key.split("|");
    const rs = arr.map((r) => Number(r.rMultiple ?? 0));
    const pnls = arr.map((r) => Number(r.pnl ?? 0));
    const wins = arr.filter((r) => Number(r.pnl ?? 0) > 0);
    const grossWin = wins.reduce((a, r) => a + Number(r.pnl ?? 0), 0);
    const grossLoss = Math.abs(arr.filter((r) => Number(r.pnl ?? 0) <= 0).reduce((a, r) => a + Number(r.pnl ?? 0), 0));
    stats.push({
      strategyId,
      variantId: variantId === "-" ? null : variantId,
      source,
      trades: arr.length,
      wins: wins.length,
      winRate: arr.length > 0 ? +((wins.length / arr.length) * 100).toFixed(1) : null,
      expectancyR: arr.length > 0 ? +(rs.reduce((a, b) => a + b, 0) / arr.length).toFixed(3) : null,
      profitFactor: grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : grossWin > 0 ? Infinity : null,
      totalPnl: +pnls.reduce((a, b) => a + b, 0).toFixed(2),
    });
  }
  return stats.sort((a, b) => (b.expectancyR ?? -99) - (a.expectancyR ?? -99));
}

function mistakeCategory(outcome: TradeOutcome): string | null {
  if (Number(outcome.pnl ?? 0) > 0) return null;
  const reason = (outcome.exitReason ?? "").toLowerCase();
  if (reason.includes("stop")) return "stopped_out";
  if (reason.includes("stall") || reason.includes("timer")) return "stalled_no_followthrough";
  if (reason.includes("flatten")) return "faded_into_close";
  return "other_loss";
}

export async function getLearningReport(userId: string): Promise<LearningReport> {
  const empty: LearningReport = {
    totalOutcomes: 0, byVariant: [], divergences: [], mistakePatterns: [], worstVariant: null,
    lessons: ["No outcomes logged yet — run a backtest to start the learning loop."],
  };
  const db = await getDb();
  if (!db) return empty;
  let rows: TradeOutcome[];
  try {
    rows = await db
      .select()
      .from(tradeOutcomes)
      .where(eq(tradeOutcomes.userId, userId))
      .orderBy(desc(tradeOutcomes.id))
      .limit(5000);
  } catch {
    return empty;
  }
  if (rows.length === 0) return empty;

  const byVariant = aggregate(rows);

  // Divergence: live (PAPER/LIVE) expectancy vs backtest expectancy, same strategy+variant
  const divergences: DivergenceFlag[] = [];
  for (const live of byVariant.filter((s) => (s.source === "PAPER" || s.source === "LIVE") && s.trades >= 5)) {
    const bt = byVariant.find(
      (s) => s.source === "BACKTEST" && s.strategyId === live.strategyId && s.variantId === live.variantId && s.trades >= 10
    );
    if (!bt || bt.expectancyR == null || live.expectancyR == null) continue;
    if (Math.abs(live.expectancyR - bt.expectancyR) > 0.5) {
      divergences.push({
        strategyId: live.strategyId,
        variantId: live.variantId,
        backtestExpectancyR: bt.expectancyR,
        liveExpectancyR: live.expectancyR,
        liveTrades: live.trades,
        message:
          `DIVERGENCE: ${live.strategyId}/${live.variantId ?? "?"} backtest expectancy ${bt.expectancyR}R ` +
          `but live is ${live.expectancyR}R over ${live.trades} trades — live results diverge from backtest. Investigate before trusting this variant.`,
      });
    }
  }

  // Mistake patterns across all losers
  const losers = rows.filter((r) => Number(r.pnl ?? 0) <= 0);
  const catCounts = new Map<string, number>();
  for (const r of losers) {
    const c = mistakeCategory(r);
    if (c) catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
  }
  const mistakePatterns = [...catCounts.entries()]
    .map(([category, count]) => ({ category, count, shareOfLosses: losers.length > 0 ? +((count / losers.length) * 100).toFixed(1) : 0 }))
    .sort((a, b) => b.count - a.count);

  // Worst variant with a meaningful sample
  const worstVariant =
    byVariant
      .filter((s) => s.trades >= 5 && s.expectancyR != null && s.expectancyR < 0)
      .sort((a, b) => (a.expectancyR ?? 0) - (b.expectancyR ?? 0))[0] ?? null;

  // Distilled lessons (human- and LLM-readable)
  const lessons: string[] = [];
  for (const d of divergences) lessons.push(d.message);
  if (mistakePatterns[0] && losers.length >= 5) {
    lessons.push(
      `Most common mistake: ${mistakePatterns[0].category} — ${mistakePatterns[0].count} of ${losers.length} losing trades (${mistakePatterns[0].shareOfLosses}%). ` +
        (mistakePatterns[0].category === "stopped_out"
          ? "Consider whether entries are chasing or stops are too tight for current ATR."
          : mistakePatterns[0].category === "stalled_no_followthrough"
            ? "Triggers fire but moves fail — consider raising min_signals_armed or the volume threshold."
            : "Entries may be too late in the session — check the no-entries-after cutoff.")
    );
  }
  if (worstVariant) {
    lessons.push(
      `Weakest variant: ${worstVariant.strategyId}/${worstVariant.variantId ?? "?"} — expectancy ${worstVariant.expectancyR}R over ${worstVariant.trades} trades. Deprioritize it in the ladder.`
    );
  }
  const best = byVariant.find((s) => s.trades >= 5 && (s.expectancyR ?? -99) > 0);
  if (best) {
    lessons.push(`Best performer: ${best.strategyId}/${best.variantId ?? "?"} (${best.source}) — expectancy ${best.expectancyR}R, win rate ${best.winRate}%.`);
  }
  if (lessons.length === 0) lessons.push(`${rows.length} outcomes logged; no strong patterns yet — keep collecting.`);

  return { totalOutcomes: rows.length, byVariant: byVariant.slice(0, 30), divergences, mistakePatterns, worstVariant, lessons };
}

/* ---------- 3. FEED BACK (into the Intelligence snapshot) ---------- */

export async function learningSummaryLines(userId: string): Promise<string[]> {
  const report = await getLearningReport(userId).catch(() => null);
  if (!report || report.totalOutcomes === 0) return [];
  return report.lessons.slice(0, 5);
}
