import { and, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { indicatorRegistry } from "@db/schema";
import * as P from "./primitives";

/**
 * REQUI INDICATOR REGISTRY — the single authoritative catalog of every
 * indicator the platform may calculate (Indicator Engine spec: registry,
 * standard interface, approval ladder, data-tier classification).
 *
 * Rules encoded here:
 *  · No strategy, engine module or AI path may contain its own indicator
 *    math — everything requests values through this registry.
 *  · Every indicator carries a DATA TIER so the system never attempts a
 *    calculation from insufficient data (Yahoo OHLCV = Tier 1/2).
 *  · The approval ladder (RESEARCH_ONLY → … → APPROVED_FOR_AUTONOMOUS_LIVE)
 *    is deterministic: only the approved subset may feed live Autonomous.
 *  · Calculations are point-in-time safe (see ./primitives.ts).
 *
 * The code registry below is the source of truth; `syncIndicatorRegistry`
 * mirrors it into the indicator_registry table for auditability.
 */

export type ApprovalStatus =
  | "RESEARCH_ONLY"
  | "APPROVED_FOR_INTELLIGENCE"
  | "APPROVED_FOR_BACKTESTING"
  | "APPROVED_FOR_PAPER_TRADING"
  | "APPROVED_FOR_AUTONOMOUS_LIVE";

export type Priority = "P0" | "P1" | "P2" | "P3" | "P4";

/** Data tiers per spec — Tier 1 = OHLCV only … Tier 9 = macroeconomic. */
export type DataTier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface IndicatorDefinition {
  id: string;
  name: string;
  category: "TREND" | "MOMENTUM" | "VOLUME" | "VOLATILITY" | "PRICE_TRANSFORM" | "RANGE";
  version: string;
  priority: Priority;
  description: string;
  defaultParameters: Record<string, number>;
  /** Which bar series the indicator consumes. */
  input: "daily" | "intraday";
  minimumHistory: number;
  dataTier: DataTier;
  yfinanceSupported: boolean;
  approval: ApprovalStatus;
  /**
   * Deterministic calculation from normalized bars (ascending). Returns null
   * when lookback is insufficient — never fabricates.
   */
  calculate: (daily: P.BarLike[], intraday: P.BarLike[], params: Record<string, number>) => number | null;
}

const closes = (daily: P.BarLike[]) => daily.map((b) => b.c);
const vols = (daily: P.BarLike[]) => daily.map((b) => b.v);

const LIVE = "APPROVED_FOR_AUTONOMOUS_LIVE" as const;
const INTEL = "APPROVED_FOR_INTELLIGENCE" as const;

function ma(id: string, name: string, fn: "sma" | "ema", period: number): IndicatorDefinition {
  return {
    id,
    name,
    category: "TREND",
    version: "1.0.0",
    priority: period <= 50 ? "P0" : "P1",
    description: `${name}(${period}) of close prices.`,
    defaultParameters: { period },
    input: "daily",
    minimumHistory: period,
    dataTier: 1,
    yfinanceSupported: true,
    approval: LIVE,
    calculate: (daily, _i, p) => (fn === "sma" ? P.sma(closes(daily), p.period ?? period) : P.ema(closes(daily), p.period ?? period)),
  };
}

/** The production registry — P0/P1 set, all Tier-1 (OHLCV), all validated. */
export const INDICATORS: IndicatorDefinition[] = [
  ma("sma_5", "Simple Moving Average", "sma", 5),
  ma("sma_10", "Simple Moving Average", "sma", 10),
  ma("sma_20", "Simple Moving Average", "sma", 20),
  ma("sma_50", "Simple Moving Average", "sma", 50),
  ma("sma_100", "Simple Moving Average", "sma", 100),
  ma("sma_200", "Simple Moving Average", "sma", 200),
  ma("ema_9", "Exponential Moving Average", "ema", 9),
  ma("ema_12", "Exponential Moving Average", "ema", 12),
  ma("ema_20", "Exponential Moving Average", "ema", 20),
  ma("ema_21", "Exponential Moving Average", "ema", 21),
  ma("ema_26", "Exponential Moving Average", "ema", 26),
  ma("ema_50", "Exponential Moving Average", "ema", 50),
  ma("ema_200", "Exponential Moving Average", "ema", 200),
  {
    id: "rsi_14",
    name: "Relative Strength Index",
    category: "MOMENTUM",
    version: "1.0.0",
    priority: "P0",
    description: "Wilder's RSI(14) on closes. Value exposed with context — RSI > 70 is information, not a universal SELL.",
    defaultParameters: { period: 14 },
    input: "daily",
    minimumHistory: 15,
    dataTier: 1,
    yfinanceSupported: true,
    approval: LIVE,
    calculate: (daily, _i, p) => P.rsi(closes(daily), p.period ?? 14),
  },
  {
    id: "atr_14",
    name: "Average True Range",
    category: "VOLATILITY",
    version: "1.0.0",
    priority: "P0",
    description: "Wilder's ATR(14) — feeds stop placement and sizing in the risk engine.",
    defaultParameters: { period: 14 },
    input: "daily",
    minimumHistory: 15,
    dataTier: 1,
    yfinanceSupported: true,
    approval: LIVE,
    calculate: (daily, _i, p) => P.atr(daily, p.period ?? 14),
  },
  {
    id: "vwap",
    name: "Session VWAP",
    category: "VOLUME",
    version: "1.0.0",
    priority: "P0",
    description: "Volume-weighted average price of the current session (typical price × volume).",
    defaultParameters: {},
    input: "intraday",
    minimumHistory: 1,
    dataTier: 1,
    yfinanceSupported: true,
    approval: LIVE,
    calculate: (_d, intraday) => P.vwap(intraday),
  },
  {
    id: "bollinger_upper",
    name: "Bollinger Band Upper",
    category: "VOLATILITY",
    version: "1.0.0",
    priority: "P1",
    description: "SMA(20) + 2σ of closes.",
    defaultParameters: { period: 20, k: 2 },
    input: "daily",
    minimumHistory: 20,
    dataTier: 1,
    yfinanceSupported: true,
    approval: INTEL,
    calculate: (daily, _i, p) => P.bollinger(closes(daily), p.period ?? 20, p.k ?? 2)?.upper ?? null,
  },
  {
    id: "bollinger_middle",
    name: "Bollinger Band Middle",
    category: "VOLATILITY",
    version: "1.0.0",
    priority: "P1",
    description: "SMA(20) of closes.",
    defaultParameters: { period: 20, k: 2 },
    input: "daily",
    minimumHistory: 20,
    dataTier: 1,
    yfinanceSupported: true,
    approval: INTEL,
    calculate: (daily, _i, p) => P.bollinger(closes(daily), p.period ?? 20, p.k ?? 2)?.middle ?? null,
  },
  {
    id: "bollinger_lower",
    name: "Bollinger Band Lower",
    category: "VOLATILITY",
    version: "1.0.0",
    priority: "P1",
    description: "SMA(20) − 2σ of closes.",
    defaultParameters: { period: 20, k: 2 },
    input: "daily",
    minimumHistory: 20,
    dataTier: 1,
    yfinanceSupported: true,
    approval: INTEL,
    calculate: (daily, _i, p) => P.bollinger(closes(daily), p.period ?? 20, p.k ?? 2)?.lower ?? null,
  },
  {
    id: "macd",
    name: "MACD Line",
    category: "MOMENTUM",
    version: "1.0.0",
    priority: "P1",
    description: "EMA(12) − EMA(26) of closes.",
    defaultParameters: { fast: 12, slow: 26, signal: 9 },
    input: "daily",
    minimumHistory: 26,
    dataTier: 1,
    yfinanceSupported: true,
    approval: INTEL,
    calculate: (daily, _i, p) => P.macd(closes(daily), p.fast ?? 12, p.slow ?? 26, p.signal ?? 9)?.macd ?? null,
  },
  {
    id: "macd_signal",
    name: "MACD Signal",
    category: "MOMENTUM",
    version: "1.0.0",
    priority: "P1",
    description: "EMA(9) of the MACD line.",
    defaultParameters: { fast: 12, slow: 26, signal: 9 },
    input: "daily",
    minimumHistory: 35,
    dataTier: 1,
    yfinanceSupported: true,
    approval: INTEL,
    calculate: (daily, _i, p) => P.macd(closes(daily), p.fast ?? 12, p.slow ?? 26, p.signal ?? 9)?.signal ?? null,
  },
  {
    id: "macd_histogram",
    name: "MACD Histogram",
    category: "MOMENTUM",
    version: "1.0.0",
    priority: "P1",
    description: "MACD line − signal.",
    defaultParameters: { fast: 12, slow: 26, signal: 9 },
    input: "daily",
    minimumHistory: 35,
    dataTier: 1,
    yfinanceSupported: true,
    approval: INTEL,
    calculate: (daily, _i, p) => P.macd(closes(daily), p.fast ?? 12, p.slow ?? 26, p.signal ?? 9)?.histogram ?? null,
  },
  {
    id: "average_volume",
    name: "Average Volume (20d)",
    category: "VOLUME",
    version: "1.0.0",
    priority: "P0",
    description: "20-day simple average of daily volume (excludes the forming session).",
    defaultParameters: { period: 20 },
    input: "daily",
    minimumHistory: 21,
    dataTier: 1,
    yfinanceSupported: true,
    approval: LIVE,
    calculate: (daily, _i, p) => {
      const v = vols(daily);
      const base = v.length > 1 ? v.slice(0, -1) : v;
      return P.sma(base, Math.min(p.period ?? 20, base.length));
    },
  },
  {
    id: "week_52_high",
    name: "52-Week High",
    category: "RANGE",
    version: "1.0.0",
    priority: "P1",
    description: "Highest daily high over the last 252 sessions.",
    defaultParameters: { period: 252 },
    input: "daily",
    minimumHistory: 30,
    dataTier: 1,
    yfinanceSupported: true,
    approval: INTEL,
    calculate: (daily, _i, p) => {
      const slice = daily.slice(-(p.period ?? 252));
      return slice.length ? Math.max(...slice.map((b) => b.h)) : null;
    },
  },
  {
    id: "week_52_low",
    name: "52-Week Low",
    category: "RANGE",
    version: "1.0.0",
    priority: "P1",
    description: "Lowest daily low over the last 252 sessions.",
    defaultParameters: { period: 252 },
    input: "daily",
    minimumHistory: 30,
    dataTier: 1,
    yfinanceSupported: true,
    approval: INTEL,
    calculate: (daily, _i, p) => {
      const slice = daily.slice(-(p.period ?? 252));
      return slice.length ? Math.min(...slice.map((b) => b.l)) : null;
    },
  },
];

/** Registry access — the only way modules obtain indicator definitions. */
class Registry {
  /** Every calculation is wrapped: throw/NaN/Infinity → null (never fabricate). */
  private byId = new Map(
    INDICATORS.map((d) => [
      d.id,
      {
        ...d,
        calculate: ((fn, def) => (daily: P.BarLike[], intraday: P.BarLike[], params: Record<string, number>) => {
          try {
            const series = def.input === "intraday" ? intraday : daily;
            if (series.length < def.minimumHistory) return null; // insufficient lookback — never fabricate
            const v = fn(daily, intraday, params);
            return v !== null && Number.isFinite(v) ? v : null;
          } catch {
            return null;
          }
        })(d.calculate, d),
      } satisfies IndicatorDefinition,
    ]),
  );

  get(id: string): IndicatorDefinition {
    const def = this.byId.get(id);
    if (!def) throw new Error(`Unknown indicator "${id}" — strategies must request registered indicators only`);
    return def;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  list(): IndicatorDefinition[] {
    return INDICATORS;
  }

  /** The subset permitted for a given consumption level (approval ladder). */
  approvedFor(level: "INTELLIGENCE" | "BACKTESTING" | "PAPER_TRADING" | "AUTONOMOUS_LIVE"): IndicatorDefinition[] {
    const order: ApprovalStatus[] = ["RESEARCH_ONLY", "APPROVED_FOR_INTELLIGENCE", "APPROVED_FOR_BACKTESTING", "APPROVED_FOR_PAPER_TRADING", "APPROVED_FOR_AUTONOMOUS_LIVE"];
    const need: Record<typeof level, number> = { INTELLIGENCE: 1, BACKTESTING: 2, PAPER_TRADING: 3, AUTONOMOUS_LIVE: 4 };
    return INDICATORS.filter((d) => order.indexOf(d.approval) >= need[level]);
  }
}

export const registry = new Registry();

/**
 * Mirror the code registry into indicator_registry (audit trail of versions,
 * approval status and data requirements). Idempotent upsert; failures never
 * break boot — the code registry remains authoritative.
 */
export async function syncIndicatorRegistry(): Promise<void> {
  try {
    const db = getDb();
    for (const d of INDICATORS) {
      const existing = await db.select({ id: indicatorRegistry.id }).from(indicatorRegistry).where(eq(indicatorRegistry.indicatorId, d.id)).limit(1);
      const row = {
        name: d.name,
        category: d.category,
        version: d.version,
        priority: d.priority,
        description: d.description,
        status: d.approval,
        dataRequirements: { tier: d.dataTier, yfinanceSupported: d.yfinanceSupported },
        defaultParameters: d.defaultParameters,
        minimumHistory: d.minimumHistory,
        approvedForIntelligence: ["APPROVED_FOR_INTELLIGENCE", "APPROVED_FOR_BACKTESTING", "APPROVED_FOR_PAPER_TRADING", "APPROVED_FOR_AUTONOMOUS_LIVE"].includes(d.approval),
        approvedForBacktesting: ["APPROVED_FOR_BACKTESTING", "APPROVED_FOR_PAPER_TRADING", "APPROVED_FOR_AUTONOMOUS_LIVE"].includes(d.approval),
        approvedForPaper: ["APPROVED_FOR_PAPER_TRADING", "APPROVED_FOR_AUTONOMOUS_LIVE"].includes(d.approval),
        approvedForLive: d.approval === "APPROVED_FOR_AUTONOMOUS_LIVE",
        updatedAt: new Date(),
      };
      if (existing[0]) {
        await db.update(indicatorRegistry).set(row).where(and(eq(indicatorRegistry.indicatorId, d.id)));
      } else {
        await db.insert(indicatorRegistry).values({ indicatorId: d.id, ...row });
      }
    }
  } catch (e) {
    console.error("[indicators] registry sync failed:", (e as Error).message);
  }
}
