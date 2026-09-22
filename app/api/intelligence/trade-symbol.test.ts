import { describe, expect, it } from "vitest";
import { classifyIntent } from "./intent";
import {
  clarificationAskSharesOrDollars,
  parseTradeNotional,
  parseTradeQuantity,
  resolveTradeSymbol,
} from "./trade-symbol";

const emptyThread = {
  advisory: null,
  stagedTicketId: null,
  stagedExpiresAt: null,
  pendingQuantity: null,
  awaitingQuantityFor: null,
};

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

  it("does not resolve TODAY from stock-discovery phrasing", () => {
    expect(resolveTradeSymbol("What should I buy today", emptyThread)).toBeNull();
    expect(resolveTradeSymbol("What should I buy today?", emptyThread)).toBeNull();
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

  it("parses bare share count for clarification follow-up", () => {
    expect(parseTradeQuantity("100 shares")).toEqual({ quantity: 100, error: null });
    expect(parseTradeQuantity("100")).toEqual({ quantity: 100, error: null });
  });
});

describe("parseTradeNotional", () => {
  it("parses dollar notional", () => {
    expect(parseTradeNotional("Buy $5,000 of NVDA")).toEqual({ notional: 5000, error: null });
    expect(parseTradeNotional("$5000")).toEqual({ notional: 5000, error: null });
    expect(parseTradeNotional("5000 dollars")).toEqual({ notional: 5000, error: null });
  });
});

describe("clarificationAskSharesOrDollars", () => {
  it("asks shares or dollar amount for AAPL", () => {
    expect(clarificationAskSharesOrDollars("AAPL", "BUY")).toMatch(/shares.*dollar/i);
    expect(clarificationAskSharesOrDollars("AAPL", "BUY")).toMatch(/AAPL/);
  });
});

describe("classifyIntent trade flow", () => {
  it("flags invalid quantity on buy intent", () => {
    const intent = classifyIntent("Buy -5 shares of AAPL", emptyThread);
    expect(intent.mode).toBe("TRADE_INTENT");
    expect(intent.quantityError).toBeTruthy();
    expect(intent.symbol).toBe("AAPL");
  });

  it("Buy Apple is TRADE_INTENT with no quantity (router must clarify)", () => {
    const intent = classifyIntent("Buy Apple", emptyThread);
    expect(intent.mode).toBe("TRADE_INTENT");
    expect(intent.symbol).toBe("AAPL");
    expect(intent.quantity).toBeNull();
  });

  it("routes stock-discovery questions to CHAT, not TRADE_INTENT", () => {
    const intent = classifyIntent("What should I buy today", emptyThread);
    expect(intent.mode).toBe("CHAT");
    expect(intent.symbol).toBeNull();
  });

  it("does not treat Rev-1 style research on short list as sell STYLE", () => {
    const msg = "Analyze that short list with Rev-1 style research";
    expect(resolveTradeSymbol(msg, emptyThread)).toBeNull();
    const intent = classifyIntent(msg, emptyThread);
    expect(intent.mode).toBe("CHAT");
    expect(intent.symbol).toBeNull();
    expect(intent.side).toBeNull();
  });

  it("still routes short TSLA as TRADE_INTENT", () => {
    const intent = classifyIntent("short TSLA 100 shares", emptyThread);
    expect(intent.mode).toBe("TRADE_INTENT");
    expect(intent.side).toBe("SELL");
  });

  it("routes Trading Console research chips to CHAT, not TRADE_INTENT", () => {
    const beginner = classifyIntent(
      "Help me find a trading opportunity and explain it simply.",
      emptyThread,
    );
    expect(beginner.mode).toBe("CHAT");
    expect(beginner.symbol).toBeNull();
    expect(beginner.side).toBeNull();

    const expert = classifyIntent(
      "Run a full quantitative market scan and rank the highest-quality setups by probability, expected value, risk, and evidence reliability.",
      emptyThread,
    );
    expect(expert.mode).toBe("CHAT");
    expect(expert.symbol).toBeNull();
  });
});
