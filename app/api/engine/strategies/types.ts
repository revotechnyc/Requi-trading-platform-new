/**
 * UNIVERSAL STRATEGY OBJECT — Strategy Specification v1.0 §2.
 *
 * Every strategy in the Requi deterministic engine is expressed as ONE
 * schema. The object is DATA: it declares what the strategy needs, how it
 * scans, how it enters, how it is sized, and how it exits — the engine's
 * deterministic pipeline (§3) interprets it. The AI layer may scan, rank
 * and explain; it may never override a parameter, stop, size or gate
 * declared here.
 *
 * Status lifecycle (§14):
 *   DRAFT → BACKTEST_REQUIRED → (BACKTEST_PASS → WALK_FORWARD_PASS →
 *   OUT_OF_SAMPLE_PASS) → PAPER_TRADING → CANARY → APPROVED
 * Only status === "APPROVED" with an executable mapping is eligible for
 * autonomous trading. Any failure demotes back to BACKTEST_REQUIRED.
 * Runtime code can only DEMOTE (APPROVED → DISABLED). Promotion requires
 * validation evidence and a versioned code release — never a silent
 * in-place parameter change (§10/§11).
 */

export type StrategyStatus =
  | "DRAFT"
  | "BACKTEST_REQUIRED"
  | "PAPER_TRADING"
  | "CANARY"
  | "APPROVED"
  | "DISABLED";

export type StrategyDirection = "LONG" | "SHORT";
export type StrategyTimeframe = "INTRADAY" | "SWING" | "EVENT" | "POSITION";
export type AssetClass = "EQUITY" | "ETF" | "OPTIONS" | "FUTURES";
export type Regime = "TRENDING" | "MEAN_REVERTING" | "HIGH_VOL" | "LOW_VOL" | "ANY";

/** Which engine primitives can execute this strategy today. */
export interface ExecutableMapping {
  /** StrategyConfig id in api/engine/config.ts (governance-clamped at load) */
  configId: string;
  /** triggers used by the mapping (must exist in TRIGGERS) */
  triggers: string[];
  /** what is deliberately approximated vs. the full spec (auditable) */
  notes: string;
}

export interface UniverseRules {
  minPrice: number;          // §13 SCAN: price ≥ $5
  minDollarVolume: number;   // dollars per day
  maxSpreadPct: number;      // tight spread requirement
  session: "RTH" | "ETH" | "ANY";
}

export interface UniversalStrategy {
  strategy_id: string;            // "REQ-001"
  name: string;
  version: string;                // semver — trades record the version used (§11)
  status: StrategyStatus;
  asset_class: AssetClass;
  direction: StrategyDirection;
  timeframe: StrategyTimeframe;

  universe: UniverseRules;
  regime: { allowed: Regime[] };
  required_data: string[];        // e.g. ["1m_bars"] | ["daily_bars"] | ["options_chain"] | ["pairs_second_leg"]
  indicators: string[];

  scan_rules: string[];           // auditable text of each gate
  signal_rules: string[];
  confirmation_rules: string[];

  entry: string;
  position_sizing: { risk_pct: number; hard_cap_pct: number };
  initial_stop: string;
  profit_targets: { t1_r: number; t2_r: number } | null;
  /** How the position hands off to the trailing engine (module: trailing.ts owns every protective exit) */
  trailing_stop: string;
  time_exit: string | null;

  liquidity_rules: { min_score: number; vpin_max: number | null };
  portfolio_rules: { heat_max_pct: number; max_pair_correlation: number };
  event_rules: string[];
  no_trade_rules: string[];

  monitor_frequency: string;
  exit_rules: string[];           // priority order per §7 — protective/trailing exits always last
  validation: string[];           // what must be proven before promotion

  /** null = metadata-only (not activatable). Present + APPROVED = eligible. */
  executable: ExecutableMapping | null;
}

/** Global deterministic decisions the engine may return (§1). */
export type EngineDecision =
  | "EXECUTE"
  | "WAIT"
  | "REJECT"
  | "REDUCE_SIZE"
  | "EXIT"
  | "HALT";
