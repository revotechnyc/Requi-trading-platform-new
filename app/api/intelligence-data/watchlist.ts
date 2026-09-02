import { getDb } from "../queries/connection";
import { intelligenceWatchlist } from "@db/schema";
import { and, eq, or, sql } from "drizzle-orm";

/** Map common watchlist typos/aliases to tradable tickers for data providers. */
const WATCHLIST_SYMBOL_ALIASES: Record<string, string> = {
  GOOGLE: "GOOGL",
  FB: "META",
};

export function normalizeWatchlistSymbol(raw: string): string {
  const symbol = raw.toUpperCase().trim();
  return WATCHLIST_SYMBOL_ALIASES[symbol] ?? symbol;
}

let watchlistTableReady = false;

export async function ensureIntelligenceWatchlistTable(): Promise<void> {
  if (watchlistTableReady) return;
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS intelligence_watchlist (
      id text PRIMARY KEY DEFAULT gen_random_uuid(),
      "userId" text NOT NULL REFERENCES users(id),
      symbol varchar(16) NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS intelligence_watchlist_user_idx
    ON intelligence_watchlist ("userId", "createdAt" DESC)
  `);
  watchlistTableReady = true;
}

export async function listWatchlist(userId: string) {
  await ensureIntelligenceWatchlistTable();
  return getDb()
    .select()
    .from(intelligenceWatchlist)
    .where(eq(intelligenceWatchlist.userId, userId))
    .orderBy(intelligenceWatchlist.createdAt);
}

export async function listWatchlistSymbols(userId: string): Promise<string[]> {
  const rows = await listWatchlist(userId);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const sym = normalizeWatchlistSymbol(row.symbol);
    if (seen.has(sym)) continue;
    seen.add(sym);
    out.push(sym);
  }
  return out;
}

export async function addWatchlistSymbol(userId: string, rawSymbol: string) {
  await ensureIntelligenceWatchlistTable();
  const raw = rawSymbol.toUpperCase().trim();
  const symbol = normalizeWatchlistSymbol(raw);
  if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) {
    return { ok: false as const, error: `Invalid symbol "${rawSymbol}"` };
  }
  const db = getDb();
  const existing = await db
    .select({ id: intelligenceWatchlist.id })
    .from(intelligenceWatchlist)
    .where(
      and(
        eq(intelligenceWatchlist.userId, userId),
        or(eq(intelligenceWatchlist.symbol, symbol), eq(intelligenceWatchlist.symbol, raw)),
      ),
    )
    .limit(1);
  if (existing[0]) return { ok: true as const, symbol, created: false };
  await db.insert(intelligenceWatchlist).values({ userId, symbol });
  return { ok: true as const, symbol, created: true };
}

export async function removeWatchlistSymbol(userId: string, rawSymbol: string) {
  await ensureIntelligenceWatchlistTable();
  const raw = rawSymbol.toUpperCase().trim();
  const symbol = normalizeWatchlistSymbol(raw);
  await getDb()
    .delete(intelligenceWatchlist)
    .where(
      and(
        eq(intelligenceWatchlist.userId, userId),
        or(eq(intelligenceWatchlist.symbol, symbol), eq(intelligenceWatchlist.symbol, raw)),
      ),
    );
  return { ok: true as const, symbol };
}
