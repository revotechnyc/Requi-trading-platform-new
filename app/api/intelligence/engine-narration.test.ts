import { describe, expect, it } from "vitest";
import {
  buildDiscoveryNarrationPayload,
  formatConversationalEngineReply,
  looksLikeProtocolDump,
  shouldRejectEngineNarration,
} from "./engine-narration";
import type { GeneralMarketAnalysis } from "./general-market";
import type { StockDiscoveryResult } from "./stock-discovery";

function fixtureAnalysis(): GeneralMarketAnalysis {
  return {
    asOf: "2026-09-18T20:00:00.000Z",
    session: "REGULAR",
    regime: "SIDEWAYS",
    marketHealth: 40,
    analysisConfidence: 72,
    indexes: [
      {
        symbol: "SPY",
        price: 560,
        dailyChangePct: -0.12,
        source: "Yahoo Finance",
        timestamp: "2026-09-18T20:00:00.000Z",
        session: "REGULAR",
        stale: false,
        available: true,
        rsi14: 50,
        relativeVolume: 1,
      },
    ],
    sectors: [],
    spotVix: null,
    macro: null,
    breadth: null,
    components: {
      indexTrend: 50,
      breadth: 40,
      sector: 45,
      volatility: 55,
      momentum: 48,
      volume: 50,
      macro: 50,
    },
  };
}

function fixtureDiscovery(): StockDiscoveryResult {
  return {
    asOf: "2026-09-18T20:00:00.000Z",
    regime: "SIDEWAYS",
    marketHealth: 40,
    focusSectors: [{ symbol: "XLK", label: "Technology", dailyChangePct: 0.11 }],
    scanned: 22,
    missingFields: [],
    candidates: [
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
        risk: "MODERATE",
        reasons: ["outperforming SPY by 2.35%"],
        source: "Yahoo Finance",
        timestamp: "2026-09-18T17:54:52.000Z",
        stale: false,
        available: true,
      },
      {
        symbol: "AMD",
        sectorEtf: "XLK",
        sectorLabel: "Technology",
        price: 545.84,
        dailyChangePct: 0.14,
        relativeStrengthVsSpy: 0.26,
        rsi14: 63,
        relativeVolume: 0.74,
        score: 72,
        risk: "MODERATE",
        reasons: ["RSI 63.0 in momentum band"],
        source: "Yahoo Finance",
        timestamp: "2026-09-18T17:54:49.000Z",
        stale: false,
        available: true,
      },
    ],
  };
}

describe("formatConversationalEngineReply", () => {
  it("narrates quant scan in prose without markdown report headers", () => {
    const payload = buildDiscoveryNarrationPayload(
      "Run a full quantitative market scan",
      fixtureAnalysis(),
      fixtureDiscovery(),
      "stock-discovery-console-quant",
      "quant",
    );
    const reply = formatConversationalEngineReply(payload);
    expect(reply).toMatch(/MU/);
    expect(reply).toMatch(/89\/100/);
    expect(reply).toMatch(/AMD/);
    expect(reply).toMatch(/REOS\/ERS were \*\*not\*\* calculated/i);
    expect(reply).not.toMatch(/^###/m);
    expect(reply).not.toMatch(/Ranked candidates \(top/i);
    expect(reply).not.toMatch(/Quantitative US scan — engine ranked/i);
  });

  it("narrates simple depth as one lead name", () => {
    const payload = buildDiscoveryNarrationPayload(
      "Help me find a trading opportunity",
      fixtureAnalysis(),
      fixtureDiscovery(),
      "stock-discovery-console-simple",
      "simple",
    );
    const reply = formatConversationalEngineReply(payload);
    expect(reply).toMatch(/One name that stood out on this pass is \*\*MU\*\*/);
    expect(reply).toMatch(/second look.*AMD/i);
    expect(reply).not.toMatch(/Ranked candidates/i);
  });
});

describe("looksLikeProtocolDump", () => {
  it("flags markdown report-card output", () => {
    expect(looksLikeProtocolDump("### Ranked candidates (top 5)")).toBe(true);
    expect(looksLikeProtocolDump("**Quantitative US scan — engine ranked**")).toBe(true);
    expect(looksLikeProtocolDump("The top name is MU at $999 — research only.")).toBe(false);
  });
});

describe("shouldRejectEngineNarration", () => {
  it("rejects portfolio / chart / attachment stalls", () => {
    expect(
      shouldRejectEngineNarration(
        "I don't have current market data or a verified portfolio. Naming a ticker would risk inventing.",
      ),
    ).toBe(true);
    expect(
      shouldRejectEngineNarration(
        "If you can attach a chart or option chain, I can rank setups more carefully.",
      ),
    ).toBe(true);
    expect(
      shouldRejectEngineNarration(
        "Here's a simple read — **MU** at $999.28 (+2.23%). Research only.",
      ),
    ).toBe(false);
  });
});
