import { describe, expect, it, beforeEach } from "vitest";
import {
  commitDisplayScope,
  inferDisplayScopeFromAssistantReply,
  isOperationalFollowUp,
  resolveOperationalScope,
} from "./conversation-scope";
import { clearWorkingSet, getWorkingSet, planFromConversationContext, recordResearchResults } from "./conversation-context";

describe("conversation scope (display stack)", () => {
  const userId = "scope-user";
  const conversationId = "scope-conv";

  beforeEach(() => {
    clearWorkingSet(userId, conversationId);
  });

  it("resolveOperationalScope prefers displayScope over full ranked on vague follow-up", () => {
    const ws = getWorkingSet(userId, conversationId);
    recordResearchResults(
      ws,
      [
        { symbol: "AYTU", rawScore: 1 },
        { symbol: "AZO", rawScore: 8 },
        { symbol: "KBH", rawScore: 2 },
        { symbol: "WOR", rawScore: 1 },
      ],
      { groupLabel: "today", lastHandler: "earnings_day" },
    );
    commitDisplayScope(ws, ["AYTU", "KBH", "WOR"], "earnings_session_slice");
    const scope = resolveOperationalScope(ws, "please break down what's left", ws.active, ws.ranked);
    expect(scope.map((e) => e.symbol).sort()).toEqual(["AYTU", "KBH", "WOR"]);
  });

  it("infers subset scope from assistant table when meta was missing", () => {
    const ws = getWorkingSet(userId, conversationId);
    recordResearchResults(
      ws,
      [
        { symbol: "AYTU", rawScore: 1 },
        { symbol: "AZO", rawScore: 8 },
        { symbol: "KBH", rawScore: 2 },
        { symbol: "WOR", rawScore: 1 },
      ],
      { groupLabel: "today", lastHandler: "earnings_day" },
    );
    const userText = "Filter the above table to AMC timing only.";
    const assistant = [
      "After market close — September 22, 2026 (ET)",
      "Table · 3 rows",
      "AYTU AMC",
      "KBH AMC",
      "WOR AMC",
      "3 companies. Source: Finnhub",
    ].join("\n");
    const inferred = inferDisplayScopeFromAssistantReply(userText, assistant, ws);
    expect(inferred?.map((e) => e.symbol).sort()).toEqual(["AYTU", "KBH", "WOR"]);
  });

  it("planFromConversationContext uses displayScope for paraphrased dig-in ask", () => {
    const ws = getWorkingSet(userId, conversationId);
    recordResearchResults(
      ws,
      [
        { symbol: "AYTU", rawScore: 1 },
        { symbol: "AZO", rawScore: 8 },
      ],
      { groupLabel: "today", lastHandler: "earnings_day" },
    );
    commitDisplayScope(ws, ["AYTU", "KBH", "WOR"], "inferred_reply");
    expect(isOperationalFollowUp("go deeper on whatever you just showed me", ws)).toBe(true);
    const plan = planFromConversationContext("go deeper on whatever you just showed me", ws);
    expect(plan.kind).toBe("rewrite");
    if (plan.kind === "rewrite") {
      expect(plan.targetSymbols?.sort()).toEqual(["AYTU", "KBH", "WOR"]);
    }
  });
});
