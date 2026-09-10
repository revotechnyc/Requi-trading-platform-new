import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  INLINE_SAFE_CHARS,
  acceptPromptLength,
  estimateTokens,
  preparePromptForModel,
} from "./prompt-overflow";
import { epsSurprisePercent, summarizeBeatHistory } from "../intelligence-data/providers/earnings-history";
import { sanitizeProviderError } from "../intelligence-data/providers/alpha-vantage";
import { resolveSymbolsFromText } from "../intelligence-data/symbol-resolver";
import {
  buildCrossDayScreenPool,
  isEarningsResearchProtocol,
  isPeerReadThroughRequest,
  isPlausibleMarginRatio,
  isResearchProtocolText,
  rankScreenCandidates,
  runRevision1Research,
  type ScreenCandidate,
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

describe("provider error sanitization", () => {
  it("redacts keys and collapses Alpha Vantage rate-limit blurbs", () => {
    expect(sanitizeProviderError("Alpha Vantage: rate limit 25 requests SNTQE5B3S4DETSVF premium plans")).toBe(
      "Alpha Vantage rate-limited or daily quota exceeded",
    );
    expect(sanitizeProviderError("ALPHA_VANTAGE_API_KEY not configured")).toContain("not configured");
    expect(sanitizeProviderError(null)).toBe("provider unavailable");
  });
});

describe("XBRL margin sanity", () => {
  it("rejects implausible margin ratios", () => {
    expect(isPlausibleMarginRatio(0.382)).toBe(true);
    expect(isPlausibleMarginRatio(1.934)).toBe(false);
    expect(isPlausibleMarginRatio(-0.2)).toBe(true);
    expect(isPlausibleMarginRatio(-0.9)).toBe(false);
  });
});

describe("upcoming candidate screen ranking", () => {
  it("ranks by beat rate then surprise (not calendar order)", () => {
    const rows: ScreenCandidate[] = [
      {
        symbol: "CMCM",
        reportDate: "2026-09-09",
        reportTime: "BMO",
        beatRate: 0,
        avgSurprisePct: -300,
        quarters: 1,
        screenScore: 0,
      },
      {
        symbol: "AEO",
        reportDate: "2026-09-09",
        reportTime: "AMC",
        beatRate: 100,
        avgSurprisePct: 40,
        quarters: 4,
        screenScore: 100,
      },
      {
        symbol: "ASO",
        reportDate: "2026-09-09",
        reportTime: "BMO",
        beatRate: 75,
        avgSurprisePct: 3,
        quarters: 4,
        screenScore: 75,
      },
    ];
    const ranked = rankScreenCandidates(rows);
    expect(ranked.map((r) => r.symbol)).toEqual(["AEO", "ASO", "CMCM"]);
  });

  it("round-robins the screen pool across days (day-0 cannot monopolize)", () => {
    const day0 = Array.from({ length: 30 }, (_, i) => `D0_${i}`);
    const day1 = ["D1_A", "D1_B"];
    const day2 = ["D2_A"];
    const pool = buildCrossDayScreenPool([day0, day1, day2], 10);
    expect(pool).toHaveLength(10);
    expect(pool.filter((s) => s.startsWith("D0_")).length).toBeLessThan(10);
    expect(pool).toContain("D1_A");
    expect(pool).toContain("D2_A");
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
  it("runs peer engine for MSFT without inventing PEER/READ tickers", async () => {
    process.env.DATA_PROVIDER_MODE = "mock";
    const peerPrompt = `PEER READ-THROUGH

For MSFT, identify economically relevant peers that have already reported this earnings season.
Provide Peer Relevance, Fundamental, Market-Reaction scores.
Use verified data only. If missing, mark unavailable — do not invent.`;
    const result = await runRevision1Research("test-user", peerPrompt);
    expect(result).not.toBeNull();
    expect(result!.symbols).toEqual(["MSFT"]);
    expect(result!.reply).toContain("Peer Read-Through — **MSFT**");
    expect(result!.reply).not.toContain("Earnings candidate research — **PEER**");
    expect(result!.reply).not.toContain("Earnings candidate research — **READ**");
  });
});

describe("benchmark acceptance runs (client prompts)", () => {
  it("runs the client-scale long prompt through Revision 1 runner (honest gaps)", async () => {
    if (!process.env.FINNHUB_API_KEY?.trim()) {
      // Local CI / dev environments may not have keys. In that case, we skip
      // rather than failing acceptance tests for missing connectivity.
      return;
    }

    const promptPath = join(__dirname, "../../../REVISION1_LONG_PROMPT_CLIENT_SCALE.txt");
    const prompt = readFileSync(promptPath, "utf8");

    const result = await runRevision1Research("test-user", prompt);
    expect(result).not.toBeNull();
    expect(result!.reply).toContain("Revision 1 — Earnings candidate research report");
    expect(result!.reply).toContain("Protocol detected. Analyzed");
    // Peer Read-Through engine is intentionally not implemented in Revision 1.
    expect(result!.reply).toContain("Peer Read-Through engine pending");
    // The client prompt instructs execution on these tickers; ensure they appear.
    expect(result!.reply).toContain("— **AAPL**");
    expect(result!.reply).toContain("— **MSFT**");
    expect(result!.reply).toContain("— **NVDA**");
  }, 120_000);
});
