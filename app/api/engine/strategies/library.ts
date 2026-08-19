import type { AssetClass, Regime, StrategyDirection, StrategyStatus, StrategyTimeframe, UniversalStrategy } from "./types";

/**
 * STRATEGY LIBRARY — all 100 strategies of Strategy Specification v1.0
 * embedded as Universal Strategy Objects (§2). This file is the versioned
 * source of truth: every change is a code release with a version bump and
 * a new config hash (§10/§11) — the runtime never mutates parameters.
 *
 * First DevOps release (§13): REQ-001, REQ-002, REQ-003, REQ-004, REQ-024,
 * REQ-034, REQ-036, REQ-064, REQ-065, REQ-091.
 *
 * Activation honesty: only strategies whose executable mapping runs on
 * CURRENT engine primitives (SetupMachine + trigger library + ticket gate
 * + trailing engine) are status APPROVED. Everything else is DRAFT or
 * BACKTEST_REQUIRED with the exact blocker recorded in `validation` —
 * promotion requires the §14 evidence chain, never a status edit alone.
 */

export const FIRST_RELEASE_IDS = [
  "REQ-001", "REQ-002", "REQ-003", "REQ-004", "REQ-024",
  "REQ-034", "REQ-036", "REQ-064", "REQ-065", "REQ-091",
] as const;

/* ---------- §4 global risk defaults every strategy inherits ---------- */

const GLOBALS = {
  position_sizing: { risk_pct: 0.5, hard_cap_pct: 1.0 },
  liquidity_rules: { min_score: 0.5, vpin_max: 0.7 as number | null },
  portfolio_rules: { heat_max_pct: 10, max_pair_correlation: 0.7 },
};

const DEFAULT_UNIVERSE = { minPrice: 5, minDollarVolume: 20_000_000, maxSpreadPct: 0.1, session: "RTH" as const };

interface Def {
  name: string;
  status?: StrategyStatus;
  asset?: AssetClass;
  dir: StrategyDirection;
  tf: StrategyTimeframe;
  regime?: Regime[];
  data: string[];
  indicators?: string[];
  scan?: string[];
  signal: string[];
  confirm?: string[];
  entry: string;
  stop: string;
  targets?: { t1_r: number; t2_r: number } | null;
  trail?: string;
  timeExit?: string | null;
  noTrade?: string[];
  monitor?: string;
  exits?: string[];
  validation?: string[];
  executable?: UniversalStrategy["executable"];
}

function def(id: string, d: Def): UniversalStrategy {
  return {
    strategy_id: id,
    name: d.name,
    version: "1.0.0",
    status: d.status ?? "DRAFT",
    asset_class: d.asset ?? "EQUITY",
    direction: d.dir,
    timeframe: d.tf,
    universe: { ...DEFAULT_UNIVERSE },
    regime: { allowed: d.regime ?? ["ANY"] },
    required_data: d.data,
    indicators: d.indicators ?? [],
    scan_rules: d.scan ?? ["Price >= $5", "Dollar volume >= threshold", "Spread <= max", "Regular trading session"],
    signal_rules: d.signal,
    confirmation_rules: d.confirm ?? [],
    entry: d.entry,
    position_sizing: { ...GLOBALS.position_sizing },
    initial_stop: d.stop,
    profit_targets: d.targets === undefined ? { t1_r: 1.5, t2_r: 2.5 } : d.targets,
    trailing_stop: d.trail ?? "After T1: hand to trailing engine (tightening-only ATR trail, module trailing.ts owns the exit)",
    time_exit: d.timeExit === undefined ? "Close remaining intraday position by session cutoff" : d.timeExit,
    liquidity_rules: { ...GLOBALS.liquidity_rules },
    portfolio_rules: { ...GLOBALS.portfolio_rules },
    event_rules: ["Feed down -> HALT new entries", "Missing/stale data -> REJECT (never estimate with an LLM)"],
    no_trade_rules: d.noTrade ?? ["Low liquidity", "Excessive spread", "Unconfirmed signal", "Market regime conflict", "Extended entry"],
    monitor_frequency: d.monitor ?? "1-minute bars, every engine tick",
    exit_rules: d.exits ?? ["Kill switch", "Broker fault", "Max-loss", "Thesis invalidation", "Regime flip", "Protective stop", "Time stop", "Target", "Trailing exit (last)"],
    validation: d.validation ?? ["BACKTEST_PASS", "WALK_FORWARD_PASS", "OUT_OF_SAMPLE_PASS", "PAPER_TRADING soak", "CANARY"],
    executable: d.executable ?? null,
  };
}

/* ---------- FIRST RELEASE — full specification detail (§13) ---------- */

const FIRST_RELEASE: UniversalStrategy[] = [
  def("REQ-001", {
    name: "Opening Range Breakout Long",
    status: "APPROVED",
    dir: "LONG",
    tf: "INTRADAY",
    regime: ["TRENDING", "ANY"],
    data: ["1m_bars"],
    indicators: ["opening_range", "relative_volume", "atr"],
    scan: ["Price >= $5", "20D median dollar volume >= configured threshold", "Spread <= configured maximum", "Regular trading session"],
    signal: ["Price > OpeningRangeHigh"],
    confirm: ["RelativeVolume >= 1.5", "Close > OpeningRangeHigh", "MarketAlignment = BULLISH"],
    entry: "Buy-stop above confirmed opening-range breakout",
    stop: "MIN(OpeningRangeLow, StructureStop, ATRStop)",
    targets: { t1_r: 1.5, t2_r: 2.5 },
    trail: "Trail after T1 via trailing engine",
    timeExit: "Close remaining intraday position by session cutoff",
    executable: {
      configId: "req_001_orb_long",
      triggers: ["orb_breakout", "volume_climax"],
      notes: "Opening range = first 15 RTH minutes computed from session bars; rvol evidence from volume_climax signal; market alignment approximated by price-vs-VWAP at arm time.",
    },
  }),
  def("REQ-002", {
    name: "Opening Range Breakdown Short",
    status: "BACKTEST_REQUIRED",
    dir: "SHORT",
    tf: "INTRADAY",
    regime: ["TRENDING", "ANY"],
    data: ["1m_bars"],
    indicators: ["opening_range", "relative_volume", "atr"],
    signal: ["Price < OpeningRangeLow"],
    confirm: ["RelativeVolume >= 1.5", "Close < OpeningRangeLow", "MarketAlignment = BEARISH"],
    entry: "Sell-stop below confirmed opening-range breakdown",
    stop: "Above opening-range structure",
    validation: ["Requires short-selling execution path in tickets/portfolio layer", "Standard §14 evidence chain"],
  }),
  def("REQ-003", {
    name: "VWAP Reclaim Long",
    status: "APPROVED",
    dir: "LONG",
    tf: "INTRADAY",
    regime: ["ANY"],
    data: ["1m_bars"],
    indicators: ["vwap", "swing_low", "volume"],
    signal: ["PriorPrice < VWAP AND CrossUp(Price, VWAP)"],
    confirm: ["HigherLow = TRUE", "BarsAboveVWAP >= 2", "VolumeConfirmation = TRUE"],
    entry: "First confirmed hold/retest above VWAP",
    stop: "Below reclaim swing low",
    trail: "After T1: trail beneath confirmed higher lows OR ATR trail (trailing engine)",
    executable: {
      configId: "req_003_vwap_reclaim",
      triggers: ["vwap_reclaim", "volume_climax"],
      notes: "Reclaim+hold enforced by vwap_reclaim trigger (full-reset on close back below); swing-low stop resolved by SetupMachine; volume confirmation via volume_climax signal.",
    },
  }),
  def("REQ-004", {
    name: "VWAP Rejection Short",
    status: "BACKTEST_REQUIRED",
    dir: "SHORT",
    tf: "INTRADAY",
    regime: ["ANY"],
    data: ["1m_bars"],
    indicators: ["vwap", "relative_strength"],
    signal: ["Price tests VWAP AND Close < VWAP"],
    confirm: ["LowerHigh = TRUE", "WeakRelativeStrength = TRUE"],
    entry: "Sell on confirmed VWAP rejection",
    stop: "Above rejection swing high",
    validation: ["Requires short-selling execution path", "Standard §14 evidence chain"],
  }),
  def("REQ-024", {
    name: "Volume Profile VAH Breakout",
    status: "BACKTEST_REQUIRED",
    dir: "LONG",
    tf: "INTRADAY",
    regime: ["TRENDING"],
    data: ["1m_bars", "order_book", "options_gex"],
    indicators: ["volume_profile", "vah", "poc", "obi", "gex"],
    signal: ["Price > VAH + 0.5σ", "Volume >= 1.5 × AverageVolume20", "LiquidityScore > 0.60", "OBI > +0.40", "GEX regime supports breakout"],
    entry: "Buy on accepted VAH breakout",
    stop: "Below POC",
    targets: null,
    trail: "Target = Entry + 2 × ValueAreaWidth; trail via trailing engine after T1",
    validation: ["Volume-profile computable from 1m bars; OBI + GEX feeds not yet wired — data adapters required", "Standard §14 evidence chain"],
  }),
  def("REQ-034", {
    name: "20-Day Donchian Breakout Long",
    status: "BACKTEST_REQUIRED",
    dir: "LONG",
    tf: "SWING",
    regime: ["TRENDING"],
    data: ["daily_bars"],
    indicators: ["donchian_20", "atr"],
    signal: ["Price > MAX(High[t-20:t-1])"],
    entry: "Buy-stop above 20-day channel high",
    stop: "10-day opposite channel or ATR-derived stop",
    timeExit: null,
    monitor: "daily close + intraday breakout watch",
    validation: ["Needs multi-session channel context in SetupMachine (20 sessions of daily levels)", "Standard §14 evidence chain"],
  }),
  def("REQ-036", {
    name: "Turtle Trend Following Long",
    status: "BACKTEST_REQUIRED",
    dir: "LONG",
    tf: "POSITION",
    regime: ["TRENDING"],
    data: ["daily_bars"],
    indicators: ["donchian_20", "donchian_10", "atr20"],
    signal: ["Price > 20-Day High"],
    entry: "Buy-stop above 20-day high; regime must be trending",
    stop: "Exit when Price < 10-Day Low",
    targets: null,
    trail: "Channel-exit managed by trailing engine swing mode",
    timeExit: null,
    monitor: "daily",
    validation: ["Multi-session daily context + position-timeframe holding support required", "Standard §14 evidence chain"],
  }),
  def("REQ-064", {
    name: "PEAD Long",
    status: "BACKTEST_REQUIRED",
    dir: "LONG",
    tf: "EVENT",
    regime: ["ANY"],
    data: ["earnings_calendar", "estimates", "daily_bars"],
    indicators: ["sue", "announcement_reaction"],
    signal: ["SUE >= configured positive threshold", "Announcement-day reaction confirms"],
    entry: "Buy post-announcement drift confirmation",
    stop: "Below announcement-day low / ATR stop",
    timeExit: "Maximum horizon 30–60 days",
    monitor: "daily",
    validation: ["Earnings calendar + SUE data adapter required", "Standard §14 evidence chain"],
  }),
  def("REQ-065", {
    name: "PEAD Short",
    status: "BACKTEST_REQUIRED",
    dir: "SHORT",
    tf: "EVENT",
    regime: ["ANY"],
    data: ["earnings_calendar", "estimates", "daily_bars"],
    indicators: ["sue", "announcement_reaction"],
    signal: ["SUE <= negative threshold", "Announcement-day downside confirms"],
    entry: "Sell post-announcement downside drift",
    stop: "Above announcement-day high",
    timeExit: "Maximum horizon 30–60 days",
    monitor: "daily",
    validation: ["Short-selling execution path + earnings data adapter required", "Standard §14 evidence chain"],
  }),
  def("REQ-091", {
    name: "Pairs Mean Reversion",
    status: "BACKTEST_REQUIRED",
    dir: "LONG",
    tf: "SWING",
    regime: ["MEAN_REVERTING"],
    data: ["pairs_second_leg", "daily_bars"],
    indicators: ["spread_z", "cointegration"],
    signal: ["abs(SpreadZ) >= 2 (statistically validated relationship required)"],
    entry: "Enter both legs at SpreadZ extreme",
    stop: "abs(SpreadZ) >= 3 OR StructuralBreak = TRUE",
    targets: null,
    trail: "Target SpreadZ between -0.5 and +0.5",
    timeExit: null,
    monitor: "hourly/daily",
    validation: ["Two-leg simultaneous execution + cointegration validation harness required", "Standard §14 evidence chain"],
  }),
];

/* ---------- Compact builder for the remaining 90 ---------- */

function c(
  id: string, name: string, dir: StrategyDirection, tf: StrategyTimeframe,
  signal: string[], opts: Partial<Def> = {},
): UniversalStrategy {
  return def(id, { name, dir, tf, data: opts.data ?? ["1m_bars"], signal, entry: opts.entry ?? `${dir === "LONG" ? "Buy" : "Sell"} on confirmed signal per spec`, stop: opts.stop ?? "Structure/ATR stop per spec", ...opts });
}

const REMAINING: UniversalStrategy[] = [
  c("REQ-005", "Gap-and-Go Long", "LONG", "INTRADAY", ["Gap up >= threshold with catalyst", "Open holds above VWAP", "rvol expansion"], { confirm: ["First 15m hold", "MarketAlignment = BULLISH"] }),
  c("REQ-006", "Gap-and-Go Short", "SHORT", "INTRADAY", ["Inverse REQ-005: negative catalyst and downside confirmation"]),
  c("REQ-007", "Gap Fade Long", "LONG", "INTRADAY", ["Exhaustion gap down into support", "Reversal confirmation"]),
  c("REQ-008", "Gap Fade Short", "SHORT", "INTRADAY", ["Inverse REQ-007"]),
  c("REQ-009", "First Pullback Long", "LONG", "INTRADAY", ["Strong opening drive", "First orderly pullback holds VWAP/ORH"]),
  c("REQ-010", "First Bounce Short", "SHORT", "INTRADAY", ["Inverse REQ-009"]),
  c("REQ-011", "High-of-Day Breakout", "LONG", "INTRADAY", ["Close > session high with volume expansion", "chase <= limit"]),
  c("REQ-012", "Low-of-Day Breakdown", "SHORT", "INTRADAY", ["Inverse REQ-011"]),
  c("REQ-013", "Premarket High Breakout", "LONG", "INTRADAY", ["Close > premarket high", "RTH acceptance"], { data: ["1m_bars", "premarket_bars"] }),
  c("REQ-014", "Premarket Low Breakdown", "SHORT", "INTRADAY", ["Inverse REQ-013"], { data: ["1m_bars", "premarket_bars"] }),
  c("REQ-015", "Volume Expansion Breakout", "LONG", "INTRADAY", ["Volume >= N× 20-bar average at range break", "follow-through close"]),
  c("REQ-016", "Relative Strength Leader Long", "LONG", "INTRADAY", ["Symbol outperforming benchmark over window", "trend alignment"], { data: ["1m_bars", "benchmark_bars"] }),
  c("REQ-017", "Relative Weakness Leader Short", "SHORT", "INTRADAY", ["Inverse REQ-016"], { data: ["1m_bars", "benchmark_bars"] }),
  c("REQ-018", "Sector Leader Rotation", "LONG", "SWING", ["Sector relative-strength rotation into leader"], { data: ["daily_bars", "sector_bars"] }),
  c("REQ-019", "Sector Laggard Short Rotation", "SHORT", "SWING", ["Sector weakness rotation into laggard"], { data: ["daily_bars", "sector_bars"] }),
  c("REQ-020", "Intraday VWAP Mean Reversion Long", "LONG", "INTRADAY", ["Regime = MEAN_REVERTING", "Standardized extension below VWAP >= threshold"], { regime: ["MEAN_REVERTING"] }),
  c("REQ-021", "Intraday VWAP Mean Reversion Short", "SHORT", "INTRADAY", ["Inverse REQ-020"], { regime: ["MEAN_REVERTING"] }),
  c("REQ-022", "Anchored VWAP Reversion Long", "LONG", "SWING", ["Extension below event-anchored VWAP", "reversion trigger"], { data: ["1m_bars", "anchor_events"] }),
  c("REQ-023", "Anchored VWAP Reversion Short", "SHORT", "SWING", ["Inverse REQ-022"], { data: ["1m_bars", "anchor_events"] }),
  c("REQ-025", "Volume Profile VAL Breakdown", "SHORT", "INTRADAY", ["Inverse REQ-024"], { data: ["1m_bars", "order_book", "options_gex"] }),
  c("REQ-026", "POC Mean Reversion", "LONG", "INTRADAY", ["Regime = MEAN_REVERTING", "abs(Price - POC) standardized >= threshold"], { regime: ["MEAN_REVERTING"], data: ["1m_bars"], targets: null, trail: "Target = POC" }),
  c("REQ-027", "Low-Volume-Node Momentum", "LONG", "INTRADAY", ["Acceptance into LVN in direction of breakout"], { data: ["1m_bars"] }),
  c("REQ-028", "Liquidity Sweep Long", "LONG", "INTRADAY", ["Sweep of equal lows / stop pool", "reclaim confirmation"]),
  c("REQ-029", "Liquidity Sweep Short", "SHORT", "INTRADAY", ["Inverse REQ-028"]),
  c("REQ-030", "Fair Value Gap Long", "LONG", "INTRADAY", ["Bullish FVG fill-and-hold"]),
  c("REQ-031", "Fair Value Gap Short", "SHORT", "INTRADAY", ["Inverse REQ-030"]),
  c("REQ-032", "Order Book Imbalance Long", "LONG", "INTRADAY", ["OBI > threshold sustained", "price acceptance"], { data: ["1m_bars", "order_book"] }),
  c("REQ-033", "Order Book Imbalance Short", "SHORT", "INTRADAY", ["Inverse REQ-032"], { data: ["1m_bars", "order_book"] }),
  c("REQ-035", "20-Day Donchian Breakdown Short", "SHORT", "SWING", ["Inverse REQ-034"], { data: ["daily_bars"] }),
  c("REQ-037", "Turtle Trend Following Short", "SHORT", "POSITION", ["Inverse REQ-036"], { data: ["daily_bars"] }),
  c("REQ-038", "50-Day Moving-Average Pullback", "LONG", "SWING", ["Uptrend pullback to 50DMA holds", "reversal confirmation"], { data: ["daily_bars"] }),
  c("REQ-039", "200-Day Trend Recovery", "LONG", "POSITION", ["Reclaim of 200DMA after basing", "trend confirmation"], { data: ["daily_bars"] }),
  c("REQ-040", "KAMA Adaptive Trend Long", "LONG", "SWING", ["Price > KAMA", "KAMA slope positive"], { data: ["daily_bars"] }),
  c("REQ-041", "KAMA Adaptive Trend Short", "SHORT", "SWING", ["Inverse REQ-040"], { data: ["daily_bars"] }),
  c("REQ-042", "VIDYA Adaptive Trend Long", "LONG", "SWING", ["Price > VIDYA", "volatility-adjusted trend up"], { data: ["daily_bars"] }),
  c("REQ-043", "VIDYA Adaptive Trend Short", "SHORT", "SWING", ["Inverse REQ-042"], { data: ["daily_bars"] }),
  c("REQ-044", "Modern RSI Oversold Reversion", "LONG", "SWING", ["RSI regime-adaptive oversold", "reversion trigger"], { data: ["daily_bars"], regime: ["MEAN_REVERTING"] }),
  c("REQ-045", "Modern RSI Overbought Reversion", "SHORT", "SWING", ["Inverse REQ-044"], { data: ["daily_bars"], regime: ["MEAN_REVERTING"] }),
  c("REQ-046", "Modern MACD Trend Long", "LONG", "SWING", ["MACD signal cross with regime filter"], { data: ["daily_bars"] }),
  c("REQ-047", "Modern MACD Trend Short", "SHORT", "SWING", ["Inverse REQ-046"], { data: ["daily_bars"] }),
  c("REQ-048", "VWAP/GARCH Bollinger Reversion Long", "LONG", "INTRADAY", ["GARCH-scaled band touch", "reversion confirmation"], { regime: ["MEAN_REVERTING"] }),
  c("REQ-049", "VWAP/GARCH Bollinger Reversion Short", "SHORT", "INTRADAY", ["Inverse REQ-048"], { regime: ["MEAN_REVERTING"] }),
  c("REQ-050", "ATR-Normalized Stochastic Long", "LONG", "SWING", ["ATR-normalized stochastic oversold cross"], { data: ["daily_bars"] }),
  c("REQ-051", "ATR-Normalized Stochastic Short", "SHORT", "SWING", ["Inverse REQ-050"], { data: ["daily_bars"] }),
  c("REQ-052", "Momentum Top-Decile Long", "LONG", "POSITION", ["Universe momentum decile ranking", "top-decile entry with trend filter"], { data: ["daily_bars", "universe_history"] }),
  c("REQ-053", "Momentum Breakdown Short", "SHORT", "SWING", ["Momentum failure breakdown"], { data: ["daily_bars"] }),
  c("REQ-054", "Jegadeesh-Titman Momentum", "LONG", "POSITION", ["3–12 month formation momentum", "monthly rebalance"], { data: ["daily_bars", "universe_history"], monitor: "monthly" }),
  c("REQ-055", "Quality + Momentum", "LONG", "POSITION", ["Quality factor screen + momentum overlay"], { data: ["fundamentals", "daily_bars"] }),
  c("REQ-056", "Value + Momentum", "LONG", "POSITION", ["Value factor screen + momentum overlay"], { data: ["fundamentals", "daily_bars"] }),
  c("REQ-057", "Quality + Value + Momentum", "LONG", "POSITION", ["Three-factor composite screen"], { data: ["fundamentals", "daily_bars"] }),
  c("REQ-058", "Low-Volatility Factor", "LONG", "POSITION", ["Low-vol anomaly ranking", "defensive regime tilt"], { data: ["daily_bars", "universe_history"] }),
  c("REQ-059", "Multi-Factor Alpha", "LONG", "POSITION", ["Composite multi-factor score >= threshold"], { data: ["fundamentals", "daily_bars", "universe_history"] }),
  c("REQ-060", "Margin-of-Safety Value", "LONG", "POSITION", ["Price < intrinsic estimate by margin-of-safety threshold"], { data: ["fundamentals", "daily_bars"] }),
  c("REQ-061", "Free-Cash-Flow Inflection", "LONG", "POSITION", ["FCF inflection positive", "valuation support"], { data: ["fundamentals", "daily_bars"] }),
  c("REQ-062", "Revenue Acceleration", "LONG", "POSITION", ["Sequential revenue acceleration", "estimate support"], { data: ["fundamentals", "estimates", "daily_bars"] }),
  c("REQ-063", "Margin Expansion", "LONG", "POSITION", ["Gross/operating margin expansion trend"], { data: ["fundamentals", "daily_bars"] }),
  c("REQ-066", "Earnings Gap Continuation Long", "LONG", "EVENT", ["Positive earnings repricing", "Gap remains accepted", "Forward revisions positive"], { data: ["earnings_calendar", "estimates", "1m_bars"] }),
  c("REQ-067", "Earnings Gap Continuation Short", "SHORT", "EVENT", ["Inverse REQ-066"], { data: ["earnings_calendar", "estimates", "1m_bars"] }),
  c("REQ-068", "Earnings Gap Fade Long", "LONG", "EVENT", ["Overextended down-gap post-earnings", "fade confirmation"], { data: ["earnings_calendar", "1m_bars"] }),
  c("REQ-069", "Earnings Gap Fade Short", "SHORT", "EVENT", ["Inverse REQ-068"], { data: ["earnings_calendar", "1m_bars"] }),
  c("REQ-070", "Estimate Revision Momentum Long", "LONG", "SWING", ["Positive revision breadth/magnitude trend"], { data: ["estimates", "daily_bars"] }),
  c("REQ-071", "Estimate Revision Short", "SHORT", "SWING", ["Inverse REQ-070"], { data: ["estimates", "daily_bars"] }),
  c("REQ-072", "Guidance Raise Long", "LONG", "EVENT", ["Guidance raise event", "acceptance confirmation"], { data: ["earnings_calendar", "news", "daily_bars"] }),
  c("REQ-073", "Guidance Cut Short", "SHORT", "EVENT", ["Inverse REQ-072"], { data: ["earnings_calendar", "news", "daily_bars"] }),
  c("REQ-074", "Earnings Straddle: Underpriced Move", "LONG", "EVENT", ["Implied move < model expected move", "long straddle into event"], { asset: "OPTIONS", data: ["options_chain", "earnings_calendar"] }),
  c("REQ-075", "Earnings IV-Crush Defined-Risk", "SHORT", "EVENT", ["Post-event IV crush harvest with defined-risk structure"], { asset: "OPTIONS", data: ["options_chain", "earnings_calendar"] }),
  c("REQ-076", "Long Put Breakdown", "LONG", "SWING", ["Technical breakdown + put purchase", "negative catalyst"], { asset: "OPTIONS", data: ["options_chain", "daily_bars"] }),
  c("REQ-077", "Put Debit Spread", "LONG", "SWING", ["Bearish defined-risk debit structure"], { asset: "OPTIONS", data: ["options_chain", "daily_bars"] }),
  c("REQ-078", "Call Debit Spread", "LONG", "SWING", ["Bullish defined-risk debit structure"], { asset: "OPTIONS", data: ["options_chain", "daily_bars"] }),
  c("REQ-079", "Bull Put Spread", "SHORT", "SWING", ["Credit structure at support", "IV rank filter"], { asset: "OPTIONS", data: ["options_chain", "daily_bars"] }),
  c("REQ-080", "Bear Call Spread", "SHORT", "SWING", ["Credit structure at resistance", "IV rank filter"], { asset: "OPTIONS", data: ["options_chain", "daily_bars"] }),
  c("REQ-081", "Long Straddle", "LONG", "EVENT", ["Volatility expansion expectation", "event catalyst"], { asset: "OPTIONS", data: ["options_chain", "earnings_calendar"] }),
  c("REQ-082", "Long Strangle", "LONG", "EVENT", ["Cheaper wing variant of REQ-081"], { asset: "OPTIONS", data: ["options_chain", "earnings_calendar"] }),
  c("REQ-083", "Calendar Spread", "LONG", "SWING", ["Term-structure dislocation", "theta/vega profile within limits"], { asset: "OPTIONS", data: ["options_chain"] }),
  c("REQ-084", "Variance Risk Premium Harvest", "SHORT", "POSITION", ["Implied variance > realized forecast by threshold", "defined-risk harvest"], { asset: "OPTIONS", data: ["options_chain", "daily_bars"] }),
  c("REQ-085", "Gamma Flip Trend", "LONG", "INTRADAY", ["Price across gamma flip level", "dealer-hedging regime supports trend"], { data: ["1m_bars", "options_gex"] }),
  c("REQ-086", "Positive-Gamma Mean Reversion", "LONG", "INTRADAY", ["Positive-GEX regime fade extremes"], { data: ["1m_bars", "options_gex"], regime: ["MEAN_REVERTING"] }),
  c("REQ-087", "Negative-Gamma Momentum", "LONG", "INTRADAY", ["Negative-GEX regime momentum continuation"], { data: ["1m_bars", "options_gex"], regime: ["TRENDING", "HIGH_VOL"] }),
  c("REQ-088", "0DTE Gamma Pinning", "LONG", "INTRADAY", ["Pin magnet at large 0DTE strike", "decay harvest structure"], { asset: "OPTIONS", data: ["options_chain", "options_gex"] }),
  c("REQ-089", "0DTE Gamma Acceleration", "LONG", "INTRADAY", ["Break of pin level accelerates via dealer hedging"], { asset: "OPTIONS", data: ["options_chain", "options_gex"] }),
  c("REQ-090", "ETF/NAV Statistical Arbitrage", "LONG", "INTRADAY", ["ETF price vs NAV dislocation >= threshold"], { asset: "ETF", data: ["1m_bars", "nav_feed"] }),
  c("REQ-092", "Institutional Accumulation Composite", "LONG", "POSITION", ["Composite accumulation score >= threshold (13F, dark-pool, insider inputs)"], { data: ["13f_filings", "dark_pool", "daily_bars"] }),
  c("REQ-093", "Insider Purchase Cluster Long", "LONG", "POSITION", ["Cluster of open-market insider purchases", "confirmation window"], { data: ["insider_filings", "daily_bars"] }),
  c("REQ-094", "Alternative-Data Composite", "LONG", "POSITION", ["Alt-data composite score >= threshold"], { data: ["alt_data", "daily_bars"] }),
  c("REQ-095", "News Sentiment Momentum", "LONG", "EVENT", ["Sentiment shock with persistence confirmation"], { data: ["news", "1m_bars"] }),
  c("REQ-096", "Earnings Call NLP Divergence", "LONG", "EVENT", ["Call-tone vs estimate divergence signal"], { data: ["transcripts", "estimates", "daily_bars"] }),
  c("REQ-097", "SEC Filing Risk Signal", "SHORT", "POSITION", ["Filing risk-factor deterioration signal"], { data: ["sec_filings", "daily_bars"] }),
  c("REQ-098", "CFTC COT Contrarian", "LONG", "POSITION", ["Positioning extreme contrarian signal"], { asset: "FUTURES", data: ["cot_reports", "daily_bars"] }),
  c("REQ-099", "Buyback Support", "LONG", "POSITION", ["Active buyback + support confluence"], { data: ["fundamentals", "daily_bars"] }),
  c("REQ-100", "Smart Money Flow Confirmation", "LONG", "SWING", ["Flow composite confirms directional thesis"], { data: ["order_flow", "daily_bars"] }),
];

/** The complete 100-strategy library, REQ-001 … REQ-100, spec order. */
export const STRATEGY_LIBRARY: UniversalStrategy[] = (() => {
  const all = [...FIRST_RELEASE, ...REMAINING];
  all.sort((a, b) => a.strategy_id.localeCompare(b.strategy_id));
  return all;
})();
