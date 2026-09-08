import { describe, expect, it } from "vitest";
import {
  INLINE_SAFE_CHARS,
  acceptPromptLength,
  estimateTokens,
  preparePromptForModel,
} from "./prompt-overflow";
import { epsSurprisePercent, summarizeBeatHistory } from "../intelligence-data/providers/earnings-history";
import { resolveSymbolsFromText } from "../intelligence-data/symbol-resolver";
import {
  isEarningsResearchProtocol,
  isPeerReadThroughRequest,
  isResearchProtocolText,
  runRevision1Research,
} from "./research/earnings-candidate";

describe("prompt overflow", () => {
  it("accepts large prompts up to app max", () => {
    const big = "x".repeat(50_000);
    expect(acceptPromptLength(big).ok).toBe(true);
  });

  it("packages overflow without truncating original text", () => {
    const big = "x".repeat(INLINE_SAFE_CHARS + 500);
    const prep = preparePromptForModel(big);
    expect(prep.overflow).toBe(true);
    expect(prep.originalText.length).toBe(big.length);
    expect(prep.attachmentId).toBeTruthy();
    expect(prep.attachmentBlocks.length).toBeGreaterThan(0);
    expect(prep.modelUserText).toContain("attachment_id=");
    expect(estimateTokens(big)).toBeGreaterThan(0);
  });

  it("passes small prompts through", () => {
    const prep = preparePromptForModel("When is Apple's next earnings?");
    expect(prep.overflow).toBe(false);
    expect(prep.modelUserText).toBe("When is Apple's next earnings?");
    expect(prep.attachmentBlocks).toEqual([]);
  });
});

describe("earnings surprise calc", () => {
  it("computes surprise percent", () => {
    expect(epsSurprisePercent(1.1, 1.0)).toBeCloseTo(10, 5);
    expect(epsSurprisePercent(1, 0)).toBeNull();
  });

  it("summarizes beat history", () => {
    const summary = summarizeBeatHistory([
      { period: "2024-01-01", year: 2024, quarter: 1, actual: 1.2, estimate: 1.0, surprise: 0.2, surprisePercent: 20 },
      { period: "2024-04-01", year: 2024, quarter: 2, actual: 0.9, estimate: 1.0, surprise: -0.1, surprisePercent: -10 },
    ]);
    expect(summary.quarters).toBe(2);
    expect(summary.epsBeatCount).toBe(1);
    expect(summary.epsBeatRate).toBe(50);
  });
});

describe("research protocol detect", () => {
  it("detects quarterly protocol header", () => {
    expect(isResearchProtocolText("REQUI QUARTERLY EARNINGS CANDIDATE SELECTION PROTOCOL\n...")).toBe(true);
    expect(isEarningsResearchProtocol("REQUI QUARTERLY EARNINGS CANDIDATE SELECTION PROTOCOL\n...")).toBe(true);
  });

  it("detects run research with tickers", () => {
    expect(isResearchProtocolText("Run earnings candidate research on AAPL and MSFT")).toBe(true);
    expect(isEarningsResearchProtocol("Run earnings candidate research on AAPL and MSFT")).toBe(true);
  });

  it("ignores plain price questions", () => {
    expect(isResearchProtocolText("What is AAPL trading at right now?")).toBe(false);
  });

  it("detects peer read-through without treating it as earnings research", () => {
    const peerPrompt = `PEER READ-THROUGH

For MSFT, identify economically relevant peers that have already reported this earnings season.
Provide Peer Relevance scores.`;
    expect(isPeerReadThroughRequest(peerPrompt)).toBe(true);
    expect(isEarningsResearchProtocol(peerPrompt)).toBe(false);
    expect(isResearchProtocolText(peerPrompt)).toBe(true);
    expect(resolveSymbolsFromText(peerPrompt)).toEqual(["MSFT"]);
  });
});

describe("peer read-through routing", () => {
  it("returns unavailable instead of researching fake PEER/READ tickers", async () => {
    const peerPrompt = `PEER READ-THROUGH

For MSFT, identify economically relevant peers that have already reported this earnings season.
Provide Peer Relevance, Fundamental, Market-Reaction scores.
Use verified data only. If missing, mark unavailable — do not invent.`;
    const result = await runRevision1Research("test-user", peerPrompt);
    expect(result).not.toBeNull();
    expect(result!.symbols).toEqual(["MSFT"]);
    expect(result!.reply).toContain("PEER_READ_THROUGH_UNAVAILABLE");
    expect(result!.reply).not.toContain("Earnings candidate research — **PEER**");
    expect(result!.reply).not.toContain("Earnings candidate research — **READ**");
  });
});
