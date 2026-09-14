import { describe, expect, it, beforeEach } from "vitest";
import {
  applyActiveSubset,
  clearWorkingSet,
  formatSelectAfterRankReply,
  getReferentialTarget,
  getWorkingSet,
  hasReferentialLanguage,
  parseQuantity,
  planFromConversationContext,
  recordResearchResults,
  setActiveEntities,
} from "./conversation-context";

describe("conversation context orchestrator", () => {
  const userId = "test-user-ctx";
  const conversationId = "conv-ctx-1";

  const SYMS = ["CODA", "CBRL", "IVDN", "KAVL", "KARX", "HAIN", "GFAI", "EBZT", "HYSR", "HYFT", "CLSD", "BRRE"];

  function seedRankedResearch() {
    const ws = getWorkingSet(userId, conversationId);
    recordResearchResults(
      ws,
      SYMS.map((s, i) => ({
        symbol: s,
        rawScore: 100 - i * 5,
        classification: i === 0 ? "WATCHLIST" : "WAIT",
      })),
    );
    return ws;
  }

  beforeEach(() => {
    clearWorkingSet(userId, conversationId);
  });

  it("parseQuantity handles natural phrasing", () => {
    expect(parseQuantity("Which three look strongest?")).toBe(3);
    expect(parseQuantity("Give me the top 5")).toBe(5);
    expect(parseQuantity("Focus on a couple")).toBe(2);
    expect(parseQuantity("those two")).toBe(2);
  });

  it("detects referential language from client examples", () => {
    expect(hasReferentialLanguage("Analyze those tickers.")).toBe(true);
    expect(hasReferentialLanguage("Which three look strongest?")).toBe(true);
    expect(hasReferentialLanguage("Go deeper on those.")).toBe(true);
    expect(hasReferentialLanguage("Rank them based on the analysis.")).toBe(true);
    expect(hasReferentialLanguage("i want only the three whihc is top")).toBe(true);
    expect(hasReferentialLanguage("I want only the top three")).toBe(true);
  });

  it("natural 'want only top three' select without scores uses rank path (not LLM passthrough)", () => {
    const ws = getWorkingSet(userId, conversationId);
    setActiveEntities(ws, ["HERE", "GIS", "VRA", "EPM", "FPS"], {
      handler: "earnings_day",
      asRanked: true,
    });
    const plan = planFromConversationContext("i want only the three whihc is top", ws);
    expect(plan.kind).toBe("rewrite");
    if (plan.kind !== "rewrite") return;
    expect(plan.intent).toBe("select");
    expect(plan.action).toBe("rank");
    expect(plan.targetSymbols?.length).toBe(5);
    expect(plan.nextActive?.length).toBe(3);
  });

  it("parseQuantity handles want/keep only top-N phrasing", () => {
    expect(parseQuantity("i want only the three whihc is top")).toBe(3);
    expect(parseQuantity("I want only the top three")).toBe(3);
    expect(parseQuantity("keep only the top 3")).toBe(3);
  });

  it("client workflow: rank → select top 3 → go deeper uses 3 not 12", () => {
    const ws = seedRankedResearch();
    expect(ws.active.length).toBe(12);

    const rankPlan = planFromConversationContext("Rank them based on the analysis.", ws);
    expect(rankPlan.kind).toBe("reply");

    const selectPlan = planFromConversationContext("Which three look strongest?", ws);
    expect(selectPlan.kind).toBe("reply");
    if (selectPlan.kind === "reply") {
      expect(selectPlan.applyActive.map((e) => e.symbol)).toEqual(["CODA", "CBRL", "IVDN"]);
      applyActiveSubset(ws, selectPlan.applyActive, "select");
    }
    expect(ws.active.length).toBe(3);
    expect(ws.ranked.length).toBe(12);
    expect(getReferentialTarget(ws).map((e) => e.symbol)).toEqual(["CODA", "CBRL", "IVDN"]);

    const deeperPlan = planFromConversationContext("Go deeper on those.", ws);
    expect(deeperPlan.kind).toBe("rewrite");
    if (deeperPlan.kind === "rewrite") {
      expect(deeperPlan.intent).toBe("go_deeper");
      expect(deeperPlan.text).toMatch(/Run earnings candidate research on CODA, CBRL, IVDN/i);
      expect(deeperPlan.text).not.toMatch(/KAVL/);
      expect(deeperPlan.targetSymbols).toEqual(["CODA", "CBRL", "IVDN"]);
    }
  });

  it("select top-N without cached scores rewrites to rank the full universe (not a silent empty select)", () => {
    const ws = getWorkingSet(userId, conversationId);
    // Calendar-style set: symbols present, no partial scores yet.
    setActiveEntities(ws, ["HERE", "GIS", "VRA", "EPM", "FPS"], {
      handler: "earnings_day",
      asRanked: true,
    });
    expect(ws.ranked.every((e) => e.score == null)).toBe(true);

    const plan = planFromConversationContext("Keep the top 3 only", ws);
    expect(plan.kind).toBe("rewrite");
    if (plan.kind !== "rewrite") return;
    expect(plan.intent).toBe("select");
    expect(plan.action).toBe("rank");
    expect(plan.targetSymbols).toEqual(["HERE", "GIS", "VRA", "EPM", "FPS"]);
    expect(plan.nextActive?.map((e) => e.symbol)).toEqual(["HERE", "GIS", "VRA"]);
    expect(plan.text).toMatch(/Run earnings candidate research on HERE, GIS, VRA, EPM, FPS/i);
  });

  it("formatSelectAfterRankReply returns short selection card — not full Rev-1 dump (Phase 3 MT-001)", () => {
    const reply = formatSelectAfterRankReply(
      [
        { symbol: "HERE", rawScore: 70, classification: "WATCHLIST" },
        { symbol: "GIS", rawScore: 63, classification: "REJECT" },
        { symbol: "VRA", rawScore: 60, classification: "REJECT" },
        { symbol: "EPM", rawScore: 40, classification: "REJECT" },
      ],
      3,
    );
    expect(reply).toMatch(/Selection — top candidates/i);
    expect(reply).toMatch(/\bHERE\b/);
    expect(reply).toMatch(/\bGIS\b/);
    expect(reply).toMatch(/\bVRA\b/);
    expect(reply).not.toMatch(/\bEPM\b/);
    expect(reply).toMatch(/Go deeper on those/i);
    expect(reply).not.toMatch(/Gap register/i);
    expect(reply).not.toMatch(/Revision 1/i);
  });

  it("cached-score select still replies immediately without re-research (regression)", () => {
    const ws = seedRankedResearch();
    const plan = planFromConversationContext("Keep the top 3 only", ws);
    expect(plan.kind).toBe("reply");
    if (plan.kind !== "reply") return;
    expect(plan.applyActive.map((e) => e.symbol)).toEqual(["CODA", "CBRL", "IVDN"]);
    expect(plan.reply).toMatch(/Selection — top candidates/i);
    expect(plan.reply).not.toMatch(/Run earnings candidate research/i);
  });

  it("go_deeper after select still targets only the narrowed set (regression)", () => {
    const ws = seedRankedResearch();
    const selectPlan = planFromConversationContext("Keep the top 3 only", ws);
    expect(selectPlan.kind).toBe("reply");
    if (selectPlan.kind === "reply") {
      applyActiveSubset(ws, selectPlan.applyActive, "select");
    }
    const deeper = planFromConversationContext("Go deeper on those", ws);
    expect(deeper.kind).toBe("rewrite");
    if (deeper.kind !== "rewrite") return;
    expect(deeper.action).toBe("research");
    expect(deeper.targetSymbols).toEqual(["CODA", "CBRL", "IVDN"]);
    expect(deeper.text).not.toMatch(/KAVL|BRRE/);
  });

  it("rewrites Analyze those tickers onto prior calendar set", () => {
    const ws = getWorkingSet(userId, conversationId);
    recordResearchResults(ws, [{ symbol: "ADBE", rawScore: 50, classification: "WAIT" }]);
    const plan = planFromConversationContext("Analyze those tickers.", ws);
    expect(plan.kind).toBe("rewrite");
    if (plan.kind !== "rewrite") return;
    expect(plan.intent).toBe("research");
    expect(plan.text).toMatch(/ADBE/);
  });

  it("does not override explicit ticker lists", () => {
    const ws = seedRankedResearch();
    const plan = planFromConversationContext("Run earnings candidate research on AAPL, MSFT", ws);
    expect(plan.kind).toBe("passthrough");
  });

  it("narrows to top three for go deeper on the top three", () => {
    const ws = seedRankedResearch();
    const plan = planFromConversationContext("Go deeper on the top three.", ws);
    expect(plan.kind).toBe("rewrite");
    if (plan.kind !== "rewrite") return;
    expect(plan.text).toMatch(/CODA, CBRL, IVDN/);
  });

  it("removes the weakest from the ranked set", () => {
    const ws = seedRankedResearch();
    const plan = planFromConversationContext("Remove the riskiest one.", ws);
    expect(plan.kind).toBe("reply");
    if (plan.kind !== "reply") return;
    expect(plan.applyActive.map((e) => e.symbol)).not.toContain("BRRE");
    expect(plan.reply).toMatch(/Removed \*\*BRRE\*\*/);
  });

  it("rewrites same-for-Tuesday into calendar_then_research", () => {
    const ws = seedRankedResearch();
    const plan = planFromConversationContext("Do the same for Tuesday.", ws);
    expect(plan.kind).toBe("rewrite");
    if (plan.kind !== "rewrite") return;
    expect(plan.action).toBe("calendar_then_research");
  });

  it("compare uses current active scope", () => {
    const ws = seedRankedResearch();
    applyActiveSubset(ws, ws.ranked.slice(0, 2), "select");
    const plan = planFromConversationContext("Compare them.", ws);
    expect(plan.kind).toBe("rewrite");
    if (plan.kind !== "rewrite") return;
    expect(plan.text).toMatch(/CODA/);
    expect(plan.text).toMatch(/CBRL/);
    expect(plan.text).not.toMatch(/IVDN/);
  });

  it("asks for clarification when referential but no active set", () => {
    const ws = getWorkingSet(userId, conversationId);
    const plan = planFromConversationContext("Analyze those tickers.", ws);
    expect(plan.kind).toBe("clarify");
  });

  it("researches explicit Monday list instead of full calendar board", () => {
    const ws = getWorkingSet(userId, conversationId);
    const q =
      "Analyze these tickers for Monday earnings: CODA, CBRL, IVDN, KAVL, KARX, HAIN, GFAI, EBZT, HYSR, HYFT, CLSD, BRRE.";
    const plan = planFromConversationContext(q, ws);
    expect(plan.kind).toBe("rewrite");
    if (plan.kind !== "rewrite") return;
    expect(plan.intent).toBe("research");
    expect(plan.action).toBe("research");
    expect(plan.text).toMatch(/Run earnings candidate research on CODA, CBRL, IVDN/);
    expect(plan.text).not.toMatch(/What companies are reporting earnings on monday/i);
  });

  it("researches Analyze the full universe cold start (not passthrough)", () => {
    const ws = getWorkingSet(userId, conversationId);
    const q =
      "Analyze the full universe of: CODA, CBRL, IVDN, KAVL, KARX, HAIN, GFAI, EBZT, HYSR, HYFT, CLSD, BRRE.";
    const plan = planFromConversationContext(q, ws);
    expect(plan.kind).toBe("rewrite");
    if (plan.kind !== "rewrite") return;
    expect(plan.text).toMatch(/Run earnings candidate research on CODA, CBRL, IVDN/);
    expect(plan.text).not.toMatch(/\bFIVE\b/);
  });

  it("client workflow: five strongest does not resolve FIVE ticker", () => {
    const ws = seedRankedResearch();
    const plan = planFromConversationContext(
      "Identify the five strongest candidates based on the available earnings evidence.",
      ws,
    );
    expect(plan.kind).toBe("reply");
    if (plan.kind !== "reply") return;
    expect(plan.applyActive.map((e) => e.symbol)).toEqual(["CODA", "CBRL", "IVDN", "KAVL", "KARX"]);
    expect(plan.applyActive.map((e) => e.symbol)).not.toContain("FIVE");
  });

  it("client workflow: isolate two from five uses active group not full universe", () => {
    const ws = seedRankedResearch();
    const top5 = planFromConversationContext(
      "Identify the five strongest candidates based on the available earnings evidence.",
      ws,
    );
    if (top5.kind === "reply") applyActiveSubset(ws, top5.applyActive, "select");

    const plan = planFromConversationContext(
      "From those five, isolate the two with the most favorable historical earnings reactions.",
      ws,
    );
    expect(plan.kind).toBe("reply");
    if (plan.kind !== "reply") return;
    expect(plan.applyActive.map((e) => e.symbol)).toEqual(["CODA", "CBRL"]);
  });

  it("restores original universe group", () => {
    const ws = seedRankedResearch();
    applyActiveSubset(ws, ws.ranked.slice(0, 2), "select");
    const plan = planFromConversationContext("Return to the original 12-name universe.", ws);
    expect(plan.kind).toBe("reply");
    if (plan.kind !== "reply") return;
    expect(plan.applyActive.length).toBe(12);
  });

  it("parseQuantity prefers isolate-the-two over those-five", () => {
    expect(parseQuantity("From those five, isolate the two with favorable reactions.")).toBe(2);
    expect(parseQuantity("Identify the five strongest candidates.")).toBe(5);
  });

  it("passthroughs fundamental-series compares even with an active working set (Phase 0)", () => {
    const ws = seedRankedResearch();
    applyActiveSubset(ws, [{ symbol: "AAPL", score: 70, classification: "WATCHLIST" }], "select");
    const q = "Compare gross margin trends for AAPL, MSFT, and GOOGL over the last 8 quarters";
    const plan = planFromConversationContext(q, ws);
    expect(plan.kind).toBe("passthrough");
    if (plan.kind === "passthrough") {
      expect(plan.text).toBe(q);
      expect(plan.text).not.toMatch(/Give me their current prices, RSI/i);
    }
  });

  it("passthroughs risk/reward asks instead of rewriting to earnings research (Phase 0)", () => {
    const ws = getWorkingSet(userId, conversationId);
    recordResearchResults(ws, [{ symbol: "AAPL", rawScore: 70, classification: "WATCHLIST" }]);
    const q = "What is the risk/reward of buying NVDA into earnings?";
    const plan = planFromConversationContext(q, ws);
    expect(plan.kind).toBe("passthrough");
    if (plan.kind === "passthrough") {
      expect(plan.text).toMatch(/risk\/reward/i);
      expect(plan.text).not.toMatch(/^Run earnings candidate research/i);
    }
  });

  it("passthroughs desk-compare — does not rewrite to earnings research on LIKE/DESK/KEY (Phase 2)", () => {
    const ws = getWorkingSet(userId, conversationId);
    const q =
      "Compare Apple and Microsoft like a research desk: business quality, valuation, momentum, and key risks.";
    const plan = planFromConversationContext(q, ws);
    expect(plan.kind).toBe("passthrough");
    if (plan.kind === "passthrough") {
      expect(plan.text).toBe(q);
      expect(plan.text).not.toMatch(/Run earnings candidate research/i);
      expect(plan.text).not.toMatch(/\bLIKE\b|\bDESK\b|\bRISKS\b/);
    }
  });

  it("passthroughs implied-move asks instead of rewriting to earnings research (Phase 2)", () => {
    const ws = getWorkingSet(userId, conversationId);
    const q = "What's the implied move for AAPL into earnings?";
    const plan = planFromConversationContext(q, ws);
    expect(plan.kind).toBe("passthrough");
    if (plan.kind === "passthrough") {
      expect(plan.text).toBe(q);
      expect(plan.text).not.toMatch(/^Run earnings candidate research/i);
    }
  });

  it("passthroughs rates-backdrop asks (Phase 2 Pack G)", () => {
    const ws = getWorkingSet(userId, conversationId);
    const q = "Give me the current rates backdrop in plain English — fed funds, 10Y, curve.";
    const plan = planFromConversationContext(q, ws);
    expect(plan.kind).toBe("passthrough");
    if (plan.kind === "passthrough") {
      expect(plan.text).toBe(q);
    }
  });

  it("still rewrites explicit earnings research asks onto named tickers", () => {
    const ws = getWorkingSet(userId, conversationId);
    const plan = planFromConversationContext("Run earnings candidate research on AAPL and MSFT", ws);
    // Already handler-ready → passthrough (unchanged text)
    expect(plan.kind).toBe("passthrough");
    if (plan.kind === "passthrough") {
      expect(plan.text).toMatch(/Run earnings candidate research on AAPL and MSFT/i);
    }
  });

  it("after risk/reward, referential best-of-them stays on NVDA not stale AAPL", () => {
    const ws = getWorkingSet(userId, conversationId);
    // Simulate data_reply rememberFromMeta after a successful NVDA risk/reward turn.
    recordResearchResults(ws, [{ symbol: "NVDA", rawScore: null }]);
    const follow = planFromConversationContext("which is best stock between them?", ws);
    expect(follow.kind).toBe("rewrite");
    if (follow.kind === "rewrite") {
      expect(follow.text).toMatch(/NVDA/i);
      expect(follow.text).not.toMatch(/\bAAPL\b/);
      expect(follow.targetSymbols).toEqual(["NVDA"]);
    }
  });
});
