/**
 * Regression locks for Client PDF "9_22 Test results" prompts + paraphrased
 * style variants (different wording, same routing intent).
 */
import { describe, expect, it } from "vitest";
import { resolveSymbolsFromText } from "../intelligence-data/symbol-resolver";
import { resolveEarningsCalendarDateRange } from "../intelligence-data/earnings-day";
import {
  isDeskCompareQuery,
  isConversationalFundamentalQuery,
  isHypotheticalPortfolioQuery,
  isTechnicalIndicatorQuery,
} from "./gap-intents";
import { classifyMarketIntelligenceIntent } from "./market-intent";
import { isEarningsResearchProtocol, parseEarningsScreenLimits } from "./research/earnings-candidate";
import {
  formatHypotheticalPortfolioReply,
} from "./data-reply";
import { classifyIntent, type ThreadState } from "./intent";

const emptyThread = {
  advisory: null,
  stagedTicketId: null,
  stagedExpiresAt: null,
  pendingQuantity: null,
  awaitingQuantityFor: null,
} as ThreadState;

/** Original client PDF wording */
const P1 =
  "Analyze the current U.S. stock market and identify five stocks showing unusual trading volume, strong price momentum, and potential institutional activity. Provide supporting indicators and explain what may be driving the moves. Note if any signals appear post-market or after hours.";

const P2 =
  "Compare NVIDIA, AMD, and Broadcom using their latest available financial reports. Evaluate revenue growth, profitability, free cash flow, and valuation multiples relative to historical averages. Rank them by competitive positioning and fundamentals.";

const P3 =
  "Identify three publicly traded companies reporting earnings within the next seven days with a high probability of exceeding expectations. Estimate the potential market reaction based on previous earnings surprises, analyst revisions, and implied volatility in the options market.";

const P4 =
  "Provide a technical analysis of Tesla (TSLA) using RSI, MACD, moving averages, and volume trends. Identify key support and resistance levels and outline possible short-term trading scenarios based on current price action.";

const P5 =
  "Construct a hypothetical $100,000 portfolio allocated across technology and healthcare sectors. Stress-test the portfolio under three scenarios: rising interest rates, inflation spike, and mild recession. Summarize correlations, drawdowns, and concentration vulnerabilities.";

/**
 * Same styles, totally different words / names / amounts — for manual + automated locks.
 */
const S1 =
  "Which liquid names have elevated relative volume and are running hard into the close? Call out anything that looks like big-money flow, and say when the tape is only extended-session / after-hours.";

const S2 =
  "Put Apple, Microsoft, and Google side by side on free cash flow, profitability, and valuation multiples — which one looks cleaner on fundamentals versus its own history?";

const S3 =
  "Screen for a few names reporting earnings over the next 5 days that look likely to beat consensus, and sketch how the tape might react from past surprises.";

const S4 =
  "Chart Apple with RSI, MACD, SMAs and volume — mark support and resistance, then sketch near-term setups from the current tape.";

const S5 =
  "Build a mock $250,000 sleeve split between tech and healthcare. Walk through rate hikes, sticky inflation, and a shallow downturn — call out correlation spikes and concentration risk.";

/** Second paraphrase set — again different lexicon / names / amounts. */
const T1 =
  "List the hottest US equities by participation today — flag high RVOL rippers and note whether any prints are only from the extended session.";

const T2 =
  "Compare Netflix, Amazon, and Meta on margins, free cash flow, and valuation — rank them by fundamental quality against their own history.";

const T3 =
  "Find four companies with earnings in the next 6 days and flag who historically beats estimates; note how shares usually gap after prior reports.";

const T4 =
  "Do a technical read on Tesla: RSI, MACD, moving averages, volume trend, support and resistance, then outline near-term scenarios.";

const T5 =
  "Paper portfolio of $75,000 across technology and healthcare — stress under higher rates, inflation, and recession; summarize drawdown and concentration risk.";

/** Third paraphrase set — new lexicon / names / amounts again. */
const U1 =
  "Show me today's biggest movers with a volume spike or above-average RVOL — say if any quotes are after-hours only.";

const U2 =
  "Compare Microsoft, NVIDIA, and Intel on profitability, free cash flow, and valuation multiples versus their own history.";

const U3 =
  "Identify three names reporting earnings within the next 4 days that tend to beat; comment on typical post-print price moves.";

const U4 =
  "Walk NVIDIA's tape with RSI, MACD, SMAs, volume, and support and resistance — suggest short-horizon setups.";

const U5 =
  "Simulated $40,000 portfolio split across tech and healthcare; stress for rising rates, inflation, and recession — note correlation and concentration risk.";

/** Fourth paraphrase set — fresh lexicon / names / amounts. */
const V1 =
  "Which names are ripping with high relative volume right now? Flag anything that looks like after-hours only.";

const V2 =
  "Compare Amazon, Disney, and Walmart on free cash flow, margins, and valuation.";

const V3 =
  "Screen for a couple of tickers reporting earnings over the next 3 days that usually beat; note typical gap reactions.";

const V4 =
  "Technical snapshot of Coinbase: RSI, MACD, moving averages, volume, support and resistance, near-term setups.";

const V5 =
  "Imaginary $150,000 allocation in technology and healthcare — stress under rate hikes, inflation, and recession; call out drawdowns and concentration.";

const PROSE_NOISE = [
  "VOLUME",
  "UNUSUAL",
  "INSTITUTIONAL",
  "HOURS",
  "WITHIN",
  "DAYS",
  "PORTFOLIO",
  "INFLATION",
  "RECESSION",
  "TERM",
  "ACTION",
  "ELEVATED",
  "RELATIVE",
  "CONSENSUS",
  "SLEEVE",
];

describe("Client PDF 9/22 — Prompt 1 unusual volume / after-hours", () => {
  it("does not harvest VOLUME / WITHIN-style prose as tickers", () => {
    const syms = resolveSymbolsFromText(P1);
    expect(syms).not.toContain("VOLUME");
    expect(syms).not.toContain("UNUSUAL");
    expect(syms).not.toContain("INSTITUTIONAL");
    expect(syms).not.toContain("HOURS");
    expect(syms).not.toContain("AFTER");
  });

  it("routes to MARKET_MOVERS (not earnings rewrite)", () => {
    expect(classifyMarketIntelligenceIntent(P1)).toBe("MARKET_MOVERS");
    expect(isEarningsResearchProtocol(P1)).toBe(false);
  });
});

describe("Client PDF 9/22 — Prompt 2 desk compare NVDA/AMD/AVGO", () => {
  it("resolves the three names and treats as desk-compare", () => {
    expect(resolveSymbolsFromText(P2).sort()).toEqual(["AMD", "AVGO", "NVDA"]);
    expect(isDeskCompareQuery(P2)).toBe(true);
    expect(isConversationalFundamentalQuery(P2)).toBe(false);
    expect(isEarningsResearchProtocol(P2)).toBe(false);
  });
});

describe("Client PDF 9/22 — Prompt 3 next-seven-days earnings screen", () => {
  it("does not harvest WITHIN/DAYS/PUBLICLY as tickers", () => {
    const syms = resolveSymbolsFromText(P3);
    expect(syms).not.toContain("WITHIN");
    expect(syms).not.toContain("DAYS");
    expect(syms).not.toContain("PUBLICLY");
    expect(syms).not.toContain("EXPECTATIONS");
    expect(syms).not.toContain("VOLATILITY");
  });

  it("is earnings research protocol with empty symbol list (calendar auto-screen)", () => {
    expect(resolveSymbolsFromText(P3)).toEqual([]);
    expect(isEarningsResearchProtocol(P3)).toBe(true);
  });

  it("resolves next-seven-days calendar range", () => {
    const range = resolveEarningsCalendarDateRange(P3);
    expect(range).not.toBeNull();
    expect(range!.from <= range!.to).toBe(true);
  });
});

describe("Client PDF 9/22 — Prompt 4 TSLA technicals (must stay intact)", () => {
  it("still resolves TSLA and is not desk-compare / hyp-portfolio / movers-only", () => {
    const syms = resolveSymbolsFromText(P4);
    expect(syms).toContain("TSLA");
    expect(syms).not.toContain("TERM");
    expect(syms).not.toContain("ACTION");
    expect(syms).not.toContain("VOLUME");
    expect(isDeskCompareQuery(P4)).toBe(false);
    expect(isHypotheticalPortfolioQuery(P4)).toBe(false);
    expect(isEarningsResearchProtocol(P4)).toBe(false);
  });
});

describe("Client PDF 9/22 — Prompt 5 hypothetical portfolio", () => {
  it("detects hyp portfolio and does not route to STATUS", () => {
    expect(isHypotheticalPortfolioQuery(P5)).toBe(true);
    const intent = classifyIntent(P5, emptyThread);
    expect(intent.mode).toBe("CHAT");
    expect(intent.mode).not.toBe("STATUS_QUERY");
  });

  it("does not become earnings research from prose tickers", () => {
    const syms = resolveSymbolsFromText(P5);
    expect(syms).not.toContain("PORTFOLIO");
    expect(syms).not.toContain("INFLATION");
    expect(syms).not.toContain("RECESSION");
    expect(isEarningsResearchProtocol(P5)).toBe(false);
  });
});

describe("Style paraphrases — same routing, different words", () => {
  it("S1 movers style → MARKET_MOVERS, no prose tickers, not earnings", () => {
    expect(classifyMarketIntelligenceIntent(S1)).toBe("MARKET_MOVERS");
    expect(isEarningsResearchProtocol(S1)).toBe(false);
    const syms = resolveSymbolsFromText(S1);
    for (const bad of ["ELEVATED", "RELATIVE", "VOLUME", "MONEY", "FLOW", "HOURS"]) {
      expect(syms).not.toContain(bad);
    }
  });

  it("S2 desk-compare style → desk compare on AAPL/MSFT/GOOGL", () => {
    expect(resolveSymbolsFromText(S2).sort()).toEqual(["AAPL", "GOOGL", "MSFT"]);
    expect(isDeskCompareQuery(S2)).toBe(true);
    expect(isConversationalFundamentalQuery(S2)).toBe(false);
    expect(isEarningsResearchProtocol(S2)).toBe(false);
  });

  it("S3 earnings-calendar style → Rev-1 screen, empty symbols, date range", () => {
    expect(resolveSymbolsFromText(S3)).toEqual([]);
    expect(isEarningsResearchProtocol(S3)).toBe(true);
    expect(resolveEarningsCalendarDateRange(S3)).not.toBeNull();
    expect(classifyMarketIntelligenceIntent(S3)).not.toBe("MARKET_MOVERS");
    expect(parseEarningsScreenLimits(S3)).toEqual({ maxSymbols: 3, horizonDays: 5 });
  });

  it("S4 technicals style → AAPL only, not desk/hyp/earnings", () => {
    const syms = resolveSymbolsFromText(S4);
    expect(syms).toContain("AAPL");
    for (const bad of PROSE_NOISE) expect(syms).not.toContain(bad);
    expect(isDeskCompareQuery(S4)).toBe(false);
    expect(isHypotheticalPortfolioQuery(S4)).toBe(false);
    expect(isEarningsResearchProtocol(S4)).toBe(false);
  });

  it("S5 hyp-portfolio style → CHAT not STATUS, parses $250k + tech+healthcare", () => {
    expect(isHypotheticalPortfolioQuery(S5)).toBe(true);
    expect(classifyIntent(S5, emptyThread).mode).toBe("CHAT");
    expect(isEarningsResearchProtocol(S5)).toBe(false);
    const reply = formatHypotheticalPortfolioReply(S5);
    expect(reply).toMatch(/\$250,000/);
    expect(reply).toMatch(/technology \+ healthcare/i);
    expect(reply).not.toMatch(/Assumed sleeve: \*\*\$100,000\*\* across \*\*healthcare\*\*/);
    const syms = resolveSymbolsFromText(S5);
    expect(syms).not.toContain("SLEEVE");
    expect(syms).not.toContain("INFLATION");
    expect(syms).not.toContain("DOWNTURN");
  });
});

describe("Style paraphrases set 2 — different lexicon again", () => {
  it("T1 movers style → MARKET_MOVERS", () => {
    expect(classifyMarketIntelligenceIntent(T1)).toBe("MARKET_MOVERS");
    expect(isEarningsResearchProtocol(T1)).toBe(false);
    const syms = resolveSymbolsFromText(T1);
    for (const bad of ["HOTTEST", "EQUITIES", "RVOL", "PARTICIPATION", "EXTENDED"]) {
      expect(syms).not.toContain(bad);
    }
  });

  it("T2 desk-compare → NFLX/AMZN/META", () => {
    expect(resolveSymbolsFromText(T2).sort()).toEqual(["AMZN", "META", "NFLX"]);
    expect(isDeskCompareQuery(T2)).toBe(true);
    expect(isConversationalFundamentalQuery(T2)).toBe(false);
    expect(isEarningsResearchProtocol(T2)).toBe(false);
  });

  it("T3 earnings screen → Rev-1 with 4 names / 6-day horizon", () => {
    expect(resolveSymbolsFromText(T3)).toEqual([]);
    expect(isEarningsResearchProtocol(T3)).toBe(true);
    expect(parseEarningsScreenLimits(T3)).toEqual({ maxSymbols: 4, horizonDays: 6 });
  });

  it("T4 technicals → TSLA only", () => {
    const syms = resolveSymbolsFromText(T4);
    expect(syms).toContain("TSLA");
    expect(isDeskCompareQuery(T4)).toBe(false);
    expect(isHypotheticalPortfolioQuery(T4)).toBe(false);
    expect(isTechnicalIndicatorQuery(T4)).toBe(true);
    expect(isEarningsResearchProtocol(T4)).toBe(false);
  });

  it("T5 paper portfolio → $75k tech+healthcare, not STATUS", () => {
    expect(isHypotheticalPortfolioQuery(T5)).toBe(true);
    expect(classifyIntent(T5, emptyThread).mode).toBe("CHAT");
    const reply = formatHypotheticalPortfolioReply(T5);
    expect(reply).toMatch(/\$75,000/);
    expect(reply).toMatch(/technology \+ healthcare/i);
  });
});

describe("Style paraphrases set 3 — third lexicon pass", () => {
  it("U1 movers style → MARKET_MOVERS", () => {
    expect(classifyMarketIntelligenceIntent(U1)).toBe("MARKET_MOVERS");
    expect(isEarningsResearchProtocol(U1)).toBe(false);
  });

  it("U2 desk-compare → MSFT/NVDA/INTC", () => {
    expect(resolveSymbolsFromText(U2).sort()).toEqual(["INTC", "MSFT", "NVDA"]);
    expect(isDeskCompareQuery(U2)).toBe(true);
    expect(isConversationalFundamentalQuery(U2)).toBe(false);
    expect(isEarningsResearchProtocol(U2)).toBe(false);
  });

  it("U3 earnings screen → Rev-1 with 3 names / 4-day horizon", () => {
    expect(resolveSymbolsFromText(U3)).toEqual([]);
    expect(isEarningsResearchProtocol(U3)).toBe(true);
    expect(parseEarningsScreenLimits(U3)).toEqual({ maxSymbols: 3, horizonDays: 4 });
  });

  it("U4 technicals → NVDA, not earnings rewrite", () => {
    expect(resolveSymbolsFromText(U4)).toContain("NVDA");
    expect(isTechnicalIndicatorQuery(U4)).toBe(true);
    expect(isEarningsResearchProtocol(U4)).toBe(false);
  });

  it("U5 simulated portfolio → $40k tech+healthcare", () => {
    expect(isHypotheticalPortfolioQuery(U5)).toBe(true);
    expect(classifyIntent(U5, emptyThread).mode).toBe("CHAT");
    const reply = formatHypotheticalPortfolioReply(U5);
    expect(reply).toMatch(/\$40,000/);
    expect(reply).toMatch(/technology \+ healthcare/i);
  });
});

describe("Style paraphrases set 4 — fourth lexicon pass", () => {
  it("V1 movers → MARKET_MOVERS", () => {
    expect(classifyMarketIntelligenceIntent(V1)).toBe("MARKET_MOVERS");
    expect(isEarningsResearchProtocol(V1)).toBe(false);
  });

  it("V2 desk-compare → AMZN/DIS/WMT", () => {
    expect(resolveSymbolsFromText(V2).sort()).toEqual(["AMZN", "DIS", "WMT"]);
    expect(isDeskCompareQuery(V2)).toBe(true);
    expect(isEarningsResearchProtocol(V2)).toBe(false);
  });

  it("V3 earnings screen → 3 names / 3-day horizon", () => {
    expect(resolveSymbolsFromText(V3)).toEqual([]);
    expect(isEarningsResearchProtocol(V3)).toBe(true);
    expect(parseEarningsScreenLimits(V3)).toEqual({ maxSymbols: 3, horizonDays: 3 });
  });

  it("V4 technicals → COIN", () => {
    expect(resolveSymbolsFromText(V4)).toContain("COIN");
    expect(isTechnicalIndicatorQuery(V4)).toBe(true);
    expect(isEarningsResearchProtocol(V4)).toBe(false);
  });

  it("V5 imaginary portfolio → $150k tech+healthcare", () => {
    expect(isHypotheticalPortfolioQuery(V5)).toBe(true);
    expect(classifyIntent(V5, emptyThread).mode).toBe("CHAT");
    const reply = formatHypotheticalPortfolioReply(V5);
    expect(reply).toMatch(/\$150,000/);
    expect(reply).toMatch(/technology \+ healthcare/i);
  });
});
