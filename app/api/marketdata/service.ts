import { computeIndicators, etParts, type Bar, type Indicators } from "./indicators";
import { fetchMinuteBars, gatewayHealth } from "./ibkr-data";
import { isRegularSession } from "./session";

/**
 * MARKET DATA SERVICE — the "Eyes" (module 0 of the strategy engine).
 *
 * Tracks a watchlist of symbols, pulls 1-minute bars from the IBKR gateway
 * every 60 seconds DURING REGULAR MARKET HOURS (09:30–16:00 ET, Mon–Fri),
 * and keeps a computed indicator set per symbol (session VWAP, RSI(14),
 * prior-day H/L/C, session H/L).
 *
 * Design rules:
 *   - Honest degradation: if the gateway is down/unauthenticated, feeds carry
 *     the error and the UI shows it — no fabricated data, ever.
 *   - The refresh loop only ticks during market hours; manual refreshes are
 *     allowed any time (e.g. for after-hours inspection of the last session).
 *   - Delayed data is flagged: the feed reports the broker-reported delay so
 *     downstream timer logic can refuse to arm on stale bars.
 *   - In-memory by design (module 0). Persistence arrives with the backtest
 *     module, which will also own historical bar storage.
 */

export interface SymbolFeed {
  symbol: string;
  tracked: boolean;
  bars: Bar[];
  indicators: Indicators | null;
  delaySeconds: number;
  lastRefresh: number | null;
  latencyMs: number | null;
  error: string | null;
}

export interface DataServiceStatus {
  provider: "IBKR";
  gatewayOk: boolean;
  gatewayDetail: string;
  marketOpen: boolean;
  loopRunning: boolean;
  refreshIntervalSeconds: number;
  symbols: Array<{
    symbol: string;
    ok: boolean;
    barCount: number;
    last: number | null;
    vwap: number | null;
    rsi14: number | null;
    delaySeconds: number;
    lastRefresh: number | null;
    latencyMs: number | null;
    error: string | null;
  }>;
}

const REFRESH_MS = 60_000;

/**
 * US regular session — delegates to the Market Session Service (the single
 * source of truth: weekends, NYSE holidays, early closes, special closures,
 * DST). Kept under the historical name for existing callers.
 */
export function isMarketHours(now = Date.now()): boolean {
  return isRegularSession(now);
}

class MarketDataService {
  private feeds = new Map<string, SymbolFeed>();
  private loop: ReturnType<typeof setInterval> | null = null;
  private health: { ok: boolean; detail: string; checkedAt: number } | null = null;

  async track(rawSymbol: string): Promise<SymbolFeed> {
    const symbol = rawSymbol.toUpperCase().trim();
    if (!/^[A-Z.]{1,12}$/.test(symbol)) throw new Error(`Invalid symbol "${rawSymbol}"`);
    let feed = this.feeds.get(symbol);
    if (!feed) {
      feed = {
        symbol,
        tracked: true,
        bars: [],
        indicators: null,
        delaySeconds: 0,
        lastRefresh: null,
        latencyMs: null,
        error: null,
      };
      this.feeds.set(symbol, feed);
    }
    this.ensureLoop();
    await this.refresh(symbol);
    return feed;
  }

  untrack(rawSymbol: string): boolean {
    return this.feeds.delete(rawSymbol.toUpperCase().trim());
  }

  list(): SymbolFeed[] {
    return [...this.feeds.values()];
  }

  get(rawSymbol: string): SymbolFeed | undefined {
    return this.feeds.get(rawSymbol.toUpperCase().trim());
  }

  /** Refresh one symbol: pull bars, recompute indicators, record latency/errors. */
  async refresh(rawSymbol: string): Promise<SymbolFeed> {
    const symbol = rawSymbol.toUpperCase().trim();
    const feed = this.feeds.get(symbol);
    if (!feed) throw new Error(`Symbol ${symbol} is not tracked`);
    const started = Date.now();
    try {
      const result = await fetchMinuteBars(symbol, "2d");
      feed.bars = result.bars;
      feed.indicators = computeIndicators(symbol, result.bars);
      feed.delaySeconds = result.delaySeconds;
      feed.error = result.bars.length === 0 ? "gateway returned no bars (market closed or no subscription)" : null;
    } catch (e) {
      feed.error = (e as Error).message;
    }
    feed.latencyMs = Date.now() - started;
    feed.lastRefresh = Date.now();
    return feed;
  }

  async refreshAll(): Promise<void> {
    await Promise.allSettled([...this.feeds.keys()].map((s) => this.refresh(s)));
  }

  /** Start the 60-second loop if not already running. Ticks only in market hours. */
  ensureLoop(): void {
    if (this.loop) return;
    this.loop = setInterval(() => {
      if (!isMarketHours()) return;
      void this.refreshAll();
    }, REFRESH_MS);
    // Never keep the process alive just for the data loop.
    if (typeof this.loop.unref === "function") this.loop.unref();
  }

  stopLoop(): void {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }

  async status(): Promise<DataServiceStatus> {
    // Re-check gateway health at most every 30 seconds.
    if (!this.health || Date.now() - this.health.checkedAt > 30_000) {
      const h = await gatewayHealth();
      this.health = { ...h, checkedAt: Date.now() };
    }
    return {
      provider: "IBKR",
      gatewayOk: this.health.ok,
      gatewayDetail: this.health.detail,
      marketOpen: isMarketHours(),
      loopRunning: this.loop !== null,
      refreshIntervalSeconds: REFRESH_MS / 1000,
      symbols: this.list().map((f) => ({
        symbol: f.symbol,
        ok: f.error === null && f.indicators !== null,
        barCount: f.indicators?.barCount ?? 0,
        last: f.indicators?.last ?? null,
        vwap: f.indicators?.vwap ?? null,
        rsi14: f.indicators?.rsi14 ?? null,
        delaySeconds: f.delaySeconds,
        lastRefresh: f.lastRefresh,
        latencyMs: f.latencyMs,
        error: f.error,
      })),
    };
  }
}

/** Process-wide singleton. */
export const marketDataService = new MarketDataService();
