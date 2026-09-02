import { z } from "zod";
import { authedQuery, createRouter } from "./middleware";
import { addWatchlistSymbol, listWatchlist, removeWatchlistSymbol } from "./intelligence-data/watchlist";
import { buildIntelligenceBundle } from "./intelligence-data/gateway";
import { prefetchSymbolLayers } from "./intelligence-data/gateway";

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
    .input(z.object({ text: z.string().min(1).max(8000) }))
    .query(async ({ ctx, input }) => buildIntelligenceBundle(ctx.user.id, input.text)),
});
