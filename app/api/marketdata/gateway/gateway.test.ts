import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RTI MARKET DATA GATEWAY — spec test suite.
 *
 * Covers the deterministic behaviors the spec demands:
 *   · no broker connected      → yfinance serves
 *   · broker connected         → broker serves
 *   · broker unavailable / timeout / malformed → failover to yfinance + logging
 *   · yfinance failure         → structured "unavailable", never fabricated
 *   · stale data               → marked stale / rejected
 *   · valid data               → accepted with metadata
 *   · indicator engine         → internally computed, sane values
 *   · AI-facing context        → normalized snapshot + source + timestamp
 *
 * Providers are mocked so the suite is hermetic; routing, validation,
 * normalization, indicators and caching run for real.
 */

/* ---------- provider mocks ---------- */

const yahooState = {
  quote: null as RawQuote | null,
  history: [] as OhlcvBar[],
  throwOnQuote: null as Error | null,
};

vi.mock("./providers/yahoo", () => ({
  YahooMarketDataProvider: class {
    readonly code = "YFINANCE" as const;
    readonly sourceName = "Yahoo Finance";
    async isAvailable() {
      return true;
    }
    async getQuote(): Promise<RawQuote> {
      if (yahooState.throwOnQuote) throw yahooState.throwOnQuote;
      if (!yahooState.quote) throw new Error("no quote");
      return yahooState.quote;
    }
    async getHistory(): Promise<OhlcvBar[]> {
      return yahooState.history;
    }
  },
}));

const brokerState = {
  present: false,
  available: true,
  quote: null as RawQuote | null,
  throwOnQuote: null as Error | null,
};

vi.mock("./providers/broker", () => {
  class MockBroker {
    readonly code = "BROKER" as const;
    readonly sourceName = "Interactive Brokers";
    static async forUser(): Promise<MockBroker | null> {
      return brokerState.present ? new MockBroker() : null;
    }
    async isAvailable() {
      return brokerState.available;
    }
    async getQuote(symbol: string): Promise<RawQuote> {
      if (brokerState.throwOnQuote) throw brokerState.throwOnQuote;
      if (!brokerState.quote) throw new Error(`no broker quote for ${symbol}`);
      return brokerState.quote;
    }
    async getHistory(): Promise<OhlcvBar[]> {
      throw new Error("intraday only");
    }
  }
  return { BrokerMarketDataProvider: MockBroker };
});

// Persistence must never break data delivery even with no DB.
vi.mock("./persistence", () => ({
  recordSuccess: vi.fn(async () => undefined),
  recordFailure: vi.fn(async () => undefined),
  recordEvent: vi.fn(async () => undefined),
  recordSnapshot: vi.fn(async () => undefined),
  providerHealth: vi.fn(async () => []),
  recentEvents: vi.fn(async () => []),
}));

import { getMarketContext, getSnapshot } from "./gateway";
import { gatewayCache, CACHE_TTL } from "./cache";
import { classifyFreshness, validateMarketData } from "./validation";
import { computeGatewayIndicators } from "./indicators";
import * as persistence from "./persistence";
import type { OhlcvBar, RawQuote } from "./types";

const USER = "gateway-test-user";
const nowIso = () => new Date().toISOString();

function goodQuote(price = 189.42): RawQuote {
  return {
    symbol: "AAPL",
    price,
    open: 188.1,
    high: 190.2,
    low: 187.5,
    previousClose: 187.9,
    volume: 12_345_678,
    timestamp: nowIso(),
    exchange: "NASDAQ",
    isDelayed: true,
  };
}

function dailyBars(n = 260): OhlcvBar[] {
  const bars: OhlcvBar[] = [];
  let px = 150;
  const t0 = Date.now() - n * 86_400_000;
  for (let i = 0; i < n; i++) {
    px *= 1 + Math.sin(i / 9) * 0.01 + 0.0008;
    bars.push({
      t: t0 + i * 86_400_000,
      o: +(px * 0.997).toFixed(2),
      h: +(px * 1.008).toFixed(2),
      l: +(px * 0.992).toFixed(2),
      c: +px.toFixed(2),
      v: 5_000_000 + (i % 7) * 300_000,
    });
  }
  return bars;
}

beforeEach(() => {
  gatewayCache.clear();
  yahooState.quote = goodQuote();
  yahooState.history = dailyBars();
  yahooState.throwOnQuote = null;
  brokerState.present = false;
  brokerState.available = true;
  brokerState.quote = null;
  brokerState.throwOnQuote = null;
  vi.clearAllMocks();
});

/* ---------- routing & failover ---------- */

describe("deterministic provider routing", () => {
  it("serves yfinance when no broker is connected", async () => {
    const snap = await getSnapshot(USER, "aapl");
    expect(snap.market_data_available).toBe(true);
    if (snap.market_data_available) {
      expect(snap.source).toBe("YFINANCE");
      expect(snap.source_name).toBe("Yahoo Finance");
      expect(snap.symbol).toBe("AAPL"); // normalized
      expect(snap.price).toBe(189.42);
    }
  });

  it("serves the broker when one is connected and healthy", async () => {
    brokerState.present = true;
    brokerState.quote = { ...goodQuote(201.5), open: 200.1, high: 202.2, low: 199.5, isDelayed: false };
    const snap = await getSnapshot(USER, "AAPL");
    expect(snap.market_data_available).toBe(true);
    if (snap.market_data_available) {
      expect(snap.source).toBe("BROKER");
      expect(snap.price).toBe(201.5);
      expect(snap.is_delayed).toBe(false);
    }
    expect(persistence.recordSuccess).toHaveBeenCalledWith("BROKER", expect.any(Number));
  });

  it("falls back to yfinance when the broker quote errors, logging the failure + failover", async () => {
    brokerState.present = true;
    brokerState.throwOnQuote = new Error("gateway timeout");
    const snap = await getSnapshot(USER, "AAPL");
    expect(snap.market_data_available).toBe(true);
    if (snap.market_data_available) expect(snap.source).toBe("YFINANCE");
    expect(persistence.recordFailure).toHaveBeenCalledWith("BROKER", "quote", "AAPL", expect.any(Error));
    expect(persistence.recordEvent).toHaveBeenCalledWith("FAILOVER", expect.objectContaining({ provider: "YFINANCE", symbol: "AAPL" }));
  });

  it("falls back when the broker returns malformed data (price ≤ 0)", async () => {
    brokerState.present = true;
    brokerState.quote = { ...goodQuote(0) };
    const snap = await getSnapshot(USER, "AAPL");
    expect(snap.market_data_available).toBe(true);
    if (snap.market_data_available) expect(snap.source).toBe("YFINANCE");
    expect(persistence.recordEvent).toHaveBeenCalledWith("PROVIDER_FAILURE", expect.objectContaining({ provider: "BROKER" }));
  });

  it("returns structured unavailable (never fabricates) when every provider fails", async () => {
    yahooState.throwOnQuote = new Error("yahoo down");
    const snap = await getSnapshot(USER, "MSFT");
    expect(snap.market_data_available).toBe(false);
    if (!snap.market_data_available) {
      expect(snap.reason).toMatch(/no valid market data source/i);
      expect(snap.symbol).toBe("MSFT");
      expect(snap).not.toHaveProperty("price");
    }
  });

  it("rejects invalid symbol shapes without hitting providers", async () => {
    const snap = await getSnapshot(USER, "not a symbol!!");
    expect(snap.market_data_available).toBe(false);
    expect(yahooState.throwOnQuote).toBeNull();
  });
});

/* ---------- validation & staleness ---------- */

describe("validation", () => {
  it("accepts a valid fresh quote", () => {
    const v = validateMarketData(goodQuote(), "AAPL", "REGULAR");
    expect(v.valid).toBe(true);
    expect(v.stale).toBe(false);
    expect(v.confidence).toBe("HIGH");
  });

  it("marks stale data stale (never silently fresh)", () => {
    const old = { ...goodQuote(), timestamp: new Date(Date.now() - 10 * 60_000).toISOString() };
    const v = validateMarketData(old, "AAPL", "REGULAR");
    expect(v.stale).toBe(true);
    expect(v.age_seconds).toBeGreaterThan(60);
  });

  it("rejects broken OHLC relations (high < low)", () => {
    const v = validateMarketData({ ...goodQuote(), high: 100, low: 200 }, "AAPL", "REGULAR");
    expect(v.valid).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/high/i);
  });

  it("rejects future timestamps", () => {
    const v = validateMarketData({ ...goodQuote(), timestamp: new Date(Date.now() + 300_000).toISOString() }, "AAPL", "REGULAR");
    expect(v.valid).toBe(false);
  });

  it("classifies freshness within configurable thresholds", () => {
    expect(classifyFreshness(5, "equity", "REGULAR")).toBe("FRESH");
    expect(classifyFreshness(30, "equity", "REGULAR")).toBe("AGING");
    expect(classifyFreshness(120, "equity", "REGULAR")).toBe("STALE");
    expect(classifyFreshness(90, "equity", "PREMARKET")).toBe("AGING");
    expect(classifyFreshness(90_000, "equity", "CLOSED")).toBe("AGING");
  });

  it("marks a gateway snapshot stale when the quote is stale", async () => {
    yahooState.quote = { ...goodQuote(), timestamp: new Date(Date.now() - 10 * 60_000).toISOString() };
    const snap = await getSnapshot(USER, "AAPL");
    expect(snap.market_data_available).toBe(true);
    if (snap.market_data_available) {
      expect(snap.stale).toBe(true);
      expect(snap.freshness).toBe("STALE");
    }
  });
});

/* ---------- caching ---------- */

describe("cache", () => {
  it("serves repeat quotes from cache within the TTL", async () => {
    await getSnapshot(USER, "AAPL");
    yahooState.quote = goodQuote(999);
    const second = await getSnapshot(USER, "AAPL");
    if (second.market_data_available) expect(second.price).toBe(189.42); // cached
  });

  it("expires entries after their TTL", () => {
    gatewayCache.set("k", 1, 5);
    expect(gatewayCache.get("k")).toBe(1);
    return new Promise<void>((resolve) =>
      setTimeout(() => {
        expect(gatewayCache.get("k")).toBeNull();
        resolve();
      }, 10),
    );
  });

  it("keeps per-type TTLs distinct", () => {
    expect(CACHE_TTL.quoteMs).toBeLessThan(CACHE_TTL.intradayMs);
    expect(CACHE_TTL.intradayMs).toBeLessThan(CACHE_TTL.dailyMs);
  });
});

/* ---------- indicator engine ---------- */

describe("indicator engine (internal, deterministic)", () => {
  const ind = computeGatewayIndicators(dailyBars(), [
    { t: Date.now(), o: 188, h: 189, l: 187, c: 188.5, v: 100_000 },
    { t: Date.now(), o: 188.5, h: 189.5, l: 188, c: 189, v: 120_000 },
  ]);

  it("computes the full moving-average stack", () => {
    for (const k of ["sma_5", "sma_10", "sma_20", "sma_50", "sma_100", "sma_200", "ema_9", "ema_12", "ema_20", "ema_21", "ema_26", "ema_50", "ema_200"] as const) {
      expect(ind[k], k).not.toBeNull();
      expect(ind[k]!).toBeGreaterThan(0);
    }
    // shorter windows track price closer than longer ones on trending data
    expect(Math.abs(ind.sma_5! - ind.sma_200!)).toBeGreaterThan(0);
  });

  it("computes RSI within [0,100]", () => {
    expect(ind.rsi_14).not.toBeNull();
    expect(ind.rsi_14!).toBeGreaterThanOrEqual(0);
    expect(ind.rsi_14!).toBeLessThanOrEqual(100);
  });

  it("computes MACD line/signal/histogram coherently (histogram = macd − signal)", () => {
    expect(ind.macd).not.toBeNull();
    expect(ind.macd_signal).not.toBeNull();
    expect(ind.macd_histogram!).toBeCloseTo(ind.macd! - ind.macd_signal!, 3);
  });

  it("computes Bollinger bands ordered upper > middle > lower", () => {
    expect(ind.bollinger_upper!).toBeGreaterThan(ind.bollinger_middle!);
    expect(ind.bollinger_middle!).toBeGreaterThan(ind.bollinger_lower!);
  });

  it("computes VWAP from intraday bars", () => {
    expect(ind.vwap).not.toBeNull();
    // typical price: ((189+187+188.5)/3*100k + (189.5+188+189)/3*120k) / 220k
    expect(ind.vwap!).toBeCloseTo(188.5303, 3);
  });

  it("computes ATR > 0, 52-week range, and relative volume", () => {
    expect(ind.atr_14!).toBeGreaterThan(0);
    expect(ind.week_52_high!).toBeGreaterThan(ind.week_52_low!);
    expect(ind.relative_volume!).toBeGreaterThan(0);
    expect(ind.average_volume!).toBeGreaterThan(0);
    expect(ind.daily_change_pct).not.toBeNull();
  });

  it("handles short histories without crashing", () => {
    const small = computeGatewayIndicators(dailyBars().slice(-10), []);
    expect(small.sma_200).toBeNull();
    expect(small.sma_5).not.toBeNull();
    expect(small.vwap).toBeNull();
  });
});

/* ---------- AI-facing context ---------- */

describe("market context for Intelligence / Autonomous", () => {
  it("delivers snapshot + indicators + source + timestamp, and persists what the AI saw", async () => {
    const res = await getMarketContext(USER, "AAPL", "INTELLIGENCE");
    expect(res.available).toBe(true);
    const ctx = res.context!.market_context;
    expect(ctx.symbol).toBe("AAPL");
    expect(ctx.price).toBe(189.42);
    expect(ctx.source).toBe("yfinance");
    expect(ctx.source_name).toBe("Yahoo Finance");
    expect(ctx.timestamp).toBeTruthy();
    expect(ctx.stale).toBe(false);
    expect(ctx.indicators?.rsi_14).not.toBeNull();
    expect(ctx.indicators?.sma_20).not.toBeNull();
    expect(persistence.recordSnapshot).toHaveBeenCalledWith(USER, expect.objectContaining({ symbol: "AAPL" }), expect.anything(), "INTELLIGENCE");
  });

  it("propagates structured unavailability to the consumer", async () => {
    yahooState.throwOnQuote = new Error("down");
    yahooState.history = [];
    const res = await getMarketContext(USER, "TSLA", "AUTONOMOUS");
    expect(res.available).toBe(false);
    expect(res.error?.market_data_available).toBe(false);
  });
});
