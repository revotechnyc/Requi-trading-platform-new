import { describe, expect, it } from "vitest";
import {
  addEtTradingDays,
  applyBeatRateRanking,
  applySurpriseRanking,
  formatEarningsDayCalendarReply,
  isEarningsDayCalendarQuery,
  resolveEarningsCalendarDate,
  resolveEarningsCalendarDateRange,
  resolveRelativeTradingDayOffset,
  parseEarningsCalendarIntent,
  parseMinBeatRateThreshold,
  parseMinSurpriseThreshold,
  wantsEarningsSurpriseRanking,
  wantsSessionSplit,
  type EarningsDayCalendarResult,
} from "../intelligence-data/earnings-day";
import { isNyseTradingDay } from "../marketdata/session";

describe("earnings day calendar intent", () => {
  it("detects Tuesday quarterly earnings board queries", () => {
    expect(isEarningsDayCalendarQuery("what is Tuesday quaterly earnings")).toBe(true);
    expect(isEarningsDayCalendarQuery("what is Tuesday quarterly earnings")).toBe(true);
    expect(isEarningsDayCalendarQuery("earnings calendar today")).toBe(true);
    expect(isEarningsDayCalendarQuery("who reports earnings on Friday")).toBe(true);
  });

  it("detects trader shorthand ER/BMO/AMC day-board queries", () => {
    expect(isEarningsDayCalendarQuery("ER AMC today")).toBe(true);
    expect(isEarningsDayCalendarQuery("ER BMO tomorrow")).toBe(true);
    expect(isEarningsDayCalendarQuery("ER 9/15")).toBe(true);
    expect(isEarningsDayCalendarQuery("ER Sep 15")).toBe(true);
  });

  it("does not steal single-ticker next-earnings questions", () => {
    expect(isEarningsDayCalendarQuery("When is Apple's next earnings?")).toBe(false);
    expect(isEarningsDayCalendarQuery("When does Tesla report earnings?")).toBe(false);
  });

  it("resolves weekday names to YYYY-MM-DD", () => {
    const d = resolveEarningsCalendarDate("what is Tuesday quarterly earnings");
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("resolves numeric and month-name dates", () => {
    const d1 = resolveEarningsCalendarDate("ER 9/15");
    expect(d1).not.toBeNull();
    expect(d1).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const d2 = resolveEarningsCalendarDate("ER Sep 15");
    expect(d2).not.toBeNull();
    expect(d2).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("resolves explicit ranges and buckets", () => {
    const r1 = resolveEarningsCalendarDateRange("ER from Sep 15 to Sep 20");
    expect(r1).not.toBeNull();
    expect(r1!.from).toMatch(/^\d{4}-09-15$/);
    expect(r1!.to).toMatch(/^\d{4}-09-20$/);

    const r2 = resolveEarningsCalendarDateRange("ER 9/15-9/20");
    expect(r2).not.toBeNull();
    expect(r2!.from).toMatch(/^\d{4}-09-15$/);
    expect(r2!.to).toMatch(/^\d{4}-09-20$/);

    const r3 = resolveEarningsCalendarDateRange("ER next 30 days");
    expect(r3).not.toBeNull();
    expect(r3!.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r3!.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("resolves between-and ranges and en-dash numeric ranges", () => {
    const r1 = resolveEarningsCalendarDateRange(
      "Show me companies reporting earnings between September 14 and September 18 that have an expected EPS surprise proxy above 10%",
    );
    expect(r1).not.toBeNull();
    expect(r1!.from).toMatch(/^\d{4}-09-14$/);
    expect(r1!.to).toMatch(/^\d{4}-09-18$/);

    const r2 = resolveEarningsCalendarDateRange("ER 9/14–9/18, surprise >10%, split BMO/AMC");
    expect(r2).not.toBeNull();
    expect(r2!.from).toMatch(/^\d{4}-09-14$/);
    expect(r2!.to).toMatch(/^\d{4}-09-18$/);
  });

  it("adds NYSE trading days across weekends", () => {
    // Thu 2026-09-10 + 2 trading days = Mon 2026-09-14
    expect(isNyseTradingDay("2026-09-10")).toBe(true);
    expect(isNyseTradingDay("2026-09-11")).toBe(true);
    expect(isNyseTradingDay("2026-09-12")).toBe(false);
    expect(addEtTradingDays("2026-09-10", 2)).toBe("2026-09-14");
  });

  it("resolves next trading day after an explicit date", () => {
    // Tue 2026-09-15 + 1 trading day = Wed 2026-09-16
    expect(addEtTradingDays("2026-09-15", 1)).toBe("2026-09-16");
    const q =
      "Which companies report earnings on the next trading day after September 15, 2026, and among those, which have a positive historical EPS surprise and a beat rate above 60%? Separate BMO and AMC.";
    expect(resolveRelativeTradingDayOffset(q)).toBe("2026-09-16");
    expect(resolveEarningsCalendarDate(q)).toBe("2026-09-16");

    const p = parseEarningsCalendarIntent(q);
    expect(p).not.toBeNull();
    expect(p!.date).toBe("2026-09-16");
    expect(p!.requirePositiveHistSurprise).toBe(true);
    expect(p!.minBeatRate).toBe(60);
    expect(p!.sessionFilter).toBeNull();
    expect(p!.splitBySession).toBe(true);
  });

  it("parses beat rate above threshold", () => {
    expect(parseMinBeatRateThreshold("beat rate above 60%")).toBe(60);
    expect(parseMinBeatRateThreshold("beat rate >60")).toBe(60);
  });

  it("resolves +2 trading days from tomorrow (plain + trader) to the same date", () => {
    const tomorrow = resolveEarningsCalendarDate("ER tomorrow");
    expect(tomorrow).not.toBeNull();
    const expected = addEtTradingDays(tomorrow!, 2);

    const plain =
      "What companies report earnings two trading days after tomorrow, and which ones report BMO versus AMC?";
    const trader = "ER +2 trading days from tomorrow, BMO vs AMC";

    expect(resolveRelativeTradingDayOffset(plain)).toBe(expected);
    expect(resolveRelativeTradingDayOffset(trader)).toBe(expected);
    expect(resolveEarningsCalendarDate(plain)).toBe(expected);
    expect(resolveEarningsCalendarDate(trader)).toBe(expected);
    // Must NOT collapse to bare tomorrow.
    expect(resolveEarningsCalendarDate(plain)).not.toBe(tomorrow);
  });

  it("treats BMO versus AMC as a split, not a BMO-only filter", () => {
    expect(wantsSessionSplit("report BMO versus AMC")).toBe(true);
    expect(wantsSessionSplit("split BMO/AMC")).toBe(true);

    const p1 = parseEarningsCalendarIntent(
      "What companies report earnings two trading days after tomorrow, and which ones report BMO versus AMC?",
    );
    expect(p1).not.toBeNull();
    expect(p1!.sessionFilter).toBeNull();
    expect(p1!.splitBySession).toBe(true);

    const p2 = parseEarningsCalendarIntent("ER +2 trading days from tomorrow, BMO vs AMC");
    expect(p2).not.toBeNull();
    expect(p2!.sessionFilter).toBeNull();
    expect(p2!.splitBySession).toBe(true);
  });

  it("parses surprise >10% threshold on range screens", () => {
    expect(parseMinSurpriseThreshold("expected EPS surprise proxy above 10%")).toBe(10);
    expect(parseMinSurpriseThreshold("surprise >10%")).toBe(10);

    const p = parseEarningsCalendarIntent(
      "Show me companies reporting earnings between September 14 and September 18 that have an expected EPS surprise proxy above 10%, and separate BMO from AMC.",
    );
    expect(p).not.toBeNull();
    expect(p!.timeScope).toBe("date_range");
    expect(p!.dateRange!.from).toMatch(/-09-14$/);
    expect(p!.dateRange!.to).toMatch(/-09-18$/);
    expect(p!.minSurprisePct).toBe(10);
    expect(p!.sessionFilter).toBeNull();
    expect(p!.splitBySession).toBe(true);
  });

  it("parses negative consensus + positive hist surprise with beat-rate ranking", () => {
    const q =
      "Find companies with a negative consensus EPS where the historical average EPS surprise is positive. Rank them by historical beat rate.";
    expect(isEarningsDayCalendarQuery(q)).toBe(true);
    const p = parseEarningsCalendarIntent(q);
    expect(p).not.toBeNull();
    expect(p!.requireNegativeConsensusEps).toBe(true);
    expect(p!.requirePositiveHistSurprise).toBe(true);
    expect(p!.rankBy).toBe("beat_rate");
    expect(p!.strictBeatRateRanking).toBe(true);

    const trader = "EPS <0 + hist surprise >0, rank by beat %";
    const p2 = parseEarningsCalendarIntent(trader);
    expect(p2).not.toBeNull();
    expect(p2!.requireNegativeConsensusEps).toBe(true);
    expect(p2!.requirePositiveHistSurprise).toBe(true);
    expect(p2!.rankBy).toBe("beat_rate");
  });

  it("ranks strictly by beat rate, using surprise only as an exact-tie breaker", () => {
    const base: EarningsDayCalendarResult = {
      available: true,
      date: "2026-09-15",
      dateLabel: "Tuesday, Sep 15, 2026",
      source: "Finnhub",
      timestamp: "2026-09-09T12:00:00.000Z",
      totalCount: 3,
      truncated: false,
      rows: [
        {
          symbol: "LOW",
          date: "2026-09-15",
          reportTime: "AMC",
          epsEstimate: -0.1,
          epsActual: null,
          revenueEstimate: null,
          revenueActual: null,
          quarter: 2,
          year: 2026,
          surprisePct: 90,
          surpriseKind: "expected_historical",
          surpriseQuarters: 4,
          epsBeatRate: 50,
        },
        {
          symbol: "HIGH",
          date: "2026-09-15",
          reportTime: "AMC",
          epsEstimate: -0.2,
          epsActual: null,
          revenueEstimate: null,
          revenueActual: null,
          quarter: 2,
          year: 2026,
          surprisePct: 5,
          surpriseKind: "expected_historical",
          surpriseQuarters: 8,
          epsBeatRate: 80,
        },
        {
          symbol: "TIE_B",
          date: "2026-09-15",
          reportTime: "BMO",
          epsEstimate: -0.3,
          epsActual: null,
          revenueEstimate: null,
          revenueActual: null,
          quarter: 2,
          year: 2026,
          surprisePct: 20,
          surpriseKind: "expected_historical",
          surpriseQuarters: 4,
          epsBeatRate: 80,
        },
      ],
    };

    const ranked = applyBeatRateRanking(base);
    expect(ranked.rows.map((r) => r.symbol)).toEqual(["TIE_B", "HIGH", "LOW"]);
    expect(ranked.rankedByBeatRate).toBe(true);

    const reply = formatEarningsDayCalendarReply(ranked);
    expect(reply).toContain("historical beat rate");
    expect(reply).not.toContain("larger positive average surprise");
  });

  it("parses plain English and trader shorthand into the same intent shape", () => {
    const p1 = parseEarningsCalendarIntent("What companies have earnings after market close today?");
    expect(p1).not.toBeNull();
    expect(p1!.timeScope).toBe("single_date");
    expect(p1!.sessionFilter).toBe("AMC");

    const p2 = parseEarningsCalendarIntent("ER AMC today");
    expect(p2).not.toBeNull();
    expect(p2!.timeScope).toBe("single_date");
    expect(p2!.sessionFilter).toBe("AMC");

    expect(p1!.date).toBe(p2!.date);

    const p3 = parseEarningsCalendarIntent("What companies report before market open tomorrow?");
    expect(p3).not.toBeNull();
    expect(p3!.sessionFilter).toBe("BMO");

    const p4 = parseEarningsCalendarIntent("ER BMO tomorrow");
    expect(p4).not.toBeNull();
    expect(p4!.sessionFilter).toBe("BMO");
    expect(p3!.date).toBe(p4!.date);
  });

  it("parses 'after the market closes' and 'before the market opens'", () => {
    const amc = parseEarningsCalendarIntent(
      "Which companies are reporting earnings after the market closes on September 15, and which of them have the largest expected EPS surprise?",
    );
    expect(amc).not.toBeNull();
    expect(amc!.sessionFilter).toBe("AMC");
    expect(amc!.rankBySurprise).toBe(true);
    expect(amc!.date).toMatch(/-09-15$/);

    const bmo = parseEarningsCalendarIntent("Who reports before the market opens on Sep 15?");
    expect(bmo).not.toBeNull();
    expect(bmo!.sessionFilter).toBe("BMO");
  });

  it("detects EPS surprise ranking intent on shorthand boards", () => {
    expect(wantsEarningsSurpriseRanking("ER AMC 9/15 — biggest EPS surprise?")).toBe(true);
    expect(wantsEarningsSurpriseRanking("ER AMC today")).toBe(false);

    const p = parseEarningsCalendarIntent("ER AMC 9/15 — biggest EPS surprise?");
    expect(p).not.toBeNull();
    expect(p!.sessionFilter).toBe("AMC");
    expect(p!.rankBySurprise).toBe(true);
    expect(p!.date).toMatch(/-09-15$/);
  });

  it("parses PLUR vs RZLT comparison with consensus + beat-likelihood intent", () => {
    const q =
      "Between PLUR and RZLT, which one has the better expected EPS surprise for the Sep 15 AMC report? Show me the consensus EPS, expected EPS surprise %, and explain which one is more likely to beat estimates";
    const p = parseEarningsCalendarIntent(q);
    expect(p).not.toBeNull();
    expect(p!.sessionFilter).toBe("AMC");
    expect(p!.rankBySurprise).toBe(true);
    expect(p!.date).toMatch(/-09-15$/);
    expect(p!.focusSymbols).toEqual(expect.arrayContaining(["PLUR", "RZLT"]));
    expect(wantsEarningsSurpriseRanking(q)).toBe(true);
  });

  it("treats date text and numeric date as equivalent", () => {
    const p1 = parseEarningsCalendarIntent("Show me earnings for September 15.");
    expect(p1).not.toBeNull();
    expect(p1!.timeScope).toBe("single_date");
    expect(p1!.date).toMatch(/-09-15$/);

    const p2 = parseEarningsCalendarIntent("ER 9/15");
    expect(p2).not.toBeNull();
    expect(p2!.timeScope).toBe("single_date");
    expect(p2!.date).toMatch(/-09-15$/);

    expect(p1!.date).toBe(p2!.date);
  });

  it("treats date ranges in different notations as equivalent", () => {
    const r1 = parseEarningsCalendarIntent("ER from Sep 15 to Sep 20");
    expect(r1).not.toBeNull();
    expect(r1!.timeScope).toBe("date_range");
    expect(r1!.dateRange!.from).toMatch(/-09-15$/);
    expect(r1!.dateRange!.to).toMatch(/-09-20$/);

    const r2 = parseEarningsCalendarIntent("ER 9/15-9/20");
    expect(r2).not.toBeNull();
    expect(r2!.timeScope).toBe("date_range");
    expect(r2!.dateRange!.from).toBe(r1!.dateRange!.from);
    expect(r2!.dateRange!.to).toBe(r1!.dateRange!.to);
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

  it("formats incomplete range coverage up front", () => {
    const result: EarningsDayCalendarResult = {
      available: true,
      date: "2026-09-14",
      dateLabel: "Monday, Sep 14, 2026 → Friday, Sep 18, 2026",
      source: "Finnhub",
      timestamp: "2026-09-09T12:00:00.000Z",
      totalCount: 1,
      truncated: false,
      rangeFrom: "2026-09-14",
      rangeTo: "2026-09-18",
      daysWithRows: ["2026-09-14"],
      daysMissingOrEmpty: ["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"],
      coverageIncomplete: true,
      screenNotes: ["Screen: expected/realized EPS surprise % > 10"],
      rankedBySurprise: true,
      largestSurpriseSymbol: "CBRL",
      largestSurprisePct: 55.8,
      largestSurpriseKind: "expected_historical",
      rows: [
        {
          symbol: "CBRL",
          date: "2026-09-14",
          reportTime: "BMO",
          epsEstimate: 0.09,
          epsActual: null,
          revenueEstimate: 849_400_000,
          revenueActual: null,
          quarter: 1,
          year: 2026,
          surprisePct: 55.8,
          surpriseKind: "expected_historical",
          surpriseQuarters: 16,
          epsBeatRate: 69,
        },
      ],
    };
    const reply = formatEarningsDayCalendarReply(result);
    expect(reply).toContain("Coverage incomplete");
    expect(reply).toContain("2026-09-14 → 2026-09-18");
    expect(reply).toContain("2026-09-16");
    expect(reply).toContain("surprise % > 10");
  });

  it("ranks by surprise and formats expected vs realized basis", () => {
    const base: EarningsDayCalendarResult = {
      available: true,
      date: "2026-09-15",
      dateLabel: "Tuesday, Sep 15, 2026",
      source: "Finnhub",
      timestamp: "2026-09-09T12:00:00.000Z",
      totalCount: 2,
      truncated: false,
      focusSymbolsRequested: ["PLUR", "RZLT"],
      rows: [
        {
          symbol: "RZLT",
          date: "2026-09-15",
          reportTime: "AMC",
          epsEstimate: -0.15,
          epsActual: null,
          revenueEstimate: 0,
          revenueActual: null,
          quarter: 2,
          year: 2026,
          surprisePct: 4.2,
          surpriseKind: "expected_historical",
          surpriseQuarters: 4,
          epsBeatRate: 75,
        },
        {
          symbol: "PLUR",
          date: "2026-09-15",
          reportTime: "AMC",
          epsEstimate: -0.67,
          epsActual: null,
          revenueEstimate: 668100,
          revenueActual: null,
          quarter: 2,
          year: 2026,
          surprisePct: 12.5,
          surpriseKind: "expected_historical",
          surpriseQuarters: 4,
          epsBeatRate: 100,
        },
      ],
    };

    const ranked = applySurpriseRanking(base);
    expect(ranked.rows[0]!.symbol).toBe("PLUR");
    expect(ranked.largestSurpriseSymbol).toBe("PLUR");
    expect(ranked.largestSurprisePct).toBe(12.5);

    const reply = formatEarningsDayCalendarReply(ranked);
    expect(reply).toContain("Largest expected EPS surprise");
    expect(reply).toContain("**PLUR**");
    expect(reply).toContain("+12.50%");
    expect(reply).toContain("hist avg");
    expect(reply).toContain("Consensus EPS");
    expect(reply).toContain("more likely to beat consensus");
    expect(reply).toContain("Surprise % = (Actual EPS − Consensus EPS)");
  });

  it("explains transparently when surprise % cannot be ranked", () => {
    const result: EarningsDayCalendarResult = {
      available: true,
      date: "2026-09-15",
      dateLabel: "Tuesday, Sep 15, 2026",
      source: "Finnhub",
      timestamp: "2026-09-09T12:00:00.000Z",
      totalCount: 2,
      truncated: false,
      rankedBySurprise: true,
      largestSurpriseSymbol: null,
      largestSurprisePct: null,
      largestSurpriseKind: null,
      focusSymbolsRequested: ["PLUR", "RZLT"],
      rows: [
        {
          symbol: "PLUR",
          date: "2026-09-15",
          reportTime: "AMC",
          epsEstimate: -0.67,
          epsActual: null,
          revenueEstimate: 668100,
          revenueActual: null,
          quarter: 2,
          year: 2026,
          surprisePct: null,
          surpriseKind: "unavailable",
          surpriseQuarters: 0,
          epsBeatRate: null,
        },
        {
          symbol: "RZLT",
          date: "2026-09-15",
          reportTime: "AMC",
          epsEstimate: -0.15,
          epsActual: null,
          revenueEstimate: 0,
          revenueActual: null,
          quarter: 2,
          year: 2026,
          surprisePct: null,
          surpriseKind: "unavailable",
          surpriseQuarters: 0,
          epsBeatRate: null,
        },
      ],
    };

    const reply = formatEarningsDayCalendarReply(result);
    expect(reply).toContain("Cannot rank expected EPS surprise");
    expect(reply).toContain("consensus EPS");
    expect(reply).toContain("will not invent");
    expect(reply).toContain("not** an expected-surprise ranking");
  });

  it("maps pre-market / after-hours slang to BMO / AMC (plain ↔ trader)", () => {
    const plainPre = parseEarningsCalendarIntent("Who reports pre-market tomorrow?");
    const traderBmo = parseEarningsCalendarIntent("ER BMO tomorrow");
    expect(plainPre).not.toBeNull();
    expect(traderBmo).not.toBeNull();
    expect(plainPre!.sessionFilter).toBe("BMO");
    expect(traderBmo!.sessionFilter).toBe("BMO");
    expect(plainPre!.date).toBe(traderBmo!.date);

    const plainAh = parseEarningsCalendarIntent("Companies reporting after-hours on Sep 15");
    const traderAmc = parseEarningsCalendarIntent("ER AMC 9/15");
    expect(plainAh).not.toBeNull();
    expect(traderAmc).not.toBeNull();
    expect(plainAh!.sessionFilter).toBe("AMC");
    expect(traderAmc!.sessionFilter).toBe("AMC");
    expect(plainAh!.date).toBe(traderAmc!.date);

    const plainDmh = parseEarningsCalendarIntent("Who reports during market hours today?");
    const traderDmh = parseEarningsCalendarIntent("ER DMH today");
    expect(plainDmh!.sessionFilter).toBe("DMH");
    expect(traderDmh!.sessionFilter).toBe("DMH");
    expect(plainDmh!.date).toBe(traderDmh!.date);
  });

  it("defaults undated ER / earnings board asks to today", () => {
    const today = resolveEarningsCalendarDate("earnings calendar today");
    expect(resolveEarningsCalendarDate("ER AMC")).toBe(today);
    expect(resolveEarningsCalendarDate("What are the earnings?")).toBe(today);
    expect(isEarningsDayCalendarQuery("ER AMC")).toBe(true);

    const p = parseEarningsCalendarIntent("ER AMC");
    expect(p).not.toBeNull();
    expect(p!.date).toBe(today);
    expect(p!.sessionFilter).toBe("AMC");
  });

  it("treats ISO and numeric specific dates as equivalent", () => {
    const iso = parseEarningsCalendarIntent("Show earnings for 2026-09-15");
    const mdy = parseEarningsCalendarIntent("ER 9/15/2026");
    expect(iso).not.toBeNull();
    expect(mdy).not.toBeNull();
    expect(iso!.date).toBe("2026-09-15");
    expect(mdy!.date).toBe("2026-09-15");
  });

  it("parses through/thru ranges like to-ranges", () => {
    const thru = parseEarningsCalendarIntent("Earnings from Sep 15 through Sep 20");
    const dash = parseEarningsCalendarIntent("ER 9/15-9/20");
    expect(thru).not.toBeNull();
    expect(dash).not.toBeNull();
    expect(thru!.timeScope).toBe("date_range");
    expect(thru!.dateRange!.from).toBe(dash!.dateRange!.from);
    expect(thru!.dateRange!.to).toBe(dash!.dateRange!.to);
  });

  it("treats BMO and AMC as a session split (not BMO-only filter)", () => {
    expect(wantsSessionSplit("Separate BMO and AMC for today's earnings")).toBe(true);
    expect(wantsSessionSplit("ER BMO/AMC today")).toBe(true);
    expect(wantsSessionSplit("BMO and AMC Friday")).toBe(true);

    const p = parseEarningsCalendarIntent("ER BMO and AMC today");
    expect(p).not.toBeNull();
    expect(p!.splitBySession).toBe(true);
    expect(p!.sessionFilter).toBeNull();
  });

  it("keeps recent past month/day in the current year (not rolled forward)", () => {
    // System "today" in this project context is 2026-09-10-ish; 9/1 is within 45 days past.
    const d = resolveEarningsCalendarDate("ER 9/1");
    expect(d).toBe("2026-09-01");
  });

  it("still does not steal single-ticker next-earnings after slang normalize", () => {
    expect(parseEarningsCalendarIntent("When is Apple's next earnings?")).toBeNull();
    expect(isEarningsDayCalendarQuery("When is AAPL earnings date?")).toBe(false);
  });
});
