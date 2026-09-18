import { describe, expect, it } from "vitest";
import {
  filterLikelyFalsePositiveTickers,
  normalizeForSymbolScan,
  resolveContextSymbolsFromText,
  resolveSymbolsFromText,
} from "./symbol-resolver";

describe("normalizeForSymbolScan", () => {
  it("removes vs/versus and possessive s", () => {
    expect(normalizeForSymbolScan("AAPL vs MSFT")).not.toMatch(/\bvs\b/i);
    expect(normalizeForSymbolScan("Amazon versus Meta")).not.toMatch(/versus/i);
    expect(normalizeForSymbolScan("Tell me Tesla's current price")).not.toMatch(/'s\b/);
  });
});

describe("resolveSymbolsFromText", () => {
  it("does not treat vs as ticker VS", () => {
    expect(resolveSymbolsFromText("AAPL vs MSFT price").sort()).toEqual(["AAPL", "MSFT"]);
    expect(resolveSymbolsFromText("Amazon vs Meta price").sort()).toEqual(["AMZN", "META"]);
  });

  it("does not treat possessive s as ticker S", () => {
    expect(resolveSymbolsFromText("Tell me Tesla's current price")).toEqual(["TSLA"]);
  });

  it("resolves company names and explicit tickers", () => {
    expect(resolveSymbolsFromText("What is Apple stock price today?")).toEqual(["AAPL"]);
    expect(resolveSymbolsFromText("Compare Apple and Google stock prices").sort()).toEqual(["AAPL", "GOOGL"]);
    expect(resolveSymbolsFromText("Compare $TSLA and $NVDA prices").sort()).toEqual(["NVDA", "TSLA"]);
  });

  it("ignores market noise tokens", () => {
    const syms = resolveSymbolsFromText("How much is Google trading at?");
    expect(syms).toEqual(["GOOGL"]);
    expect(syms).not.toContain("MUCH");
    expect(syms).not.toContain("WORTH");
  });

  it("resolves side-by-side phrasing", () => {
    expect(resolveSymbolsFromText("Show me AAPL and GOOGL prices side by side").sort()).toEqual(["AAPL", "GOOGL"]);
  });

  it("resolves trading-at phrasing to a single symbol", () => {
    expect(resolveSymbolsFromText("What is Apple trading at right now?")).toEqual(["AAPL"]);
    expect(resolveSymbolsFromText("What is Tesla trading at right now?")).toEqual(["TSLA"]);
    expect(resolveSymbolsFromText("What is XYZFAKE123 trading at right now?")).toEqual(["XYZFAKE123"]);
  });

  it("does not harvest GOTCHA from ack clarifications", () => {
    expect(
      resolveSymbolsFromText("gotcha is not a stock. i was saying ok"),
    ).toEqual([]);
    expect(filterLikelyFalsePositiveTickers(["GOTCHA"], "gotcha is not a stock")).toEqual([]);
  });

  it("does not harvest SCAN or VALUE from the Console quant chip prompt", () => {
    const q =
      "Run a full quantitative market scan and rank the highest-quality setups by probability, expected value, risk, and evidence reliability.";
    expect(resolveSymbolsFromText(q)).toEqual([]);
  });

  it("does not harvest tickers from the Console beginner or scan chips", () => {
    expect(
      resolveSymbolsFromText("Help me find a trading opportunity and explain it simply."),
    ).toEqual([]);
    expect(
      resolveSymbolsFromText(
        "Analyze the market and show me the strongest opportunities based on current data.",
      ),
    ).toEqual([]);
  });

  it("does not invent SEC/THEIR on cross-feature compare queries", () => {
    const q =
      "Compare Apple and Tesla. Give me their current prices, RSI, latest news, social sentiment, next earnings dates and latest SEC filings. Tell me which is showing stronger momentum and add both to my watchlist.";
    expect(resolveSymbolsFromText(q).sort()).toEqual(["AAPL", "TSLA"]);
  });

  it("does not invent tickers on GDELT macro queries", () => {
    expect(resolveSymbolsFromText("What major macro news could affect the market today?")).toEqual([]);
    expect(resolveSymbolsFromText("What macro events are affecting technology stocks?")).toEqual([]);
    expect(resolveSymbolsFromText("What global news could affect US equities?")).toEqual([]);
  });

  it("does not treat next/date/report as tickers on earnings queries", () => {
    expect(resolveSymbolsFromText("When is Apple's next earnings date?")).toEqual(["AAPL"]);
    expect(resolveSymbolsFromText("When does AMD report next?")).toEqual(["AMD"]);
    expect(resolveSymbolsFromText("Compare the next earnings dates for AAPL, MSFT and GOOGL.").sort()).toEqual([
      "AAPL",
      "GOOGL",
      "MSFT",
    ]);
  });

  it("does not treat PEER READ-THROUGH vocabulary as tickers", () => {
    expect(
      resolveSymbolsFromText(
        "PEER READ-THROUGH\nFor MSFT, identify economically relevant peers that have already reported.",
      ),
    ).toEqual(["MSFT"]);
    expect(
      resolveSymbolsFromText(
        "Run peer read-through analysis for ticker MSFT only. Do not treat PEER, READ, PEERS as tickers.",
      ),
    ).toEqual(["MSFT"]);
  });

  it("resolves tickers from small-cap research prompts", () => {
    const q = `REQUI QUANTITATIVE SMALL-CAP CANDIDATE SELECTION PROTOCOL

Run small-cap candidate research on PLTR and COIN.

Apply cash-runway, dilution, liquidity, and scoring rules.`;
    expect(resolveSymbolsFromText(q).sort()).toEqual(["COIN", "PLTR"]);
  });

  it("does not treat Use as ticker U on Base Reset prompts", () => {
    const q = `BASE RESET

Run Base Reset classification on AAPL.
Use verified data only. If guidance or event-study is incomplete, classify WAIT — do not invent.`;
    expect(resolveSymbolsFromText(q)).toEqual(["AAPL"]);
    expect(resolveSymbolsFromText(q)).not.toContain("U");
  });

  it("still resolves Unity / $U when explicitly requested", () => {
    expect(resolveSymbolsFromText("Run earnings candidate research on Unity")).toEqual(["U"]);
    expect(resolveSymbolsFromText("What is $U trading at right now?")).toEqual(["U"]);
  });

  it("does not treat five/based as tickers in selection prompts", () => {
    const q = "Identify the five strongest candidates based on the available earnings evidence.";
    expect(resolveSymbolsFromText(q)).not.toContain("FIVE");
    expect(resolveSymbolsFromText(q)).not.toContain("BASED");
    expect(resolveContextSymbolsFromText(q)).toEqual([]);
    expect(filterLikelyFalsePositiveTickers(["FIVE", "BASED"], q)).toEqual([]);
  });

  it("does not treat risk/reward/buying as tickers (Phase 0 working-set poison)", () => {
    const q = "What is the risk/reward of buying NVDA into earnings?";
    expect(resolveSymbolsFromText(q)).toEqual(["NVDA"]);
    expect(resolveSymbolsFromText(q)).not.toContain("RISK");
    expect(resolveSymbolsFromText(q)).not.toContain("REWARD");
    expect(resolveSymbolsFromText(q)).not.toContain("BUYING");
    expect(filterLikelyFalsePositiveTickers(["NVDA", "RISK", "REWARD", "BUYING"], q)).toEqual(["NVDA"]);
  });

  it("does not treat ABOVE/SECTOR as tickers in NL screener asks", () => {
    const q = "Find stocks above SMA 200 with RSI between 50 and 65 in the semiconductor sector";
    expect(resolveSymbolsFromText(q)).not.toContain("ABOVE");
    expect(resolveSymbolsFromText(q)).not.toContain("SECTOR");
    expect(resolveSymbolsFromText(q)).not.toContain("FIND");
    expect(resolveSymbolsFromText(q)).not.toContain("SMA");
  });

  it("desk-compare prose resolves only real companies — not LIKE/DESK/KEY/RISKS (Phase 2)", () => {
    const q =
      "Compare Apple and Microsoft like a research desk: business quality, valuation, momentum, and key risks.";
    expect(resolveSymbolsFromText(q).sort()).toEqual(["AAPL", "MSFT"]);
    expect(resolveContextSymbolsFromText(q).sort()).toEqual(["AAPL", "MSFT"]);
  });

  it("still resolves KEY when explicitly a ticker (KeyCorp)", () => {
    expect(resolveSymbolsFromText("What is KEY trading at right now?")).toEqual(["KEY"]);
    expect(resolveSymbolsFromText("Run earnings candidate research on KEY")).toEqual(["KEY"]);
    expect(resolveSymbolsFromText("What is $KEY trading at?")).toEqual(["KEY"]);
  });

  it("does not treat MONTH/PING as tickers in NL", () => {
    expect(resolveSymbolsFromText("Rank NVDA, AMD, and AVGO for the next month").sort()).toEqual([
      "AMD",
      "AVGO",
      "NVDA",
    ]);
    expect(resolveSymbolsFromText("Watch AAPL for a new 8-K and ping me")).toEqual(["AAPL"]);
  });

  it("keeps real tickers in colon lists while dropping quantity words", () => {
    const q =
      "Analyze the full universe of: CODA, CBRL, IVDN, KAVL, KARX, HAIN, GFAI, EBZT, HYSR, HYFT, CLSD, BRRE.";
    expect(resolveContextSymbolsFromText(q).sort()).toEqual(
      ["BRRE", "CBRL", "CLSD", "CODA", "EBZT", "GFAI", "HAIN", "HYFT", "HYSR", "IVDN", "KARX", "KAVL"].sort(),
    );
  });
});
