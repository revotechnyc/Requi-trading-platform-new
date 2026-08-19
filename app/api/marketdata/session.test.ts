import { describe, expect, it } from "vitest";
import { etWallToUtcMs, getMarketSession, isRegularSession } from "./session";

/**
 * MARKET SESSION TEST MATRIX (Production Revision §35) — normal trading day,
 * weekend, holiday, early close, DST transitions, open/close transitions.
 * All moments are constructed as ET wall-clock → UTC via the same DST-aware
 * converter the service uses, so tests hold across host timezones.
 */

function at(day: string, minutes: number): number {
  return etWallToUtcMs(day, minutes);
}

describe("getMarketSession — normal trading day", () => {
  const day = "2026-08-13"; // Thursday, no holiday
  it("PRE_MARKET at 08:00 ET", () => {
    expect(getMarketSession(at(day, 8 * 60)).state).toBe("PRE_MARKET");
  });
  it("OPEN at 09:30 ET exactly (open transition)", () => {
    expect(getMarketSession(at(day, 9 * 60 + 30)).state).toBe("OPEN");
  });
  it("OPEN at 15:59 ET", () => {
    expect(getMarketSession(at(day, 15 * 60 + 59)).state).toBe("OPEN");
  });
  it("AFTER_HOURS at 16:00 ET exactly (close transition)", () => {
    expect(getMarketSession(at(day, 16 * 60)).state).toBe("AFTER_HOURS");
  });
  it("CLOSED at 20:00 ET (after-hours end)", () => {
    expect(getMarketSession(at(day, 20 * 60)).state).toBe("CLOSED");
  });
  it("CLOSED at 03:59 ET (before pre-market)", () => {
    expect(getMarketSession(at(day, 3 * 60 + 59)).state).toBe("CLOSED");
  });
  it("reports the correct trading date and close boundary", () => {
    const s = getMarketSession(at(day, 12 * 60));
    expect(s.tradingDate).toBe(day);
    expect(s.isTradingDay).toBe(true);
    expect(s.isEarlyClose).toBe(false);
    expect(s.regularCloseMinutes).toBe(16 * 60);
    expect(s.source).toContain("NYSE_CALENDAR");
  });
});

describe("getMarketSession — weekend", () => {
  it("Saturday midday is CLOSED and not a trading day", () => {
    const s = getMarketSession(at("2026-08-15", 12 * 60)); // Saturday
    expect(s.state).toBe("CLOSED");
    expect(s.isTradingDay).toBe(false);
  });
  it("Sunday midday is CLOSED", () => {
    expect(getMarketSession(at("2026-08-16", 12 * 60)).state).toBe("CLOSED");
  });
  it("next open from Saturday skips to Monday 09:30", () => {
    const s = getMarketSession(at("2026-08-15", 12 * 60));
    expect(s.nextOpenAt).toBe(new Date(at("2026-08-17", 9 * 60 + 30)).toISOString());
  });
});

describe("getMarketSession — holidays", () => {
  it("Thanksgiving 2026 is CLOSED with the holiday named", () => {
    const s = getMarketSession(at("2026-11-26", 12 * 60));
    expect(s.state).toBe("CLOSED");
    expect(s.isTradingDay).toBe(false);
    expect(s.holidayName).toBe("Thanksgiving Day");
  });
  it("Good Friday 2026 is CLOSED", () => {
    expect(getMarketSession(at("2026-04-03", 12 * 60)).state).toBe("CLOSED");
  });
  it("Independence Day observed 2026-07-03 (Friday) is CLOSED", () => {
    expect(getMarketSession(at("2026-07-03", 12 * 60)).state).toBe("CLOSED");
  });
  it("a holiday-midweek 'next open' skips the holiday", () => {
    const s = getMarketSession(at("2026-11-25", 17 * 60)); // Wed before Thanksgiving
    expect(s.nextOpenAt).toBe(new Date(at("2026-11-27", 9 * 60 + 30)).toISOString());
  });
});

describe("getMarketSession — early close", () => {
  const day = "2026-11-27"; // day after Thanksgiving, 13:00 close
  it("EARLY_CLOSE_SESSION at 10:00 ET", () => {
    const s = getMarketSession(at(day, 10 * 60));
    expect(s.state).toBe("EARLY_CLOSE_SESSION");
    expect(s.isEarlyClose).toBe(true);
    expect(s.regularCloseMinutes).toBe(13 * 60);
  });
  it("still trading at 12:59 but AFTER_HOURS at 13:00", () => {
    expect(getMarketSession(at(day, 12 * 60 + 59)).state).toBe("EARLY_CLOSE_SESSION");
    expect(getMarketSession(at(day, 13 * 60)).state).toBe("AFTER_HOURS");
  });
  it("early-close after-hours ends 17:00 (CLOSED at 17:00)", () => {
    expect(getMarketSession(at(day, 16 * 60)).state).toBe("AFTER_HOURS");
    expect(getMarketSession(at(day, 17 * 60)).state).toBe("CLOSED");
  });
  it("Christmas Eve 2026 is an early close", () => {
    expect(getMarketSession(at("2026-12-24", 11 * 60)).state).toBe("EARLY_CLOSE_SESSION");
  });
});

describe("getMarketSession — DST transitions", () => {
  // 2026: EST→EDT on Mar 8, EDT→EST on Nov 1. 09:30 ET must stay 09:30 ET.
  it("summer (EDT): 09:30 ET open maps to 13:30 UTC", () => {
    expect(new Date(at("2026-08-13", 9 * 60 + 30)).toISOString()).toBe("2026-08-13T13:30:00.000Z");
  });
  it("winter (EST): 09:30 ET open maps to 14:30 UTC", () => {
    expect(new Date(at("2026-01-15", 9 * 60 + 30)).toISOString()).toBe("2026-01-15T14:30:00.000Z");
  });
  it("the week after spring-forward still opens on time", () => {
    expect(getMarketSession(at("2026-03-09", 9 * 60 + 30)).state).toBe("OPEN");
  });
  it("the week after fall-back still opens on time", () => {
    expect(getMarketSession(at("2026-11-02", 9 * 60 + 30)).state).toBe("OPEN");
  });
});

describe("isRegularSession", () => {
  it("true during OPEN and EARLY_CLOSE_SESSION only", () => {
    expect(isRegularSession(at("2026-08-13", 10 * 60))).toBe(true);
    expect(isRegularSession(at("2026-11-27", 10 * 60))).toBe(true); // early close day, morning
    expect(isRegularSession(at("2026-08-13", 8 * 60))).toBe(false); // pre-market
    expect(isRegularSession(at("2026-08-13", 17 * 60))).toBe(false); // after-hours
    expect(isRegularSession(at("2026-11-27", 14 * 60))).toBe(false); // early-close afternoon
  });
});
