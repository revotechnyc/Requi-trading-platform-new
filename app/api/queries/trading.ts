import { getDb } from "./connection";
import { strategies, brokerAccounts } from "@db/schema";
import { and, desc, eq } from "drizzle-orm";

/** Legacy seed names retired when the registered autonomous library replaced them. */
const LEGACY_STRATEGY_NAMES = [
  "BTC Mean Reversion", "SPX Iron Condor", "ES Opening Range", "ETH Breakout",
  "Momentum Breakout", "Mean Reversion", "Opening Range Breakout", "VWAP Reversion",
  "Trend Pullback", "Gap Fade", "Volatility Compression Breakout", "Swing Trend Follow",
  "Crypto Mean Reversion", "Index Iron Condor", "Defined-Risk Credit Spread",
  "Calendar Income", "Post-Event Drift", "Relative Strength Rotation",
];

/**
 * Registered Autonomous Strategy Library.
 * Names and user-facing descriptions only — every strategy's private
 * implementation lives in the compiled Strategy Package (server-side,
 * signed). Each strategy is independently versioned, validated,
 * risk-budgeted, monitored, and audited per its registered contract.
 */
const SEED_STRATEGIES = [
  {
    name: "Pre-Earnings Sentiment",
    source: "Custom" as const,
    asset: "Stocks" as const,
    status: "Live" as const,
    accounts: 0,
    pnl30d: "0.00",
    winRate: 0,
    trades: 0,
    prompt: `Registered strategy — earnings sleeve.
PURPOSE: Identify expectation drift and sentiment opportunities before an earnings release.
ANALYZES: Analyst revisions, consensus dispersion, news sentiment, company guidance, peer reports, institutional positioning, options-implied expectations, pre-event price movement, and market regime.
DEFAULT BEHAVIOR: Enters and exits according to its registered strategy contract. Does not hold through the release unless a separately authorized strategy permits it.
NOTE: Entry requires your explicit order confirmation. Implementation is private and runs server-side under the signed governance package.`,
  },
  {
    name: "Through-Earnings Event",
    source: "Custom" as const,
    asset: "Options" as const,
    status: "Paper" as const,
    accounts: 0,
    pnl30d: "0.00",
    winRate: 0,
    trades: 0,
    prompt: `Registered strategy — earnings sleeve.
PURPOSE: Evaluate approved overnight or through-release opportunities.
REQUIREMENTS: Confirmed release date and time, full conditional distribution, gap-risk model, approved overnight authority, stress-loss sizing, risk and compliance clearance, and exact confirmation when required.
NOTE: Stops are never represented as protection against closed-market gaps. Implementation is private and runs server-side under the signed governance package.`,
  },
  {
    name: "Earnings-Day Reaction",
    source: "Custom" as const,
    asset: "Stocks" as const,
    status: "Live" as const,
    accounts: 0,
    pnl30d: "0.00",
    winRate: 0,
    trades: 0,
    prompt: `Registered strategy — earnings sleeve.
PURPOSE: Evaluate price behavior after earnings are released.
REQUIREMENTS MAY INCLUDE: No opening-bell entry, opening-range formation, VWAP behavior, opening-range breakout or rejection, volume confirmation, spread and liquidity, post-cost expected value, minimum reward-to-risk, and current market and sector conditions.
NOTE: Implementation is private and runs server-side under the signed governance package.`,
  },
  {
    name: "Post-Earnings Continuation",
    source: "Custom" as const,
    asset: "Stocks" as const,
    status: "Live" as const,
    accounts: 0,
    pnl30d: "0.00",
    winRate: 0,
    trades: 0,
    prompt: `Registered strategy — earnings sleeve.
PURPOSE: Identify next-session or multi-session continuation, drift, reversal, or failed-reaction opportunities after public digestion of the earnings result.
ANALYZES: Quality-adjusted surprise, guidance, institutional reaction, relative volume, price acceptance, anchored VWAP, support and resistance, sector confirmation, options positioning, and historical company-specific reaction.
NOTE: Implementation is private and runs server-side under the signed governance package.`,
  },
  {
    name: "Bearish Earnings",
    source: "Custom" as const,
    asset: "Options" as const,
    status: "Paper" as const,
    accounts: 0,
    pnl30d: "0.00",
    winRate: 0,
    trades: 0,
    prompt: `Registered strategy — earnings sleeve.
PURPOSE: Identify likely disappointment or negative-reaction candidates and evaluate defined-risk bearish structures.
EVALUATES: Long put, bear put spread, other approved defined-risk alternatives — or no trade.
NOTE: Assumes the full debit may be lost. Implementation is private and runs server-side under the signed governance package.`,
  },
  {
    name: "General Intraday",
    source: "Custom" as const,
    asset: "Stocks" as const,
    status: "Live" as const,
    accounts: 0,
    pnl30d: "0.00",
    winRate: 0,
    trades: 0,
    prompt: `Registered strategy — general sleeve.
PURPOSE: Identify approved non-earnings intraday opportunities.
ANALYZES: Catalysts, market structure, institutional flow, news, macro events, weather, supply-chain developments, and other approved signals.
NOTE: Implementation is private and runs server-side under the signed governance package.`,
  },
];

/**
 * PRODUCTION REVISION §2/§5: broker accounts are NEVER seeded. Fabricated
 * balances presented as "Connected" live accounts were the single worst
 * placeholder violation in the app. The Accounts module now reflects only
 * real connections; zero rows renders the explicit Not Connected state.
 *
 * Lazily seed the strategy library and backfill strategies added later.
 */
/**
 * Strategy library auto-seeding is DISABLED (final revision): the library
 * starts empty for every user. Strategies appear only when the user actually
 * creates one (Intelligence paste / Strategies module). The registered
 * autonomous strategy contracts remain server-side in the engine registry —
 * this table is user workspace content, never pre-populated.
 */
export async function ensureUserSeeded(userId: string) {
  void userId;
  // Purge previously auto-seeded library rows (idempotent, keyed by the
  // known seed names — user-created strategies with other names are kept).
  const db = getDb();
  const seedNames = [...SEED_STRATEGIES.map((s) => s.name), ...LEGACY_STRATEGY_NAMES];
  const seededRows = await db
    .select({ id: strategies.id, name: strategies.name })
    .from(strategies)
    .where(eq(strategies.userId, userId));
  const stale = seededRows.filter((r) => seedNames.includes(r.name)).map((r) => r.id);
  for (const id of stale) {
    await db.delete(strategies).where(and(eq(strategies.id, id), eq(strategies.userId, userId)));
  }
}

export async function findStrategiesByUser(userId: string) {
  await ensureUserSeeded(userId);
  return getDb()
    .select()
    .from(strategies)
    .where(eq(strategies.userId, userId))
    .orderBy(desc(strategies.createdAt));
}

export async function createStrategy(data: {
  userId: string;
  name: string;
  prompt: string;
  asset?: "Stocks" | "Crypto" | "Options" | "Futures";
  parsedPlan?: string;
}) {
  const db = getDb();
  const [{ id }] = await db
    .insert(strategies)
    .values({
      userId: data.userId,
      name: data.name,
      prompt: data.prompt,
      asset: data.asset ?? "Stocks",
      parsedPlan: data.parsedPlan ?? null,
      source: "Custom",
      status: "Paper",
    })
    .returning();
  return { id };
}

export async function setStrategyStatus(
  userId: string,
  id: string,
  status: "Live" | "Paper" | "Paused",
) {
  await getDb()
    .update(strategies)
    .set({ status })
    .where(and(eq(strategies.id, id), eq(strategies.userId, userId)));
}

/**
 * Canonical account list — the source of truth for every module (§5).
 * Returns ONLY real connections; never seeds, never fabricates. An empty
 * array is the honest "Not Connected" state.
 */
export async function findAccountsByUser(userId: string) {
  return getDb()
    .select()
    .from(brokerAccounts)
    .where(eq(brokerAccounts.userId, userId))
    .orderBy(desc(brokerAccounts.equity));
}
