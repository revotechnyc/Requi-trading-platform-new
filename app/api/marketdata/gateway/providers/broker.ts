import { and, eq } from "drizzle-orm";
import { getDb } from "../../../queries/connection";
import { brokerAccounts } from "@db/schema";
import { fetchMinuteBars, gatewayHealth } from "../../ibkr-data";
import type { MarketDataProvider, OhlcvBar, RawQuote } from "../types";

/**
 * Broker market-data provider (spec §3) — wraps the connected broker's own
 * market-data API. Priority 1 in the deterministic hierarchy: when the user
 * has a connected, market-data-capable broker, its data wins.
 *
 * Currently market-data-capable adapters:
 *   - IBKR (Client Portal: real-time snapshots + 1-min history, via the
 *     existing ibkr-data module shared with the execution adapter)
 * Paper accounts are an execution venue, not a market-data source — they do
 * not satisfy Priority 1 and correctly fall through to Yahoo.
 *
 * Each broker normalizes into Requi's internal schema here; broker payloads
 * never leak upstream.
 */

/** Broker names (broker_accounts.broker) that can serve market data. */
const MARKET_DATA_CAPABLE = new Set(["IBKR", "Interactive Brokers"]);

export class BrokerMarketDataProvider implements MarketDataProvider {
  readonly code = "BROKER" as const;
  readonly sourceName: string;

  private constructor(brokerName: string) {
    this.sourceName = brokerName === "IBKR" ? "Interactive Brokers" : brokerName;
  }

  /** Resolve the user's connected, market-data-capable broker account, if any. */
  static async forUser(userId: string): Promise<BrokerMarketDataProvider | null> {
    const db = getDb();
    const rows = await db
      .select({ broker: brokerAccounts.broker })
      .from(brokerAccounts)
      .where(and(eq(brokerAccounts.userId, userId), eq(brokerAccounts.status, "Connected")));
    const capable = rows.find((r) => MARKET_DATA_CAPABLE.has(r.broker));
    if (!capable) return null;
    if (!process.env.IBKR_ACCOUNT) return null; // adapter not configured — cannot serve data
    return new BrokerMarketDataProvider(capable.broker);
  }

  async isAvailable(): Promise<boolean> {
    const h = await gatewayHealth();
    return h.ok;
  }

  async getQuote(symbol: string): Promise<RawQuote> {
    const sym = symbol.toUpperCase().trim();
    const { bars, delaySeconds } = await fetchMinuteBars(sym, "1d");
    if (bars.length === 0) throw new Error(`Broker returned no bars for ${sym}`);
    const latest = bars[bars.length - 1];
    const day = bars.filter((b) => new Date(b.t).toDateString() === new Date(latest.t).toDateString());
    return {
      symbol: sym,
      price: latest.c,
      open: day[0]?.o ?? null,
      high: day.length ? Math.max(...day.map((b) => b.h)) : null,
      low: day.length ? Math.min(...day.map((b) => b.l)) : null,
      previousClose: null,
      volume: day.reduce((a, b) => a + b.v, 0) || null,
      timestamp: latest.t,
      exchange: null,
      isDelayed: delaySeconds > 0,
    };
  }

  async getHistory(symbol: string, period = "1y", interval = "1d"): Promise<OhlcvBar[]> {
    // IBKR history module currently serves intraday bars; longer daily history
    // falls through to Yahoo by the router's failover (spec §5).
    if (interval !== "1m" && interval !== "5m") throw new Error("IBKR adapter serves intraday bars only");
    const { bars } = await fetchMinuteBars(symbol.toUpperCase().trim(), period === "1y" ? "2d" : period);
    if (bars.length === 0) throw new Error(`Broker returned no history for ${symbol}`);
    return bars;
  }
}
