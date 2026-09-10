/**
 * Event-study reactions around past earnings dates.
 */
import { fetchHistoricalEarnings } from "../../intelligence-data/providers/earnings-history";
import { fetchDailyBars, type DailyBar } from "../../intelligence-data/providers/massive-stocks";
import { researchOk, researchUnavailable, type ResearchFetchBase } from "../../intelligence-data/providers/types-research";

export type EventStudyEvent = {
  reportDate: string;
  gapPct: number | null;
  d1Pct: number | null;
  d5Pct: number | null;
  d10Pct: number | null;
  maePct: number | null;
};

export type EventStudyResult = ResearchFetchBase & {
  symbol: string;
  events: EventStudyEvent[];
  avgGapPct: number | null;
  avgD1Pct: number | null;
  avgD10Pct: number | null;
  incomplete: boolean;
};

function findBar(bars: DailyBar[], ymd: string): DailyBar | undefined {
  return bars.find((b) => b.date === ymd);
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, 17, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function pct(from: number, to: number): number {
  return ((to - from) / Math.abs(from)) * 100;
}

/** Pure calc for tests — gap from prior close to event open; D1 open→close; Dn vs prior close. */
export function computeEventMetrics(
  bars: DailyBar[],
  reportDate: string,
): Omit<EventStudyEvent, "reportDate"> {
  const prior = findBar(bars, addDays(reportDate, -1)) ?? findBar(bars, addDays(reportDate, -2));
  const day0 = findBar(bars, reportDate);
  if (!prior || !day0 || !prior.close) {
    return { gapPct: null, d1Pct: null, d5Pct: null, d10Pct: null, maePct: null };
  }
  const gapPct = pct(prior.close, day0.open);
  const d1Pct = pct(day0.open, day0.close);
  const d5 = findBar(bars, addDays(reportDate, 5));
  const d10 = findBar(bars, addDays(reportDate, 10));
  const d5Pct = d5 ? pct(prior.close, d5.close) : null;
  const d10Pct = d10 ? pct(prior.close, d10.close) : null;
  const window = bars.filter((b) => b.date >= reportDate && b.date <= addDays(reportDate, 10));
  let maePct: number | null = null;
  if (window.length) {
    const adverse = Math.min(...window.map((b) => pct(prior.close, b.low)));
    maePct = adverse;
  }
  return { gapPct, d1Pct, d5Pct, d10Pct, maePct };
}

function avg(nums: Array<number | null>): number | null {
  const xs = nums.filter((n): n is number => n !== null && Number.isFinite(n));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export async function runEventStudy(symbol: string): Promise<EventStudyResult> {
  const sym = symbol.toUpperCase();
  const hist = await fetchHistoricalEarnings(sym, { allowAlphaVantageBackfill: false });
  const dates = hist.rows
    .map((r) => r.period)
    .filter((d): d is string => Boolean(d))
    .slice(0, 8);

  if (!dates.length) {
    return {
      ...researchUnavailable("event-study", "No historical earnings dates for event study"),
      symbol: sym,
      events: [],
      avgGapPct: null,
      avgD1Pct: null,
      avgD10Pct: null,
      incomplete: true,
    };
  }

  const from = addDays(dates[dates.length - 1]!, -5);
  const to = addDays(dates[0]!, 15);
  const barsRes = await fetchDailyBars(sym, from, to);
  if (!barsRes.available || !barsRes.bars.length) {
    return {
      ...researchUnavailable(barsRes.source, barsRes.error ?? "No bars for event study"),
      mock: barsRes.mock,
      symbol: sym,
      events: [],
      avgGapPct: null,
      avgD1Pct: null,
      avgD10Pct: null,
      incomplete: true,
    };
  }

  const events: EventStudyEvent[] = dates.map((reportDate) => ({
    reportDate,
    ...computeEventMetrics(barsRes.bars, reportDate),
  }));
  const usable = events.filter((e) => e.gapPct !== null);
  const incomplete = usable.length < 4;
  return {
    ...researchOk(barsRes.mock ? "Massive Stocks event-study" : "Massive Stocks event-study", barsRes.mock),
    symbol: sym,
    events,
    avgGapPct: avg(events.map((e) => e.gapPct)),
    avgD1Pct: avg(events.map((e) => e.d1Pct)),
    avgD10Pct: avg(events.map((e) => e.d10Pct)),
    incomplete,
  };
}
