/**
 * Phases C–F — routing finish, desk/movers depth, AH flags, hyp+FRED.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  classifyGlobalIntent,
  shouldForcePassthroughTransition,
} from "./intent-firewall";
import {
  clearWorkingSet,
  getWorkingSet,
  planFromConversationContext,
  recordResearchResults,
} from "./conversation-context";
import {
  formatHypotheticalPortfolioReply,
  parseHypotheticalHoldings,
  parseSectorSleeve,
  formatDeskCompareReply,
} from "./data-reply";
import { formatMarketMoversReply } from "./stock-discovery";
import type { GeneralMarketAnalysis } from "./general-market";
import type { IntelligenceBundle } from "../intelligence-data/types";
import type { SecCompanyFactsSummary } from "../intelligence-data/providers/edgar-facts";

function minimalAnalysis(overrides: Partial<GeneralMarketAnalysis> = {}): GeneralMarketAnalysis {
  return {
    market: "US",
    session: "REGULAR",
    asOf: "2026-09-24T20:00:00.000Z",
    indexes: [],
    sectors: [],
    breadth: {
      advancing: 0,
      declining: 0,
      unchanged: 0,
      scanned: 0,
      quoted: 0,
      advancingPct: null,
      classification: "MIXED",
    },
    volProxy: { symbol: "UVXY", dailyChangePct: null, available: false },
    spotVix: { symbol: "VIX", level: null, available: false },
    missingFields: [],
    analysisConfidence: 50,
    marketHealth: 50,
    healthComponents: {
      indexMomentum: 50,
      breadth: 50,
      volRegime: 50,
      sectorLeadership: 50,
    },
    regime: "SIDEWAYS",
    fredBrief: [],
    ...overrides,
  };
}

describe("Phase C — routing finish", () => {
  const userId = "cdef-user";
  const conversationId = "cdef-conv";

  beforeEach(() => clearWorkingSet(userId, conversationId));

  it("forces passthrough for UNKNOWN-ish fresh ask after earnings scope", () => {
    const ws = getWorkingSet(userId, conversationId);
    recordResearchResults(
      ws,
      [{ symbol: "AAPL", rawScore: 80, classification: "WATCHLIST" }],
      { lastHandler: "research" },
    );
    expect(ws.lastGlobalIntent).toBe("EARNINGS_RESEARCH");

    const ask = "Analyze the tape for unusual volume and momentum today";
    // May classify as MOVERS or UNKNOWN — either should not rewrite onto Rev-1.
    const plan = planFromConversationContext(ask, ws);
    expect(plan.kind).toBe("passthrough");
    if (plan.kind === "passthrough") {
      expect(plan.text).not.toMatch(/Run earnings candidate research/i);
    }
  });

  it("does not rewrite bare Analyze TICKER into Rev-1 without earnings language", () => {
    const ws = getWorkingSet(userId, conversationId);
    const plan = planFromConversationContext("Analyze AAPL", ws);
    expect(plan.kind).toBe("passthrough");
    if (plan.kind === "passthrough") {
      expect(plan.text).not.toMatch(/Run earnings candidate research/i);
    }
  });

  it("still keeps explicit earnings-candidate protocol handler-ready (passthrough)", () => {
    const ws = getWorkingSet(userId, conversationId);
    const plan = planFromConversationContext(
      "Run earnings candidate research on AAPL, MSFT",
      ws,
    );
    // Already-handler-ready prompts pass through unchanged (existing behavior).
    expect(plan.kind).toBe("passthrough");
    if (plan.kind === "passthrough") {
      expect(plan.text).toMatch(/Run earnings candidate research on AAPL, MSFT/i);
    }
  });
});

describe("Phase D — desk XBRL + movers drivers", () => {
  it("formatDeskCompareReply surfaces point XBRL when provided", () => {
    const facts: SecCompanyFactsSummary = {
      available: true,
      symbol: "AAPL",
      cik: "0000320193",
      facts: [],
      derived: {
        grossMargin: 0.45,
        operatingMargin: 0.3,
        netMargin: 0.25,
        currentRatio: 1.1,
        netCash: null,
        freeCashFlow: 1_000_000_000,
      },
      source: "SEC companyfacts",
    };
    const bundle: IntelligenceBundle = {
      query: "Compare AAPL and MSFT on margins",
      symbols: ["AAPL", "MSFT"],
      layers_routed: ["prices"],
      fetched_at: "2026-09-24T12:00:00.000Z",
      layers: [],
    };
    const reply = formatDeskCompareReply("Compare AAPL and MSFT on free cash flow and profitability", bundle, {
      AAPL: facts,
      MSFT: null,
    });
    expect(reply).toMatch(/Point fundamentals \(SEC XBRL/i);
    expect(reply).toMatch(/Gross margin: 45\.0%/);
    expect(reply).toMatch(/Free cash flow: \$1,000,000,000/);
    expect(reply).toMatch(/WAIT/);
  });

  it("formatMarketMoversReply includes driver WAIT and session tags", () => {
    const reply = formatMarketMoversReply(
      minimalAnalysis({ session: "AFTER_HOURS", marketHealth: 55 }),
      {
        asOf: "2026-09-24T20:00:00.000Z",
        scanned: 36,
        gainers: [
          {
            symbol: "META",
            sectorEtf: "XLC",
            sectorLabel: "Comm",
            price: 500,
            dailyChangePct: 2,
            relativeStrengthVsSpy: null,
            rsi14: 60,
            relativeVolume: 1.2,
            score: 20,
            risk: "MODERATE",
            reasons: [],
            source: "Yahoo Finance",
            timestamp: "2026-09-24T20:00:00.000Z",
            stale: false,
            available: true,
            marketSession: "AFTER_HOURS",
            driverHeadline: null,
          },
        ],
        losers: [],
      },
    );
    expect(reply).toMatch(/META/);
    expect(reply).toMatch(/after-hours/i);
    expect(reply).toMatch(/Driver \/ catalyst: \*\*WAIT\*\*/i);
  });
});

describe("Phase E — empty AH disclosure", () => {
  it("discloses when AH scan has no movers", () => {
    const reply = formatMarketMoversReply(
      minimalAnalysis({
        session: "AFTER_HOURS",
        asOf: "2026-09-24T23:00:00.000Z",
        indexes: [
          {
            symbol: "SPY",
            price: 500,
            dailyChangePct: -0.2,
            available: true,
            stale: false,
            source: "Yahoo",
            session: "AFTER_HOURS",
            timestamp: "2026-09-24T23:00:00.000Z",
            rsi14: null,
            relativeVolume: null,
          },
        ],
      }),
      { asOf: "2026-09-24T23:00:00.000Z", scanned: 36, gainers: [], losers: [] },
    );
    expect(reply).toMatch(/Extended \/ closed session note/i);
    expect(reply).toMatch(/SPY/);
  });
});

describe("Phase F — hyp portfolio + holdings + FRED", () => {
  it("parses explicit holdings with weights", () => {
    const holdings = parseHypotheticalHoldings(
      "Imaginary $100,000 book: AAPL 40%, MSFT 35%, UNH 25% stress under rate hikes",
    );
    expect(holdings.map((h) => h.symbol).sort()).toEqual(["AAPL", "MSFT", "UNH"]);
    expect(holdings.find((h) => h.symbol === "AAPL")?.weightPct).toBe(40);
    expect(holdings.find((h) => h.symbol === "MSFT")?.weightPct).toBe(35);
  });

  it("parses client Prompt 5 sector sleeve + declining rates", () => {
    const q =
      "Analyze how a hypothetical $100,000 portfolio consisting of 40% technology stocks, 30% financial stocks, 20% healthcare stocks, and 10% cash could perform under three economic scenarios: declining interest rates, persistent inflation, and an economic recession.";
    const sleeve = parseSectorSleeve(q);
    expect(sleeve.find((s) => s.key === "technology")?.weightPct).toBe(40);
    expect(sleeve.find((s) => s.key === "financials")?.weightPct).toBe(30);
    expect(sleeve.find((s) => s.key === "healthcare")?.weightPct).toBe(20);
    expect(sleeve.find((s) => s.key === "cash")?.weightPct).toBe(10);

    const reply = formatHypotheticalPortfolioReply(q, {
      fredBrief: ["Federal Funds Rate: 3.63 (as of 2026-08-01)"],
    });
    expect(reply).toMatch(/40%/);
    expect(reply).toMatch(/Financials/i);
    expect(reply).toMatch(/Declining interest rates/i);
    expect(reply).toMatch(/Persistent inflation/i);
    expect(reply).toMatch(/Economic recession/i);
    expect(reply).toMatch(/Economic indicators to monitor/i);
    expect(reply).not.toMatch(/Rising interest rates:/);
    expect(reply).toMatch(/not\*\* your live broker/i);
  });

  it("formatHypotheticalPortfolioReply lists holdings and FRED brief", () => {
    const reply = formatHypotheticalPortfolioReply(
      "Paper $80,000 in technology and healthcare — stress under inflation",
      {
        holdings: [
          { symbol: "AAPL", weightPct: 50 },
          { symbol: "UNH", weightPct: 50 },
        ],
        fredBrief: ["Federal Funds Rate: 5.25 (as of 2026-09-01)"],
      },
    );
    expect(reply).toMatch(/named holdings/i);
    expect(reply).toMatch(/AAPL.*50%/);
    expect(reply).toMatch(/Federal Funds Rate/);
    expect(reply).toMatch(/RESEARCH ONLY/);
    expect(reply).toMatch(/not\*\* your live broker/i);
  });
});

describe("Phase C classifier sanity", () => {
  it("still classifies hard intents", () => {
    expect(
      classifyGlobalIntent(
        "Which names are ripping with high relative volume right now?",
      ),
    ).toBe("MOVERS");
    expect(
      shouldForcePassthroughTransition(
        "Walk NVIDIA's tape with RSI and MACD",
        {
          lastGlobalIntent: "EARNINGS_RESEARCH",
          lastHandler: "research",
          active: [{ symbol: "AAPL" }],
          ranked: [],
        },
      ),
    ).toBe(true);
  });
});
