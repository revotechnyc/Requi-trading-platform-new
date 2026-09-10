/**
 * Day-based earnings calendar (Finnhub bulk calendar — no symbol required).
 * Powers queries like "what is Tuesday quarterly earnings".
 */
import { fetchWithRetry } from "./http";
import { intelligenceCache, LAYER_TTL_MS } from "./cache";
import { isNyseTradingDay } from "../marketdata/session";
import {
  epsSurprisePercent,
  fetchHistoricalEarnings,
  summarizeBeatHistory,
} from "./providers/earnings-history";

const UA = "Mozilla/5.0 (compatible; RequiTrading/1.0)";
const ET = "America/New_York";
const MAX_ROWS_IN_REPLY = 40;

export type EarningsSurpriseKind = "realized" | "expected_historical" | "unavailable";

export type EarningsDayRow = {
  symbol: string;
  date: string;
  reportTime: "BMO" | "AMC" | "DMH" | "unknown";
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  quarter: number | null;
  year: number | null;
  /** EPS surprise % when enrichment ran: realized or historical avg expected. */
  surprisePct?: number | null;
  surpriseKind?: EarningsSurpriseKind;
  /** Quarters used for historical expected surprise. */
  surpriseQuarters?: number | null;
  epsBeatRate?: number | null;
};

export type EarningsDayCalendarResult = {
  available: boolean;
  date: string;
  dateLabel: string;
  source: string;
  timestamp: string;
  rows: EarningsDayRow[];
  totalCount: number;
  truncated: boolean;
  error?: string;
  /** If true, `totalCount` is after applying a session filter (BMO/AMC/DMH). */
  sessionFiltered?: boolean;
  /** Original count before applying a session filter. */
  originalTotalCount?: number;
  /** Rows sorted by surprise % (desc) after enrichment. */
  rankedBySurprise?: boolean;
  /** Symbol with the highest surprise % among rows that have a numeric surprise. */
  largestSurpriseSymbol?: string | null;
  largestSurprisePct?: number | null;
  largestSurpriseKind?: EarningsSurpriseKind | null;
  /** Tickers the user named for a head-to-head comparison. */
  focusSymbolsRequested?: string[];
  /** Multi-day range metadata (when aggregating a date range into one board). */
  rangeFrom?: string;
  rangeTo?: string;
  /** Days inside the requested range that returned at least one calendar row. */
  daysWithRows?: string[];
  /** Days inside the requested range that were empty or unavailable. */
  daysMissingOrEmpty?: string[];
  /** True when at least one day in the range had no usable calendar rows. */
  coverageIncomplete?: boolean;
  /** Applied screen description for the reply header. */
  screenNotes?: string[];
  /** Rank mode used for ordering rows. */
  rankedByBeatRate?: boolean;
  /** When true, format BMO / AMC / other sections separately (no session filter). */
  splitBySession?: boolean;
};

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function etParts(d: Date = new Date()): { y: number; m: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    day: Number(get("day")),
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

function ymdFromEtParts(p: { y: number; m: number; day: number }): string {
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Add calendar days in ET by reconstructing noon UTC-ish via Date.UTC offset approximation. */
export function addEtDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  // Use UTC noon + shift so DST edge cases rarely flip the ET calendar date.
  const base = new Date(Date.UTC(y, m - 1, d, 17, 0, 0));
  base.setUTCDate(base.getUTCDate() + delta);
  return ymdFromEtParts(etParts(base));
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function parseCountToken(tok: string): number | null {
  const t = tok.trim().toLowerCase();
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return WORD_NUMBERS[t] ?? null;
}

/**
 * Move forward/backward by N NYSE trading days (skips weekends + full closures).
 * `n = 2` from Thu Sep 10 2026 → Mon Sep 14 2026.
 */
export function addEtTradingDays(ymd: string, n: number): string {
  if (!Number.isFinite(n) || n === 0) return ymd;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(Math.trunc(n));
  let cur = ymd;
  let guard = 0;
  while (left > 0 && guard < 400) {
    cur = addEtDays(cur, step);
    guard += 1;
    if (isNyseTradingDay(cur)) left -= 1;
  }
  return cur;
}

/**
 * Resolve relative trading-day offsets such as:
 * - "two trading days after tomorrow"
 * - "+2 trading days from tomorrow"
 * - "ER +2 trading days from tomorrow"
 * - "the next trading day after September 15, 2026"
 *
 * Must run before bare "tomorrow" matching, or the offset is dropped.
 */
export function resolveRelativeTradingDayOffset(text: string): string | null {
  const lower = text.toLowerCase().replace(/\s+/g, " ").trim();

  // "next trading day after <anchor>" / "the following trading day after <anchor>"
  const nextDay = lower.match(
    /\b(?:the\s+)?(?:next|following)\s+trading\s+day\s+(?:after|from|following)\s+(.+)$/i,
  );
  if (nextDay) {
    const anchorRaw = nextDay[1]!
      .split(/[,?]|\band\b|\bthat\b|\bwhich\b|\bwho\b|\bwith\b|\bhaving\b|\bamong\b/)[0]!
      .trim();
    const today = ymdFromEtParts(etParts());
    let anchor: string | null = null;
    if (/\btomorrow\b/.test(anchorRaw)) anchor = addEtDays(today, 1);
    else if (/\btoday\b/.test(anchorRaw)) anchor = today;
    else anchor = parseMonthDay(anchorRaw);
    if (anchor) return addEtTradingDays(anchor, 1);
  }

  const m = lower.match(
    /(?:\+|plus\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+trading\s+days?\s+(?:after|from|following)\s+(.+)$/i,
  );
  if (!m) return null;
  const n = parseCountToken(m[1]!);
  if (n === null) return null;

  // Keep only the anchor phrase (drop trailing ", and which ones report…").
  const anchorRaw = m[2]!
    .split(/[,?]|\band\b|\bthat\b|\bwhich\b|\bwho\b|\bwith\b|\bhaving\b|\bamong\b/)[0]!
    .trim();
  const today = ymdFromEtParts(etParts());
  let anchor: string | null = null;
  if (/\btomorrow\b/.test(anchorRaw)) anchor = addEtDays(today, 1);
  else if (/\btoday\b/.test(anchorRaw)) anchor = today;
  else anchor = parseMonthDay(anchorRaw);

  if (!anchor) return null;
  return addEtTradingDays(anchor, n);
}

function formatDateLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const approx = new Date(Date.UTC(y, m - 1, d, 17, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(approx);
}

function ymdFromDateParts(y: number, m: number, day: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Normalize common trader/plain variants so session + domain matchers stay consistent.
 * Safe, loss-less rewrites only (does not invent dates or symbols).
 */
export function normalizeTraderSlang(text: string): string {
  return text
    .replace(/\bpre[-\s]?market\b/gi, "premarket")
    .replace(/\bafter[-\s]?market\b/gi, "after-hours")
    .replace(/\bmid[-\s]?day\b/gi, "during market hours")
    .replace(/\bintraday\s+(?:earnings|er|report)\b/gi, "during market hours earnings")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDateWithYearInference(args: { month: number; day: number; year?: number }): string {
  const today = etParts();
  const baseYear = args.year ?? today.y;
  const candidate = new Date(Date.UTC(baseYear, args.month - 1, args.day, 12, 0, 0));
  const todayCandidate = new Date(Date.UTC(today.y, today.m - 1, today.day, 12, 0, 0));
  if (!args.year && candidate.getTime() < todayCandidate.getTime()) {
    // Prefer recent past (e.g. "ER 9/1" asked on 9/10 → this year), not next year.
    // Far-past month/day without a year still rolls forward (earnings boards look ahead).
    const daysBehind = Math.floor((todayCandidate.getTime() - candidate.getTime()) / 86_400_000);
    if (daysBehind <= 45) {
      return ymdFromDateParts(today.y, args.month, args.day);
    }
    return ymdFromDateParts(today.y + 1, args.month, args.day);
  }
  return ymdFromDateParts(baseYear, args.month, args.day);
}

function parseMonthDay(text: string): string | null {
  // Numeric date: 9/15, 09/15, optionally 9/15/2026
  const numeric = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (numeric) {
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    const year = numeric[3] ? Number(numeric[3]) : undefined;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const fullYear = year !== undefined && year < 100 ? 2000 + year : year;
      return parseDateWithYearInference({ month, day, year: fullYear });
    }
  }

  // Month name date: Sep 15, September 15, optional year: Sep 15 2026
  const monthName = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:\s*,?\s*(\d{2,4}))?\b/i,
  );
  if (monthName) {
    const key = monthName[1].toLowerCase();
    const month = MONTHS[key];
    const day = Number(monthName[2]);
    const year = monthName[3] ? Number(monthName[3]) : undefined;
    if (month && day >= 1 && day <= 31) {
      const fullYear = year !== undefined && year < 100 ? 2000 + year : year;
      return parseDateWithYearInference({ month, day, year: fullYear });
    }
  }

  return null;
}

/**
 * Resolve natural-language day references to an ET YYYY-MM-DD.
 * Returns null when the text is not a day-calendar style earnings query.
 */
export function resolveEarningsCalendarDate(text: string): string | null {
  const lower = normalizeTraderSlang(text).toLowerCase().replace(/\s+/g, " ").trim();
  // Accept common misspelling "quaterly" from client test prompts.
  // Also accept trader shorthand: ER, BMO/AMC/PM/AH.
  if (
    !/\bearnings?\b|\bquart?erly\b|\breport(?:s|ing)?\b|\bcalendar\b|\ber\b/i.test(lower) &&
    !/\b(bmo|amc|dmh|pm|premarket|ah|after[-\s]?hours)\b/i.test(lower) &&
    !/\btrading\s+days?\b/i.test(lower)
  ) {
    return null;
  }

  // Explicit ISO date wins.
  const iso = lower.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1]!;

  // Relative trading-day arithmetic MUST beat bare "tomorrow"/"today".
  const relativeTrading = resolveRelativeTradingDayOffset(lower);
  if (relativeTrading) return relativeTrading;

  // Numeric and month-name dates (e.g. 9/15, Sep 15, optional year).
  // Multi-day ranges are handled by resolveEarningsCalendarDateRange (called first by the intent parser).
  const monthDay = parseMonthDay(lower);
  if (monthDay) return monthDay;

  const today = ymdFromEtParts(etParts());

  if (/\btoday\b/.test(lower)) return today;
  if (/\btomorrow\b/.test(lower)) return addEtDays(today, 1);

  // "this week" → use today as the board day (caller may expand later).
  if (/\bthis week\b/.test(lower) && !/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(lower)) {
    return today;
  }

  for (const [name, targetDow] of Object.entries(WEEKDAY_INDEX)) {
    if (!new RegExp(`\\b${name}\\b`).test(lower)) continue;
    const { weekday } = etParts();
    let delta = (targetDow - weekday + 7) % 7;
    // "next Tuesday" → always the following week if today is Tuesday, else upcoming.
    if (/\bnext\b/.test(lower) && delta === 0) delta = 7;
    return addEtDays(today, delta);
  }

  // Undated day-board asks → today (plain + trader).
  // e.g. "earnings calendar", "who reports", "ER AMC", "ER BMO"
  if (
    /\bearnings?\s+calendar\b/.test(lower) ||
    /\bwho\s+reports?\b/.test(lower) ||
    /\bcompanies?\s+(?:that\s+)?report\b/.test(lower) ||
    /\bquart?erly\s+earnings\b/.test(lower) ||
    /\bwhat\s+are\s+(?:the\s+)?earnings\b/.test(lower) ||
    /\bshow\s+(?:me\s+)?(?:the\s+)?earnings\b/.test(lower) ||
    /\ber\b/.test(lower) ||
    (/\b(bmo|amc|dmh|premarket)\b/.test(lower) &&
      /\b(earnings?|report(?:s|ing)?|companies|who)\b/.test(lower))
  ) {
    return today;
  }

  return null;
}

export type EarningsCalendarDateRange = { from: string; to: string };

function parseDateToken(part: string): string | null {
  const cleaned = normalizeTraderSlang(part).toLowerCase().replace(/\s+/g, " ").trim();
  const monthDay = parseMonthDay(cleaned);
  if (monthDay) return monthDay;
  const today = ymdFromEtParts(etParts());
  if (/\btoday\b/.test(cleaned)) return today;
  if (/\btomorrow\b/.test(cleaned)) return addEtDays(today, 1);
  for (const [name, targetDow] of Object.entries(WEEKDAY_INDEX)) {
    if (!new RegExp(`\\b${name}\\b`).test(cleaned)) continue;
    const { weekday } = etParts();
    let delta = (targetDow - weekday + 7) % 7;
    if (/\bnext\b/.test(cleaned) && delta === 0) delta = 7;
    return addEtDays(today, delta);
  }
  return null;
}

export function resolveEarningsCalendarDateRange(text: string): EarningsCalendarDateRange | null {
  const lower = normalizeTraderSlang(text).toLowerCase().replace(/\s+/g, " ").trim();
  const today = ymdFromEtParts(etParts());

  // Buckets
  if (/\bnext\s+30\s+days\b/.test(lower)) {
    return { from: today, to: addEtDays(today, 29) };
  }

  if (/\bnext\s+week\b/.test(lower)) {
    const { weekday } = etParts();
    // Next Monday (weekday=1).
    let delta = (WEEKDAY_INDEX.monday - weekday + 7) % 7;
    if (delta === 0) delta = 7;
    const start = addEtDays(today, delta);
    const end = addEtDays(start, 6);
    return { from: start, to: end };
  }

  if (/\bthis\s+week\b/.test(lower) && !/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(lower)) {
    const { weekday } = etParts();
    const start = today;
    const end = addEtDays(today, 6 - weekday);
    return { from: start, to: end };
  }

  // "between <date> and <date>"
  const betweenIdx = lower.search(/\bbetween\b/);
  if (betweenIdx !== -1) {
    const after = lower.slice(betweenIdx + "between".length).trim();
    const andIdx = after.search(/\band\b/);
    if (andIdx !== -1) {
      const fromPart = after.slice(0, andIdx).trim();
      // Stop to-part at filter language ("that have…", "with…", comma clauses).
      const toRaw = after.slice(andIdx + 3).trim();
      const toPart = toRaw.split(/\bthat\b|\bwhich\b|\bwho\b|\bwith\b|,|\./)[0]!.trim();
      const fromDate = parseDateToken(fromPart);
      const toDate = parseDateToken(toPart);
      if (fromDate && toDate) {
        return fromDate <= toDate ? { from: fromDate, to: toDate } : { from: toDate, to: fromDate };
      }
    }
  }

  // Explicit ranges: "from <date> to/through/thru <date>"
  const fromIdx = lower.indexOf("from ");
  if (fromIdx !== -1) {
    const afterFrom = lower.slice(fromIdx + 5);
    const endMatch = afterFrom.match(/\s+(?:to|through|thru)\s+/);
    if (endMatch && endMatch.index !== undefined) {
      const fromPart = afterFrom.slice(0, endMatch.index).trim();
      const toPart = afterFrom
        .slice(endMatch.index + endMatch[0].length)
        .trim()
        .split(/\bthat\b|\bwhich\b|\bwho\b|\bwith\b|,|\./)[0]!
        .trim();
      const fromDate = parseDateToken(fromPart);
      const toDate = parseDateToken(toPart);
      if (fromDate && toDate) {
        return fromDate <= toDate ? { from: fromDate, to: toDate } : { from: toDate, to: fromDate };
      }
    }
  }

  // Month-name "to" / "through" / en-dash without "from"
  const monthSpan = lower.match(
    /\b((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:\s*,?\s*\d{2,4})?)\s*(?:to|through|thru|[-–—]|and)\s*((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:\s*,?\s*\d{2,4})?)\b/i,
  );
  if (monthSpan) {
    const fromDate = parseMonthDay(monthSpan[1]!);
    const toDate = parseMonthDay(monthSpan[2]!);
    if (fromDate && toDate) {
      return fromDate <= toDate ? { from: fromDate, to: toDate } : { from: toDate, to: fromDate };
    }
  }

  // Numeric dash range: 9/15-9/20, 9/14–9/18 (en/em dash)
  const dash = lower.match(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*[-–—]\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/);
  if (dash) {
    const fromDate = parseMonthDay(dash[1]!);
    const toDate = parseMonthDay(dash[2]!);
    if (fromDate && toDate) {
      return fromDate <= toDate ? { from: fromDate, to: toDate } : { from: toDate, to: fromDate };
    }
  }

  // "from today to Friday" / "today through Friday"
  const todayToWeekday = lower.match(
    /\b(?:from\s+)?today\s+(?:to|through|thru)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  );
  if (todayToWeekday) {
    const end = parseDateToken(todayToWeekday[1]!);
    if (end) {
      return today <= end ? { from: today, to: end } : { from: end, to: today };
    }
  }

  return null;
}

/** True when the user wants a day board, not a single-ticker next-earnings answer. */
export function isEarningsDayCalendarQuery(text: string): boolean {
  const lower = normalizeTraderSlang(text).toLowerCase();
  const looksLikeEarningsDomain =
    /\bearnings?\b|\bquart?erly\b|\breport(?:s|ing)?\b|\bcalendar\b|\ber\b/i.test(lower) ||
    /\b(bmo|amc|dmh|pm|premarket|ah|after[-\s]?hours)\b/i.test(lower) ||
    /\btrading\s+days?\b/i.test(lower) ||
    hasEarningsScreenIntent(lower);

  if (!looksLikeEarningsDomain) return false;

  // Single-ticker "when is Apple's next earnings" should stay on the per-symbol path.
  if (/\b(when\s+is|when\s+does|next\s+earnings|earnings\s+date)\b/i.test(lower)) {
    // Still allow day boards like "when are Tuesday earnings"
    if (
      !/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|this week|calendar|trading\s+days?|\d{1,2}\/\d{1,2}|20\d{2}-\d{2}-\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(
        lower,
      )
    ) {
      return false;
    }
  }

  if (resolveRelativeTradingDayOffset(text)) return true;
  if (resolveEarningsCalendarDateRange(text) !== null) return true;
  if (resolveEarningsCalendarDate(text) !== null) return true;
  // Screen-only prompts (neg EPS + hist surprise) default to a short forward window.
  if (hasEarningsScreenIntent(lower)) return true;
  return false;
}

export type EarningsCalendarRankBy = "surprise" | "beat_rate";

export type ParsedEarningsCalendarIntent = {
  domain: "earnings_calendar";
  timeScope: "single_date" | "date_range";
  date?: string;
  dateRange?: EarningsCalendarDateRange;
  sessionFilter: EarningsDayRow["reportTime"] | null;
  /** Rank / annotate by EPS surprise (realized or historical expected). */
  rankBySurprise: boolean;
  /** Explicit tickers named in the prompt (e.g. "Between PLUR and RZLT"). */
  focusSymbols: string[];
  /** Minimum historical/realized surprise % (exclusive): keep rows with surprisePct > threshold. */
  minSurprisePct: number | null;
  /** Minimum historical beat rate % (exclusive): keep rows with epsBeatRate > threshold. */
  minBeatRate: number | null;
  requireNegativeConsensusEps: boolean;
  requirePositiveHistSurprise: boolean;
  rankBy: EarningsCalendarRankBy | null;
  /** Strict beat-rate ordering; surprise is never a rank key (only optional tie-breaker when beat rates equal). */
  strictBeatRateRanking: boolean;
  /** Present BMO and AMC as separate sections (do not filter to one session). */
  splitBySession: boolean;
};

/** True when the user asks to separate/compare BMO vs AMC rather than filter to one. */
export function wantsSessionSplit(text: string): boolean {
  const lower = normalizeTraderSlang(text).toLowerCase().replace(/\s+/g, " ");
  if (/\b(separate|split)\b[\s\S]{0,40}\b(bmo|amc)\b/.test(lower)) return true;
  if (/\bbmo\s*(?:versus|vs\.?|vs|\/)\s*amc\b/.test(lower)) return true;
  if (/\bamc\s*(?:versus|vs\.?|vs|\/)\s*bmo\b/.test(lower)) return true;
  if (/\breport\s+bmo\s+versus\s+amc\b/.test(lower)) return true;
  if (/\bwhich\s+ones?\s+report\s+bmo\s+versus\s+amc\b/.test(lower)) return true;
  if (/\bboth\s+(?:sessions|bmo\s+and\s+amc|amc\s+and\s+bmo)\b/.test(lower)) return true;
  // "BMO and AMC" without an exclusive filter word → split both sessions
  if (/\bbmo\s+and\s+amc\b/.test(lower) || /\bamc\s+and\s+bmo\b/.test(lower)) {
    if (!/\b(only|just|exclusively)\b/.test(lower)) return true;
  }
  return false;
}

function extractEarningsSessionFilter(text: string): EarningsDayRow["reportTime"] | null {
  if (wantsSessionSplit(text)) return null;
  const lower = normalizeTraderSlang(text).toLowerCase();
  if (/\b(dmh|during\s+market\s+hours)\b/i.test(lower)) return "DMH";
  // premarket → before open
  if (/\b(premarket|\bpm\b)\b/i.test(lower)) return "BMO";
  // after-hours → after close
  if (/\b(after[-\s]?hours|\bah\b)\b/i.test(lower)) return "AMC";
  // Plain English: "before the market opens", "before market open"
  if (/\bbefore\s+(?:the\s+)?market\s+opens?\b/i.test(lower)) return "BMO";
  if (/\b(bmo|before\s+market\s+open|before\s+the\s+open)\b/i.test(lower)) return "BMO";
  // Plain English: "after the market closes", "after market close"
  if (/\bafter\s+(?:the\s+)?market\s+clos(?:e|es|ing)\b/i.test(lower)) return "AMC";
  if (/\b(amc|after\s+market\s+close|after\s+the\s+close)\b/i.test(lower)) return "AMC";
  return null;
}

/** True when the user asks which names have the largest / expected EPS surprise. */
export function wantsEarningsSurpriseRanking(text: string): boolean {
  const lower = text.toLowerCase();
  if (/\b(eps\s+)?surprise\b/.test(lower)) return true;
  if (/\blargest\s+expected\s+eps\b/.test(lower)) return true;
  if (/\bexpected\s+eps\s+surprise\b/.test(lower)) return true;
  if (/\bbiggest\s+(?:eps\s+)?surprise\b/.test(lower)) return true;
  if (/\bbetter\s+expected\b/.test(lower)) return true;
  if (/\bmore\s+likely\s+to\s+beat\b/.test(lower)) return true;
  if (/\bbeat\s+estimates?\b/.test(lower)) return true;
  if (/\bconsensus\s+eps\b/.test(lower) && /\b(surprise|beat|compare|between|vs\.?|versus)\b/.test(lower)) {
    return true;
  }
  return false;
}

export function parseMinSurpriseThreshold(text: string): number | null {
  const lower = text.toLowerCase().replace(/\s+/g, " ");
  const patterns = [
    /(?:surprise|eps\s+surprise(?:\s+proxy)?)\s*(?:>|above|over|greater\s+than)\s*(\d+(?:\.\d+)?)\s*%?/,
    /(?:>|above|over)\s*(\d+(?:\.\d+)?)\s*%\s*(?:eps\s+)?surprise/,
    /surprise\s*>\s*(\d+(?:\.\d+)?)\s*%?/,
  ];
  for (const re of patterns) {
    const m = lower.match(re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

export function parseMinBeatRateThreshold(text: string): number | null {
  const lower = text.toLowerCase().replace(/\s+/g, " ");
  const patterns = [
    /(?:hist(?:orical)?\s+)?beat\s*rate\s*(?:>|above|over|greater\s+than)\s*(\d+(?:\.\d+)?)\s*%?/,
    /beat\s*rate\s*>\s*(\d+(?:\.\d+)?)\s*%?/,
  ];
  for (const re of patterns) {
    const m = lower.match(re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

export function hasEarningsScreenIntent(text: string): boolean {
  const lower = text.toLowerCase().replace(/\s+/g, " ");
  if (parseMinSurpriseThreshold(lower) !== null) return true;
  if (parseMinBeatRateThreshold(lower) !== null) return true;
  if (/\b(negative\s+consensus\s+eps|consensus\s+eps\s*<\s*0|eps\s*<\s*0)\b/.test(lower)) return true;
  if (/\bhist(?:orical)?(?:\s+avg(?:erage)?)?\s+surprise\s*>\s*0\b/.test(lower)) return true;
  if (/\bhistorical\s+average\s+eps\s+surprise\s+is\s+positive\b/.test(lower)) return true;
  if (/\bpositive\s+historical\s+(?:eps\s+)?surprise\b/.test(lower)) return true;
  if (/\bhistorical\s+(?:eps\s+)?surprise\b[\s\S]{0,40}\bpositive\b/.test(lower)) return true;
  if (/\brank(?:ed|ing)?\b[\s\S]{0,40}\b(beat\s*rate|historical\s+beat)\b/.test(lower)) return true;
  if (/\brank\s+by\s+beat\s*%/.test(lower)) return true;
  return false;
}

export function wantsStrictBeatRateRanking(text: string): boolean {
  const lower = text.toLowerCase().replace(/\s+/g, " ");
  if (/\bstrict(?:ly)?\b[\s\S]{0,40}\bbeat\s*rate\b/.test(lower)) return true;
  if (/\brank(?:ed|ing)?\b[\s\S]{0,60}\b(by\s+)?historical\s+beat\s*rate\b/.test(lower)) return true;
  if (/\brank\s+by\s+beat\s*%/.test(lower)) return true;
  if (/\bdo\s+not\s+use\s+surprise\b/.test(lower)) return true;
  return false;
}

const FOCUS_TICKER_STOP = new Set([
  "AMC",
  "BMO",
  "DMH",
  "EPS",
  "ER",
  "ET",
  "US",
  "SEP",
  "SEPT",
  "OCT",
  "NOV",
  "DEC",
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "JUN",
  "JUL",
  "AUG",
  "AND",
  "THE",
  "FOR",
  "SHOW",
  "ME",
  "ONE",
  "HAS",
  "WHICH",
  "BETWEEN",
  "VERSUS",
  "VS",
]);

/**
 * Pull explicitly named tickers for head-to-head comparisons
 * (e.g. "Between PLUR and RZLT").
 */
export function extractEarningsFocusSymbols(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/\b[A-Z]{1,5}\b/g)) {
    const sym = m[0]!;
    if (FOCUS_TICKER_STOP.has(sym) || seen.has(sym)) continue;
    // Skip month-day numeric leftovers already handled; keep real tickers.
    if (sym.length < 2) continue;
    seen.add(sym);
    out.push(sym);
  }
  return out;
}

function defaultScreenDateRange(): EarningsCalendarDateRange {
  const today = ymdFromEtParts(etParts());
  // Keep short — surprise enrichment is per-symbol network I/O.
  return { from: today, to: addEtDays(today, 7) };
}

/**
 * Canonical parser for earnings day-board requests.
 * This is used to ensure that plain English and trader shorthand resolve
 * to the same internal intent shape before we call deterministic handlers.
 */
export function parseEarningsCalendarIntent(text: string): ParsedEarningsCalendarIntent | null {
  const lower = normalizeTraderSlang(text).toLowerCase();

  // Domain gate (earnings calendar intent, including trader shorthand + screens).
  if (
    !/\bearnings?\b|\bquart?erly\b|\breport(?:s|ing)?\b|\bcalendar\b|\ber\b/i.test(lower) &&
    !/\b(bmo|amc|dmh|pm|premarket|ah|after[-\s]?hours)\b/i.test(lower) &&
    !/\btrading\s+days?\b/i.test(lower) &&
    !hasEarningsScreenIntent(lower)
  ) {
    return null;
  }

  // Single-ticker "when is Apple's next earnings" should stay on per-symbol path.
  if (/\b(when\s+is|when\s+does|next\s+earnings|earnings\s+date)\b/i.test(lower)) {
    if (
      !/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|this week|calendar|trading\s+days?|\d{1,2}\/\d{1,2}|20\d{2}-\d{2}-\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(
        lower,
      )
    ) {
      return null;
    }
  }

  const splitBySession = wantsSessionSplit(text);
  const sessionFilter = extractEarningsSessionFilter(text);
  const minSurprisePct = parseMinSurpriseThreshold(text);
  const minBeatRate = parseMinBeatRateThreshold(text);
  const requireNegativeConsensusEps =
    /\b(negative\s+consensus\s+eps|consensus\s+eps\s*<\s*0|eps\s*<\s*0)\b/.test(lower);
  const requirePositiveHistSurprise =
    /\bhist(?:orical)?(?:\s+avg(?:erage)?)?\s+surprise\s*>\s*0\b/.test(lower) ||
    /\bhistorical\s+average\s+eps\s+surprise\s+is\s+positive\b/.test(lower) ||
    /\bpositive\s+historical\s+(?:eps\s+)?surprise\b/.test(lower) ||
    /\bhistorical\s+(?:eps\s+)?surprise\b[\s\S]{0,40}\bpositive\b/.test(lower);
  const strictBeatRateRanking = wantsStrictBeatRateRanking(text);
  const rankBy: EarningsCalendarRankBy | null = strictBeatRateRanking
    ? "beat_rate"
    : wantsEarningsSurpriseRanking(text) || minSurprisePct !== null || minBeatRate !== null || requirePositiveHistSurprise
      ? "surprise"
      : null;
  const rankBySurprise =
    rankBy === "surprise" ||
    rankBy === "beat_rate" ||
    minSurprisePct !== null ||
    minBeatRate !== null ||
    requireNegativeConsensusEps ||
    requirePositiveHistSurprise;
  const focusSymbols = extractEarningsFocusSymbols(text);

  const dateRange = resolveEarningsCalendarDateRange(text);
  if (dateRange) {
    return {
      domain: "earnings_calendar",
      timeScope: "date_range",
      dateRange,
      sessionFilter,
      rankBySurprise,
      focusSymbols,
      minSurprisePct,
      minBeatRate,
      requireNegativeConsensusEps,
      requirePositiveHistSurprise,
      rankBy,
      strictBeatRateRanking,
      splitBySession,
    };
  }

  const date = resolveEarningsCalendarDate(text);
  if (date) {
    return {
      domain: "earnings_calendar",
      timeScope: "single_date",
      date,
      sessionFilter,
      rankBySurprise,
      focusSymbols,
      minSurprisePct,
      minBeatRate,
      requireNegativeConsensusEps,
      requirePositiveHistSurprise,
      rankBy,
      strictBeatRateRanking,
      splitBySession,
    };
  }

  // Screen-only prompts without an explicit date → short forward window (stated in reply).
  if (hasEarningsScreenIntent(lower)) {
    return {
      domain: "earnings_calendar",
      timeScope: "date_range",
      dateRange: defaultScreenDateRange(),
      sessionFilter,
      rankBySurprise: true,
      focusSymbols,
      minSurprisePct,
      minBeatRate,
      requireNegativeConsensusEps,
      requirePositiveHistSurprise,
      rankBy: rankBy ?? (strictBeatRateRanking ? "beat_rate" : "surprise"),
      strictBeatRateRanking,
      splitBySession,
    };
  }

  return null;
}

function mapHour(hour: string | undefined | null): EarningsDayRow["reportTime"] {
  const h = (hour ?? "").toLowerCase();
  if (h === "bmo" || h === "amc" || h === "dmh") return h.toUpperCase() as EarningsDayRow["reportTime"];
  return "unknown";
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function finnhubEarningsForDate(ymd: string): Promise<EarningsDayRow[]> {
  const key = process.env.FINNHUB_API_KEY?.trim();
  if (!key) {
    throw new Error("FINNHUB_API_KEY not configured");
  }
  const url =
    `https://finnhub.io/api/v1/calendar/earnings?from=${ymd}&to=${ymd}&token=${key}`;
  const res = await fetchWithRetry(url, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    throw new Error(`Finnhub earnings calendar HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    earningsCalendar?: Array<{
      date?: string;
      epsActual?: number | null;
      epsEstimate?: number | null;
      hour?: string | null;
      quarter?: number | null;
      revenueActual?: number | null;
      revenueEstimate?: number | null;
      symbol?: string;
      year?: number | null;
    }>;
  };
  const rows: EarningsDayRow[] = [];
  for (const row of data.earningsCalendar ?? []) {
    const symbol = row.symbol?.trim().toUpperCase();
    if (!symbol) continue;
    rows.push({
      symbol,
      date: row.date ?? ymd,
      reportTime: mapHour(row.hour),
      epsEstimate: numOrNull(row.epsEstimate),
      epsActual: numOrNull(row.epsActual),
      revenueEstimate: numOrNull(row.revenueEstimate),
      revenueActual: numOrNull(row.revenueActual),
      quarter: typeof row.quarter === "number" ? row.quarter : null,
      year: typeof row.year === "number" ? row.year : null,
    });
  }
  rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return rows;
}

export async function fetchEarningsCalendarForDate(ymd: string): Promise<EarningsDayCalendarResult> {
  const timestamp = new Date().toISOString();
  const dateLabel = formatDateLabel(ymd);
  try {
    const rows = await intelligenceCache.through(
      `earnings-day:${ymd}:v1`,
      LAYER_TTL_MS.earnings,
      () => finnhubEarningsForDate(ymd),
    );
    const truncated = rows.length > MAX_ROWS_IN_REPLY;
    return {
      available: true,
      date: ymd,
      dateLabel,
      source: "Finnhub",
      timestamp,
      rows: rows.slice(0, MAX_ROWS_IN_REPLY),
      totalCount: rows.length,
      truncated,
    };
  } catch (e) {
    return {
      available: false,
      date: ymd,
      dateLabel,
      source: "Finnhub",
      timestamp,
      rows: [],
      totalCount: 0,
      truncated: false,
      error: (e as Error).message,
    };
  }
}

function fmtEps(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : v.toFixed(2);
}

function fmtRev(v: number | null): string {
  if (v === null) return "—";
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return String(Math.round(v));
}

function fmtSurprisePct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function fmtSurpriseKind(kind: EarningsSurpriseKind | undefined): string {
  if (kind === "realized") return "realized";
  if (kind === "expected_historical") return "hist avg";
  return "—";
}

/**
 * Enrich calendar rows with EPS surprise %.
 * - Realized: (actual − estimate) / |estimate| × 100 when this day's actual is present.
 * - Expected (pre-report): historical average surprise % from Finnhub /stock/earnings
 *   (Alpha Vantage backfill is disabled on day-boards — free-tier AV stalls parallel enrich).
 */
export async function enrichRowsWithEpsSurprise(rows: EarningsDayRow[]): Promise<EarningsDayRow[]> {
  const CONCURRENCY = 4;
  const MAX_ENRICH = Math.min(rows.length, MAX_ROWS_IN_REPLY);
  const target = rows.slice(0, MAX_ENRICH);
  const out: EarningsDayRow[] = new Array(target.length);

  async function enrichOne(row: EarningsDayRow): Promise<EarningsDayRow> {
    const realized = epsSurprisePercent(row.epsActual, row.epsEstimate);
    if (realized !== null) {
      return {
        ...row,
        surprisePct: realized,
        surpriseKind: "realized" as const,
        surpriseQuarters: null,
        epsBeatRate: null,
      };
    }

    try {
      const hist = await fetchHistoricalEarnings(row.symbol, { allowAlphaVantageBackfill: false });
      if (!hist.available || !hist.rows.length) {
        return {
          ...row,
          surprisePct: null,
          surpriseKind: "unavailable" as const,
          surpriseQuarters: 0,
          epsBeatRate: null,
        };
      }
      const summary = summarizeBeatHistory(hist.rows);
      return {
        ...row,
        surprisePct: summary.avgSurprisePct,
        surpriseKind: summary.avgSurprisePct === null ? ("unavailable" as const) : ("expected_historical" as const),
        surpriseQuarters: summary.quarters,
        epsBeatRate: summary.epsBeatRate,
      };
    } catch {
      return {
        ...row,
        surprisePct: null,
        surpriseKind: "unavailable" as const,
        surpriseQuarters: null,
        epsBeatRate: null,
      };
    }
  }

  let cursor = 0;
  async function worker() {
    while (cursor < target.length) {
      const i = cursor;
      cursor += 1;
      out[i] = await enrichOne(target[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, target.length) }, () => worker()));

  // Preserve any rows beyond the enrich cap without surprise fields (honest truncation).
  return [...out, ...rows.slice(MAX_ENRICH)];
}

/** Sort by surprise % desc (nulls last), then symbol. Attach ranking metadata on the result. */
export function applySurpriseRanking(result: EarningsDayCalendarResult): EarningsDayCalendarResult {
  const ranked = [...result.rows].sort((a, b) => {
    const av = a.surprisePct;
    const bv = b.surprisePct;
    if (av === null || av === undefined) {
      if (bv === null || bv === undefined) return a.symbol.localeCompare(b.symbol);
      return 1;
    }
    if (bv === null || bv === undefined) return -1;
    if (bv !== av) return bv - av;
    return a.symbol.localeCompare(b.symbol);
  });

  const leader = ranked.find((r) => r.surprisePct !== null && r.surprisePct !== undefined);
  return {
    ...result,
    rows: ranked,
    rankedBySurprise: true,
    rankedByBeatRate: false,
    largestSurpriseSymbol: leader?.symbol ?? null,
    largestSurprisePct: leader?.surprisePct ?? null,
    largestSurpriseKind: leader?.surpriseKind ?? null,
  };
}

/**
 * Rank strictly by historical beat rate (desc).
 * Surprise % is used ONLY when beat rates are exactly equal (stable tie-breaker),
 * and only when the caller did not forbid it — we still document primary key = beat rate.
 */
export function applyBeatRateRanking(
  result: EarningsDayCalendarResult,
  opts?: { allowSurpriseTieBreak?: boolean },
): EarningsDayCalendarResult {
  const allowTie = opts?.allowSurpriseTieBreak !== false;
  const ranked = [...result.rows].sort((a, b) => {
    const ar = a.epsBeatRate;
    const br = b.epsBeatRate;
    if (ar === null || ar === undefined) {
      if (br === null || br === undefined) return a.symbol.localeCompare(b.symbol);
      return 1;
    }
    if (br === null || br === undefined) return -1;
    if (br !== ar) return br - ar;
    if (allowTie) {
      const as = a.surprisePct;
      const bs = b.surprisePct;
      if (as != null && bs != null && as !== bs) return bs - as;
    }
    return a.symbol.localeCompare(b.symbol);
  });

  return {
    ...result,
    rows: ranked,
    rankedBySurprise: false,
    rankedByBeatRate: true,
  };
}

function applyCalendarScreens(
  rows: EarningsDayRow[],
  opts: {
    minSurprisePct: number | null;
    minBeatRate: number | null;
    requireNegativeConsensusEps: boolean;
    requirePositiveHistSurprise: boolean;
  },
): { rows: EarningsDayRow[]; notes: string[] } {
  const notes: string[] = [];
  let next = rows;

  if (opts.minSurprisePct !== null) {
    notes.push(`Screen: expected/realized EPS surprise % > ${opts.minSurprisePct}`);
    next = next.filter(
      (r) => r.surprisePct !== null && r.surprisePct !== undefined && r.surprisePct > opts.minSurprisePct!,
    );
  }
  if (opts.requirePositiveHistSurprise) {
    notes.push("Screen: historical average EPS surprise > 0");
    next = next.filter(
      (r) =>
        r.surpriseKind === "expected_historical" &&
        r.surprisePct !== null &&
        r.surprisePct !== undefined &&
        r.surprisePct > 0,
    );
  }
  if (opts.minBeatRate !== null) {
    notes.push(`Screen: historical beat rate > ${opts.minBeatRate}%`);
    next = next.filter(
      (r) => r.epsBeatRate !== null && r.epsBeatRate !== undefined && r.epsBeatRate > opts.minBeatRate!,
    );
  }
  if (opts.requireNegativeConsensusEps) {
    notes.push("Screen: consensus EPS < 0");
    next = next.filter((r) => r.epsEstimate !== null && r.epsEstimate < 0);
  }
  return { rows: next, notes };
}

function buildSurpriseComparisonSection(result: EarningsDayCalendarResult): string[] {
  const lines: string[] = [];
  const rows = result.rows;
  const withSurprise = rows.filter((r) => r.surprisePct !== null && r.surprisePct !== undefined);
  const withoutSurprise = rows.filter((r) => r.surprisePct === null || r.surprisePct === undefined);

  if (result.rankedByBeatRate) {
    lines.push("### Ranking (historical beat rate)");
    lines.push("");
    lines.push(
      "Primary sort key: **historical EPS beat rate** (desc). Surprise % is not a ranking factor unless two names share the exact same beat rate (tie-break only).",
    );
    lines.push("");
    const withBeat = rows.filter((r) => r.epsBeatRate !== null && r.epsBeatRate !== undefined);
    if (!withBeat.length) {
      lines.push("**Verdict:** Cannot rank by beat rate — historical beat rates unavailable for these rows.");
      return lines;
    }
    const best = withBeat[0]!;
    lines.push(
      `**Top-ranked:** **${best.symbol}** with a ${best.epsBeatRate!.toFixed(0)}% historical beat rate` +
        (best.surprisePct != null ? ` (hist avg surprise ${fmtSurprisePct(best.surprisePct)}; not used as the rank key).` : "."),
    );
    for (const row of withBeat) {
      lines.push(
        `- **${row.symbol}:** beat rate ${row.epsBeatRate!.toFixed(0)}%` +
          (row.surpriseQuarters != null ? ` over ${row.surpriseQuarters} quarters` : "") +
          `; consensus EPS ${fmtEps(row.epsEstimate)}; hist avg surprise ${fmtSurprisePct(row.surprisePct)}`,
      );
    }
    return lines;
  }

  lines.push("### EPS surprise comparison");
  lines.push("");
  lines.push(
    "Finnhub calendar **EPS estimate = consensus EPS** for the upcoming report. Expected surprise % is not the same as that estimate level.",
  );
  lines.push("");

  if (withSurprise.length === 0) {
    const consensusBits = rows
      .map((r) => `${r.symbol} ${fmtEps(r.epsEstimate)}`)
      .join("; ");
    lines.push(
      `**Verdict:** Cannot rank expected EPS surprise for ${rows.map((r) => r.symbol).join(" vs ")}.`,
    );
    lines.push(
      `The calendar confirms the AMC/BMO timing and provides consensus EPS (${consensusBits || "n/a"}), but this day's **EPS actual is not reported yet**, and **no usable historical surprise series** was returned from Finnhub \`/stock/earnings\` (or Alpha Vantage backfill) for these symbols.`,
    );
    lines.push(
      "I will not invent a consensus-vs-actual surprise or claim one name is more likely to beat solely because one consensus EPS number is higher than the other (e.g. −0.15 vs −0.67 is **not** an expected-surprise ranking).",
    );
    return lines;
  }

  const sorted = [...withSurprise].sort((a, b) => (b.surprisePct ?? -Infinity) - (a.surprisePct ?? -Infinity));
  const best = sorted[0]!;

  if (best.surpriseKind === "realized") {
    lines.push(
      `**Verdict:** **${best.symbol}** has the better **realized** EPS surprise on this calendar day at ${fmtSurprisePct(best.surprisePct)} (actual vs consensus).`,
    );
  } else {
    const beatNote =
      best.epsBeatRate !== null && best.epsBeatRate !== undefined
        ? ` Historical EPS beat rate: ${best.epsBeatRate.toFixed(0)}% over ${best.surpriseQuarters ?? "n/a"} quarters.`
        : "";
    lines.push(
      `**Verdict:** **${best.symbol}** has the better **expected** EPS surprise at ${fmtSurprisePct(best.surprisePct)} (historical average surprise %).${beatNote}`,
    );
    const others = sorted.slice(1).map((r) => r.symbol).join(", ");
    lines.push(
      `On that screening signal alone, **${best.symbol}** is more likely to beat consensus than ${others || "the other names"} — this is **not** a guarantee for the upcoming print.`,
    );
  }

  for (const row of sorted) {
    const basis =
      row.surpriseKind === "realized"
        ? "realized (this day's actual vs consensus)"
        : `hist avg over ${row.surpriseQuarters ?? "?"} quarters`;
    const beat =
      row.epsBeatRate !== null && row.epsBeatRate !== undefined
        ? `; hist beat rate ${row.epsBeatRate.toFixed(0)}%`
        : "";
    lines.push(
      `- **${row.symbol}:** consensus EPS ${fmtEps(row.epsEstimate)}; expected/realized surprise ${fmtSurprisePct(row.surprisePct)} (${basis}${beat})`,
    );
  }

  if (withoutSurprise.length) {
    lines.push(
      `- No surprise % for: ${withoutSurprise.map((r) => r.symbol).join(", ")} (missing actual and/or historical rows).`,
    );
  }

  return lines;
}

function formatRowTable(
  rows: EarningsDayRow[],
  showSurprise: boolean,
): string[] {
  const lines: string[] = [];
  if (showSurprise) {
    lines.push(
      "| Symbol | Date | Timing | Consensus EPS | EPS act | Surprise % | Basis | Hist beat % | Rev est |",
      "|--------|------|--------|---------------|---------|------------|-------|-------------|---------|",
    );
    for (const row of rows) {
      const timing = row.reportTime === "unknown" ? "—" : row.reportTime;
      const beat =
        row.epsBeatRate === null || row.epsBeatRate === undefined ? "—" : `${row.epsBeatRate.toFixed(0)}%`;
      lines.push(
        `| ${row.symbol} | ${row.date} | ${timing} | ${fmtEps(row.epsEstimate)} | ${fmtEps(row.epsActual)} | ${fmtSurprisePct(row.surprisePct)} | ${fmtSurpriseKind(row.surpriseKind)} | ${beat} | ${fmtRev(row.revenueEstimate)} |`,
      );
    }
  } else {
    lines.push(
      "| Symbol | Date | Timing | Consensus EPS | Rev est |",
      "|--------|------|--------|---------------|---------|",
    );
    for (const row of rows) {
      const timing = row.reportTime === "unknown" ? "—" : row.reportTime;
      lines.push(
        `| ${row.symbol} | ${row.date} | ${timing} | ${fmtEps(row.epsEstimate)} | ${fmtRev(row.revenueEstimate)} |`,
      );
    }
  }
  return lines;
}

export function formatEarningsDayCalendarReply(result: EarningsDayCalendarResult): string {
  if (!result.available) {
    return [
      `**US quarterly earnings calendar — ${result.dateLabel}**`,
      "",
      `**Unavailable** from the earnings calendar source.`,
      `- **Date (ET):** ${result.date}`,
      `- **Source:** ${result.source}`,
      `- **Reason:** ${result.error ?? "calendar fetch failed"}`,
      `- **As of:** ${result.timestamp}`,
      "",
      "I won't invent a list of reporting companies. Configure or restore Finnhub calendar access and retry.",
    ].join("\n");
  }

  const isRange = Boolean(result.rangeFrom && result.rangeTo);
  const title = isRange
    ? `**US quarterly earnings — ${formatDateLabel(result.rangeFrom!)} → ${formatDateLabel(result.rangeTo!)} (ET)**`
    : `**US quarterly earnings — ${result.dateLabel} (ET)**`;

  if (!result.totalCount) {
    const sessionFiltered = result.sessionFiltered && (result.originalTotalCount ?? 0) > 0;
    const focusMiss =
      result.focusSymbolsRequested && result.focusSymbolsRequested.length > 0
        ? ` Named symbols (${result.focusSymbolsRequested.join(", ")}) were not on the filtered calendar.`
        : "";
    const coverage =
      isRange && result.coverageIncomplete
        ? [
            "",
            `**Coverage incomplete for requested range ${result.rangeFrom} → ${result.rangeTo}.**`,
            `- Days with rows: ${(result.daysWithRows ?? []).join(", ") || "none"}`,
            `- Days empty/unavailable: ${(result.daysMissingOrEmpty ?? []).join(", ") || "none"}`,
          ]
        : [];
    return [
      title,
      "",
      sessionFiltered
        ? `No companies match the requested filters for this calendar board.${focusMiss}`
        : `No companies appear on the Finnhub earnings calendar for this board after filters.${focusMiss}`,
      `- **Source:** ${result.source}`,
      `- **As of:** ${result.timestamp}`,
      ...(result.screenNotes ?? []).map((n) => `- ${n}`),
      ...coverage,
      "",
      "This is a verified empty result — not an estimate.",
    ].join("\n");
  }

  const showSurprise = Boolean(result.rankedBySurprise || result.rankedByBeatRate);
  const lines = [
    title,
    "",
    `- **Source:** ${result.source} (confirmed calendar)`,
    `- **As of:** ${result.timestamp}`,
    `- **Companies on calendar:** ${result.totalCount}${result.truncated ? ` (showing first ${result.rows.length})` : ""}`,
  ];

  if (isRange) {
    lines.push(`- **Requested range (ET):** ${result.rangeFrom} → ${result.rangeTo}`);
    lines.push(`- **Days with calendar rows:** ${(result.daysWithRows ?? []).join(", ") || "none"}`);
    if (result.coverageIncomplete) {
      lines.push(
        `- **Coverage incomplete:** days empty/unavailable: ${(result.daysMissingOrEmpty ?? []).join(", ") || "none"}`,
      );
      lines.push(
        "- Results below include **only** days Finnhub returned. Missing days were not invented.",
      );
    } else {
      lines.push("- **Coverage:** complete for every day in the requested range.");
    }
  }

  if (result.screenNotes?.length) {
    for (const n of result.screenNotes) lines.push(`- ${n}`);
  }

  if (result.focusSymbolsRequested?.length) {
    lines.push(`- **Focus symbols:** ${result.focusSymbolsRequested.join(", ")}`);
  }

  if (result.rankedByBeatRate) {
    const top = result.rows.find((r) => r.epsBeatRate != null);
    if (top?.epsBeatRate != null) {
      lines.push(`- **Highest historical beat rate:** **${top.symbol}** at ${top.epsBeatRate.toFixed(0)}%`);
    }
  } else if (result.rankedBySurprise) {
    if (result.largestSurpriseSymbol != null && result.largestSurprisePct != null) {
      const kindLabel =
        result.largestSurpriseKind === "realized"
          ? "realized EPS surprise (actual vs consensus on this calendar day)"
          : "expected EPS surprise (historical avg surprise %)";
      lines.push(
        `- **Largest ${kindLabel}:** **${result.largestSurpriseSymbol}** at ${fmtSurprisePct(result.largestSurprisePct)}`,
      );
    } else {
      lines.push(
        "- **Largest expected EPS surprise:** unavailable from retrieved actuals/history (see comparison notes below).",
      );
    }
  }

  lines.push("");

  if (result.splitBySession) {
    const groups: Array<{ label: string; key: EarningsDayRow["reportTime"] }> = [
      { label: "BMO (before open)", key: "BMO" },
      { label: "AMC (after close)", key: "AMC" },
      { label: "DMH (during market hours)", key: "DMH" },
      { label: "Timing unknown", key: "unknown" },
    ];
    for (const g of groups) {
      const subset = result.rows.filter((r) => r.reportTime === g.key);
      if (!subset.length) continue;
      lines.push(`### ${g.label} · ${subset.length}`);
      lines.push("");
      lines.push(...formatRowTable(subset, showSurprise));
      lines.push("");
    }
  } else {
    lines.push(...formatRowTable(result.rows, showSurprise));
  }

  if (showSurprise) {
    lines.push("");
    lines.push(...buildSurpriseComparisonSection(result));
  }

  lines.push(
    "",
    "Timing: **BMO** = before open, **AMC** = after close, **DMH** = during market hours.",
  );

  if (showSurprise) {
    lines.push(
      "Surprise % = (Actual EPS − Consensus EPS) ÷ |Consensus EPS| × 100.",
      "**Consensus EPS** = Finnhub calendar `epsEstimate` for this report date.",
      "**realized** = this calendar day's actual vs consensus when already reported.",
      "**hist avg** = average of that formula over prior reported quarters (expected-surprise proxy before the print).",
      "Near-zero consensus quarters are excluded from % averages (unstable).",
    );
  }

  lines.push("I won't invent companies or surprise percentages beyond retrieved Finnhub/Alpha Vantage data.");
  if (result.truncated) {
    lines.push(`List truncated at ${MAX_ROWS_IN_REPLY} symbols — ask for a specific ticker for full detail.`);
  }
  return lines.join("\n");
}

async function finalizeCalendarResult(
  result: EarningsDayCalendarResult,
  opts: {
    sessionFilter: EarningsDayRow["reportTime"] | null;
    rankBySurprise: boolean;
    focusSymbols?: string[];
    minSurprisePct?: number | null;
    minBeatRate?: number | null;
    requireNegativeConsensusEps?: boolean;
    requirePositiveHistSurprise?: boolean;
    rankBy?: EarningsCalendarRankBy | null;
    strictBeatRateRanking?: boolean;
    splitBySession?: boolean;
  },
): Promise<EarningsDayCalendarResult> {
  let next: EarningsDayCalendarResult = {
    ...result,
    focusSymbolsRequested: opts.focusSymbols?.length ? opts.focusSymbols : undefined,
    splitBySession: opts.splitBySession || undefined,
  };

  if (next.available && opts.sessionFilter) {
    const originalTotal = next.totalCount;
    const filtered = next.rows.filter((r) => r.reportTime === opts.sessionFilter);
    next = {
      ...next,
      rows: filtered,
      totalCount: filtered.length,
      originalTotalCount: originalTotal,
      sessionFiltered: true,
    };
  }

  if (next.available && opts.focusSymbols && opts.focusSymbols.length > 0) {
    const want = new Set(opts.focusSymbols.map((s) => s.toUpperCase()));
    const focused = next.rows.filter((r) => want.has(r.symbol));
    // Only narrow when at least one named symbol is on the board (avoid emptying on false ticker hits like SEP).
    if (focused.length > 0) {
      next = {
        ...next,
        rows: focused,
        totalCount: focused.length,
      };
    }
  }

  const needsEnrich =
    next.available &&
    next.rows.length > 0 &&
    (opts.rankBySurprise ||
      opts.minSurprisePct != null ||
      opts.minBeatRate != null ||
      opts.requireNegativeConsensusEps ||
      opts.requirePositiveHistSurprise ||
      opts.rankBy === "beat_rate");

  if (needsEnrich) {
    const enriched = await enrichRowsWithEpsSurprise(next.rows);
    next = { ...next, rows: enriched };
  }

  if (next.available) {
    const screened = applyCalendarScreens(next.rows, {
      minSurprisePct: opts.minSurprisePct ?? null,
      minBeatRate: opts.minBeatRate ?? null,
      requireNegativeConsensusEps: Boolean(opts.requireNegativeConsensusEps),
      requirePositiveHistSurprise: Boolean(opts.requirePositiveHistSurprise),
    });
    next = {
      ...next,
      rows: screened.rows,
      totalCount: screened.rows.length,
      screenNotes: screened.notes.length ? screened.notes : undefined,
    };
  }

  if (next.available && next.rows.length > 0) {
    if (opts.rankBy === "beat_rate" || opts.strictBeatRateRanking) {
      next = applyBeatRateRanking(next, { allowSurpriseTieBreak: true });
      next = {
        ...next,
        screenNotes: [
          ...(next.screenNotes ?? []),
          "Ranked strictly by historical beat rate (surprise % only breaks exact beat-rate ties).",
        ],
      };
    } else if (opts.rankBySurprise || opts.rankBy === "surprise") {
      next = applySurpriseRanking(next);
    }
  }

  return next;
}

function enumerateRangeDays(from: string, to: string, maxDays = 30): string[] {
  const days: string[] = [from];
  let cursor = from;
  while (cursor !== to && days.length < maxDays) {
    cursor = addEtDays(cursor, 1);
    days.push(cursor);
  }
  return days;
}

export async function tryEarningsDayCalendarReply(
  text: string,
): Promise<{ reply: string; meta: { symbols: string[]; source: string | null; sourceName: string | null; stale: boolean; timestamp: string | null } } | null> {
  if (!isEarningsDayCalendarQuery(text)) return null;

  const parsed = parseEarningsCalendarIntent(text);
  if (!parsed) return null;

  const finalizeOpts = {
    sessionFilter: parsed.sessionFilter,
    rankBySurprise: parsed.rankBySurprise,
    focusSymbols: parsed.focusSymbols,
    minSurprisePct: parsed.minSurprisePct,
    minBeatRate: parsed.minBeatRate,
    requireNegativeConsensusEps: parsed.requireNegativeConsensusEps,
    requirePositiveHistSurprise: parsed.requirePositiveHistSurprise,
    rankBy: parsed.rankBy,
    strictBeatRateRanking: parsed.strictBeatRateRanking,
    splitBySession: parsed.splitBySession,
  };

  if (parsed.timeScope === "date_range" && parsed.dateRange) {
    const range = parsed.dateRange;
    const days = enumerateRangeDays(range.from, range.to, 30);

    const dayResults: EarningsDayCalendarResult[] = [];
    for (const d of days) {
      dayResults.push(await fetchEarningsCalendarForDate(d));
    }

    const daysWithRows = dayResults.filter((r) => r.available && r.rows.length > 0).map((r) => r.date);
    const daysMissingOrEmpty = dayResults
      .filter((r) => !r.available || r.rows.length === 0)
      .map((r) => r.date);
    const mergedRows = dayResults.flatMap((r) => (r.available ? r.rows : []));
    const anyAvailable = dayResults.some((r) => r.available);
    const lastTimestamp = dayResults[dayResults.length - 1]?.timestamp ?? new Date().toISOString();

    const mergedBase: EarningsDayCalendarResult = {
      available: anyAvailable,
      date: range.from,
      dateLabel: `${formatDateLabel(range.from)} → ${formatDateLabel(range.to)}`,
      source: "Finnhub",
      timestamp: lastTimestamp,
      rows: mergedRows,
      totalCount: mergedRows.length,
      truncated: mergedRows.length > MAX_ROWS_IN_REPLY,
      rangeFrom: range.from,
      rangeTo: range.to,
      daysWithRows,
      daysMissingOrEmpty,
      coverageIncomplete: daysMissingOrEmpty.length > 0,
      error: anyAvailable ? undefined : dayResults.find((r) => r.error)?.error ?? "calendar fetch failed",
    };
    if (mergedBase.truncated) {
      mergedBase.rows = mergedRows.slice(0, MAX_ROWS_IN_REPLY);
    }

    const result = await finalizeCalendarResult(mergedBase, finalizeOpts);

    return {
      reply: formatEarningsDayCalendarReply(result),
      meta: {
        symbols: Array.from(new Set(result.rows.map((r) => r.symbol))).slice(0, 8),
        source: result.available ? "finnhub" : null,
        sourceName: result.available ? "Finnhub" : "Finnhub (unavailable)",
        stale: false,
        timestamp: result.timestamp,
      },
    };
  }

  const ymd = parsed.timeScope === "single_date" ? parsed.date : null;
  if (!ymd) return null;
  const result = await finalizeCalendarResult(await fetchEarningsCalendarForDate(ymd), finalizeOpts);

  return {
    reply: formatEarningsDayCalendarReply(result),
    meta: {
      symbols: result.rows.slice(0, 8).map((r) => r.symbol),
      source: result.available ? "finnhub" : null,
      sourceName: result.available ? "Finnhub" : "Finnhub (unavailable)",
      stale: false,
      timestamp: result.timestamp,
    },
  };
}
