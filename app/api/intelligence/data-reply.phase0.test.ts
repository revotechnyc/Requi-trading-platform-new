import { describe, expect, it } from "vitest";
import {
  isDeskCompareQuery,
  isFilingContentQuery,
  isFundamentalSeriesQuery,
  isImpliedMoveQuery,
  isNlScreenerQuery,
  isRatesBackdropQuery,
  isRiskRewardQuery,
} from "./gap-intents";
import {
  formatDeskCompareReply,
  formatFundamentalSeriesUnavailableReply,
  formatImpliedMoveReply,
  formatNlScreenerUnavailableReply,
  formatRatesBackdropReply,
  formatRiskRewardPartialReply,
} from "./data-reply";
import type { IntelligenceBundle } from "../intelligence-data/types";

describe("Phase 0 gap gates", () => {
  it("detects NL screener language (P0-TECH-005)", () => {
    const q = "Find stocks above SMA 200 with RSI between 50 and 65 in the semiconductor sector";
    expect(isNlScreenerQuery(q)).toBe(true);
    expect(formatNlScreenerUnavailableReply(q)).toMatch(/NOT WIRED/i);
    expect(formatNlScreenerUnavailableReply(q)).toMatch(/ABOVE or SECTOR/i);
  });

  it("does not flag ordinary RSI asks as screeners", () => {
    expect(isNlScreenerQuery("What is NVDA RSI?")).toBe(false);
    expect(isNlScreenerQuery("Is TSLA overbought on RSI?")).toBe(false);
  });

  it("detects multi-quarter fundamental series asks (P0-FUND-003)", () => {
    const q = "Compare gross margin trends for AAPL, MSFT, and GOOGL over the last 8 quarters";
    expect(isFundamentalSeriesQuery(q)).toBe(true);
    expect(formatFundamentalSeriesUnavailableReply(["AAPL", "MSFT", "GOOGL"])).toMatch(/UNAVAILABLE/i);
    expect(formatFundamentalSeriesUnavailableReply(["AAPL", "MSFT", "GOOGL"])).toMatch(/AAPL, MSFT, GOOGL/);
  });

  it("detects filing content Q&A vs metadata list (P0-FILING-003/004)", () => {
    expect(
      isFilingContentQuery("What did the latest 10-K say about revenue concentration risk for AAPL?"),
    ).toBe(true);
    expect(isFilingContentQuery("Did NVDA change guidance in its latest 8-K?")).toBe(true);
    expect(
      isFilingContentQuery(
        "Did Microsoft's last 8-K change anything material for Azure growth expectations?",
      ),
    ).toBe(true);
    expect(isFilingContentQuery("What are the latest SEC filings for MSFT?")).toBe(false);
  });

  it("detects implied move and does not treat compound screens as single-ticker IV (Phase 2 Pack E/H)", () => {
    expect(isImpliedMoveQuery("What's the implied move for AAPL into earnings?")).toBe(true);
    expect(
      isImpliedMoveQuery(
        "Show me earnings this week with beat rate over 70% and implied move over 5%.",
      ),
    ).toBe(false);
  });

  it("formats implied move without collapsing to earnings-date-only (Phase 2 Pack E)", () => {
    const reply = formatImpliedMoveReply(
      "AAPL",
      {
        available: true,
        mock: true,
        source: "Massive Options",
        symbol: "AAPL",
        impliedMovePct: 4.2,
        iv: 0.28,
        ivRank: 42,
        expiry: "2026-09-19",
        underlyingPrice: 220,
        detail: "ATM implied move ~4.2% (MOCK fixture)",
      },
      "**AAPL next earnings:** 2026-10-30 (estimated)",
    );
    expect(reply).toMatch(/Implied move/i);
    expect(reply).toMatch(/4\.2%/);
    expect(reply).toMatch(/Supporting earnings calendar/i);
    expect(reply).toMatch(/NO TRADE/i);
    expect(reply).toMatch(/not a substitute for implied move/i);
    expect(reply.length).toBeGreaterThan(120);
  });

  it("formats rates backdrop from FRED when available (Phase 2 Pack G)", () => {
    const reply = formatRatesBackdropReply({
      available: true,
      asOf: "2026-09-14T18:00:00.000Z",
      source: "FRED",
      series: [
        { seriesId: "FEDFUNDS", title: "Federal Funds Effective Rate", value: 4.33, date: "2026-08-01" },
        { seriesId: "DGS10", title: "10-Year Treasury", value: 4.12, date: "2026-09-12" },
        { seriesId: "T10Y2Y", title: "10Y-2Y Spread", value: 0.45, date: "2026-09-12" },
      ],
    });
    expect(isRatesBackdropQuery("Give me the current rates backdrop in plain English — fed funds, 10Y, curve.")).toBe(
      true,
    );
    expect(reply).toMatch(/Fed funds/i);
    expect(reply).toMatch(/4\.33%/);
    expect(reply).toMatch(/10-year Treasury/i);
    expect(reply).toMatch(/Curve/i);
    expect(reply).not.toMatch(/UNVERIFIED/i);
  });

  it("formats rates backdrop UNAVAILABLE honestly when FRED missing", () => {
    const reply = formatRatesBackdropReply({
      available: false,
      asOf: "2026-09-14T18:00:00.000Z",
      source: "FRED",
      series: [],
      error: "FRED_API_KEY not configured",
    });
    expect(reply).toMatch(/UNAVAILABLE|WAIT/i);
    expect(reply).toMatch(/will \*\*not\*\* invent/i);
  });

  it("detects desk-compare and does not treat it as screener-only (Phase 2)", () => {
    const q =
      "Compare Apple and Microsoft like a research desk: business quality, valuation, momentum, and key risks.";
    expect(isDeskCompareQuery(q)).toBe(true);
    expect(isNlScreenerQuery(q)).toBe(false);
  });

  it("formats desk-compare with sections and WAIT for valuation (not price-only)", () => {
    const q =
      "Compare Apple and Microsoft like a research desk: business quality, valuation, momentum, and key risks.";
    const bundle: IntelligenceBundle = {
      query: q,
      symbols: ["AAPL", "MSFT"],
      layers_routed: ["prices", "indicators", "earnings", "edgar", "news"],
      fetched_at: "2026-09-14T18:00:00.000Z",
      layers: [
        {
          layer: "prices",
          ticker: "AAPL",
          timestamp: "2026-09-14T18:00:00.000Z",
          source: "Yahoo Finance",
          available: true,
          stale: false,
          payload: { price: 333.72, previous_close: 332.27, market_session: "REGULAR", freshness: "FRESH" },
        },
        {
          layer: "prices",
          ticker: "MSFT",
          timestamp: "2026-09-14T18:00:00.000Z",
          source: "Yahoo Finance",
          available: true,
          stale: false,
          payload: { price: 509.21, previous_close: 495.63, market_session: "REGULAR", freshness: "FRESH" },
        },
        {
          layer: "indicators",
          ticker: "AAPL",
          timestamp: "2026-09-14T18:00:00.000Z",
          source: "YFINANCE",
          available: true,
          stale: false,
          payload: { rsi_14: 63.64 },
        },
        {
          layer: "indicators",
          ticker: "MSFT",
          timestamp: "2026-09-14T18:00:00.000Z",
          source: "YFINANCE",
          available: true,
          stale: false,
          payload: { rsi_14: 63.09 },
        },
      ],
    };
    const reply = formatDeskCompareReply(q, bundle);
    expect(reply).toMatch(/Research-desk compare/i);
    expect(reply).toMatch(/### Price/);
    expect(reply).toMatch(/### Momentum/);
    expect(reply).toMatch(/### Valuation/);
    expect(reply).toMatch(/WAIT/);
    expect(reply).toMatch(/AAPL/);
    expect(reply).toMatch(/MSFT/);
    expect(reply).toMatch(/NO TRADE/i);
    expect(reply).not.toMatch(/\bLIKE\b|\bDESK\b|\bRISKS\b/);
  });

  it("detects risk/reward and does not collapse to earnings-only (P0-RISK-001)", () => {
    const q = "What is the risk/reward of buying NVDA into earnings?";
    expect(isRiskRewardQuery(q)).toBe(true);
    const bundle: IntelligenceBundle = {
      query: q,
      symbols: ["NVDA"],
      layers_routed: ["earnings", "prices"],
      fetched_at: "2026-09-14T16:00:00.000Z",
      layers: [
        {
          layer: "earnings",
          ticker: "NVDA",
          timestamp: "2026-09-14T16:00:00.000Z",
          source: "Finnhub",
          available: true,
          stale: false,
          payload: {
            symbol: "NVDA",
            reportDate: "2026-11-17",
            dateType: "estimated",
            reportTime: "unknown",
            epsEstimate: 2.47,
          },
        },
      ],
    };
    const reply = formatRiskRewardPartialReply(q, bundle);
    expect(reply).toMatch(/Risk\/reward framing/i);
    expect(reply).toMatch(/will \*\*not\*\* collapse/i);
    expect(reply).toMatch(/2026-11-17/);
    expect(reply).toMatch(/NO TRADE/i);
    // Must not be earnings-date-only.
    expect(reply).not.toMatch(/^[\s\S]*next earnings:[\s\S]*$/);
    expect(reply.length).toBeGreaterThan(200);
  });
});
