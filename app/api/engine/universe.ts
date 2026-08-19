import { marketDataService, isMarketHours } from "../marketdata/service";
import { groupRthSessions } from "../marketdata/indicators";
import { startMonitor, listMonitors } from "./monitor";
import { evaluateAll } from "./monitor";
import { resolveExecutable, eligibleStrategies } from "./strategies/registry";
import { listAutoUniverseUsers } from "./portfolio";

/**
 * AUTO-UNIVERSE ENGINE — Strategy Specification v1.0 §3 stages 1–2
 * (MARKET SCAN → UNIVERSE FILTER) made deterministic and automatic.
 *
 * Replaces manual symbol tracking: the bot builds its own watchlist.
 *
 *   SEED UNIVERSE (liquid-symbol list, code-versioned)
 *     → track + refresh feeds (shared global feed map)
 *     → UNIVERSE FILTER: price ≥ $5 · session dollar volume ≥ threshold ·
 *       activity floor · RTH session · fresh data (§5: stale → REJECT)
 *     → RANK: rvol × liquidity score
 *     → TOP N per user (default 5)
 *     → STRATEGY ASSIGNMENT: deterministic tape match against APPROVED
 *       registry strategies only (resolveExecutable is the §2 gate)
 *     → startMonitor(...) → SetupMachine → ticket gate → broker
 *     → fill → TRAILING ENGINE owns every exit (coexistence by contract:
 *       this module never touches a protective stop)
 *
 * Deterministic decisions only: EXECUTE path is the existing monitor →
 * ticket pipeline; anything else is WAIT / REJECT / HALT with a recorded
 * reason. The engine never invents missing data (§5).
 *
 * This module also owns the ENGINE HEARTBEAT: ensureUniverseLoop() ticks
 * every 60s in market hours — refresh feeds → evaluate every active
 * monitor (evaluateAll) → run auto-universe cycles. Before this module,
 * monitors only evaluated on manual router calls.
 */

/* ---------- seed universe: broad, liquid, code-versioned ---------- */

const SEED_UNIVERSE: string[] = [
  // Index / sector ETFs
  "SPY", "QQQ", "IWM", "DIA", "XLF", "XLK", "XLE", "XLV", "XLI", "XLP", "XLY", "XLU", "XLC", "XLB", "XLRE", "SMH", "SOXX", "ARKK", "GLD", "SLV", "USO", "TLT",
  // Mega-cap / high-liquidity single names
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "AMD", "NFLX", "CRM", "ORCL", "ADBE", "INTC", "MU", "QCOM", "TXN", "PLTR", "UBER", "SHOP", "SQ", "COIN", "JPM", "BAC", "WFC", "GS", "MS", "XOM", "CVX", "LLY", "UNH", "JNJ", "PFE", "MRNA", "WMT", "COST", "HD", "NKE", "MCD", "SBUX", "DIS", "BA", "CAT", "GE", "F", "GM", "RIVN", "SOFI", "HOOD", "SNOW", "DDOG", "NET", "CRWD",
];

/* ---------- universe filter constants (REQ-001 SCAN + §4) ---------- */

const MIN_PRICE = 5;
const MIN_SESSION_DOLLAR_VOLUME = 20_000_000;
const MIN_RVOL = 1.2;                 // activity floor for candidates
const STALE_FEED_SECONDS = 180;       // §5: data older than this → REJECT
const TRACK_BATCH = 5;                // gateway-friendly tracking pace
const TRACK_BATCH_DELAY_MS = 300;

export interface UniverseCandidate {
  symbol: string;
  last: number;
  sessionDollarVolume: number;
  rvol: number | null;
  gapPct: number | null;
  vsVwapPct: number | null;
  score: number;
  assignedStrategy: string | null;   // registry id, e.g. "REQ-001"
  assignedConfigId: string | null;
  decision: "MONITOR" | "WAIT" | "REJECT";
  reason: string;
}

export interface UniverseCycleReport {
  userId: string;
  ranAt: number;
  seeds: number;
  tracked: number;
  filtered: number;
  candidates: UniverseCandidate[];
  monitorsStarted: string[];
  maxMonitors: number;
  errors: string[];
}

const lastCycles = new Map<string, UniverseCycleReport>();
const autoStarted = new Set<string>(); // `${userId}:${symbol}` monitors this module started
let seedsTracked = false;

/** Ensure every seed symbol has a tracked feed (batched, gateway-friendly). */
export async function ensureSeedUniverse(): Promise<number> {
  if (seedsTracked) return SEED_UNIVERSE.length;
  for (let i = 0; i < SEED_UNIVERSE.length; i += TRACK_BATCH) {
    const batch = SEED_UNIVERSE.slice(i, i + TRACK_BATCH);
    await Promise.allSettled(batch.map((s) => marketDataService.track(s)));
    await new Promise((r) => setTimeout(r, TRACK_BATCH_DELAY_MS));
  }
  seedsTracked = true;
  return SEED_UNIVERSE.length;
}

/** Deterministic strategy assignment: match tape shape to an APPROVED strategy. */
function assignStrategy(features: {
  sessionAgeMin: number;
  last: number;
  orh: number | null;
  vwap: number | null;
  wasBelowVwap: boolean;
  rvol: number | null;
}): { strategyId: string; configId: string; reason: string } | null {
  const eligible = new Set(eligibleStrategies().map((r) => r.strategyId));
  // REQ-001: opening-range breakout conditions (range formed, price above ORH, rvol hot)
  if (eligible.has("REQ-001") && features.orh !== null && features.sessionAgeMin >= 16 && features.last > features.orh && (features.rvol ?? 0) >= 1.5) {
    try {
      const ex = resolveExecutable("REQ-001");
      return { strategyId: "REQ-001", configId: ex.configId, reason: `tape matches ORB: last ${features.last} > ORH ${features.orh}, rvol ${features.rvol}` };
    } catch { /* falls through */ }
  }
  // REQ-003: VWAP reclaim shape (was below, now above)
  if (eligible.has("REQ-003") && features.vwap !== null && features.wasBelowVwap && features.last > features.vwap) {
    try {
      const ex = resolveExecutable("REQ-003");
      return { strategyId: "REQ-003", configId: ex.configId, reason: `tape matches VWAP reclaim: last ${features.last} > VWAP ${features.vwap} after trading below` };
    } catch { /* falls through */ }
  }
  return null;
}

/** Build one user's universe cycle: filter → rank → assign → start monitors. */
export async function runUniverseCycle(userId: string, maxMonitors: number): Promise<UniverseCycleReport> {
  const report: UniverseCycleReport = {
    userId,
    ranAt: Date.now(),
    seeds: SEED_UNIVERSE.length,
    tracked: 0,
    filtered: 0,
    candidates: [],
    monitorsStarted: [],
    maxMonitors,
    errors: [],
  };

  const now = Date.now();
  const current = listMonitors(userId).map((m) => m.symbol);
  const openSlots = Math.max(0, maxMonitors - current.length);

  for (const symbol of SEED_UNIVERSE) {
    const feed = marketDataService.get(symbol);
    if (!feed) continue;
    report.tracked++;

    // §5 data-failure rules: stale or errored feeds are REJECTED, never estimated.
    if (feed.error) { report.errors.push(`${symbol}: ${feed.error}`); continue; }
    if (!feed.lastRefresh || now - feed.lastRefresh > STALE_FEED_SECONDS * 1000) continue;
    if (feed.bars.length < 30 || !feed.indicators) continue;

    const sessions = groupRthSessions(feed.bars);
    const days = [...sessions.keys()].sort();
    const today = sessions.get(days[days.length - 1]) ?? [];
    if (today.length < 2) continue;

    const ind = feed.indicators;
    const last = ind.last ?? today[today.length - 1].c;
    const sessionDollarVol = today.reduce((a, b) => a + b.v * ((b.h + b.l + b.c) / 3), 0);

    // UNIVERSE FILTER (REQ-001 SCAN)
    if (last < MIN_PRICE) continue;
    if (sessionDollarVol < MIN_SESSION_DOLLAR_VOLUME) continue;

    // RVOL vs prior session same-bar-count window
    const prior = days.length > 1 ? sessions.get(days[days.length - 2])! : null;
    const priorWindow = prior ? prior.slice(0, today.length) : [];
    const priorVol = priorWindow.reduce((a, b) => a + b.v, 0);
    const todayVol = today.reduce((a, b) => a + b.v, 0);
    const rvol = priorVol > 0 ? +(todayVol / priorVol).toFixed(2) : null;
    if (rvol !== null && rvol < MIN_RVOL) continue;

    report.filtered++;

    const gapPct = ind.priorDay && ind.priorDay.close > 0
      ? +(((today[0].o - ind.priorDay.close) / ind.priorDay.close) * 100).toFixed(2)
      : null;
    const vsVwapPct = ind.vwap ? +(((last - ind.vwap) / ind.vwap) * 100).toFixed(2) : null;

    // Opening range (first 15 RTH minutes) for REQ-001 matching
    const range = today.slice(0, 15);
    const orh = range.length >= 15 ? Math.max(...range.map((b) => b.h)) : null;
    const sessionAgeMin = today.length;
    const wasBelowVwap = ind.vwap !== null && today.some((b, i) => {
      // rolling vwap comparison approximated by cumulative-to-bar vwap
      const slice = today.slice(0, i + 1);
      let pv = 0, vol = 0;
      for (const x of slice) { pv += ((x.h + x.l + x.c) / 3) * x.v; vol += x.v; }
      return vol > 0 && b.c < pv / vol;
    });

    const assignment = assignStrategy({ sessionAgeMin, last, orh, vwap: ind.vwap ?? null, wasBelowVwap, rvol });
    const score = +(((rvol ?? 1) * Math.log10(sessionDollarVol + 1)).toFixed(2));

    report.candidates.push({
      symbol,
      last,
      sessionDollarVolume: Math.round(sessionDollarVol),
      rvol,
      gapPct,
      vsVwapPct,
      score,
      assignedStrategy: assignment?.strategyId ?? null,
      assignedConfigId: assignment?.configId ?? null,
      decision: assignment ? "MONITOR" : "WAIT",
      reason: assignment?.reason ?? "no APPROVED strategy pattern matches this tape — deterministic WAIT",
    });
  }

  // RANK: score desc; only candidates with an assignment and open slots get monitors.
  report.candidates.sort((a, b) => b.score - a.score);
  let slots = openSlots;
  for (const cand of report.candidates) {
    if (slots <= 0) { if (cand.decision === "MONITOR") { cand.decision = "WAIT"; cand.reason = `monitor cap reached (${maxMonitors} concurrent) — ranked out`; } continue; }
    if (cand.decision !== "MONITOR" || !cand.assignedConfigId) continue;
    if (current.includes(cand.symbol)) { cand.decision = "WAIT"; cand.reason = "already monitored (manual or auto) — no duplicate"; continue; }
    try {
      const started = await startMonitor(userId, cand.symbol, cand.assignedConfigId);
      if (started.ok) {
        autoStarted.add(`${userId}:${cand.symbol}`);
        report.monitorsStarted.push(cand.symbol);
        slots--;
      } else {
        cand.decision = "REJECT";
        cand.reason = started.detail;
      }
    } catch (e) {
      cand.decision = "REJECT";
      cand.reason = (e as Error).message;
    }
  }

  report.candidates = report.candidates.slice(0, 25); // top of book for the UI
  lastCycles.set(userId, report);
  return report;
}

export function lastUniverseCycle(userId: string): UniverseCycleReport | null {
  return lastCycles.get(userId) ?? null;
}

export function universeStatus() {
  return {
    seeds: SEED_UNIVERSE.length,
    seedsTracked,
    trackedFeeds: marketDataService.list().length,
    marketHours: isMarketHours(),
    filter: { minPrice: MIN_PRICE, minSessionDollarVolume: MIN_SESSION_DOLLAR_VOLUME, minRvol: MIN_RVOL, staleFeedSeconds: STALE_FEED_SECONDS },
  };
}

/* ---------- engine heartbeat ---------- */

let loop: ReturnType<typeof setInterval> | null = null;
let ticking = false;

/**
 * The engine heartbeat (60s, market hours only):
 *   1. refresh every tracked feed
 *   2. evaluate every active monitor (the tick that drives state machines)
 *   3. run auto-universe cycles for opted-in users
 */
export function ensureUniverseLoop(): void {
  if (loop) return;
  loop = setInterval(() => {
    if (!isMarketHours() || ticking) return;
    ticking = true;
    void (async () => {
      try {
        await marketDataService.refreshAll();
        await evaluateAll();
        const users = await listAutoUniverseUsers();
        if (users.length > 0) await ensureSeedUniverse();
        for (const u of users) {
          await runUniverseCycle(u.id, u.autoUniverseMax).catch(() => undefined);
        }
      } finally {
        ticking = false;
      }
    })();
  }, 60_000);
  if (typeof loop.unref === "function") loop.unref();
}
