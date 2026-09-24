/**
 * Phase A — intent firewall classification + transition rules.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  classifyGlobalIntent,
  shouldForcePassthroughTransition,
  intentFamily,
} from "./intent-firewall";
import {
  clearWorkingSet,
  getWorkingSet,
  planFromConversationContext,
  recordResearchResults,
  recordGlobalIntentFromText,
} from "./conversation-context";

describe("intent firewall — classifyGlobalIntent", () => {
  it("classifies movers / desk / earnings screen / technicals / hyp portfolio", () => {
    expect(
      classifyGlobalIntent(
        "Which names are ripping with high relative volume right now? Flag anything that looks like after-hours only.",
      ),
    ).toBe("MOVERS");
    expect(
      classifyGlobalIntent(
        "Compare Amazon, Disney, and Walmart on free cash flow, margins, and valuation.",
      ),
    ).toBe("DESK_COMPARE");
    expect(
      classifyGlobalIntent(
        "Identify three names reporting earnings within the next 4 days that tend to beat.",
      ),
    ).toBe("EARNINGS_SCREEN");
    expect(
      classifyGlobalIntent(
        "Walk NVIDIA's tape with RSI, MACD, SMAs, volume, and support and resistance.",
      ),
    ).toBe("TECHNICALS");
    expect(
      classifyGlobalIntent(
        "Imaginary $150,000 allocation in technology and healthcare — stress under rate hikes, inflation, and recession.",
      ),
    ).toBe("HYP_PORTFOLIO");
  });

  it("keeps earnings research family distinct from screen", () => {
    expect(classifyGlobalIntent("Run earnings candidate research on AAPL, MSFT")).toBe(
      "EARNINGS_RESEARCH",
    );
    expect(intentFamily("EARNINGS_SCREEN")).toBe("earnings");
    expect(intentFamily("EARNINGS_RESEARCH")).toBe("earnings");
  });
});

describe("intent firewall — transition passthrough", () => {
  const userId = "fw-user";
  const conversationId = "fw-conv";

  beforeEach(() => clearWorkingSet(userId, conversationId));

  it("forces passthrough when technicals follow earnings research scope", () => {
    const ws = getWorkingSet(userId, conversationId);
    recordResearchResults(
      ws,
      [
        { symbol: "ANEB", rawScore: 60, classification: "REJECT" },
        { symbol: "KMX", rawScore: 53, classification: "REJECT" },
      ],
      { lastHandler: "research" },
    );
    expect(ws.lastGlobalIntent).toBe("EARNINGS_RESEARCH");

    const tech =
      "Do a technical read on Tesla: RSI, MACD, moving averages, volume trend, support and resistance.";
    expect(shouldForcePassthroughTransition(tech, ws)).toBe(true);

    const plan = planFromConversationContext(tech, ws);
    expect(plan.kind).toBe("passthrough");
    if (plan.kind === "passthrough") {
      expect(plan.text).not.toMatch(/Run earnings candidate research/i);
      expect(plan.text).toMatch(/Tesla|RSI/i);
    }
  });

  it("forces passthrough when movers follow earnings scope", () => {
    const ws = getWorkingSet(userId, conversationId);
    recordResearchResults(
      ws,
      [{ symbol: "SNX", rawScore: 57, classification: "REJECT" }],
      { lastHandler: "earnings_day" },
    );
    const movers =
      "Show me today's biggest movers with a volume spike or above-average RVOL — say if any quotes are after-hours only.";
    expect(shouldForcePassthroughTransition(movers, ws)).toBe(true);
    expect(planFromConversationContext(movers, ws).kind).toBe("passthrough");
  });

  it("does not force passthrough for same-family earnings follow-up", () => {
    const ws = getWorkingSet(userId, conversationId);
    recordResearchResults(
      ws,
      [
        { symbol: "AAPL", rawScore: 80, classification: "WATCHLIST" },
        { symbol: "MSFT", rawScore: 70, classification: "WATCHLIST" },
      ],
      { lastHandler: "research" },
    );
    const follow = "Analyze those two with Rev-1 style research";
    expect(shouldForcePassthroughTransition(follow, ws)).toBe(false);
  });

  it("recordGlobalIntentFromText stamps movers after a movers turn", () => {
    const ws = getWorkingSet(userId, conversationId);
    recordGlobalIntentFromText(
      ws,
      "Which names are ripping with high relative volume right now?",
    );
    expect(ws.lastGlobalIntent).toBe("MOVERS");
  });
});
