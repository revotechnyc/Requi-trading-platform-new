import { describe, expect, it } from "vitest";
import { classifyIntent } from "./intent";
import { parseTradeQuantity, resolveTradeSymbol } from "./trade-symbol";

const emptyThread = { advisory: null, stagedTicketId: null, stagedExpiresAt: null, pendingQuantity: null };

describe("resolveTradeSymbol", () => {
  it("maps Buy Apple to AAPL", () => {
    expect(resolveTradeSymbol("Buy Apple", emptyThread)).toBe("AAPL");
  });

  it("parses Buy 1 share of AAPL", () => {
    expect(resolveTradeSymbol("Buy 1 share of AAPL", emptyThread)).toBe("AAPL");
  });

  it("parses Buy 2 shares of TSLA", () => {
    expect(resolveTradeSymbol("Buy 2 shares of TSLA", emptyThread)).toBe("TSLA");
  });
});

describe("parseTradeQuantity", () => {
  it("extracts quantity from buy 1 share of AAPL", () => {
    expect(parseTradeQuantity("Buy 1 share of AAPL")).toEqual({ quantity: 1, error: null });
  });

  it("rejects negative quantity", () => {
    expect(parseTradeQuantity("Buy -5 shares of AAPL").error).toMatch(/negative/i);
  });

  it("rejects zero quantity", () => {
    expect(parseTradeQuantity("Buy zero shares of TSLA").error).toMatch(/zero/i);
  });
});

describe("classifyIntent trade flow", () => {
  it("flags invalid quantity on buy intent", () => {
    const intent = classifyIntent("Buy -5 shares of AAPL", emptyThread);
    expect(intent.mode).toBe("TRADE_INTENT");
    expect(intent.quantityError).toBeTruthy();
    expect(intent.symbol).toBe("AAPL");
  });
});
