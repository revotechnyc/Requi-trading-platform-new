import { z } from "zod";
import { authedQuery, createRouter } from "./middleware";
import { addWatchlistSymbol, listWatchlist, removeWatchlistSymbol } from "./intelligence-data/watchlist";
import { buildIntelligenceBundle } from "./intelligence-data/gateway";
import { prefetchSymbolLayers } from "./intelligence-data/gateway";
import { MAX_USER_PROMPT_CHARS } from "./intelligence/prompt-overflow";
import {
  fetchEarningsCalendarForDate,
  resolveEarningsCalendarDate,
  resolveEarningsCalendarDateRange,
  addEtDays,
} from "./intelligence-data/earnings-day";

const symbolInput = z.object({ symbol: z.string().min(1).max(12) });

export const intelligenceDataRouter = createRouter({
  watchlist: authedQuery.query(async ({ ctx }) => listWatchlist(ctx.user.id)),

  addWatchlist: authedQuery.input(symbolInput).mutation(async ({ ctx, input }) => {
    const res = await addWatchlistSymbol(ctx.user.id, input.symbol);
    if (res.ok && res.created) {
      void prefetchSymbolLayers(ctx.user.id, res.symbol).catch(() => undefined);
    }
    return res;
  }),

  removeWatchlist: authedQuery.input(symbolInput).mutation(async ({ ctx, input }) =>
    removeWatchlistSymbol(ctx.user.id, input.symbol),
  ),

  /** Debug / UI: full normalized bundle for a query (same object the AI sees). */
  bundle: authedQuery
    .input(z.object({ text: z.string().min(1).max(MAX_USER_PROMPT_CHARS) }))
    .query(async ({ ctx, input }) => buildIntelligenceBundle(ctx.user.id, input.text)),

  /** Earnings calendar day or short range for Calendar UI panel. */
  earningsCalendar: authedQuery
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        session: z.enum(["BMO", "AMC", "DMH"]).optional(),
      }),
    )
    .query(async ({ input }) => {
      const today =
        resolveEarningsCalendarDate("earnings calendar today") ?? new Date().toISOString().slice(0, 10);
      const range =
        input.from && input.to
          ? { from: input.from, to: input.to }
          : input.date
            ? { from: input.date, to: input.date }
            : resolveEarningsCalendarDateRange("ER this week") ?? { from: today, to: today };

      const days: string[] = [range.from];
      let cursor = range.from;
      while (cursor !== range.to && days.length < 14) {
        cursor = addEtDays(cursor, 1);
        days.push(cursor);
      }

      const boards = [];
      for (const d of days) {
        const res = await fetchEarningsCalendarForDate(d);
        let rows = res.rows;
        if (input.session) rows = rows.filter((r) => r.reportTime === input.session);
        boards.push({
          date: d,
          available: res.available,
          source: res.source,
          error: res.error,
          totalCount: rows.length,
          rows: rows.slice(0, 40).map((r) => ({
            symbol: r.symbol,
            date: r.date,
            reportTime: r.reportTime,
            epsEstimate: r.epsEstimate,
            revenueEstimate: r.revenueEstimate,
          })),
        });
      }
      return { from: range.from, to: range.to, boards };
    }),
});
