import { describe, expect, it } from "vitest";
import {
  isCancelAllOrdersIntent,
  isCancelWorkingOrderIntent,
  isFollowUpProtectiveStopIntent,
  isMakeTrailingStopIntent,
  isPortfolioStatusAsk,
  isSellProfitableIntent,
  isStopToBreakevenIntent,
  isTakeProfitIntent,
  parseTakeProfitPct,
  parseTrailPct,
} from "./ibkr-paper-nl";
import { classifyIntent, ORDER_MANAGE_TRIGGERS } from "./intent";

const emptyThread = {
  advisory: null,
  stagedTicketId: null,
  stagedExpiresAt: null,
  pendingQuantity: null,
  awaitingQuantityFor: null,
};

describe("Slice 2 NL parsers / intents", () => {
  it("parses take-profit and trail percents", () => {
    expect(parseTakeProfitPct("Take profit on half at 8%")).toBe(8);
    expect(parseTakeProfitPct("5% take profit")).toBe(5);
    expect(parseTrailPct("Buy NVDA and trail it by 3%")).toBe(3);
    expect(parseTrailPct("Make it a 2% trail")).toBe(2);
  });

  it("detects manage phrases", () => {
    expect(isCancelWorkingOrderIntent("Cancel my open AAPL order")).toBe(true);
    expect(isCancelAllOrdersIntent("Cancel all open orders")).toBe(true);
    expect(isStopToBreakevenIntent("Move my stop to breakeven")).toBe(true);
    expect(isTakeProfitIntent("Take profit on half at 8%")).toBe(true);
    expect(isFollowUpProtectiveStopIntent("Add a 3% stop")).toBe(true);
    expect(isMakeTrailingStopIntent("Make it a trailing stop instead")).toBe(true);
    expect(isSellProfitableIntent("Sell all profitable positions")).toBe(true);
  });

  it("routes manage phrases to TRADE_INTENT", () => {
    expect(ORDER_MANAGE_TRIGGERS.test("Cancel all open orders")).toBe(true);
    expect(classifyIntent("Move my stop to breakeven", emptyThread).mode).toBe("TRADE_INTENT");
    expect(classifyIntent("Add a 3% stop", emptyThread).mode).toBe("TRADE_INTENT");
    expect(classifyIntent("Take profit on half at 8%", emptyThread).mode).toBe("TRADE_INTENT");
    expect(classifyIntent("What should I buy today?", emptyThread).mode).toBe("CHAT");
  });

  it("routes holdings / what I have to STATUS_QUERY", () => {
    expect(classifyIntent("what i have", emptyThread).mode).toBe("STATUS_QUERY");
    expect(classifyIntent("What do I have?", emptyThread).mode).toBe("STATUS_QUERY");
    expect(classifyIntent("current holdings", emptyThread).mode).toBe("STATUS_QUERY");
    expect(classifyIntent("Show my open positions", emptyThread).mode).toBe("STATUS_QUERY");
    expect(isPortfolioStatusAsk("what i have ?")).toBe(true);
    expect(isPortfolioStatusAsk("current holdings")).toBe(true);
    expect(isPortfolioStatusAsk("What should I buy today?")).toBe(false);
  });
});

