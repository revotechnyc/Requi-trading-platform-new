import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  isPaperIntelligenceVenue,
  parseLimitPrice,
  parsePositionFraction,
  parseStopLossPct,
  parseTrailPct,
  stopFromPct,
  stageExplicitIntelligenceOrder,
} from "./ibkr-paper-nl";
import { catalogSlice1Codes } from "./intent-catalog";

vi.mock("../queries/tickets", () => ({
  proposeTicket: vi.fn(),
}));

vi.mock("../queries/autonomous-exec-policy", () => ({
  resolveIntelligenceBroker: vi.fn(),
}));

vi.mock("./intent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./intent")>();
  return {
    ...actual,
    clearThreadState: vi.fn(),
    setThreadState: vi.fn(),
  };
});

import { proposeTicket } from "../queries/tickets";
import { resolveIntelligenceBroker } from "../queries/autonomous-exec-policy";

const proposeTicketMock = vi.mocked(proposeTicket);
const resolveBrokerMock = vi.mocked(resolveIntelligenceBroker);

describe("IBKR Paper NL parsers", () => {
  it("parses stop loss percent", () => {
    expect(parseStopLossPct("Buy 100 AAPL with a 2% stop loss")).toBe(2);
    expect(parseStopLossPct("buy NVDA stop 3%")).toBe(3);
    expect(parseStopLossPct("buy AAPL")).toBeNull();
  });

  it("parses trail percent", () => {
    expect(parseTrailPct("Buy NVDA and trail it by 3%")).toBe(3);
    expect(parseTrailPct("2% trailing stop")).toBe(2);
  });

  it("parses limit price", () => {
    expect(parseLimitPrice("Place a limit order for TSLA at $390")).toBe(390);
    expect(parseLimitPrice("buy AAPL limit 225")).toBe(225);
  });

  it("parses position fractions", () => {
    expect(parsePositionFraction("Sell half my Tesla")).toBe(0.5);
    expect(parsePositionFraction("Reduce my position by 25%")).toBe(0.25);
    expect(parsePositionFraction("Close my entire AMD position")).toBe(1);
  });

  it("computes stop from pct", () => {
    expect(stopFromPct("BUY", 100, 2)).toBe(98);
    expect(stopFromPct("SELL", 100, 2)).toBe(102);
  });

  it("recognizes paper venues", () => {
    expect(isPaperIntelligenceVenue("PAPER", "PAPER-001")).toBe(true);
    expect(isPaperIntelligenceVenue("IBKR", "DUR506819")).toBe(true);
    expect(isPaperIntelligenceVenue("IBKR", "U1234567")).toBe(false);
  });
});

describe("intent catalog slice 1", () => {
  it("includes core place/confirm/view codes", () => {
    const codes = catalogSlice1Codes();
    expect(codes).toContain("BUY_BY_SHARES");
    expect(codes).toContain("CONFIRM_STAGED_TICKET");
    expect(codes).toContain("VIEW_BUYING_POWER");
  });
});

describe("stageExplicitIntelligenceOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveBrokerMock.mockResolvedValue({
      broker: "IBKR",
      accountId: "DUR506819",
      note: "test IBKR Paper",
    });
    proposeTicketMock.mockResolvedValue({
      ticket: {
        ticketId: "INTELL-TEST-0001",
        symbol: "AAPL",
        side: "BUY",
        quantity: 100,
        orderType: "LMT",
        limitPrice: 200,
        broker: "IBKR",
        effectiveBroker: "IBKR",
      },
      degradedNote: undefined,
    } as never);
  });

  it("stages to IBKR Paper and requires CONFIRM", async () => {
    const res = await stageExplicitIntelligenceOrder({
      userId: "user-1",
      symbol: "AAPL",
      side: "BUY",
      quantity: 100,
      lastPrice: 200,
      stop: 196,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.ticketId).toBe("INTELL-TEST-0001");
      expect(res.reply).toMatch(/CONFIRM ORDER INTELL-TEST-0001/);
      expect(res.reply).toMatch(/IBKR Paper/i);
    }
    expect(proposeTicketMock).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        broker: "IBKR",
        accountId: "DUR506819",
        symbol: "AAPL",
        quantity: 100,
        origin: "INTELLIGENCE",
      }),
    );
  });

  it("refuses live IBKR venue without unlock", async () => {
    resolveBrokerMock.mockResolvedValue({
      broker: "IBKR",
      accountId: "U9999999",
      note: "live",
    });
    const res = await stageExplicitIntelligenceOrder({
      userId: "user-1",
      symbol: "AAPL",
      side: "BUY",
      quantity: 1,
      lastPrice: 200,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reply).toMatch(/Nothing was staged/i);
    expect(proposeTicketMock).not.toHaveBeenCalled();
  });
});
