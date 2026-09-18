/**
 * Engine A — background intelligence data scheduler (PDF §5).
 * Prefetches watchlist symbols across layers on a schedule.
 */
import { getDb } from "../queries/connection";
import { intelligenceWatchlist } from "@db/schema";
import { prefetchSymbolLayers } from "./gateway";
import { fetchGdeltMacro } from "./providers/gdelt";
import { runEarningsAlertsForUser } from "./earnings-alerts";
import { ensureIntelligenceWatchlistTable, normalizeWatchlistSymbol } from "./watchlist";

type EngineGlobal = typeof globalThis & {
  __requiIntelEngine?: {
    started: boolean;
    newsTimer: ReturnType<typeof setInterval> | null;
    indicatorTimer: ReturnType<typeof setInterval> | null;
    macroTimer: ReturnType<typeof setInterval> | null;
    earningsTimer: ReturnType<typeof setInterval> | null;
  };
};
const engineState = ((globalThis as EngineGlobal).__requiIntelEngine ??= {
  started: false,
  newsTimer: null,
  indicatorTimer: null,
  macroTimer: null,
  earningsTimer: null,
});

async function allWatchlistSymbols(): Promise<Array<{ userId: string; symbol: string }>> {
  try {
    return await getDb()
      .select({ userId: intelligenceWatchlist.userId, symbol: intelligenceWatchlist.symbol })
      .from(intelligenceWatchlist);
  } catch (e) {
    console.error("[intelligence-data] watchlist query failed", e instanceof Error ? e.message : e);
    return [];
  }
}

async function prefetchAllWatchlists(): Promise<void> {
  let rows: Array<{ userId: string; symbol: string }>;
  try {
    rows = await allWatchlistSymbols();
  } catch (e) {
    console.error("[intelligence-data] prefetch skipped", e instanceof Error ? e.message : e);
    return;
  }
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.userId}:${row.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await prefetchSymbolLayers(row.userId, normalizeWatchlistSymbol(row.symbol)).catch((e) => {
      console.error("[intelligence-data] prefetch failed", row.symbol, e);
    });
  }
}

async function runEarningsAlertsAll(): Promise<void> {
  const rows = await allWatchlistSymbols();
  const users = [...new Set(rows.map((r) => r.userId))];
  for (const userId of users) {
    await runEarningsAlertsForUser(userId).catch((e) => {
      console.error("[intelligence-data] earnings alert failed", userId, e);
    });
  }
}

export function startIntelligenceDataEngine(): void {
  if (engineState.started) return;
  engineState.started = true;

  void ensureIntelligenceWatchlistTable().catch((e) => {
    console.error("[intelligence-data] watchlist table init failed", e);
  });

  // News + prices prefetch ~1 min
  engineState.newsTimer = setInterval(() => {
    void prefetchAllWatchlists();
  }, 60_000);

  // Indicators ~90s
  engineState.indicatorTimer = setInterval(() => {
    void prefetchAllWatchlists();
  }, 90_000);

  // GDELT macro ~15 min
  engineState.macroTimer = setInterval(() => {
    void fetchGdeltMacro().catch(() => undefined);
  }, 15 * 60_000);

  // Earnings calendar + alerts daily (also run once at start after delay)
  engineState.earningsTimer = setInterval(() => {
    void runEarningsAlertsAll();
  }, 24 * 3_600_000);

  setTimeout(() => {
    void prefetchAllWatchlists();
    void fetchGdeltMacro().catch(() => undefined);
    void runEarningsAlertsAll();
  }, 8_000);

  console.log("[intelligence-data] background engine started");
}

export function stopIntelligenceDataEngine(): void {
  if (engineState.newsTimer) clearInterval(engineState.newsTimer);
  if (engineState.indicatorTimer) clearInterval(engineState.indicatorTimer);
  if (engineState.macroTimer) clearInterval(engineState.macroTimer);
  if (engineState.earningsTimer) clearInterval(engineState.earningsTimer);
  engineState.newsTimer = null;
  engineState.indicatorTimer = null;
  engineState.macroTimer = null;
  engineState.earningsTimer = null;
  engineState.started = false;
}
