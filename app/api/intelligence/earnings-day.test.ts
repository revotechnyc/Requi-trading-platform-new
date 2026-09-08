import { describe, expect, it } from "vitest";
import {
  formatEarningsDayCalendarReply,
  isEarningsDayCalendarQuery,
  resolveEarningsCalendarDate,
  type EarningsDayCalendarResult,
} from "../intelligence-data/earnings-day";

describe("earnings day calendar intent", () => {
  it("detects Tuesday quarterly earnings board queries", () => {
    expect(isEarningsDayCalendarQuery("what is Tuesday quaterly earnings")).toBe(true);
    expect(isEarningsDayCalendarQuery("what is Tuesday quarterly earnings")).toBe(true);
    expect(isEarningsDayCalendarQuery("earnings calendar today")).toBe(true);
    expect(isEarningsDayCalendarQuery("who reports earnings on Friday")).toBe(true);
  });

  it("does not steal single-ticker next-earnings questions", () => {
    expect(isEarningsDayCalendarQuery("When is Apple's next earnings?")).toBe(false);
    expect(isEarningsDayCalendarQuery("When does Tesla report earnings?")).toBe(false);
  });

  it("resolves weekday names to YYYY-MM-DD", () => {
    const d = resolveEarningsCalendarDate("what is Tuesday quarterly earnings");
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("formats unavailable honestly", () => {
    const result: EarningsDayCalendarResult = {
      available: false,
      date: "2026-09-09",
      dateLabel: "Wednesday, Sep 9, 2026",
      source: "Finnhub",
      timestamp: "2026-09-08T12:00:00.000Z",
      rows: [],
      totalCount: 0,
      truncated: false,
      error: "FINNHUB_API_KEY not configured",
    };
    const reply = formatEarningsDayCalendarReply(result);
    expect(reply).toContain("Unavailable");
    expect(reply).toContain("won't invent");
  });
});
