import { describe, expect, it } from "vitest";
import { bundleToAiBlock } from "../intelligence-data/normalizer";
import type { IntelligenceBundle } from "../intelligence-data/types";
import {
  formatVerifiedPriceReply,
  isDeterministicPriceQuery,
} from "./price-reply";

describe("isDeterministicPriceQuery", () => {
  it("matches simple ticker price questions", () => {
    expect(isDeterministicPriceQuery("What is AAPL stock price?", ["AAPL"])).toBe(true);
    expect(isDeterministicPriceQuery("What is Apple stock price today?", ["AAPL"])).toBe(true);
  });

  it("matches multi-symbol compare price questions", () => {
    expect(
      isDeterministicPriceQuery("Compare Apple and Google stock prices", ["AAPL", "GOOGL"]),
    ).toBe(true);
  });

  it("skips news, movement, and indicator-only questions", () => {
    expect(isDeterministicPriceQuery("What is the latest news on TSLA?", ["TSLA"])).toBe(false);
    expect(isDeterministicPriceQuery("Why is TSLA moving today?", ["TSLA"])).toBe(false);
    expect(isDeterministicPriceQuery("What is NVDA's RSI?", ["NVDA"])).toBe(false);
  });

  it("treats vs compare as deterministic without spurious VS ticker", () => {
    expect(isDeterministicPriceQuery("AAPL vs MSFT price", ["AAPL", "MSFT"])).toBe(true);
    expect(isDeterministicPriceQuery("Amazon vs Meta price", ["AMZN", "META"])).toBe(true);
  });
});

describe("formatVerifiedPriceReply", () => {
  it("formats gateway numbers exactly", () => {
    const bundle: IntelligenceBundle = {
      query: "What is AAPL stock price?",
      symbols: ["AAPL"],
      layers_routed: ["prices"],
      fetched_at: "2026-09-01T17:01:12.000Z",
      layers: [
        {
          layer: "prices",
          ticker: "AAPL",
          timestamp: "2026-09-01T17:01:12.000Z",
          source: "Yahoo Finance",
          available: true,
          stale: false,
          payload: {
            price: 325.2098083496094,
            previous_close: 316.85,
            market_session: "REGULAR",
            freshness: "FRESH",
          },
        },
      ],
    };

    const reply = formatVerifiedPriceReply(bundle);
    expect(reply).toContain("**AAPL** is trading at **$325.21**");
    expect(reply).toContain("Yahoo Finance (verified market data)");
    expect(reply).not.toContain("$225");
  });
});

describe("bundleToAiBlock", () => {
  it("includes authoritative LAST PRICE lines", () => {
    const block = bundleToAiBlock({
      query: "price",
      symbols: ["AAPL"],
      layers_routed: ["prices"],
      fetched_at: "2026-09-01T17:01:12.000Z",
      layers: [
        {
          layer: "prices",
          ticker: "AAPL",
          timestamp: "2026-09-01T17:01:12.000Z",
          source: "Yahoo Finance",
          available: true,
          stale: false,
          payload: { price: 325.21, previous_close: 316.85, market_session: "REGULAR", freshness: "FRESH" },
        },
      ],
    });

    expect(block).toContain("AUTHORITATIVE PRICE LINES");
    expect(block).toContain("LAST PRICE AAPL: $325.21");
  });
});
