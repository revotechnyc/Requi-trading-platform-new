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

let started = false;
let newsTimer: ReturnType<typeof setInterval> | null = null;
let indicatorTimer: ReturnType<typeof setInterval> | null = null;
let macroTimer: ReturnType<typeof setInterval> | null = null;
let earningsTimer: ReturnType<typeof setInterval> | null = null;

async function allWatchlistSymbols(): Promise<Array<{ userId: string; symbol: string }>> {
  try {
    return getDb().select({ userId: intelligenceWatchlist.userId, symbol: intelligenceWatchlist.symbol }).from(intelligenceWatchlist);
  } catch {
    return [];
  }
}

async function prefetchAllWatchlists(): Promise<void> {
  const rows = await allWatchlistSymbols();
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
  if (started) return;
  started = true;

  void ensureIntelligenceWatchlistTable().catch((e) => {
    console.error("[intelligence-data] watchlist table init failed", e);
  });

  // News + prices prefetch ~1 min
  newsTimer = setInterval(() => {
    void prefetchAllWatchlists();
  }, 60_000);

  // Indicators ~90s
  indicatorTimer = setInterval(() => {
    void prefetchAllWatchlists();
  }, 90_000);

  // GDELT macro ~15 min
  macroTimer = setInterval(() => {
    void fetchGdeltMacro().catch(() => undefined);
  }, 15 * 60_000);

  // Earnings calendar + alerts daily (also run once at start after delay)
  earningsTimer = setInterval(() => {
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
  if (newsTimer) clearInterval(newsTimer);
  if (indicatorTimer) clearInterval(indicatorTimer);
  if (macroTimer) clearInterval(macroTimer);
  if (earningsTimer) clearInterval(earningsTimer);
  started = false;
}
