import { z } from "zod";
import { authedQuery, createRouter } from "./middleware";
import { marketDataService } from "./marketdata/service";
import { getMarketSession } from "./marketdata/session";

/**
 * MARKET DATA API — module 0 of the autonomous strategy engine ("Eyes").
 *
 * Exposes the IBKR-backed data service: gateway/market-hours status,
 * watchlist management, cached 1-minute bars, and the computed indicator
 * set per symbol (session VWAP, RSI(14), prior-day H/L/C, session H/L).
 *
 * This is the minimum-disclosure surface: raw bar history is capped and
 * indicators are the primary output — downstream modules (triggers, state
 * machine) consume the same service server-side.
 */

const symbolInput = z.object({
  symbol: z.string().min(1).max(12),
});

export const marketDataRouter = createRouter({
  /**
   * Canonical NYSE market session (Production Revision §3) — the single
   * source every module consumes: state (PRE_MARKET / OPEN /
   * EARLY_CLOSE_SESSION / AFTER_HOURS / CLOSED), exchange time, trading date,
   * next open/close. Holidays, early closes, special closures and DST are
   * handled by the embedded NYSE calendar, never by per-component timers.
   */
  session: authedQuery.query(() => getMarketSession()),

  /** Service + gateway + per-symbol health. */
  status: authedQuery.query(async () => marketDataService.status()),

  /** Start tracking a symbol (immediate refresh + joins the 60-second loop). */
  track: authedQuery.input(symbolInput).mutation(async ({ input }) => {
    const feed = await marketDataService.track(input.symbol);
    return {
      symbol: feed.symbol,
      ok: feed.error === null,
      error: feed.error,
      barCount: feed.indicators?.barCount ?? 0,
      indicators: feed.indicators,
      delaySeconds: feed.delaySeconds,
      latencyMs: feed.latencyMs,
    };
  }),

  /** Stop tracking a symbol. */
  untrack: authedQuery.input(symbolInput).mutation(async ({ input }) => ({
    removed: marketDataService.untrack(input.symbol),
  })),

  /** Force a refresh of one tracked symbol (allowed outside market hours). */
  refresh: authedQuery.input(symbolInput).mutation(async ({ input }) => {
    const feed = await marketDataService.refresh(input.symbol);
    return { symbol: feed.symbol, ok: feed.error === null, error: feed.error, indicators: feed.indicators };
  }),

  /** Full indicator set for one tracked symbol. */
  indicators: authedQuery.input(symbolInput).query(async ({ input }) => {
    const feed = marketDataService.get(input.symbol);
    if (!feed) return { tracked: false as const, indicators: null, error: null, delaySeconds: 0 };
    return { tracked: true as const, indicators: feed.indicators, error: feed.error, delaySeconds: feed.delaySeconds };
  }),

  /** Recent cached 1-minute bars (newest last), capped at `limit`. */
  bars: authedQuery
    .input(symbolInput.extend({ limit: z.number().int().min(1).max(390).default(120) }))
    .query(async ({ input }) => {
      const feed = marketDataService.get(input.symbol);
      if (!feed) return { tracked: false as const, bars: [] };
      return { tracked: true as const, bars: feed.bars.slice(-input.limit) };
    }),

  /** All tracked symbols with their indicator summary. */
  list: authedQuery.query(async () => {
    const status = await marketDataService.status();
    return status.symbols;
  }),

  /* ---- RTI Market Data Gateway surface (deterministic, spec §6/§8) ---- */

  /** Which provider is serving this user (discreet source visibility chip). */
  gatewaySource: authedQuery.query(async ({ ctx }) => {
    const { sourceStatus } = await import("./marketdata/gateway/gateway");
    const s = await sourceStatus(ctx.user.id);
    return { ...s, checkedAt: new Date().toISOString() };
  }),

  /** Unified validated snapshot for any symbol — same object the AI sees. */
  gatewaySnapshot: authedQuery.input(symbolInput).query(async ({ ctx, input }) => {
    const { getSnapshot } = await import("./marketdata/gateway/gateway");
    return getSnapshot(ctx.user.id, input.symbol);
  }),

  /** Internally-computed indicator set (SMA/EMA/RSI/MACD/VWAP/Bollinger/ATR…). */
  gatewayIndicators: authedQuery.input(symbolInput).query(async ({ ctx, input }) => {
    const { getIndicators } = await import("./marketdata/gateway/gateway");
    return getIndicators(ctx.user.id, input.symbol);
  }),
});
