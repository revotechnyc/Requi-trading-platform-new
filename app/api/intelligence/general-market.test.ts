import { describe, expect, it } from "vitest";
import {
  classifyMarketIntelligenceIntent,
  isDiscoveryFollowUpQuery,
  isGeneralMarketQuery,
  isInternationalMarketQuery,
  isMarketMoversQuery,
  isRiskTodayQuery,
  isSectorLeadingQuery,
  isStockDiscoveryQuery,
} from "./market-intent";
import {
  calculateMarketHealthV1,
  classifyMarketRegimeV1,
  formatGeneralMarketReply,
  type GeneralMarketAnalysis,
} from "./general-market";
import { formatMarketMoversReply, formatStockDiscoveryReply } from "./stock-discovery";

describe("market-intent (Client Rev 9/14)", () => {
  it("classifies general market beginner asks", () => {
    expect(classifyMarketIntelligenceIntent("How's the market today?")).toBe("GENERAL_MARKET");
    expect(classifyMarketIntelligenceIntent("How is the market?")).toBe("GENERAL_MARKET");
    expect(isGeneralMarketQuery("Is the market good today?")).toBe(true);
  });

  it("classifies stock discovery without requiring a ticker", () => {
    expect(classifyMarketIntelligenceIntent("What should I buy today?")).toBe("STOCK_DISCOVERY");
    expect(classifyMarketIntelligenceIntent("What should I buy today")).toBe("STOCK_DISCOVERY");
    expect(classifyMarketIntelligenceIntent("What stock should I buy today?")).toBe("STOCK_DISCOVERY");
    expect(isStockDiscoveryQuery("What should I buy today?")).toBe(true);
  });

  it("classifies market movers", () => {
    expect(classifyMarketIntelligenceIntent("What's moving?")).toBe("MARKET_MOVERS");
    expect(isMarketMoversQuery("What's hot today?")).toBe(true);
  });

  it("prefers discovery when buy + movers combined", () => {
    expect(classifyMarketIntelligenceIntent("What's moving? What should I buy today?")).toBe("STOCK_DISCOVERY");
  });

  it("does not US-default international override asks", () => {
    expect(isInternationalMarketQuery("How is Japan doing?")).toBe(true);
    expect(classifyMarketIntelligenceIntent("How is Japan doing?")).toBeNull();
  });

  it("detects discovery follow-up prompts (Pack D2)", () => {
    expect(isDiscoveryFollowUpQuery("Why is the top one ranked first?")).toBe(true);
    expect(isDiscoveryFollowUpQuery("Which of those is riskiest?")).toBe(true);
  });

  it("detects sector leading and risk-today prompts (Script 1)", () => {
    expect(classifyMarketIntelligenceIntent("What's leading?")).toBe("GENERAL_MARKET");
    expect(isSectorLeadingQuery("What's leading?")).toBe(true);
    expect(isRiskTodayQuery("Is it risky today?")).toBe(true);
  });
});

describe("Market Health V1 (Pack B4)", () => {
  it("computes weighted score from fixture components", () => {
    const { score, components } = calculateMarketHealthV1({
      indexReturns: [1.0, 0.8, 0.5, 0.6],
      sectorSnapshots: [
        { symbol: "XLK", label: "Technology", dailyChangePct: 1.2, available: true },
        { symbol: "XLF", label: "Financials", dailyChangePct: 0.4, available: true },
        { symbol: "XLE", label: "Energy", dailyChangePct: -0.2, available: true },
      ],
      volProxyDailyPct: 0.5,
      spyRsi: 58,
      spyRelativeVolume: 1.1,
      fredAvailable: true,
    });
    expect(components.indexTrend).toBeGreaterThan(50);
    expect(score).toBeGreaterThan(50);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("maps health to regime labels", () => {
    expect(classifyMarketRegimeV1(82, 0.3)).toBe("STRONG_BULL");
    expect(classifyMarketRegimeV1(72, 0.3)).toBe("BULL");
    expect(classifyMarketRegimeV1(55, 0.3)).toBe("MIXED");
    expect(classifyMarketRegimeV1(35, 0.3)).toBe("CAUTIOUS_BEAR");
    expect(classifyMarketRegimeV1(60, 5.0)).toBe("HIGH_VOLATILITY");
  });
});

function fixtureAnalysis(overrides: Partial<GeneralMarketAnalysis> = {}): GeneralMarketAnalysis {
  return {
    market: "US",
    session: "REGULAR",
    asOf: "2026-09-15T20:00:00.000Z",
    indexes: [
      {
        symbol: "SPY",
        price: 560.12,
        dailyChangePct: 0.65,
        source: "Yahoo Finance",
        timestamp: "2026-09-15T20:00:00.000Z",
        session: "REGULAR",
        stale: false,
        available: true,
        rsi14: 55,
        relativeVolume: 1.05,
      },
      {
        symbol: "QQQ",
        price: 480.5,
        dailyChangePct: 0.9,
        source: "Yahoo Finance",
        timestamp: "2026-09-15T20:00:00.000Z",
        session: "REGULAR",
        stale: false,
        available: true,
        rsi14: null,
        relativeVolume: null,
      },
    ],
    sectors: [
      { symbol: "XLK", label: "Technology", dailyChangePct: 1.1, available: true },
      { symbol: "XLE", label: "Energy", dailyChangePct: -0.4, available: true },
    ],
    volProxy: { symbol: "VIXY", dailyChangePct: -0.8, available: true },
    missingFields: ["DIA quote"],
    analysisConfidence: 78,
    marketHealth: 64,
    healthComponents: {
      indexTrend: 66,
      breadth: 100,
      sector: 50,
      volatility: 70,
      momentum: 56,
      volume: 52,
      macro: 60,
    },
    regime: "CAUTIOUS_BULL",
    fredBrief: ["Federal Funds Rate: 4.33 (as of 2026-08-01)"],
    ...overrides,
  };
}

describe("general-market formatters", () => {
  it("formats general market with health, regime, and indexes", () => {
    const reply = formatGeneralMarketReply(fixtureAnalysis());
    expect(reply).toMatch(/US market snapshot/i);
    expect(reply).toMatch(/Market Health.*64\/100/i);
    expect(reply).toMatch(/CAUTIOUS BULL/i);
    expect(reply).toMatch(/SPY.*\$560\.12/i);
    expect(reply).toMatch(/\+0\.65%/);
    expect(reply).not.toMatch(/UNVERIFIED/i);
  });

  it("formats Phase 2 stock discovery table from engine output", () => {
    const reply = formatStockDiscoveryReply(fixtureAnalysis(), {
      asOf: "2026-09-15T20:00:00.000Z",
      regime: "CAUTIOUS_BULL",
      marketHealth: 64,
      focusSectors: [{ symbol: "XLK", label: "Technology", dailyChangePct: 1.1 }],
      scanned: 20,
      missingFields: [],
      candidates: [
        {
          symbol: "NVDA",
          sectorEtf: "XLK",
          sectorLabel: "Technology",
          price: 180,
          dailyChangePct: 1.5,
          relativeStrengthVsSpy: 0.85,
          rsi14: 58,
          relativeVolume: 1.2,
          score: 72,
          risk: "MODERATE",
          reasons: ["momentum band"],
          source: "Yahoo Finance",
          timestamp: "2026-09-15T20:00:00.000Z",
          stale: false,
          available: true,
        },
      ],
    });
    expect(reply).toMatch(/engine ranked/i);
    expect(reply).toMatch(/NVDA/);
    expect(reply).not.toMatch(/WAIT — Phase 2/i);
  });

  it("formats Phase 2 market movers from verified scan", () => {
    const reply = formatMarketMoversReply(fixtureAnalysis(), {
      asOf: "2026-09-15T20:00:00.000Z",
      scanned: 30,
      gainers: [
        {
          symbol: "XOM",
          sectorEtf: "XLE",
          sectorLabel: "Energy",
          price: 112,
          dailyChangePct: 2.1,
          relativeStrengthVsSpy: null,
          rsi14: null,
          relativeVolume: 1.3,
          score: 21,
          risk: "MODERATE",
          reasons: [],
          source: "Yahoo Finance",
          timestamp: "2026-09-15T20:00:00.000Z",
          stale: false,
          available: true,
        },
      ],
      losers: [],
    });
    expect(reply).toMatch(/liquid stocks/i);
    expect(reply).toMatch(/XOM/);
    expect(reply).not.toMatch(/WAIT — Phase 2/i);
  });
});
