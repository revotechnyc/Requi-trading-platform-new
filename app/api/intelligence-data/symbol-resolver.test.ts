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
});
