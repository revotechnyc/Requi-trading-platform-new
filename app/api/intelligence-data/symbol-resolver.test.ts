import { describe, expect, it } from "vitest";
import { normalizeForSymbolScan, resolveSymbolsFromText } from "./symbol-resolver";

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

  it("does not invent SOCIAL ticker on sentiment queries", () => {
    expect(resolveSymbolsFromText("What is social sentiment on NVDA?")).toEqual(["NVDA"]);
    expect(resolveSymbolsFromText("What are traders saying about AAPL?")).toEqual(["AAPL"]);
    expect(resolveSymbolsFromText("Compare social sentiment for AMD and NVDA.").sort()).toEqual(["AMD", "NVDA"]);
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
});
