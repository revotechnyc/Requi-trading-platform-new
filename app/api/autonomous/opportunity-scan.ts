/**
 * Autonomous opportunity scan — General Intraday (S&P≈100) + earnings calendar.
 *
 * - Quotes go through the RTI market-data gateway (Yahoo/IBKR/cache) — never invented.
 * - Scan is cached (~90s) so the 2.5s runner does not hammer the gateway.
 * - Earnings sleeve evaluates calendar names; auto-trade only when
 *   AUTONOMOUS_EARNINGS_AUTO_TRADE=true|1 (default off — governance).
 */
import { getSnapshot } from "../marketdata/gateway/gateway";
import { fetchEarningsCalendarForDate } from "../intelligence-data/earnings-day";
import { autonomousScanUniverse } from "./sp100-universe";

export type AutonomousStrategyName =
  | "General Intraday"
  | "Pre-Earnings Sentiment"
  | "Earnings-Day Reaction"
  | "Post-Earnings Continuation"
  | "Through-Earnings Event";

export type ScanCandidate = {
  symbol: string;
  strategy: AutonomousStrategyName;
  score: number;
  price: number;
  dailyChangePct: number | null;
  reason: string;
  source: string | null;
  sleeve: "INTRADAY" | "EARNINGS";
  /** When false, surface as a pick/event but do not auto-execute. */
  executable: boolean;
};

export type ScanSnapshot = {
  at: number;
  scanned: number;
  quoted: number;
  universeSize: number;
  candidates: ScanCandidate[];
  earningsAvailable: boolean;
  earningsError?: string;
  message: string;
};

const SCAN_TTL_MS = 90_000;
const QUOTE_BATCH = 8;
const BATCH_PAUSE_MS = 120;
const MIN_PRICE = 5;
/** Absolute daily move threshold for General Intraday entry consideration. */
const MIN_INTRADAY_MOVE_PCT = 0.75;

type CacheEntry = { at: number; snap: ScanSnapshot; inflight?: Promise<ScanSnapshot> };
const cacheByUser = new Map<string, CacheEntry>();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function ymdInNy(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function earningsAutoTradeEnabled(): boolean {
  const v = process.env.AUTONOMOUS_EARNINGS_AUTO_TRADE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

async function quoteBatch(
  userId: string,
  symbols: string[],
): Promise<Map<string, { price: number; dailyChangePct: number | null; source: string | null }>> {
  const out = new Map<string, { price: number; dailyChangePct: number | null; source: string | null }>();
  for (let i = 0; i < symbols.length; i += QUOTE_BATCH) {
    const slice = symbols.slice(i, i + QUOTE_BATCH);
    const rows = await Promise.all(
      slice.map(async (symbol) => {
        try {
          const snap = await getSnapshot(userId, symbol);
          if (!snap.market_data_available || !(snap.price > 0)) return null;
          const prev = snap.previous_close;
          const dailyChangePct =
            prev !== null && prev > 0 ? ((snap.price - prev) / prev) * 100 : null;
          return {
            symbol,
            price: snap.price,
            dailyChangePct,
            source: snap.source_name ?? snap.source ?? null,
          };
        } catch {
          return null;
        }
      }),
    );
    for (const row of rows) {
      if (row) out.set(row.symbol, row);
    }
    if (i + QUOTE_BATCH < symbols.length) await sleep(BATCH_PAUSE_MS);
  }
  return out;
}

async function loadEarningsSymbols(): Promise<{ symbols: Map<string, string>; available: boolean; error?: string }> {
  const today = ymdInNy();
  const tomorrow = addDaysYmd(today, 1);
  const symbols = new Map<string, string>(); // symbol → date
  try {
    const [a, b] = await Promise.all([
      fetchEarningsCalendarForDate(today),
      fetchEarningsCalendarForDate(tomorrow),
    ]);
    const available = Boolean(a.available || b.available);
    const err = !available ? a.error || b.error : undefined;
    for (const row of [...(a.rows ?? []), ...(b.rows ?? [])]) {
      const sym = String(row.symbol || "").trim().toUpperCase();
      if (!sym || symbols.has(sym)) continue;
      symbols.set(sym, row.date || today);
    }
    return { symbols, available, error: err };
  } catch (e) {
    return { symbols, available: false, error: (e as Error).message };
  }
}

function scoreIntraday(dailyChangePct: number | null): number {
  if (dailyChangePct === null) return 0;
  // Prefer upside momentum for long-only paper sleeve.
  if (dailyChangePct < MIN_INTRADAY_MOVE_PCT) return 0;
  return dailyChangePct;
}

async function runScan(userId: string, exclude: Set<string>): Promise<ScanSnapshot> {
  const universe = autonomousScanUniverse(100);
  const quotes = await quoteBatch(userId, universe);
  const candidates: ScanCandidate[] = [];

  for (const symbol of universe) {
    if (exclude.has(symbol)) continue;
    const q = quotes.get(symbol);
    if (!q || q.price < MIN_PRICE) continue;
    const score = scoreIntraday(q.dailyChangePct);
    if (score <= 0) continue;
    candidates.push({
      symbol,
      strategy: "General Intraday",
      score,
      price: q.price,
      dailyChangePct: q.dailyChangePct,
      reason: `Intraday momentum ${q.dailyChangePct!.toFixed(2)}% ≥ ${MIN_INTRADAY_MOVE_PCT}% · live quote`,
      source: q.source,
      sleeve: "INTRADAY",
      executable: true,
    });
  }

  const earn = await loadEarningsSymbols();
  const earningsAuto = earningsAutoTradeEnabled();
  let extrasQuoted = 0;
  for (const [symbol, reportDate] of earn.symbols) {
    if (exclude.has(symbol)) continue;
    if (!quotes.has(symbol)) {
      if (extrasQuoted >= 15) continue;
      const extra = await quoteBatch(userId, [symbol]);
      const q0 = extra.get(symbol);
      if (q0) {
        quotes.set(symbol, q0);
        extrasQuoted += 1;
      } else {
        continue;
      }
    }
    const q = quotes.get(symbol);
    if (!q || q.price < MIN_PRICE) continue;

    const today = ymdInNy();
    const strategy: AutonomousStrategyName =
      reportDate === today
        ? q.dailyChangePct !== null && q.dailyChangePct < 0
          ? "Earnings-Day Reaction"
          : "Post-Earnings Continuation"
        : "Pre-Earnings Sentiment";

    const move = Math.abs(q.dailyChangePct ?? 0);
    const score = 10 + move; // earnings sleeve ranked above weak intraday noise
    candidates.push({
      symbol,
      strategy,
      score,
      price: q.price,
      dailyChangePct: q.dailyChangePct,
      reason: `Earnings calendar ${reportDate} · ${strategy}${earningsAuto ? "" : " · sleeve evaluate-only (auto-trade off)"}`,
      source: q.source,
      sleeve: "EARNINGS",
      executable: earningsAuto,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  // Dedupe by symbol — keep highest score
  const best = new Map<string, ScanCandidate>();
  for (const c of candidates) {
    const prev = best.get(c.symbol);
    if (!prev || c.score > prev.score) best.set(c.symbol, c);
  }
  const deduped = [...best.values()].sort((a, b) => b.score - a.score);

  const executable = deduped.filter((c) => c.executable);
  const message =
    deduped.length === 0
      ? `Scanned ${universe.length} liquid names (${quotes.size} quoted) — none met General Intraday / earnings criteria`
      : `Scan ready · ${deduped.length} pick(s) · ${executable.length} executable · universe ${universe.length}`;

  return {
    at: Date.now(),
    scanned: universe.length,
    quoted: quotes.size,
    universeSize: universe.length,
    candidates: deduped.slice(0, 25),
    earningsAvailable: earn.available,
    earningsError: earn.error,
    message,
  };
}

/** Fresh or cached scan for this user. */
export async function getOpportunityScan(
  userId: string,
  opts?: { excludeSymbols?: string[]; force?: boolean },
): Promise<ScanSnapshot> {
  const exclude = new Set((opts?.excludeSymbols ?? []).map((s) => s.toUpperCase()));
  const key = userId;
  const hit = cacheByUser.get(key);
  const fresh = hit && Date.now() - hit.at < SCAN_TTL_MS && !opts?.force;
  if (fresh && hit) return hit.snap;
  if (hit?.inflight) return hit.inflight;

  const inflight = runScan(userId, exclude)
    .then((snap) => {
      cacheByUser.set(key, { at: Date.now(), snap });
      return snap;
    })
    .catch((err) => {
      cacheByUser.delete(key);
      throw err;
    });

  cacheByUser.set(key, {
    at: hit?.at ?? 0,
    snap: hit?.snap ?? {
      at: 0,
      scanned: 0,
      quoted: 0,
      universeSize: 0,
      candidates: [],
      earningsAvailable: false,
      message: "Scanning…",
    },
    inflight,
  });
  return inflight;
}

/** Next candidate the runner may attempt to trade (executable only). */
export function nextExecutablePick(
  snap: ScanSnapshot,
  exclude: Set<string>,
): ScanCandidate | null {
  for (const c of snap.candidates) {
    if (!c.executable) continue;
    if (exclude.has(c.symbol.toUpperCase())) continue;
    return c;
  }
  return null;
}

/** UI Strategy Picks — includes evaluate-only earnings names. */
export function listScanPicks(snap: ScanSnapshot, limit = 12): ScanCandidate[] {
  return snap.candidates.slice(0, limit);
}
