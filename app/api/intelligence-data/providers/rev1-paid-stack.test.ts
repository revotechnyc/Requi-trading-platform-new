import { afterEach, describe, expect, it } from "vitest";
import {
  fetchEstimateRevisions,
  formatRevisionBrief,
  resetEstimatesProviderForTests,
} from "./estimates";
import { fetchImpliedMove } from "./massive-options";
import { syntheticBarsAroundEvent } from "./massive-stocks";
import {
  extractGuidanceFromText,
  guidanceFromHtmlFixture,
  validateExtractAgainstSource,
} from "./edgar-guidance";
import { computeEventMetrics } from "../../intelligence/research/event-study";
import { classifyBaseReset } from "../../intelligence/research/base-reset";

afterEach(() => {
  delete process.env.DATA_PROVIDER_MODE;
  delete process.env.ESTIMATES_API_KEY;
  delete process.env.MASSIVE_API_KEY;
  resetEstimatesProviderForTests();
});

describe("estimates provider", () => {
  it("T1.1 mock revisions for AAPL include 30/60/90", async () => {
    process.env.DATA_PROVIDER_MODE = "mock";
    resetEstimatesProviderForTests();
    const snap = await fetchEstimateRevisions("AAPL");
    expect(snap.available).toBe(true);
    expect(snap.mock).toBe(true);
    expect(snap.source).toContain("MOCK");
    expect(snap.epsRevisionPct30d).not.toBeNull();
    expect(snap.epsRevisionPct60d).not.toBeNull();
    expect(snap.epsRevisionPct90d).not.toBeNull();
    expect(formatRevisionBrief(snap)).toMatch(/EPS 30d/);
  });

  it("T1.2 live with no key → unavailable", async () => {
    process.env.DATA_PROVIDER_MODE = "live";
    delete process.env.ESTIMATES_API_KEY;
    resetEstimatesProviderForTests();
    const snap = await fetchEstimateRevisions("MSFT");
    expect(snap.available).toBe(false);
    expect(snap.error).toMatch(/ESTIMATES_API_KEY|DUMMY|not configured/i);
  });
});

describe("massive options", () => {
  it("T2.1 mock implied move shape", async () => {
    process.env.DATA_PROVIDER_MODE = "mock";
    const iv = await fetchImpliedMove("AAPL");
    expect(iv.available).toBe(true);
    expect(iv.mock).toBe(true);
    expect(iv.impliedMovePct).toBeGreaterThan(0);
    expect(iv.iv).not.toBeNull();
  });
});

describe("event study calc", () => {
  it("T3.1 synthetic bars → expected gap/D1", () => {
    const bars = syntheticBarsAroundEvent("2026-01-15", 100, 3, 1.5, 2.5, 4);
    const m = computeEventMetrics(bars, "2026-01-15");
    expect(m.gapPct).not.toBeNull();
    expect(m.gapPct!).toBeCloseTo(3, 5);
    expect(m.d1Pct).not.toBeNull();
    expect(m.d1Pct!).toBeCloseTo(1.5, 5);
  });
});

describe("edgar guidance extract", () => {
  it("T4.1 fixture 8-K extracts guidance present in text", () => {
    const html =
      "<html><body>The company expects revenue of $1.2 billion and raises guidance for FY2026 ARR growth.</body></html>";
    const res = guidanceFromHtmlFixture("TEST", html);
    expect(res.available).toBe(true);
    expect(res.guidanceSnippets.length + res.kpiSnippets.length).toBeGreaterThan(0);
    for (const s of res.guidanceSnippets) {
      expect(validateExtractAgainstSource(s, html.replace(/<[^>]+>/g, " "))).toBe(true);
    }
  });

  it("rejects empty extract", () => {
    const extracted = extractGuidanceFromText("Hello world with no numbers.");
    expect(extracted.guidanceSnippets.length).toBe(0);
  });
});

describe("base reset classifier", () => {
  it("T6.2 missing revisions → WAIT", () => {
    const r = classifyBaseReset({
      symbol: "X",
      revisions: null,
      guidance: null,
      eventStudy: null,
      peers: null,
    });
    expect(r.classification).toBe("WAIT");
  });

  it("T6.1 complete mock-like inputs can classify", () => {
    const r = classifyBaseReset({
      symbol: "AAPL",
      revisions: {
        available: true,
        mock: true,
        source: "MOCK",
        symbol: "AAPL",
        vendor: "MOCK",
        consensusEps: 1,
        consensusRevenue: 1,
        epsRevisionPct30d: 1,
        epsRevisionPct60d: 2,
        epsRevisionPct90d: 3,
        revenueRevisionPct30d: 0,
        revenueRevisionPct60d: 0,
        revenueRevisionPct90d: 0,
        epsDispersion: 0.1,
        asOf: "2026-01-01",
      },
      guidance: {
        available: true,
        mock: false,
        source: "SEC",
        symbol: "AAPL",
        cik: null,
        guidanceSnippets: ["expects revenue of $1.2 billion"],
        kpiSnippets: ["ARR"],
        raisesOrMaintains: true,
      },
      eventStudy: {
        available: true,
        mock: true,
        source: "MOCK",
        symbol: "AAPL",
        events: [],
        avgGapPct: 3,
        avgD1Pct: 1,
        avgD10Pct: 2,
        incomplete: false,
      },
      peers: {
        peerRelevanceScore: 70,
        peerFundamentalScore: 60,
        peerExpectationResetScore: 10,
        peerMarketReactionScore: 12,
        peerSensitivityScore: 55,
        incomplete: false,
        mock: true,
        peers: ["MSFT"],
        detail: "peers",
      },
    });
    expect(["BASE_RESET", "BAR_RESET", "BOTH", "NEITHER"]).toContain(r.classification);
    expect(r.reportMarkdown).toContain("Base Reset classifier");
  });
});
