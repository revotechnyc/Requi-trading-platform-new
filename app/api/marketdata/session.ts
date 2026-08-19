import { etParts } from "./indicators";

/**
 * MARKET SESSION SERVICE (Production Revision §3–§4) — the single source of
 * truth for NYSE market state. No module computes market state independently.
 *
 * Calendar: NYSE_CALENDAR_V1 — an embedded, versioned table of official NYSE
 * full-day closures and early-close sessions (published exchange calendars,
 * 2024–2027, incl. the 2025-01-09 National Day of Mourning special closure).
 * This replaces naive weekday/time logic: weekends, holidays, early closes,
 * special closures and DST (via America/New_York) are all handled. Beyond the
 * table range the service falls back to weekday rules and says so in `source`,
 * so the gap is observable rather than silent. An external market-calendar
 * provider can replace the table behind this same interface without touching
 * any consumer.
 */

export type MarketState = "PRE_MARKET" | "OPEN" | "EARLY_CLOSE_SESSION" | "AFTER_HOURS" | "CLOSED";

export interface MarketSession {
  state: MarketState;
  /** Wall clock at the exchange, ISO string (America/New_York). */
  exchangeTime: string;
  /** ET calendar date the session belongs to (YYYY-MM-DD). */
  tradingDate: string;
  isTradingDay: boolean;
  isEarlyClose: boolean;
  holidayName: string | null;
  /** Regular-session boundaries, minutes since ET midnight. */
  regularOpenMinutes: number;
  regularCloseMinutes: number;
  nextOpenAt: string | null; // ISO, UTC ms-derived
  nextCloseAt: string | null;
  source: string;
}

const CALENDAR_SOURCE = "NYSE_CALENDAR_V1";
const FALLBACK_SOURCE = "WEEKDAY_RULE_FALLBACK (outside calendar table range)";

/* Full-day closures: date → holiday name. */
const FULL_CLOSURES: Record<string, string> = {
  // 2024
  "2024-01-01": "New Year's Day", "2024-01-15": "Martin Luther King Jr. Day",
  "2024-02-19": "Washington's Birthday", "2024-03-29": "Good Friday",
  "2024-05-27": "Memorial Day", "2024-06-19": "Juneteenth",
  "2024-07-04": "Independence Day", "2024-09-02": "Labor Day",
  "2024-11-28": "Thanksgiving Day", "2024-12-25": "Christmas Day",
  // 2025
  "2025-01-01": "New Year's Day", "2025-01-09": "National Day of Mourning (Carter)",
  "2025-01-20": "Martin Luther King Jr. Day", "2025-02-17": "Washington's Birthday",
  "2025-04-18": "Good Friday", "2025-05-26": "Memorial Day",
  "2025-06-19": "Juneteenth", "2025-07-04": "Independence Day",
  "2025-09-01": "Labor Day", "2025-11-27": "Thanksgiving Day", "2025-12-25": "Christmas Day",
  // 2026
  "2026-01-01": "New Year's Day", "2026-01-19": "Martin Luther King Jr. Day",
  "2026-02-16": "Washington's Birthday", "2026-04-03": "Good Friday",
  "2026-05-25": "Memorial Day", "2026-06-19": "Juneteenth",
  "2026-07-03": "Independence Day (observed)", "2026-09-07": "Labor Day",
  "2026-11-26": "Thanksgiving Day", "2026-12-25": "Christmas Day",
  // 2027
  "2027-01-01": "New Year's Day", "2027-01-18": "Martin Luther King Jr. Day",
  "2027-02-15": "Washington's Birthday", "2027-03-26": "Good Friday",
  "2027-05-31": "Memorial Day", "2027-06-18": "Juneteenth (observed)",
  "2027-07-05": "Independence Day (observed)", "2027-09-06": "Labor Day",
  "2027-11-25": "Thanksgiving Day", "2027-12-24": "Christmas Day (observed)",
};

/* Early-close sessions (regular session ends 13:00 ET). */
const EARLY_CLOSES = new Set([
  "2024-07-03", "2024-11-29", "2024-12-24",
  "2025-07-03", "2025-11-28", "2025-12-24",
  "2026-11-27", "2026-12-24",
  "2027-11-26",
]);

const PRE_MARKET_START = 4 * 60; // 04:00 ET
const REGULAR_OPEN = 9 * 60 + 30; // 09:30 ET
const REGULAR_CLOSE = 16 * 60; // 16:00 ET
const EARLY_CLOSE = 13 * 60; // 13:00 ET
const AFTER_HOURS_END = 20 * 60; // 20:00 ET (17:00 on early-close days)
const EARLY_AFTER_HOURS_END = 17 * 60;

const TABLE_MIN = "2024-01-01";
const TABLE_MAX = "2027-12-31";

function isWeekend(day: string): boolean {
  // Noon UTC avoids any date-line edge when deriving the weekday.
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

function withinTable(day: string): boolean {
  return day >= TABLE_MIN && day <= TABLE_MAX;
}

function tradingDayInfo(day: string): { isTradingDay: boolean; holidayName: string | null; early: boolean; source: string } {
  if (!withinTable(day)) {
    return { isTradingDay: !isWeekend(day), holidayName: null, early: false, source: FALLBACK_SOURCE };
  }
  const holiday = FULL_CLOSURES[day] ?? null;
  if (holiday) return { isTradingDay: false, holidayName: holiday, early: false, source: CALENDAR_SOURCE };
  if (isWeekend(day)) return { isTradingDay: false, holidayName: null, early: false, source: CALENDAR_SOURCE };
  return { isTradingDay: true, holidayName: null, early: EARLY_CLOSES.has(day), source: CALENDAR_SOURCE };
}

/** Convert an ET wall-clock (day + minutes) to a UTC ms timestamp (DST-aware, two-pass). */
export function etWallToUtcMs(day: string, minutes: number): number {
  let guess = Date.parse(`${day}T00:00:00Z`) + minutes * 60_000;
  for (let i = 0; i < 2; i++) {
    const p = etParts(guess);
    const dayDeltaMs = Date.parse(`${day}T12:00:00Z`) - Date.parse(`${p.day}T12:00:00Z`);
    guess += dayDeltaMs + (minutes - p.minutes) * 60_000;
  }
  return guess;
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Canonical session state for a moment in time. */
export function getMarketSession(now = Date.now()): MarketSession {
  const { day, minutes } = etParts(now);
  const info = tradingDayInfo(day);
  const closeMin = info.early ? EARLY_CLOSE : REGULAR_CLOSE;
  const afterEnd = info.early ? EARLY_AFTER_HOURS_END : AFTER_HOURS_END;

  let state: MarketState = "CLOSED";
  if (info.isTradingDay) {
    if (minutes >= REGULAR_OPEN && minutes < closeMin) {
      state = info.early ? "EARLY_CLOSE_SESSION" : "OPEN";
    } else if (minutes >= PRE_MARKET_START && minutes < REGULAR_OPEN) {
      state = "PRE_MARKET";
    } else if (minutes >= closeMin && minutes < afterEnd) {
      state = "AFTER_HOURS";
    }
  }

  // Next regular open: today if it hasn't happened, else the next trading day.
  let openDay = day;
  if (!info.isTradingDay || minutes >= REGULAR_OPEN) {
    openDay = addDays(day, 1);
    for (let i = 0; i < 12 && !tradingDayInfo(openDay).isTradingDay; i++) openDay = addDays(openDay, 1);
  }
  const openInfo = tradingDayInfo(openDay);
  const nextOpenAt = etWallToUtcMs(openDay, REGULAR_OPEN);
  const nextCloseAt = etWallToUtcMs(openDay, openInfo.early ? EARLY_CLOSE : REGULAR_CLOSE);

  return {
    state,
    exchangeTime: new Date(now).toLocaleString("en-US", { timeZone: "America/New_York" }),
    tradingDate: day,
    isTradingDay: info.isTradingDay,
    isEarlyClose: info.early,
    holidayName: info.holidayName,
    regularOpenMinutes: REGULAR_OPEN,
    regularCloseMinutes: closeMin,
    nextOpenAt: new Date(nextOpenAt).toISOString(),
    nextCloseAt: new Date(nextCloseAt).toISOString(),
    source: info.source,
  };
}

/** True only during the regular session (incl. early-close sessions until 13:00). */
export function isRegularSession(now = Date.now()): boolean {
  const s = getMarketSession(now);
  return s.state === "OPEN" || s.state === "EARLY_CLOSE_SESSION";
}
