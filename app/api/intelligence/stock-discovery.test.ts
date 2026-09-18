import { describe, expect, it } from "vitest";
import type { GeneralMarketAnalysis } from "./general-market";
import {
  buildDiscoveryCandidatePool,
  computeCandidateRiskScore,
  formatDiscoveryRankExplain,
  formatDiscoverySymbolExplain,
  formatStockDiscoveryReply,
  pickRiskiestCandidate,
  scoreDiscoveryCandidate,
  selectFocusSectorEtfs,
  clearStockDiscoveryCache,
} from "./stock-discovery";

function fixtureAnalysis(overrides: Partial<GeneralMarketAnalysis> = {}): GeneralMarketAnalysis {
  return {
    market: "US",
    session: "REGULAR",
    asOf: "2026-09-15T20:00:00.000Z",
    indexes: [
      {
        symbol: "SPY",
        price: 560,
        dailyChangePct: -0.5,
        source: "Yahoo Finance",
        timestamp: "2026-09-15T20:00:00.000Z",
        session: "REGULAR",
        stale: false,
        available: true,
        rsi14: 48,
        relativeVolume: 1.0,
      },
    ],
    breadth: {
      advancing: 8,
      declining: 20,
      unchanged: 8,
      scanned: 36,
      quoted: 36,
      pctAdvancing: 22.2,
      advanceDeclineRatio: 0.4,
      classification: "VERY_WEAK",
      universeLabel: "liquid US equities (36-name sample)",
      available: true,
      asOf: "2026-09-15T20:00:00.000Z",
    },
    sectors: [
      { symbol: "XLE", label: "Energy", dailyChangePct: 2.1, available: true },
      { symbol: "XLK", label: "Technology", dailyChangePct: -0.2, available: true },
      { symbol: "XLY", label: "Cons. Discretionary", dailyChangePct: -1.3, available: true },
      { symbol: "XLP", label: "Cons. Staples", dailyChangePct: 0.1, available: true },
      { symbol: "XLV", label: "Health Care", dailyChangePct: -0.04, available: true },
    ],
    volProxy: { symbol: "VIXY", dailyChangePct: 0.5, available: true },
    spotVix: {
      symbol: "^VIX",
      level: 18,
      dailyChangePct: 0.2,
      classification: "NORMAL",
      source: "Yahoo Finance",
      timestamp: "2026-09-15T20:00:00.000Z",
      stale: false,
      available: true,
    },
    missingFields: [],
    analysisConfidence: 90,
    marketHealth: 32,
    healthComponents: {
      indexTrend: 33,
      breadth: 0,
      sector: 18,
      volatility: 70,
      momentum: 43,
      volume: 34,
      macro: 60,
    },
    regime: "CAUTIOUS_BEAR",
    fredBrief: [],
    ...overrides,
  };
}

describe("stock-discovery Phase 2", () => {
  it("selects leading sectors and adds defensive tilt in bear regimes", () => {
    const etfs = selectFocusSectorEtfs(fixtureAnalysis());
    expect(etfs).toContain("XLE");
    expect(etfs.some((e) => ["XLP", "XLV", "XLU"].includes(e))).toBe(true);
  });

  it("builds candidate pool only from mapped liquid symbols", () => {
    const pool = buildDiscoveryCandidatePool(["XLE", "XLK"]);
    expect(pool.length).toBeGreaterThan(0);
    expect(pool).toContain("XOM");
    expect(pool).toContain("NVDA");
    expect(pool.every((s) => /^[A-Z]{1,5}$/.test(s))).toBe(true);
  });

  it("scores momentum + relative strength vs SPY", () => {
    const strong = scoreDiscoveryCandidate({
      metrics: {
        symbol: "XOM",
        price: 110,
        dailyChangePct: 2.5,
        rsi14: 58,
        relativeVolume: 1.6,
        source: "Yahoo Finance",
        timestamp: "2026-09-15T20:00:00.000Z",
        stale: false,
        available: true,
      },
      sectorEtf: "XLE",
      sectorLeader: true,
      spyDailyChangePct: -0.5,
      regime: "CAUTIOUS_BEAR",
    });
    const weak = scoreDiscoveryCandidate({
      metrics: {
        symbol: "NKE",
        price: 80,
        dailyChangePct: -2.0,
        rsi14: 78,
        relativeVolume: 0.5,
        source: "Yahoo Finance",
        timestamp: "2026-09-15T20:00:00.000Z",
        stale: false,
        available: true,
      },
      sectorEtf: "XLY",
      sectorLeader: false,
      spyDailyChangePct: -0.5,
      regime: "CAUTIOUS_BEAR",
    });
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.reasons.some((r) => /outperforming SPY/i.test(r))).toBe(true);
  });

  it("explains top rank from engine factors (Pack D2)", () => {
    const explain = formatDiscoveryRankExplain(
      [
        {
          symbol: "XOM",
          sectorEtf: "XLE",
          sectorLabel: "Energy",
          price: 112.5,
          dailyChangePct: 2.2,
          relativeStrengthVsSpy: 2.7,
          rsi14: 56,
          relativeVolume: 1.4,
          score: 78,
          risk: "MODERATE",
          reasons: ["outperforming SPY by 2.70%"],
          source: "Yahoo Finance",
          timestamp: "2026-09-15T20:00:00.000Z",
          stale: false,
          available: true,
        },
      ],
      "top",
    );
    expect(explain).toMatch(/ranked #1/i);
    expect(explain).toMatch(/78\/100/);
    expect(explain).not.toMatch(/UNVERIFIED/i);
  });

  it("explains a named symbol rank from fresh engine order (Why is MU ranked first)", () => {
    const sorted = [
      {
        symbol: "MU",
        sectorEtf: "XLK",
        sectorLabel: "Technology",
        price: 999.28,
        dailyChangePct: 2.23,
        relativeStrengthVsSpy: 2.35,
        rsi14: 56.4,
        relativeVolume: 0.77,
        score: 89,
        risk: "MODERATE" as const,
        reasons: ["outperforming SPY by 2.35%"],
        source: "Yahoo Finance",
        timestamp: "2026-09-18T17:54:52.000Z",
        stale: false,
        available: true,
      },
      {
        symbol: "TXN",
        sectorEtf: "XLK",
        sectorLabel: "Technology",
        price: 263.12,
        dailyChangePct: 1.93,
        relativeStrengthVsSpy: 2.05,
        rsi14: 48.1,
        relativeVolume: 0.58,
        score: 66,
        risk: "MODERATE" as const,
        reasons: ["outperforming SPY by 2.05%"],
        source: "Yahoo Finance",
        timestamp: "2026-09-18T17:54:53.000Z",
        stale: false,
        available: true,
      },
    ];
    const explain = formatDiscoverySymbolExplain(sorted[0]!, 1, sorted);
    expect(explain).toMatch(/Why MU is ranked #1/i);
    expect(explain).toMatch(/89\/100/);
    expect(explain).not.toMatch(/TXN ranked #1/i);
  });

  it("formats ranked discovery without inventing names outside engine output", () => {
    clearStockDiscoveryCache();
    const reply = formatStockDiscoveryReply(fixtureAnalysis(), {
      asOf: "2026-09-15T20:00:00.000Z",
      regime: "CAUTIOUS_BEAR",
      marketHealth: 32,
      focusSectors: [{ symbol: "XLE", label: "Energy", dailyChangePct: 2.1 }],
      scanned: 18,
      missingFields: [],
      candidates: [
        {
          symbol: "XOM",
          sectorEtf: "XLE",
          sectorLabel: "Energy",
          price: 112.5,
          dailyChangePct: 2.2,
          relativeStrengthVsSpy: 2.7,
          rsi14: 56,
          relativeVolume: 1.4,
          score: 78,
          risk: "MODERATE",
          reasons: ["outperforming SPY by 2.70%", "in leading sector XLE"],
          source: "Yahoo Finance",
          timestamp: "2026-09-15T20:00:00.000Z",
          stale: false,
          available: true,
        },
      ],
    });
    expect(reply).toMatch(/engine ranked/i);
    expect(reply).toMatch(/XOM.*78\/100/i);
    expect(reply).toMatch(/RESEARCH ONLY/i);
    expect(reply).not.toMatch(/I('d| would) buy/i);
  });

  it("formats Console simple depth as one name without inventing tickers", () => {
    const reply = formatStockDiscoveryReply(
      fixtureAnalysis(),
      {
        asOf: "2026-09-15T20:00:00.000Z",
        regime: "CAUTIOUS_BEAR",
        marketHealth: 32,
        focusSectors: [{ symbol: "XLE", label: "Energy", dailyChangePct: 2.1 }],
        scanned: 18,
        missingFields: [],
        candidates: [
          {
            symbol: "XOM",
            sectorEtf: "XLE",
            sectorLabel: "Energy",
            price: 112.5,
            dailyChangePct: 2.2,
            relativeStrengthVsSpy: 2.7,
            rsi14: 56,
            relativeVolume: 1.4,
            score: 78,
            risk: "MODERATE",
            reasons: ["outperforming SPY by 2.70%"],
            source: "Yahoo Finance",
            timestamp: "2026-09-15T20:00:00.000Z",
            stale: false,
            available: true,
          },
          {
            symbol: "CVX",
            sectorEtf: "XLE",
            sectorLabel: "Energy",
            price: 155,
            dailyChangePct: 1.1,
            relativeStrengthVsSpy: 1.6,
            rsi14: 54,
            relativeVolume: 1.1,
            score: 70,
            risk: "MODERATE",
            reasons: ["in leading sector XLE"],
            source: "Yahoo Finance",
            timestamp: "2026-09-15T20:00:00.000Z",
            stale: false,
            available: true,
          },
        ],
      },
      { depth: "simple" },
    );
    expect(reply).toMatch(/\*\*XOM\*\*/);
    expect(reply).toMatch(/Yahoo Finance/);
    expect(reply).toMatch(/brokerage account is not required/i);
    expect(reply).not.toMatch(/\bSCAN\b/);
    expect(reply).not.toMatch(/DATA_UNAVAILABLE/i);
    expect(reply).not.toMatch(/UNVERIFIED/i);
  });

  it("formats Console quant depth with WAIT on EV/REOS, not invented numbers", () => {
    const reply = formatStockDiscoveryReply(
      fixtureAnalysis(),
      {
        asOf: "2026-09-15T20:00:00.000Z",
        regime: "CAUTIOUS_BEAR",
        marketHealth: 32,
        focusSectors: [{ symbol: "XLE", label: "Energy", dailyChangePct: 2.1 }],
        scanned: 18,
        missingFields: [],
        candidates: [
          {
            symbol: "XOM",
            sectorEtf: "XLE",
            sectorLabel: "Energy",
            price: 112.5,
            dailyChangePct: 2.2,
            relativeStrengthVsSpy: 2.7,
            rsi14: 56,
            relativeVolume: 1.4,
            score: 78,
            risk: "MODERATE",
            reasons: ["outperforming SPY by 2.70%"],
            source: "Yahoo Finance",
            timestamp: "2026-09-15T20:00:00.000Z",
            stale: false,
            available: true,
          },
        ],
      },
      { depth: "quant" },
    );
    expect(reply).toMatch(/\*\*XOM\*\*/);
    expect(reply).toMatch(/78\/100/);
    expect(reply).toMatch(/Calibrated probability:\*\* \*\*WAIT/i);
    expect(reply).toMatch(/REOS \/ ERS:\*\* \*\*WAIT/i);
    expect(reply).not.toMatch(/DATA_UNAVAILABLE/i);
    expect(reply).not.toMatch(/\bSCAN\b/);
    expect(reply).not.toMatch(/\bVALUE\b/);
  });

  it("riskiest is not the top discovery rank — GE beats XOM on live-style fixture", () => {
    const list = [
      {
        symbol: "XOM",
        sectorEtf: "XLE",
        sectorLabel: "Energy",
        price: 169.29,
        dailyChangePct: 2.55,
        relativeStrengthVsSpy: 3.04,
        rsi14: 65.7,
        relativeVolume: 0.42,
        score: 82,
        risk: "MODERATE" as const,
        reasons: ["outperforming SPY"],
        source: "Yahoo Finance",
        timestamp: "2026-09-15T17:33:18.000Z",
        stale: false,
        available: true,
      },
      {
        symbol: "GE",
        sectorEtf: "XLB",
        sectorLabel: "Materials",
        price: 308.57,
        dailyChangePct: -2.83,
        relativeStrengthVsSpy: -2.34,
        rsi14: 27.4,
        relativeVolume: 0.7,
        score: 43,
        risk: "HIGH" as const,
        reasons: ["oversold bounce watch"],
        source: "Yahoo Finance",
        timestamp: "2026-09-15T17:33:10.000Z",
        stale: false,
        available: true,
      },
      {
        symbol: "WMT",
        sectorEtf: "XLP",
        sectorLabel: "Cons. Staples",
        price: 108.68,
        dailyChangePct: -0.37,
        relativeStrengthVsSpy: 0.12,
        rsi14: 51.1,
        relativeVolume: 0.31,
        score: 49,
        risk: "LOW" as const,
        reasons: ["defensive"],
        source: "Yahoo Finance",
        timestamp: "2026-09-15T17:33:12.000Z",
        stale: false,
        available: true,
      },
    ];
    expect(pickRiskiestCandidate(list).symbol).toBe("GE");
    expect(computeCandidateRiskScore(list[1]!)).toBeGreaterThan(computeCandidateRiskScore(list[0]!));

    const reply = formatDiscoveryRankExplain(list, "riskiest");
    expect(reply).toMatch(/Riskiest.*GE/i);
    expect(reply).not.toMatch(/Riskiest.*XOM/i);
    expect(reply).toMatch(/rank #1 is \*\*not\*\* the same as highest risk/i);
  });
});
