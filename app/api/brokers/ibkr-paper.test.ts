import { describe, expect, it } from "vitest";
import {
  assertIbkrPaperUnlessLiveUnlocked,
  isIbkrBrokerAccount,
  isIbkrPaperAccountId,
  isLiveTradingUnlocked,
} from "./ibkr";

describe("IBKR paper account guards", () => {
  it("treats DU… ids as paper", () => {
    expect(isIbkrPaperAccountId("DU1234567")).toBe(true);
    expect(isIbkrPaperAccountId("du999")).toBe(true);
    expect(isIbkrPaperAccountId("U1234567")).toBe(false);
    expect(isIbkrPaperAccountId("")).toBe(false);
  });

  it("refuses live account ids when live trading is locked", () => {
    const prev = process.env.LIVE_TRADING_ENABLED;
    try {
      delete process.env.LIVE_TRADING_ENABLED;
      expect(isLiveTradingUnlocked()).toBe(false);
      expect(() => assertIbkrPaperUnlessLiveUnlocked("U111111")).toThrow(/not a paper account/);
      expect(() => assertIbkrPaperUnlessLiveUnlocked("DU111111")).not.toThrow();
    } finally {
      if (prev === undefined) delete process.env.LIVE_TRADING_ENABLED;
      else process.env.LIVE_TRADING_ENABLED = prev;
    }
  });

  it("maps broker_accounts.broker names to IBKR", () => {
    expect(isIbkrBrokerAccount("IBKR")).toBe(true);
    expect(isIbkrBrokerAccount("Interactive Brokers")).toBe(true);
    expect(isIbkrBrokerAccount("Paper")).toBe(false);
  });
});
