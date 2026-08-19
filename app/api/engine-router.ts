import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authedQuery, createRouter } from "./middleware";
import { hasAcceptedCurrent, AUTONOMOUS_DOC } from "./legal/consent";
import { recordAudit } from "./queries/audit";
import { TRIGGERS } from "./engine/triggers";
import { BUILTIN_CONFIGS, loadConfig } from "./engine/config";
import { runBacktest } from "./engine/backtest";
import { simulateVariants } from "./engine/simulator";
import { scanFeeds } from "./engine/scanner";
import { evaluateMonitor, listMonitors, startMonitor, stopMonitor } from "./engine/monitor";
import { marketDataService } from "./marketdata/service";
import { fetchMinuteBars } from "./marketdata/ibkr-data";
import { getLearningReport, recordBacktestOutcomes } from "./engine/learning";
import { identifyStrategy } from "./engine/scanner";
import { getPnlSummary, getStopMode, isAutoExecuteEnabled, isAutoUniverseEnabled, listOrders, listPositions, setAutoExecute, setAutoUniverse, setPositionOverride, setStopMode, streamActivity, tightenStop, tightenTrail } from "./engine/portfolio";
import { requestFlatten, trailingStatus } from "./engine/trailing";
import { getStrategy, listRegistry, registryStats, disableStrategy, enableStrategy } from "./engine/strategies/registry";
import { ensureSeedUniverse, lastUniverseCycle, runUniverseCycle, universeStatus } from "./engine/universe";

/**
 * ENGINE API — modules 1–6 of the autonomous strategy engine.
 *
 * Trigger library, config library (governance-clamped), backtester,
 * what-if simulator, scanner, and the live monitor that wires CONFIRMED
 * setups into the existing ticket confirmation gate. Phase 1: no
 * auto-execution — every proposal waits for CONFIRM ORDER [TICKET_ID].
 */

const strategyInput = z.object({
  symbol: z.string().min(1).max(12),
  strategyId: z.string().min(1).max(64),
});

/** Fetch bars for analysis: prefer the tracked feed, else pull fresh from IBKR. */
async function barsFor(symbol: string, period: string) {
  const feed = marketDataService.get(symbol);
  if (feed && feed.bars.length >= 100) return feed.bars;
  const result = await fetchMinuteBars(symbol, period);
  return result.bars;
}

/** Compute scanner features for one tracked symbol and run strategy self-identification. */
function identifyForSymbol(symbol: string) {
  const feed = marketDataService.get(symbol.toUpperCase());
  if (!feed || !feed.indicators || feed.bars.length < 30) return null;
  const ind = feed.indicators;
  const gapPct = ind.priorDay && ind.priorDay.close > 0 && feed.bars.length > 0
    ? +(((feed.bars[0].o - ind.priorDay.close) / ind.priorDay.close) * 100).toFixed(2)
    : null;
  const vsVwapPct = ind.vwap && ind.last ? +(((ind.last - ind.vwap) / ind.vwap) * 100).toFixed(2) : null;
  // RVOL against the same bar-count window of the prior session
  const todayVol = feed.bars.slice(-ind.barCount).reduce((a, b) => a + b.v, 0);
  const priorWindow = feed.bars.slice(0, Math.max(feed.bars.length - ind.barCount, 0)).slice(-ind.barCount);
  const priorVol = priorWindow.reduce((a, b) => a + b.v, 0);
  const relativeVolume = priorVol > 0 ? +(todayVol / priorVol).toFixed(2) : null;
  return identifyStrategy({ gapPct, vsVwapPct, rsi14: ind.rsi14, relativeVolume });
}

export const engineRouter = createRouter({
  /** Trigger library catalog (module 1). */
  triggers: authedQuery.query(() =>
    Object.entries(TRIGGERS).map(([name, t]) => ({ name, description: t.description, defaults: t.defaults })),
  ),

  /** Strategy config library (minimum-disclosure summary). */
  configs: authedQuery.query(() =>
    BUILTIN_CONFIGS.map((c) => ({
      strategyId: c.strategy_id,
      label: c.label,
      version: c.version,
      variants: c.entry_variants.map((v) => ({ id: v.id, trigger: v.trigger_type, priority: v.priority })),
      riskPct: c.sizing.max_risk_pct,
      positionCapPct: c.sizing.max_position_pct,
    })),
  ),

  /** Backtest a config on a symbol's recent 1-min history (module 3). */
  backtest: authedQuery
    .input(strategyInput.extend({ period: z.enum(["2d", "1w", "2w", "1m"]).default("1w") }))
    .mutation(async ({ ctx, input }) => {
      const { config, clamps, governanceVersion } = await loadConfig(input.strategyId);
      const bars = await barsFor(input.symbol, input.period);
      if (bars.length < 200) throw new Error(`Not enough bars for ${input.symbol.toUpperCase()} (${bars.length}) — check the data feed`);
      const report = runBacktest({ config, symbol: input.symbol.toUpperCase(), bars });
      // Learning loop: every backtest's outcomes feed the mistake/lesson layer.
      const { recorded } = await recordBacktestOutcomes(ctx.user.id, input.symbol.toUpperCase(), config.strategy_id, report);
      return { ...report, events: report.events.slice(-30), governanceVersion, clamps, outcomesRecorded: recorded };
    }),

  /** What-if simulator: rank entry variants by expectancy (module 4). */
  simulate: authedQuery
    .input(strategyInput.extend({ period: z.enum(["2d", "1w", "2w", "1m"]).default("1w") }))
    .mutation(async ({ input }) => {
      const { config, clamps, governanceVersion } = await loadConfig(input.strategyId);
      const bars = await barsFor(input.symbol, input.period);
      if (bars.length < 200) throw new Error(`Not enough bars for ${input.symbol.toUpperCase()} (${bars.length})`);
      const report = simulateVariants({ config, symbol: input.symbol.toUpperCase(), bars });
      return { ...report, governanceVersion, clamps };
    }),

  /** Scan tracked feeds for candidates (module 5). */
  scan: authedQuery.mutation(async () => scanFeeds(marketDataService.list())),

  /** Learning loop report: per-variant stats, mistake patterns, divergences, lessons. */
  learning: authedQuery.query(async ({ ctx }) => getLearningReport(ctx.user.id)),

  /** Start live monitoring: symbol × config → proposals (module 6). strategyId "AUTO" self-identifies from the current tape. */
  monitorStart: authedQuery.input(strategyInput).mutation(async ({ ctx, input }) => {
    await marketDataService.track(input.symbol); // ensure the feed exists
    if (input.strategyId.toUpperCase() === "AUTO") {
      const identified = identifyForSymbol(input.symbol);
      if (!identified) throw new Error(`Cannot auto-identify a strategy for ${input.symbol.toUpperCase()} — no feed data yet. Track the symbol and try again.`);
      const started = await startMonitor(ctx.user.id, input.symbol, identified.strategyId);
      return { ...started, identified };
    }
    return startMonitor(ctx.user.id, input.symbol, input.strategyId);
  }),

  /** Self-identify the best-fit strategy for a symbol from its current tape. */
  identify: authedQuery.input(z.object({ symbol: z.string().min(1).max(12) })).query(({ input }) => {
    const identified = identifyForSymbol(input.symbol);
    if (!identified) return { identified: null, detail: "no feed data — track the symbol first" };
    return { identified };
  }),

  monitorStop: authedQuery.input(z.object({ symbol: z.string().min(1).max(12) })).mutation(async ({ ctx, input }) => ({
    stopped: stopMonitor(ctx.user.id, input.symbol),
  })),

  monitors: authedQuery.query(async ({ ctx }) => listMonitors(ctx.user.id)),

  /** Evaluate a monitored symbol against its freshest bars right now. */
  evaluate: authedQuery.input(z.object({ symbol: z.string().min(1).max(12) })).mutation(async ({ ctx, input }) => {
    await marketDataService.refresh(input.symbol).catch(() => undefined);
    return evaluateMonitor(ctx.user.id, input.symbol);
  }),

  /* ---------- strategy registry (Strategy Spec v1.0) ---------- */

  /** All 100 embedded strategies: status, eligibility, config hash (§10). */
  strategies: authedQuery.query(() => listRegistry()),

  /** Registry roll-up: totals by status, eligible count, first-release count. */
  strategyStats: authedQuery.query(() => registryStats()),

  /** Full Universal Strategy Object for one strategy (§2 schema). */
  strategyDetail: authedQuery.input(z.object({ id: z.string().min(1).max(12) })).query(({ input }) => {
    const s = getStrategy(input.id);
    if (!s) throw new Error(`Unknown strategy ${input.id}`);
    return s;
  }),

  /** Operator kill: demote a strategy to DISABLED (the only runtime status mutation). */
  strategyDisable: authedQuery.input(z.object({ id: z.string().min(1).max(12) })).mutation(({ ctx, input }) => {
    const r = disableStrategy(input.id);
    void recordAudit({ userId: ctx.user.id, action: "STRATEGY_DISABLED", entityType: "STRATEGY", entityId: input.id, newState: "DISABLED", correlationId: input.id });
    return r;
  }),

  /** Restore a disabled strategy to its library status (never a promotion). */
  strategyEnable: authedQuery.input(z.object({ id: z.string().min(1).max(12) })).mutation(({ ctx, input }) => {
    const r = enableStrategy(input.id);
    void recordAudit({ userId: ctx.user.id, action: "STRATEGY_ENABLED", entityType: "STRATEGY", entityId: input.id, prevState: "DISABLED", correlationId: input.id });
    return r;
  }),

  /* ---------- auto-universe engine (§3 stages 1–2) ---------- */

  /** Universe engine status + this user's last cycle report. */
  universe: authedQuery.query(async ({ ctx }) => ({
    ...universeStatus(),
    preference: await isAutoUniverseEnabled(ctx.user.id),
    lastCycle: lastUniverseCycle(ctx.user.id),
  })),

  /** Force an auto-universe cycle right now (tracks seeds on first use). */
  universeScan: authedQuery.mutation(async ({ ctx }) => {
    const pref = await isAutoUniverseEnabled(ctx.user.id);
    await ensureSeedUniverse();
    await marketDataService.refreshAll();
    return runUniverseCycle(ctx.user.id, pref.maxMonitors);
  }),

  /** Auto-universe preference: enabled + max concurrent monitors. */
  getAutoUniverse: authedQuery.query(async ({ ctx }) => isAutoUniverseEnabled(ctx.user.id)),

  setAutoUniverse: authedQuery
    .input(z.object({ enabled: z.boolean(), maxMonitors: z.number().int().min(1).max(20).optional() }))
    .mutation(async ({ ctx, input }) => {
      // Legal Revision §18: enabling autonomous features requires the dedicated
      // activation consent (recorded, versioned) — never buried in general Terms.
      if (input.enabled && !(await hasAcceptedCurrent(ctx.user.id, AUTONOMOUS_DOC))) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AUTONOMOUS_CONSENT_REQUIRED" });
      }
      const r = await setAutoUniverse(ctx.user.id, input.enabled, input.maxMonitors);
      void recordAudit({ userId: ctx.user.id, action: "SETTING_CHANGED", entityType: "SETTING", entityId: "autoUniverse", newState: input.enabled ? "ON" : "OFF", meta: { maxMonitors: input.maxMonitors ?? null } });
      return r;
    }),

  /* ---------- portfolio: orders, positions, P&L, auto-execute ---------- */

  /** Order history — every ticket that became an order (confirmed or auto-executed). */
  orders: authedQuery.query(async ({ ctx }) => listOrders(ctx.user.id, 100)),

  /** Positions with live marks and unrealized P&L. */
  positions: authedQuery.query(async ({ ctx }) => listPositions(ctx.user.id, 100)),

  /** P&L summary: realized + unrealized + win/loss counts. */
  pnl: authedQuery.query(async ({ ctx }) => getPnlSummary(ctx.user.id)),

  /** Auto-execute preference (AUTONOMOUS engine proposals only). */
  getAutoExecute: authedQuery.query(async ({ ctx }) => ({ enabled: await isAutoExecuteEnabled(ctx.user.id) })),

  setAutoExecute: authedQuery
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Legal Revision §18: auto-execution is the highest-risk switch — consent gate.
      if (input.enabled && !(await hasAcceptedCurrent(ctx.user.id, AUTONOMOUS_DOC))) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AUTONOMOUS_CONSENT_REQUIRED" });
      }
      const r = await setAutoExecute(ctx.user.id, input.enabled);
      void recordAudit({ userId: ctx.user.id, action: "SETTING_CHANGED", entityType: "SETTING", entityId: "autoExecute", newState: input.enabled ? "ON" : "OFF" });
      return r;
    }),

  /** Trailing-stop module status (running, managed positions, fires today). */
  trailing: authedQuery.query(() => trailingStatus()),

  /** Per-user stop mode: CLASSIC (flat stop → 1R arm → ATR trail) or IMMEDIATE_TRAIL (0.5% trail from entry + moving hard bottom). */
  getStopMode: authedQuery.query(async ({ ctx }) => ({ mode: await getStopMode(ctx.user.id) })),
  setStopMode: authedQuery
    .input(z.object({ mode: z.enum(["CLASSIC", "IMMEDIATE_TRAIL"]) }))
    .mutation(async ({ ctx, input }) => setStopMode(ctx.user.id, input.mode)),

  /** Manual overrides — tighten only (ratchet-respecting); loosening requires manual control. */
  tightenStop: authedQuery
    .input(z.object({ positionId: z.string(), stopPrice: z.number().positive() }))
    .mutation(({ ctx, input }) => tightenStop(ctx.user.id, input.positionId, input.stopPrice)),
  tightenTrail: authedQuery
    .input(z.object({ positionId: z.string(), trailPrice: z.number().positive() }))
    .mutation(({ ctx, input }) => tightenTrail(ctx.user.id, input.positionId, input.trailPrice)),
  setPositionOverride: authedQuery
    .input(z.object({ positionId: z.string(), manual: z.boolean() }))
    .mutation(({ ctx, input }) => setPositionOverride(ctx.user.id, input.positionId, input.manual)),
  /** Flatten an open position now — market sell through the same audited fire path. */
  flattenPosition: authedQuery
    .input(z.object({ positionId: z.string() }))
    .mutation(({ ctx, input }) => requestFlatten(ctx.user.id, input.positionId)),

  /** Live trade stream — execution-relevant events, newest first. */
  activity: authedQuery.query(({ ctx }) => streamActivity(ctx.user.id, 40)),
});
