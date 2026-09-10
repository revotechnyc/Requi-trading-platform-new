import { describe, expect, it } from "vitest";
import {
  classifyOrStatus,
  classifyPriceVsVwap,
  computeSessionRangeMetrics,
  isLivePriceConfirmationQuery,
  runLivePriceConfirmationGate,
  type SessionRangeMetrics,
} from "./research/live-price-gate";
import type { OhlcvBar } from "../marketdata/gateway/types";

/** Build an ET minute bar at hour:minute on a fixed trading day (2026-09-09). */
function etBar(hour: number, minute: number, h: number, l: number, c = (h + l) / 2): OhlcvBar {
  // Construct UTC instant that is that ET clock time on 2026-09-09 (EDT = UTC-4).
  const utcMs = Date.UTC(2026, 8, 9, hour + 4, minute, 0);
  return { t: utcMs, o: c, h, l, c, v: 1000 };
}

describe("live price confirmation gate", () => {
  it("detects Live Gate prompts narrowly", () => {
    expect(
      isLivePriceConfirmationQuery(
        "Evaluate this post-earnings candidate using the Requi Live Price-Confirmation Gate. Ticker POST.",
      ),
    ).toBe(true);
    expect(isLivePriceConfirmationQuery("Evaluate POST using the Requi Live Price-Confirmation Gate")).toBe(
      true,
    );
    expect(isLivePriceConfirmationQuery("Run live gate on AAPL after earnings")).toBe(true);
    expect(isLivePriceConfirmationQuery("What is POST trading at right now?")).toBe(false);
    expect(isLivePriceConfirmationQuery("ER AMC today")).toBe(false);
  });

  it("computes ORH/ORL from first 15 RTH minutes and premarket H/L", () => {
    const bars: OhlcvBar[] = [
      etBar(8, 0, 80, 78), // premarket
      etBar(9, 0, 81, 79), // premarket
      ...Array.from({ length: 15 }, (_, i) => etBar(9, 30 + i, 82 + i * 0.1, 80 - i * 0.05)),
      etBar(10, 0, 84, 82), // after OR
    ];
    const m = computeSessionRangeMetrics(bars);
    expect(m.premarketBars).toBe(2);
    expect(m.premarketHigh).toBe(81);
    expect(m.premarketLow).toBe(78);
    expect(m.orBars).toBe(15);
    expect(m.orh).toBeCloseTo(82 + 14 * 0.1, 5);
    expect(m.orl).toBeCloseTo(80 - 14 * 0.05, 5);
  });

  it("classifies price vs VWAP and OR status without inventing", () => {
    expect(classifyPriceVsVwap(100, 99)).toBe("ABOVE");
    expect(classifyPriceVsVwap(98, 99)).toBe("BELOW");
    expect(classifyPriceVsVwap(null, 99)).toBe("UNAVAILABLE");
    expect(classifyPriceVsVwap(100, null)).toBe("UNAVAILABLE");

    const full: SessionRangeMetrics = {
      orh: 102,
      orl: 100,
      orBars: 15,
      premarketHigh: 101,
      premarketLow: 99,
      premarketBars: 10,
    };
    expect(classifyOrStatus(103, full)).toBe("ABOVE_ORH");
    expect(classifyOrStatus(99, full)).toBe("BELOW_ORL");
    expect(classifyOrStatus(101, full)).toBe("INSIDE_OR");
    expect(classifyOrStatus(101, { ...full, orBars: 3 })).toBe("OR_FORMING");
    expect(classifyOrStatus(101, { ...full, orBars: 0, orh: null, orl: null })).toBe("UNAVAILABLE");
  });

  it("never treats missing ticker / missing bid-ask path as a gate PASS", async () => {
    const noTicker = await runLivePriceConfirmationGate(
      "test-user",
      "Evaluate using the Requi Live Price-Confirmation Gate",
    );
    expect(noTicker).not.toBeNull();
    expect(noTicker!.reply).toContain("no ticker");
    expect(noTicker!.reply).not.toMatch(/\bPASS\b/);
    expect(noTicker!.reply).not.toMatch(/\bBUY\b/);
  });
});
