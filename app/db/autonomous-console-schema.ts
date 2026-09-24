import { pgSchema, serial, varchar, text, timestamp, integer, boolean, numeric, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';

/** Autonomous console tables in Postgres schema `ac` (avoids public.* collisions). */
export const ac = pgSchema('ac');


// ============================================================
// ENUMS
// ============================================================

export const engineModeEnum = ac.enum('engine_mode', ['SHADOW', 'PAPER', 'LIVE']) ;
export const engineStatusEnum = ac.enum('engine_status', ['ARMED', 'DISARMED', 'ERROR']) ;
export const eventStateEnum = ac.enum('event_state', [
  'DETECTED', 'RESEARCHING', 'ANALYZING', 'QUALIFIED', 'ORDER_READY',
  'ORDER_SUBMITTED', 'PARTIAL_FILL', 'FILLED', 'HOLDING', 'EXITING', 'CLOSED', 'NO_ACTION'
]) ;
export const orderSideEnum = ac.enum('order_side', ['BUY', 'SELL']) ;
export const orderTypeEnum = ac.enum('order_type', ['LIMIT', 'MARKET', 'STOP', 'STOP_LIMIT']) ;
export const orderStatusEnum = ac.enum('order_status', [
  'OPEN', 'SUBMITTED', 'PARTIAL', 'FILLED', 'CANCELED', 'REJECTED', 'EXPIRED'
]) ;
export const riskStatusEnum = ac.enum('risk_status', ['PENDING', 'RISK_APPROVED', 'REJECTED', 'OVERRIDDEN']) ;
export const protectionStateEnum = ac.enum('protection_state', [
  'NO_PROTECTION', 'BREAKEVEN', 'TRAILING_STOP', 'HARD_STOP', 'PROFIT_TARGET', 'TIME_EXIT'
]) ;
export const dataFeedStatusEnum = ac.enum('data_feed_status', ['CONNECTED', 'DEGRADED', 'DISCONNECTED', 'ERROR']) ;
export const dataFeedHealthEnum = ac.enum('data_feed_health', ['HEALTHY', 'DEGRADED', 'CRITICAL']) ;
export const auditLevelEnum = ac.enum('audit_level', ['INFO', 'SUCCESS', 'WARNING', 'ERROR', 'CRITICAL', 'START', 'PAUSE', 'KILL']) ;
export const decisionStateEnum = ac.enum('decision_state', [
  'EVENT_DETECTED', 'RESEARCH_COMPLETE', 'FIS_QUALIFIED', 'FIS_DISQUALIFIED', 'PRE_EVENT_POSITION_OK',
  'RCS_QUALIFIED', 'RCS_DISQUALIFIED', 'EVENT_POSITION_OK', 'ORDER_READY', 'REACTION_CONFIRMED',
  'NO_ACTION', 'WAITING', 'ORDER_SUBMITTED', 'ORDER_FILLED', 'ORDER_PARTIAL', 'ORDER_REJECTED',
  'POSITION_OPEN', 'POSITION_HOLDING', 'POSITION_EXITING', 'POSITION_CLOSED'
]) ;
export const strategyEnum = ac.enum('strategy_type', [
  'Post-Earnings Momentum', 'Gap Continuation', 'Fade the Move', 'Contrarian Reversal'
]) ;
export const integrationStatusEnum = ac.enum('integration_status', ['HEALTHY', 'DEGRADED', 'DOWN', 'UNKNOWN']) ;
export const circuitStateEnum = ac.enum('circuit_state', ['CLOSED', 'OPEN', 'HALF_OPEN']) ;

// ============================================================
// 1. ENGINE STATE & CONFIGURATION
// ============================================================

export const engineState = ac.table('engine_state', {
  id: serial('id').primaryKey(),
  version: varchar('version', { length: 32 }).notNull().default('3.2.1'),
  mode: engineModeEnum('mode').notNull().default('PAPER'),
  status: engineStatusEnum('status').notNull().default('ARMED'),
  killSwitchArmed: boolean('kill_switch_armed').notNull().default(true),
  lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true }).defaultNow(),
  cycleCount: integer('cycle_count').notNull().default(0),
  totalEvents: integer('total_events').notNull().default(0),
  totalOrders: integer('total_orders').notNull().default(0),
  totalPositions: integer('total_positions').notNull().default(0),
  uptimeSeconds: integer('uptime_seconds').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('engine_state_status_idx').on(table.status),
]) ;

export const engineConfig = ac.table('engine_config', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 128 }).notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
  category: varchar('category', { length: 64 }).notNull(),
  isSecret: boolean('is_secret').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: varchar('updated_by', { length: 255 }),
}, (table) => [
  index('engine_config_key_idx').on(table.key),
  index('engine_config_category_idx').on(table.category),
]) ;

// ============================================================
// 2. PIPELINE STAGES
// ============================================================

export const pipelineStages = ac.table('pipeline_stages', {
  id: serial('id').primaryKey(),
  stageId: varchar('stage_id', { length: 8 }).notNull().unique(),
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description').notNull(),
  sequenceOrder: integer('sequence_order').notNull(),
  slaMicroseconds: integer('sla_microseconds').notNull(),
  isCritical: boolean('is_critical').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}) ;

export const pipelineExecutions = ac.table('pipeline_executions', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull(),
  stageId: varchar('stage_id', { length: 8 }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }),
  latencyMicroseconds: integer('latency_microseconds'),
  dataVersion: varchar('data_version', { length: 32 }),
  sourceStatus: varchar('source_status', { length: 64 }),
  passFail: varchar('pass_fail', { length: 16 }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('pipeline_exec_event_idx').on(table.eventId),
  index('pipeline_exec_stage_idx').on(table.stageId),
  index('pipeline_exec_status_idx').on(table.status),
]) ;

// ============================================================
// 3. EARNINGS EVENTS
// ============================================================

export const earningsEvents = ac.table('earnings_events', {
  id: serial('id').primaryKey(),
  ticker: varchar('ticker', { length: 16 }).notNull(),
  companyName: varchar('company_name', { length: 255 }),
  earningsDate: timestamp('earnings_date', { withTimezone: true }).notNull(),
  earningsTime: varchar('earnings_time', { length: 16 }),
  expectedEps: numeric('expected_eps', { precision: 12, scale: 4 }),
  actualEps: numeric('actual_eps', { precision: 12, scale: 4 }),
  expectedRevenue: numeric('expected_revenue', { precision: 18, scale: 2 }),
  actualRevenue: numeric('actual_revenue', { precision: 18, scale: 2 }),
  surpriseType: varchar('surprise_type', { length: 16 }),
  beatProbability: integer('beat_probability'),
  rpers: integer('rpers'),
  impliedMove: numeric('implied_move', { precision: 8, scale: 4 }),
  pre5dReturn: numeric('pre5d_return', { precision: 8, scale: 4 }),
  pre10dReturn: numeric('pre10d_return', { precision: 8, scale: 4 }),
  pre20dReturn: numeric('pre20d_return', { precision: 8, scale: 4 }),
  decisionState: decisionStateEnum('decision_state').notNull().default('EVENT_DETECTED'),
  riskStatus: riskStatusEnum('risk_status').notNull().default('PENDING'),
  authorizedQty: integer('authorized_qty'),
  eventVwap: numeric('event_vwap', { precision: 12, scale: 4 }),
  priceReaction: varchar('price_reaction', { length: 16 }),
  volumeVelocity: varchar('volume_velocity', { length: 32 }),
  spread: varchar('spread', { length: 16 }),
  fis: numeric('fis', { precision: 8, scale: 4 }),
  rcs: numeric('rcs', { precision: 8, scale: 4 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('events_ticker_idx').on(table.ticker),
  index('events_date_idx').on(table.earningsDate),
  index('events_state_idx').on(table.decisionState),
  uniqueIndex('events_ticker_date_idx').on(table.ticker, table.earningsDate),
]) ;

// ============================================================
// 4. ORDERS
// ============================================================

export const orders = ac.table('orders', {
  id: serial('id').primaryKey(),
  orderId: varchar('order_id', { length: 32 }).notNull().unique(),
  eventId: integer('event_id').references(() => earningsEvents.id),
  ticker: varchar('ticker', { length: 16 }).notNull(),
  side: orderSideEnum('side').notNull(),
  type: orderTypeEnum('type').notNull(),
  qty: integer('qty').notNull(),
  limitPrice: numeric('limit_price', { precision: 12, scale: 4 }),
  stopPrice: numeric('stop_price', { precision: 12, scale: 4 }),
  submittedPrice: numeric('submitted_price', { precision: 12, scale: 4 }),
  avgFillPrice: numeric('avg_fill_price', { precision: 12, scale: 4 }),
  filledQty: integer('filled_qty').notNull().default(0),
  remainingQty: integer('remaining_qty').notNull(),
  status: orderStatusEnum('status').notNull().default('OPEN'),
  broker: varchar('broker', { length: 64 }).notNull().default('IBKR'),
  strategy: strategyEnum('strategy').notNull(),
  latencyAck: integer('latency_ack'),
  latencyFill: integer('latency_fill'),
  slippageBps: integer('slippage_bps'),
  rejectReason: text('reject_reason'),
  parentOrderId: varchar('parent_order_id', { length: 32 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('orders_ticker_idx').on(table.ticker),
  index('orders_status_idx').on(table.status),
  index('orders_event_idx').on(table.eventId),
  index('orders_created_idx').on(table.createdAt),
]) ;

// ============================================================
// 5. POSITIONS
// ============================================================

export const positions = ac.table('positions', {
  id: serial('id').primaryKey(),
  ticker: varchar('ticker', { length: 16 }).notNull(),
  orderId: varchar('order_id', { length: 32 }).notNull(),
  eventId: integer('event_id').references(() => earningsEvents.id),
  strategy: strategyEnum('strategy').notNull(),
  qty: integer('qty').notNull(),
  avgFillPrice: numeric('avg_fill_price', { precision: 12, scale: 4 }).notNull(),
  currentPrice: numeric('current_price', { precision: 12, scale: 4 }).notNull(),
  marketValue: numeric('market_value', { precision: 18, scale: 2 }).notNull(),
  unrealizedPnl: numeric('unrealized_pnl', { precision: 18, scale: 2 }).notNull().default('0'),
  unrealizedPct: numeric('unrealized_pct', { precision: 8, scale: 4 }).notNull().default('0'),
  realizedPnl: numeric('realized_pnl', { precision: 18, scale: 2 }).notNull().default('0'),
  highWaterPrice: numeric('high_water_price', { precision: 12, scale: 4 }),
  maxProfit: numeric('max_profit', { precision: 18, scale: 2 }).notNull().default('0'),
  maxDrawdown: numeric('max_drawdown', { precision: 18, scale: 2 }).notNull().default('0'),
  protectionState: protectionStateEnum('protection_state').notNull().default('NO_PROTECTION'),
  apmaState: varchar('apma_state', { length: 64 }),
  authorizedQty: integer('authorized_qty'),
  entryTime: timestamp('entry_time', { withTimezone: true }).notNull(),
  exitTime: timestamp('exit_time', { withTimezone: true }),
  isOpen: boolean('is_open').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('positions_ticker_idx').on(table.ticker),
  index('positions_open_idx').on(table.isOpen),
  index('positions_event_idx').on(table.eventId),
  uniqueIndex('positions_order_idx').on(table.orderId),
]) ;

// ============================================================
// 6. RISK CONFIGURATION
// ============================================================

export const riskConfig = ac.table('risk_config', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 128 }).notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
  category: varchar('category', { length: 64 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('risk_config_key_idx').on(table.key),
]) ;

export const riskExposure = ac.table('risk_exposure', {
  id: serial('id').primaryKey(),
  date: timestamp('date', { withTimezone: true }).notNull(),
  currentEquity: numeric('current_equity', { precision: 18, scale: 2 }).notNull(),
  maxDailyLoss: numeric('max_daily_loss', { precision: 18, scale: 2 }).notNull(),
  remainingDailyRisk: numeric('remaining_daily_risk', { precision: 18, scale: 2 }).notNull(),
  maxEventRisk: numeric('max_event_risk', { precision: 18, scale: 2 }).notNull(),
  currentEventExposure: numeric('current_event_exposure', { precision: 18, scale: 2 }).notNull().default('0'),
  singleNameExposure: numeric('single_name_exposure', { precision: 18, scale: 2 }).notNull().default('0'),
  sectorExposure: numeric('sector_exposure', { precision: 18, scale: 2 }).notNull().default('0'),
  correlatedExposure: numeric('correlated_exposure', { precision: 18, scale: 2 }).notNull().default('0'),
  grossExposure: numeric('gross_exposure', { precision: 18, scale: 2 }).notNull().default('0'),
  netExposure: numeric('net_exposure', { precision: 18, scale: 2 }).notNull().default('0'),
  openOrdersExposure: numeric('open_orders_exposure', { precision: 18, scale: 2 }).notNull().default('0'),
  gapExposure: numeric('gap_exposure', { precision: 18, scale: 2 }).notNull().default('0'),
  authorizedQty: integer('authorized_qty').notNull().default(0),
  currentQty: integer('current_qty').notNull().default(0),
  remainingAuthority: integer('remaining_authority').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('risk_exposure_date_idx').on(table.date),
]) ;

// ============================================================
// 7. LATENCY
// ============================================================

export const latencyPoints = ac.table('latency_points', {
  id: serial('id').primaryKey(),
  pointId: varchar('point_id', { length: 8 }).notNull().unique(),
  label: varchar('label', { length: 128 }).notNull(),
  description: text('description').notNull(),
  category: varchar('category', { length: 32 }).notNull(),
  sequenceOrder: integer('sequence_order').notNull(),
  isInternal: boolean('is_internal').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}) ;

export const latencyMeasurements = ac.table('latency_measurements', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull(),
  pointId: varchar('point_id', { length: 8 }).notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  latencyMicroseconds: integer('latency_microseconds'),
  type: varchar('type', { length: 16 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('latency_event_idx').on(table.eventId),
  index('latency_point_idx').on(table.pointId),
]) ;

// ============================================================
// 8. DATA FEEDS
// ============================================================

export const dataFeeds = ac.table('data_feeds', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  source: varchar('source', { length: 128 }).notNull(),
  category: varchar('category', { length: 32 }).notNull(),
  type: varchar('type', { length: 64 }).notNull(),
  status: dataFeedStatusEnum('status').notNull().default('CONNECTED'),
  health: dataFeedHealthEnum('health').notNull().default('HEALTHY'),
  frequency: varchar('frequency', { length: 32 }),
  latency: varchar('latency', { length: 32 }),
  lastMessage: timestamp('last_message', { withTimezone: true }),
  errorRate: varchar('error_rate', { length: 16 }).notNull().default('0.00%'),
  config: jsonb('config'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('feeds_name_idx').on(table.name),
  index('feeds_category_idx').on(table.category),
  index('feeds_status_idx').on(table.status),
  uniqueIndex('feeds_name_source_idx').on(table.name, table.source),
]) ;

// ============================================================
// 9. AUDIT & REPLAY
// ============================================================

export const auditEvents = ac.table('audit_events', {
  id: serial('id').primaryKey(),
  eventId: varchar('event_id', { length: 64 }).notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  level: auditLevelEnum('level').notNull(),
  source: varchar('source', { length: 128 }).notNull(),
  type: varchar('type', { length: 64 }).notNull(),
  message: text('message').notNull(),
  data: jsonb('data'),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('audit_timestamp_idx').on(table.timestamp),
  index('audit_level_idx').on(table.level),
  index('audit_source_idx').on(table.source),
  index('audit_event_id_idx').on(table.eventId),
]) ;

export const eventSnapshots = ac.table('event_snapshots', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull(),
  snapshotType: varchar('snapshot_type', { length: 32 }).notNull(),
  snapshotData: jsonb('snapshot_data').notNull(),
  frozenProfileVersion: varchar('frozen_profile_version', { length: 32 }),
  strategyContract: varchar('strategy_contract', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('snapshot_event_idx').on(table.eventId),
  index('snapshot_type_idx').on(table.snapshotType),
]) ;

// ============================================================
// 10. RESEARCH / PRE-EVENT METRICS
// ============================================================

export const preEventMetrics = ac.table('pre_event_metrics', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull().references(() => earningsEvents.id),
  beatProbability: integer('beat_probability'),
  rpers: integer('rpers'),
  expectationBurden: varchar('expectation_burden', { length: 32 }),
  historicalPositiveGapRate: integer('historical_positive_gap_rate'),
  beatButSellRate: integer('beat_but_sell_rate'),
  impliedMove: numeric('implied_move', { precision: 8, scale: 4 }),
  pre5d: numeric('pre5d', { precision: 8, scale: 4 }),
  pre10d: numeric('pre10d', { precision: 8, scale: 4 }),
  pre20d: numeric('pre20d', { precision: 8, scale: 4 }),
  valuationState: varchar('valuation_state', { length: 32 }),
  peerRegime: varchar('peer_regime', { length: 32 }),
  sectorRegime: varchar('sector_regime', { length: 32 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('pre_event_event_idx').on(table.eventId),
]) ;

// ============================================================
// 11. FIS / RCS SCORES
// ============================================================

export const fisBreakdown = ac.table('fis_breakdown', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull().references(() => earningsEvents.id),
  epsSurprise: numeric('eps_surprise', { precision: 8, scale: 4 }),
  revenueSurprise: numeric('revenue_surprise', { precision: 8, scale: 4 }),
  guidanceSurprise: numeric('guidance_surprise', { precision: 8, scale: 4 }),
  kpiSurprise: numeric('kpi_surprise', { precision: 8, scale: 4 }),
  surpriseAcceleration: numeric('surprise_acceleration', { precision: 8, scale: 4 }),
  expectationBurden: varchar('expectation_burden', { length: 32 }),
  fisTotal: numeric('fis_total', { precision: 8, scale: 4 }),
  threshold: numeric('threshold', { precision: 8, scale: 4 }).notNull().default('2.0'),
  isQualified: boolean('is_qualified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('fis_event_idx').on(table.eventId),
]) ;

export const reactionMetrics = ac.table('reaction_metrics', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull().references(() => earningsEvents.id),
  priceChange: numeric('price_change', { precision: 8, scale: 4 }),
  priceVelocity: numeric('price_velocity', { precision: 12, scale: 6 }),
  priceAcceleration: numeric('price_acceleration', { precision: 12, scale: 6 }),
  volumePerSec: integer('volume_per_sec'),
  dollarVolumePerSec: numeric('dollar_volume_per_sec', { precision: 18, scale: 2 }),
  relativeVolumeVelocity: numeric('relative_volume_velocity', { precision: 8, scale: 4 }),
  tradeCountPerSec: integer('trade_count_per_sec'),
  buySellImbalance: numeric('buy_sell_imbalance', { precision: 8, scale: 4 }),
  bidAskImbalance: numeric('bid_ask_imbalance', { precision: 8, scale: 4 }),
  spread: numeric('spread', { precision: 12, scale: 4 }),
  spreadExpansion: numeric('spread_expansion', { precision: 8, scale: 4 }),
  eventVwap: numeric('event_vwap', { precision: 12, scale: 4 }),
  distanceFromVwap: numeric('distance_from_vwap', { precision: 8, scale: 4 }),
  highWaterMark: numeric('high_water_mark', { precision: 12, scale: 4 }),
  drawdownFromHwm: numeric('drawdown_from_hwm', { precision: 8, scale: 4 }),
  largePrintFrequency: integer('large_print_frequency'),
  depthImbalance: numeric('depth_imbalance', { precision: 8, scale: 4 }),
  rcs: numeric('rcs', { precision: 8, scale: 4 }),
  status: varchar('status', { length: 32 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('rcs_event_idx').on(table.eventId),
]) ;

// ============================================================
// 12. FINANCIALS
// ============================================================

export const accountSummary = ac.table('account_summary', {
  id: serial('id').primaryKey(),
  date: timestamp('date', { withTimezone: true }).notNull(),
  startingEquity: numeric('starting_equity', { precision: 18, scale: 2 }).notNull(),
  currentEquity: numeric('current_equity', { precision: 18, scale: 2 }).notNull(),
  cash: numeric('cash', { precision: 18, scale: 2 }).notNull(),
  buyingPower: numeric('buying_power', { precision: 18, scale: 2 }).notNull(),
  grossExposure: numeric('gross_exposure', { precision: 18, scale: 2 }).notNull(),
  netExposure: numeric('net_exposure', { precision: 18, scale: 2 }).notNull(),
  realizedPnl: numeric('realized_pnl', { precision: 18, scale: 2 }).notNull().default('0'),
  unrealizedPnl: numeric('unrealized_pnl', { precision: 18, scale: 2 }).notNull().default('0'),
  totalPnl: numeric('total_pnl', { precision: 18, scale: 2 }).notNull().default('0'),
  dailyReturnPct: numeric('daily_return_pct', { precision: 8, scale: 4 }),
  weeklyReturnPct: numeric('weekly_return_pct', { precision: 8, scale: 4 }),
  monthlyReturnPct: numeric('monthly_return_pct', { precision: 8, scale: 4 }),
  ytdReturnPct: numeric('ytd_return_pct', { precision: 8, scale: 4 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('account_date_idx').on(table.date),
]) ;

export const orderFinancials = ac.table('order_financials', {
  id: serial('id').primaryKey(),
  orderId: varchar('order_id', { length: 32 }).notNull().unique(),
  ticker: varchar('ticker', { length: 16 }).notNull(),
  strategy: strategyEnum('strategy').notNull(),
  eventId: integer('event_id'),
  entryTime: timestamp('entry_time', { withTimezone: true }),
  exitTime: timestamp('exit_time', { withTimezone: true }),
  entryPrice: numeric('entry_price', { precision: 12, scale: 4 }),
  exitPrice: numeric('exit_price', { precision: 12, scale: 4 }),
  qty: integer('qty').notNull(),
  grossPnl: numeric('gross_pnl', { precision: 18, scale: 2 }),
  fees: numeric('fees', { precision: 18, scale: 2 }).notNull().default('0'),
  slippage: numeric('slippage', { precision: 18, scale: 2 }).notNull().default('0'),
  netPnl: numeric('net_pnl', { precision: 18, scale: 2 }),
  returnPct: numeric('return_pct', { precision: 8, scale: 4 }),
  mfe: numeric('mfe', { precision: 18, scale: 2 }),
  mae: numeric('mae', { precision: 18, scale: 2 }),
  holdPeriod: varchar('hold_period', { length: 32 }),
  outcome: varchar('outcome', { length: 16 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('fin_order_id_idx').on(table.orderId),
  index('fin_ticker_idx').on(table.ticker),
]) ;

export const winsPerOrder = ac.table('wins_per_order', {
  id: serial('id').primaryKey(),
  period: varchar('period', { length: 32 }).notNull(),
  totalOrders: integer('total_orders').notNull().default(0),
  winningOrders: integer('winning_orders').notNull().default(0),
  losingOrders: integer('losing_orders').notNull().default(0),
  winRate: numeric('win_rate', { precision: 6, scale: 2 }),
  averageWin: numeric('average_win', { precision: 18, scale: 2 }),
  averageLoss: numeric('average_loss', { precision: 18, scale: 2 }),
  largestWin: numeric('largest_win', { precision: 18, scale: 2 }),
  largestLoss: numeric('largest_loss', { precision: 18, scale: 2 }),
  medianWin: numeric('median_win', { precision: 18, scale: 2 }),
  medianLoss: numeric('median_loss', { precision: 18, scale: 2 }),
  winLossRatio: numeric('win_loss_ratio', { precision: 8, scale: 4 }),
  profitFactor: numeric('profit_factor', { precision: 8, scale: 4 }),
  expectancyPerOrder: numeric('expectancy_per_order', { precision: 18, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('wpo_period_idx').on(table.period),
]) ;

export const earningsBreakdown = ac.table('earnings_breakdown', {
  id: serial('id').primaryKey(),
  period: varchar('period', { length: 32 }).notNull(),
  totalTrades: integer('total_trades').notNull().default(0),
  positiveReaction: integer('positive_reaction').notNull().default(0),
  negativeReaction: integer('negative_reaction').notNull().default(0),
  correctPredictions: integer('correct_predictions').notNull().default(0),
  incorrectPredictions: integer('incorrect_predictions').notNull().default(0),
  reactionAccuracy: numeric('reaction_accuracy', { precision: 6, scale: 2 }),
  gapAccuracy: numeric('gap_accuracy', { precision: 6, scale: 2 }),
  avgGapCaptured: numeric('avg_gap_captured', { precision: 8, scale: 4 }),
  avgProfitPerEvent: numeric('avg_profit_per_event', { precision: 18, scale: 2 }),
  avgLossPerEvent: numeric('avg_loss_per_event', { precision: 18, scale: 2 }),
  beatPositive: integer('beat_positive').notNull().default(0),
  beatNegative: integer('beat_negative').notNull().default(0),
  missPositive: integer('miss_positive').notNull().default(0),
  missNegative: integer('miss_negative').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('eb_period_idx').on(table.period),
]) ;

export const strategyPerformance = ac.table('strategy_performance', {
  id: serial('id').primaryKey(),
  period: varchar('period', { length: 32 }).notNull(),
  strategy: strategyEnum('strategy').notNull(),
  trades: integer('trades').notNull().default(0),
  winRate: numeric('win_rate', { precision: 6, scale: 2 }),
  avgReturn: numeric('avg_return', { precision: 8, scale: 4 }),
  netPnl: numeric('net_pnl', { precision: 18, scale: 2 }),
  profitFactor: numeric('profit_factor', { precision: 8, scale: 4 }),
  mdd: numeric('mdd', { precision: 8, scale: 4 }),
  sharpe: numeric('sharpe', { precision: 8, scale: 4 }),
  avgHold: varchar('avg_hold', { length: 32 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('sp_period_strategy_idx').on(table.period, table.strategy),
]) ;

export const tickerPerformance = ac.table('ticker_performance', {
  id: serial('id').primaryKey(),
  period: varchar('period', { length: 32 }).notNull(),
  ticker: varchar('ticker', { length: 16 }).notNull(),
  trades: integer('trades').notNull().default(0),
  wins: integer('wins').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  winRate: numeric('win_rate', { precision: 6, scale: 2 }),
  grossPnl: numeric('gross_pnl', { precision: 18, scale: 2 }),
  netPnl: numeric('net_pnl', { precision: 18, scale: 2 }),
  avgTrade: numeric('avg_trade', { precision: 18, scale: 2 }),
  bestTrade: numeric('best_trade', { precision: 18, scale: 2 }),
  worstTrade: numeric('worst_trade', { precision: 18, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('tp_period_ticker_idx').on(table.period, table.ticker),
]) ;

export const sectorPerformance = ac.table('sector_performance', {
  id: serial('id').primaryKey(),
  period: varchar('period', { length: 32 }).notNull(),
  sector: varchar('sector', { length: 64 }).notNull(),
  trades: integer('trades').notNull().default(0),
  winRate: numeric('win_rate', { precision: 6, scale: 2 }),
  pnl: numeric('pnl', { precision: 18, scale: 2 }),
  avgGap: numeric('avg_gap', { precision: 8, scale: 4 }),
  avgMfe: numeric('avg_mfe', { precision: 18, scale: 2 }),
  avgMae: numeric('avg_mae', { precision: 18, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('sp2_period_sector_idx').on(table.period, table.sector),
]) ;

export const regimePerformance = ac.table('regime_performance', {
  id: serial('id').primaryKey(),
  period: varchar('period', { length: 32 }).notNull(),
  regime: varchar('regime', { length: 64 }).notNull(),
  trades: integer('trades').notNull().default(0),
  winRate: numeric('win_rate', { precision: 6, scale: 2 }),
  avgPnl: numeric('avg_pnl', { precision: 18, scale: 2 }),
  avgGap: numeric('avg_gap', { precision: 8, scale: 4 }),
  falsePositiveRate: numeric('false_positive_rate', { precision: 6, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('rp_period_regime_idx').on(table.period, table.regime),
]) ;

export const rpersPerformance = ac.table('rpers_performance', {
  id: serial('id').primaryKey(),
  period: varchar('period', { length: 32 }).notNull(),
  bucket: varchar('bucket', { length: 32 }).notNull(),
  predictedProb: numeric('predicted_prob', { precision: 6, scale: 2 }),
  realizedRate: numeric('realized_rate', { precision: 6, scale: 2 }),
  trades: integer('trades').notNull().default(0),
  avgPnl: numeric('avg_pnl', { precision: 18, scale: 2 }),
  avgGap: numeric('avg_gap', { precision: 8, scale: 4 }),
  mfe: numeric('mfe', { precision: 18, scale: 2 }),
  mae: numeric('mae', { precision: 18, scale: 2 }),
  calibrationError: numeric('calibration_error', { precision: 6, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('rpers_period_bucket_idx').on(table.period, table.bucket),
]) ;

// ============================================================
// 13. POSITION AUTHORITY
// ============================================================

export const positionAuthority = ac.table('position_authority', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull().references(() => earningsEvents.id),
  accountEquity: numeric('account_equity', { precision: 18, scale: 2 }).notNull(),
  defaultAllocationCeiling: numeric('default_allocation_ceiling', { precision: 6, scale: 4 }).notNull(),
  strategyAllocationCeiling: numeric('strategy_allocation_ceiling', { precision: 6, scale: 4 }).notNull(),
  volatilityAdjustment: numeric('volatility_adjustment', { precision: 6, scale: 4 }).notNull(),
  liquidityAdjustment: numeric('liquidity_adjustment', { precision: 6, scale: 4 }).notNull(),
  spreadAdjustment: numeric('spread_adjustment', { precision: 6, scale: 4 }).notNull(),
  gapRiskAdjustment: numeric('gap_risk_adjustment', { precision: 6, scale: 4 }).notNull(),
  wholeShareAdjustment: numeric('whole_share_adjustment', { precision: 6, scale: 4 }).notNull(),
  authorizedQty: integer('authorized_qty').notNull(),
  maxCapital: numeric('max_capital', { precision: 18, scale: 2 }).notNull(),
  maxLoss: numeric('max_loss', { precision: 18, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('pa_event_idx').on(table.eventId),
]) ;

// ============================================================
// 14. APMA
// ============================================================

export const apmaConfig = ac.table('apma_config', {
  id: serial('id').primaryKey(),
  action: varchar('action', { length: 64 }).notNull(),
  desc: text('desc').notNull(),
  trigger: text('trigger').notNull(),
  color: varchar('color', { length: 16 }).notNull(),
  order: integer('order').notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}) ;

export const apmaState = ac.table('apma_state', {
  id: serial('id').primaryKey(),
  ticker: varchar('ticker', { length: 16 }).notNull(),
  actionId: integer('action_id').notNull().references(() => apmaConfig.id),
  status: varchar('status', { length: 32 }).notNull(),
  maxExposure: numeric('max_exposure', { precision: 18, scale: 2 }),
  currentExposure: numeric('current_exposure', { precision: 18, scale: 2 }),
  peakExposure: numeric('peak_exposure', { precision: 18, scale: 2 }),
  lowWaterMark: numeric('low_water_mark', { precision: 18, scale: 2 }),
  highWaterMark: numeric('high_water_mark', { precision: 18, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('apma_ticker_idx').on(table.ticker),
]) ;

// ============================================================
// 15. DECISION STATES
// ============================================================

export const decisionStates = ac.table('decision_states', {
  id: serial('id').primaryKey(),
  stateId: varchar('state_id', { length: 64 }).notNull().unique(),
  label: varchar('label', { length: 128 }).notNull(),
  description: text('description').notNull(),
  category: varchar('category', { length: 64 }).notNull(),
  isTerminal: boolean('is_terminal').notNull().default(false),
  isSuccess: boolean('is_success').notNull().default(false),
  isFailure: boolean('is_failure').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}) ;

export const stateTransitions = ac.table('state_transitions', {
  id: serial('id').primaryKey(),
  fromStateId: varchar('from_state_id', { length: 64 }).notNull(),
  toStateId: varchar('to_state_id', { length: 64 }).notNull(),
  condition: text('condition').notNull(),
  isAutomatic: boolean('is_automatic').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('st_from_idx').on(table.fromStateId),
  index('st_to_idx').on(table.toStateId),
]) ;

// ============================================================
// 16. INTEGRATIONS / ADAPTERS
// ============================================================

export const integrationAdapters = ac.table('integration_adapters', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 64 }).notNull().unique(),
  displayName: varchar('display_name', { length: 128 }).notNull(),
  category: varchar('category', { length: 64 }).notNull(),
  description: text('description').notNull(),
  status: integrationStatusEnum('status').notNull().default('UNKNOWN'),
  lastHealthCheck: timestamp('last_health_check', { withTimezone: true }),
  latencyMs: integer('latency_ms'),
  errorCount: integer('error_count').notNull().default(0),
  successCount: integer('success_count').notNull().default(0),
  circuitState: circuitStateEnum('circuit_state').notNull().default('CLOSED'),
  configSchema: jsonb('config_schema'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('ia_name_idx').on(table.name),
  index('ia_status_idx').on(table.status),
  index('ia_category_idx').on(table.category),
]) ;

export const integrationCredentials = ac.table('integration_credentials', {
  id: serial('id').primaryKey(),
  adapterId: integer('adapter_id').notNull().references(() => integrationAdapters.id),
  keyName: varchar('key_name', { length: 128 }).notNull(),
  keyValue: text('key_value').notNull(),
  isEncrypted: boolean('is_encrypted').notNull().default(true),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('ic_adapter_idx').on(table.adapterId),
]) ;

// ============================================================
// 17. KILL SWITCH LOG
// ============================================================

export const killSwitchLog = ac.table('kill_switch_log', {
  id: serial('id').primaryKey(),
  action: varchar('action', { length: 32 }).notNull(),
  triggeredBy: varchar('triggered_by', { length: 128 }).notNull(),
  reason: text('reason'),
  previousState: varchar('previous_state', { length: 32 }).notNull(),
  newState: varchar('new_state', { length: 32 }).notNull(),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('ks_action_idx').on(table.action),
  index('ks_created_idx').on(table.createdAt),
]) ;

// ============================================================
// 18. SYSTEM HEALTH
// ============================================================

export const systemHealth = ac.table('system_health', {
  id: serial('id').primaryKey(),
  component: varchar('component', { length: 64 }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  latencyMs: integer('latency_ms'),
  errorRate: numeric('error_rate', { precision: 6, scale: 4 }),
  message: text('message'),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('sh_component_idx').on(table.component),
  index('sh_status_idx').on(table.status),
  index('sh_checked_idx').on(table.checkedAt),
]) ;

// ============================================================
// 19. USERS (for admin access)
// ============================================================

export const users = ac.table('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  role: varchar('role', { length: 32 }).notNull().default('viewer'),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('users_email_idx').on(table.email),
  index('users_role_idx').on(table.role),
]) ;

// ============================================================
// 20. DEPLOYMENT METADATA
// ============================================================

export const deploymentLog = ac.table('deployment_log', {
  id: serial('id').primaryKey(),
  environment: varchar('environment', { length: 32 }).notNull(),
  version: varchar('version', { length: 32 }).notNull(),
  commitHash: varchar('commit_hash', { length: 64 }),
  deployedBy: varchar('deployed_by', { length: 255 }),
  deployedAt: timestamp('deployed_at', { withTimezone: true }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('deploy_env_idx').on(table.environment),
  index('deploy_at_idx').on(table.deployedAt),
]) ;

// ============================================================
// 21. STRATEGY REGISTRY (Multi-Strategy Platform)
// ============================================================

export const strategies = ac.table('strategies', {
  id: serial('id').primaryKey(),
  strategyId: varchar('strategy_id', { length: 32 }).notNull().unique(),
  name: varchar('name', { length: 128 }).notNull(),
  displayName: varchar('display_name', { length: 128 }).notNull(),
  category: varchar('category', { length: 64 }).notNull(),
  description: text('description').notNull(),
  version: varchar('version', { length: 16 }).notNull().default('1.0.0'),
  status: varchar('status', { length: 32 }).notNull().default('DRAFT'),
  isActive: boolean('is_active').notNull().default(false),
  isDefault: boolean('is_default').notNull().default(false),
  priority: integer('priority').notNull().default(0),
  author: varchar('author', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('strategies_id_idx').on(table.strategyId),
  index('strategies_status_idx').on(table.status),
  index('strategies_active_idx').on(table.isActive),
]);

export const strategyVersions = ac.table('strategy_versions', {
  id: serial('id').primaryKey(),
  strategyId: integer('strategy_id').notNull().references(() => strategies.id),
  version: varchar('version', { length: 16 }).notNull(),
  changeLog: text('change_log'),
  contractDefinition: jsonb('contract_definition').notNull(),
  isLive: boolean('is_live').notNull().default(false),
  deployedAt: timestamp('deployed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('sv_strategy_idx').on(table.strategyId),
  uniqueIndex('sv_strategy_version_idx').on(table.strategyId, table.version),
]);

export const strategyContracts = ac.table('strategy_contracts', {
  id: serial('id').primaryKey(),
  strategyId: integer('strategy_id').notNull().references(() => strategies.id),
  versionId: integer('version_id').references(() => strategyVersions.id),
  contractKey: varchar('contract_key', { length: 128 }).notNull().unique(),
  entryConditions: jsonb('entry_conditions').notNull(),
  exitConditions: jsonb('exit_conditions').notNull(),
  riskParameters: jsonb('risk_parameters').notNull(),
  positionSizing: jsonb('position_sizing').notNull(),
  timeInForce: jsonb('time_in_force').notNull(),
  filters: jsonb('filters'),
  indicators: jsonb('indicators'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('sc_strategy_idx').on(table.strategyId),
  index('sc_key_idx').on(table.contractKey),
]);

export const strategyParameters = ac.table('strategy_parameters', {
  id: serial('id').primaryKey(),
  contractId: integer('contract_id').notNull().references(() => strategyContracts.id),
  paramKey: varchar('param_key', { length: 128 }).notNull(),
  paramValue: text('param_value').notNull(),
  paramType: varchar('param_type', { length: 32 }).notNull(),
  minValue: numeric('min_value', { precision: 18, scale: 8 }),
  maxValue: numeric('max_value', { precision: 18, scale: 8 }),
  description: text('description'),
  isEditable: boolean('is_editable').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('sp_contract_idx').on(table.contractId),
  uniqueIndex('sp_contract_key_idx').on(table.contractId, table.paramKey),
]);

export const marketRegimes = ac.table('market_regimes', {
  id: serial('id').primaryKey(),
  regimeId: varchar('regime_id', { length: 64 }).notNull().unique(),
  label: varchar('label', { length: 128 }).notNull(),
  description: text('description').notNull(),
  vixRangeLow: numeric('vix_range_low', { precision: 6, scale: 2 }),
  vixRangeHigh: numeric('vix_range_high', { precision: 6, scale: 2 }),
  spyTrend: varchar('spy_trend', { length: 16 }),
  sectorRotation: varchar('sector_rotation', { length: 32 }),
  breadth: varchar('breadth', { length: 16 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const strategyCandidates = ac.table('strategy_candidates', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull().references(() => earningsEvents.id),
  strategyId: integer('strategy_id').notNull().references(() => strategies.id),
  score: integer('score').notNull(),
  rank: integer('rank').notNull(),
  eligibilityReason: text('eligibility_reason'),
  isSelected: boolean('is_selected').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('scand_event_idx').on(table.eventId),
  index('scand_strategy_idx').on(table.strategyId),
]);

export const strategyRouterDecisions = ac.table('strategy_router_decisions', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull().references(() => earningsEvents.id),
  marketRegimeId: integer('market_regime_id').references(() => marketRegimes.id),
  selectedStrategyId: integer('selected_strategy_id').references(() => strategies.id),
  candidateScores: jsonb('candidate_scores').notNull(),
  routingLogic: text('routing_logic').notNull(),
  decisionTimeMicroseconds: integer('decision_time_microseconds'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('srd_event_idx').on(table.eventId),
  index('srd_regime_idx').on(table.marketRegimeId),
]);

export const strategyRejections = ac.table('strategy_rejections', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull().references(() => earningsEvents.id),
  strategyId: integer('strategy_id').notNull().references(() => strategies.id),
  rejectionReason: text('rejection_reason').notNull(),
  rejectionCategory: varchar('rejection_category', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('sr_event_idx').on(table.eventId),
  index('sr_strategy_idx').on(table.strategyId),
]);

// ============================================================
// 22. SYNTHETIC PROTECTION
// ============================================================

export const syntheticProtection = ac.table('synthetic_protection', {
  id: serial('id').primaryKey(),
  positionId: integer('position_id').notNull().references(() => positions.id),
  strategyId: integer('strategy_id').notNull().references(() => strategies.id),
  protectionType: varchar('protection_type', { length: 32 }).notNull(),
  entryPrice: numeric('entry_price', { precision: 12, scale: 4 }).notNull(),
  peakPrice: numeric('peak_price', { precision: 12, scale: 4 }).notNull(),
  protectionFloor: numeric('protection_floor', { precision: 12, scale: 4 }).notNull(),
  trailDistance: numeric('trail_distance', { precision: 12, scale: 4 }),
  triggerPrice: numeric('trigger_price', { precision: 12, scale: 4 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('sp_pos_idx').on(table.positionId),
]);

export const syntheticProtectionEvents = ac.table('synthetic_protection_events', {
  id: serial('id').primaryKey(),
  protectionId: integer('protection_id').notNull().references(() => syntheticProtection.id),
  eventType: varchar('event_type', { length: 32 }).notNull(),
  oldFloor: numeric('old_floor', { precision: 12, scale: 4 }),
  newFloor: numeric('new_floor', { precision: 12, scale: 4 }),
  oldTrail: numeric('old_trail', { precision: 12, scale: 4 }),
  newTrail: numeric('new_trail', { precision: 12, scale: 4 }),
  priceAtEvent: numeric('price_at_event', { precision: 12, scale: 4 }),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('spe_protection_idx').on(table.protectionId),
]);

// ============================================================
// 23. FILLS
// ============================================================

export const fills = ac.table('fills', {
  id: serial('id').primaryKey(),
  fillId: varchar('fill_id', { length: 32 }).notNull().unique(),
  orderId: varchar('order_id', { length: 32 }).notNull(),
  eventId: integer('event_id').references(() => earningsEvents.id),
  strategyId: integer('strategy_id').references(() => strategies.id),
  ticker: varchar('ticker', { length: 16 }).notNull(),
  qty: integer('qty').notNull(),
  fillPrice: numeric('fill_price', { precision: 12, scale: 4 }).notNull(),
  side: orderSideEnum('side').notNull(),
  commission: numeric('commission', { precision: 18, scale: 4 }).notNull().default('0'),
  realizedPnl: numeric('realized_pnl', { precision: 18, scale: 4 }),
  executionTime: timestamp('execution_time', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('fills_order_idx').on(table.orderId),
  index('fills_ticker_idx').on(table.ticker),
  index('fills_strategy_idx').on(table.strategyId),
]);

// ============================================================
// 24. POSITION RECLASSIFICATIONS
// ============================================================

export const positionReclassifications = ac.table('position_reclassifications', {
  id: serial('id').primaryKey(),
  positionId: integer('position_id').notNull().references(() => positions.id),
  oldStrategyId: integer('old_strategy_id').references(() => strategies.id),
  newStrategyId: integer('new_strategy_id').references(() => strategies.id),
  reason: text('reason').notNull(),
  reclassifiedBy: varchar('reclassified_by', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('pr_position_idx').on(table.positionId),
]);

// ============================================================
// 25. STRATEGY VALIDATION / PROMOTIONS / SUSPENSIONS
// ============================================================

export const strategyValidation = ac.table('strategy_validation', {
  id: serial('id').primaryKey(),
  strategyId: integer('strategy_id').notNull().references(() => strategies.id),
  validationType: varchar('validation_type', { length: 64 }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  testResults: jsonb('test_results'),
  metrics: jsonb('metrics'),
  approvedBy: varchar('approved_by', { length: 255 }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('sv2_strategy_idx').on(table.strategyId),
]);

export const strategyPromotions = ac.table('strategy_promotions', {
  id: serial('id').primaryKey(),
  strategyId: integer('strategy_id').notNull().references(() => strategies.id),
  fromEnvironment: varchar('from_environment', { length: 32 }).notNull(),
  toEnvironment: varchar('to_environment', { length: 32 }).notNull(),
  promotedBy: varchar('promoted_by', { length: 255 }),
  promotionReason: text('promotion_reason'),
  metricsAtPromotion: jsonb('metrics_at_promotion'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('spromo_strategy_idx').on(table.strategyId),
]);

export const strategySuspensions = ac.table('strategy_suspensions', {
  id: serial('id').primaryKey(),
  strategyId: integer('strategy_id').notNull().references(() => strategies.id),
  reason: text('reason').notNull(),
  suspendedBy: varchar('suspended_by', { length: 255 }),
  resumedAt: timestamp('resumed_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('ss_strategy_idx').on(table.strategyId),
]);

// ============================================================
// 26. INDICATOR SNAPSHOTS
// ============================================================

export const indicatorSnapshots = ac.table('indicator_snapshots', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull().references(() => earningsEvents.id),
  ticker: varchar('ticker', { length: 16 }).notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  ema9: numeric('ema9', { precision: 12, scale: 4 }),
  ema20: numeric('ema20', { precision: 12, scale: 4 }),
  ema50: numeric('ema50', { precision: 12, scale: 4 }),
  vwap: numeric('vwap', { precision: 12, scale: 4 }),
  rsi14: numeric('rsi14', { precision: 6, scale: 2 }),
  atr14: numeric('atr14', { precision: 12, scale: 4 }),
  bollingerUpper: numeric('bollinger_upper', { precision: 12, scale: 4 }),
  bollingerLower: numeric('bollinger_lower', { precision: 12, scale: 4 }),
  volumeSma20: numeric('volume_sma20', { precision: 18, scale: 2 }),
  rvol: numeric('rvol', { precision: 6, scale: 2 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('is_event_idx').on(table.eventId),
  index('is_ticker_idx').on(table.ticker),
  index('is_timestamp_idx').on(table.timestamp),
]);

// ============================================================
// 27. CHART DATA TABLES
// ============================================================

export const chartBars = ac.table('chart_bars', {
  id: serial('id').primaryKey(),
  symbol: varchar('symbol', { length: 16 }).notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  timeframe: varchar('timeframe', { length: 8 }).notNull(),
  open: numeric('open', { precision: 12, scale: 4 }).notNull(),
  high: numeric('high', { precision: 12, scale: 4 }).notNull(),
  low: numeric('low', { precision: 12, scale: 4 }).notNull(),
  close: numeric('close', { precision: 12, scale: 4 }).notNull(),
  volume: numeric('volume', { precision: 18, scale: 2 }),
  vwap: numeric('vwap', { precision: 12, scale: 4 }),
  tradeCount: integer('trade_count'),
  session: varchar('session', { length: 16 }),
  source: varchar('source', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('cb_symbol_idx').on(table.symbol),
  index('cb_timeframe_idx').on(table.timeframe),
  index('cb_timestamp_idx').on(table.timestamp),
  uniqueIndex('cb_unique_idx').on(table.symbol, table.timestamp, table.timeframe, table.source),
]);

export const chartEvents = ac.table('chart_events', {
  id: serial('id').primaryKey(),
  symbol: varchar('symbol', { length: 16 }).notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  eventType: varchar('event_type', { length: 32 }).notNull(),
  price: numeric('price', { precision: 12, scale: 4 }),
  quantity: integer('quantity'),
  strategyId: integer('strategy_id').references(() => strategies.id),
  positionId: integer('position_id').references(() => positions.id),
  orderId: varchar('order_id', { length: 32 }),
  earningsEventId: integer('earnings_event_id').references(() => earningsEvents.id),
  label: text('label'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('ce_symbol_idx').on(table.symbol),
  index('ce_type_idx').on(table.eventType),
  index('ce_timestamp_idx').on(table.timestamp),
]);

export const chartAnnotations = ac.table('chart_annotations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  symbol: varchar('symbol', { length: 16 }).notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  annotationType: varchar('annotation_type', { length: 32 }).notNull(),
  price: numeric('price', { precision: 12, scale: 4 }),
  text: text('text'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('ca_symbol_idx').on(table.symbol),
  index('ca_user_idx').on(table.userId),
]);

export const chartLayouts = ac.table('chart_layouts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  layoutName: varchar('layout_name', { length: 128 }).notNull(),
  layout: jsonb('layout').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('cl_user_idx').on(table.userId),
  index('cl_default_idx').on(table.isDefault),
]);

export const chartPreferences = ac.table('chart_preferences', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  symbol: varchar('symbol', { length: 16 }),
  defaultTimeframe: varchar('default_timeframe', { length: 8 }).notNull().default('1m'),
  showVolume: boolean('show_volume').notNull().default(true),
  showVwap: boolean('show_vwap').notNull().default(true),
  showEma9: boolean('show_ema9').notNull().default(true),
  showEma20: boolean('show_ema20').notNull().default(true),
  showEma50: boolean('show_ema50').notNull().default(false),
  showOrders: boolean('show_orders').notNull().default(true),
  showPositions: boolean('show_positions').notNull().default(true),
  showProtection: boolean('show_protection').notNull().default(true),
  showApma: boolean('show_apma').notNull().default(true),
  settings: jsonb('settings'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('cp_user_idx').on(table.userId),
  index('cp_symbol_idx').on(table.symbol),
]);

// ============================================================
// 28. RCS TIME SERIES
// ============================================================

export const rcsTimeSeries = ac.table('rcs_time_series', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull().references(() => earningsEvents.id),
  ticker: varchar('ticker', { length: 16 }).notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  rcs: numeric('rcs', { precision: 8, scale: 4 }).notNull(),
  priceComponent: numeric('price_component', { precision: 8, scale: 4 }),
  volumeComponent: numeric('volume_component', { precision: 8, scale: 4 }),
  orderFlowComponent: numeric('order_flow_component', { precision: 8, scale: 4 }),
  liquidityComponent: numeric('liquidity_component', { precision: 8, scale: 4 }),
  continuationComponent: numeric('continuation_component', { precision: 8, scale: 4 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('rcs_ts_event_idx').on(table.eventId),
  index('rcs_ts_ticker_idx').on(table.ticker),
  index('rcs_ts_time_idx').on(table.timestamp),
]);

// ============================================================
// 29. FIS TIMELINE
// ============================================================

export const fisTimeline = ac.table('fis_timeline', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').notNull().references(() => earningsEvents.id),
  version: varchar('version', { length: 16 }).notNull().default('1.0'),
  epsSurprise: numeric('eps_surprise', { precision: 8, scale: 4 }),
  revenueSurprise: numeric('revenue_surprise', { precision: 8, scale: 4 }),
  guidanceSurprise: numeric('guidance_surprise', { precision: 8, scale: 4 }),
  kpiSurprise: numeric('kpi_surprise', { precision: 8, scale: 4 }),
  surpriseAcceleration: numeric('surprise_acceleration', { precision: 8, scale: 4 }),
  expectationBurden: varchar('expectation_burden', { length: 32 }),
  finalFis: numeric('final_fis', { precision: 8, scale: 4 }),
  contractVersion: varchar('contract_version', { length: 32 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('ft_event_idx').on(table.eventId),
]);

// ============================================================
// 30. USER SETTINGS
// ============================================================

export const userSettings = ac.table('user_settings', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  accountId: integer('account_id').references(() => users.id),
  settingGroup: varchar('setting_group', { length: 64 }).notNull(),
  settingKey: varchar('setting_key', { length: 128 }).notNull(),
  value: jsonb('value'),
  defaultValue: jsonb('default_value'),
  source: varchar('source', { length: 32 }).notNull().default('USER'),
  editable: boolean('editable').notNull().default(true),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: integer('updated_by').references(() => users.id),
}, (table) => [
  uniqueIndex('us_user_group_key_idx').on(table.userId, table.accountId, table.settingGroup, table.settingKey),
  index('us_user_idx').on(table.userId),
  index('us_group_idx').on(table.settingGroup),
]);

// ============================================================
// 31. RISK PROFILES
// ============================================================

export const riskProfiles = ac.table('risk_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  accountId: integer('account_id').notNull(),
  profileName: varchar('profile_name', { length: 64 }).notNull(),
  isActive: boolean('is_active').notNull().default(false),
  maxDailyLoss: numeric('max_daily_loss', { precision: 18, scale: 2 }),
  maxDailyLossType: varchar('max_daily_loss_type', { length: 16 }).default('USD'),
  maxEventRisk: numeric('max_event_risk', { precision: 18, scale: 2 }),
  maxEventRiskType: varchar('max_event_risk_type', { length: 16 }).default('USD'),
  maxSingleNameExposure: numeric('max_single_name_exposure', { precision: 6, scale: 2 }),
  maxSectorExposure: numeric('max_sector_exposure', { precision: 6, scale: 2 }),
  maxGrossExposure: numeric('max_gross_exposure', { precision: 6, scale: 2 }),
  maxNetExposure: numeric('max_net_exposure', { precision: 6, scale: 2 }),
  maxCorrelatedExposure: numeric('max_correlated_exposure', { precision: 6, scale: 2 }),
  haltOnConsecutiveLosses: integer('halt_on_consecutive_losses').default(3),
  maxOpenPositions: integer('max_open_positions'),
  maxOpenOrders: integer('max_open_orders'),
  maxDailyTrades: integer('max_daily_trades'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: integer('updated_by').references(() => users.id),
}, (table) => [
  index('rp_user_idx').on(table.userId),
  index('rp_account_idx').on(table.accountId),
  index('rp_active_idx').on(table.isActive),
]);

// ============================================================
// 32. RISK PROFILE VERSIONS
// ============================================================

export const riskProfileVersions = ac.table('risk_profile_versions', {
  id: serial('id').primaryKey(),
  riskProfileId: integer('risk_profile_id').notNull().references(() => riskProfiles.id),
  version: integer('version').notNull(),
  snapshot: jsonb('snapshot').notNull(),
  changeReason: text('change_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: integer('created_by').references(() => users.id),
}, (table) => [
  index('rpv_profile_idx').on(table.riskProfileId),
  index('rpv_version_idx').on(table.version),
]);

// ============================================================
// 33. STRATEGY USER PREFERENCES
// ============================================================

export const strategyUserPreferences = ac.table('strategy_user_preferences', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  accountId: integer('account_id').notNull(),
  strategyId: integer('strategy_id').notNull().references(() => strategies.id),
  enabled: boolean('enabled').notNull().default(true),
  preferred: boolean('preferred').notNull().default(false),
  selectionPriority: integer('selection_priority').notNull().default(0),
  maxAllocation: numeric('max_allocation', { precision: 18, scale: 2 }),
  maxEventRisk: numeric('max_event_risk', { precision: 18, scale: 2 }),
  maxConcurrentPositions: integer('max_concurrent_positions'),
  allowedSessions: jsonb('allowed_sessions'),
  settings: jsonb('settings'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('sup_user_account_strategy_idx').on(table.userId, table.accountId, table.strategyId),
  index('sup_user_idx').on(table.userId),
  index('sup_strategy_idx').on(table.strategyId),
  index('sup_enabled_idx').on(table.enabled),
]);

// ============================================================
// 34. STRATEGY SELECTION PROFILES
// ============================================================

export const strategySelectionProfiles = ac.table('strategy_selection_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  accountId: integer('account_id').notNull(),
  selectionMode: varchar('selection_mode', { length: 32 }).notNull().default('AUTO'),
  lockedStrategyId: integer('locked_strategy_id').references(() => strategies.id),
  preferredStrategyIds: jsonb('preferred_strategy_ids'),
  allowRouterFallback: boolean('allow_router_fallback').notNull().default(true),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('ssp_user_account_idx').on(table.userId, table.accountId),
  index('ssp_user_idx').on(table.userId),
  index('ssp_mode_idx').on(table.selectionMode),
]);

// ============================================================
// 35. PROTECTION PROFILES
// ============================================================

export const protectionProfiles = ac.table('protection_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  accountId: integer('account_id').notNull(),
  strategyId: integer('strategy_id').references(() => strategies.id),
  profileName: varchar('profile_name', { length: 64 }).default('Default'),
  isActive: boolean('is_active').notNull().default(true),
  syntheticStopEnabled: boolean('synthetic_stop_enabled').notNull().default(true),
  syntheticTrailEnabled: boolean('synthetic_trail_enabled').notNull().default(false),
  initialStopType: varchar('initial_stop_type', { length: 32 }).default('PERCENTAGE'),
  initialStopValue: numeric('initial_stop_value', { precision: 10, scale: 4 }),
  trailType: varchar('trail_type', { length: 32 }).default('PERCENTAGE'),
  trailValue: numeric('trail_value', { precision: 10, scale: 4 }),
  atrMultiplier: numeric('atr_multiplier', { precision: 6, scale: 2 }),
  spreadFloorMultiplier: numeric('spread_floor_multiplier', { precision: 6, scale: 2 }),
  minimumProtectionDistance: numeric('minimum_protection_distance', { precision: 10, scale: 4 }),
  repriceEnabled: boolean('reprice_enabled').notNull().default(false),
  repriceIntervalMs: integer('reprice_interval_ms'),
  maxRepriceAttempts: integer('max_reprice_attempts'),
  apmaEnabled: boolean('apma_enabled').notNull().default(true),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  updatedBy: integer('updated_by').references(() => users.id),
}, (table) => [
  index('pp_user_idx').on(table.userId),
  index('pp_account_idx').on(table.accountId),
  index('pp_strategy_idx').on(table.strategyId),
  index('pp_active_idx').on(table.isActive),
]);

// ============================================================
// 36. CONFIGURATION EVENTS
// ============================================================

export const configurationEvents = ac.table('configuration_events', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  accountId: integer('account_id'),
  configurationType: varchar('configuration_type', { length: 64 }).notNull(),
  configurationId: integer('configuration_id'),
  settingKey: varchar('setting_key', { length: 128 }).notNull(),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  source: varchar('source', { length: 32 }).notNull().default('UI'),
  status: varchar('status', { length: 32 }).notNull().default('REQUESTED'),
  reason: text('reason'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  runtimeAppliedAt: timestamp('runtime_applied_at', { withTimezone: true }),
  runtimeVersion: varchar('runtime_version', { length: 32 }),
}, (table) => [
  index('ce_user_idx').on(table.userId),
  index('ce_type_idx').on(table.configurationType),
  index('ce_status_idx').on(table.status),
  index('ce_timestamp_idx').on(table.timestamp),
]);

// ============================================================
// 37. USER PERMISSIONS
// ============================================================

export const userPermissions = ac.table('user_permissions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  role: varchar('role', { length: 32 }).notNull().default('VIEWER'),
  scope: varchar('scope', { length: 64 }).notNull().default('GLOBAL'),
  resourceType: varchar('resource_type', { length: 64 }),
  resourceId: integer('resource_id'),
  permissions: jsonb('permissions'),
  grantedBy: integer('granted_by').references(() => users.id),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('up_user_idx').on(table.userId),
  index('up_role_idx').on(table.role),
  index('up_scope_idx').on(table.scope),
]);

// ============================================================
// 38. LEGAL DOCUMENTS
// ============================================================

export const legalDocuments = ac.table('legal_documents', {
  id: serial('id').primaryKey(),
  documentId: varchar('document_id', { length: 64 }).notNull().unique(),
  title: varchar('title', { length: 256 }).notNull(),
  version: integer('version').notNull(),
  versionEffectiveDate: timestamp('version_effective_date', { withTimezone: true }).notNull(),
  contentHash: varchar('content_hash', { length: 128 }).notNull(),
  isRequired: boolean('is_required').notNull().default(true),
  appliesToMode: varchar('applies_to_mode', { length: 32 }).default('ALL'),
  appliesToEnvironment: varchar('applies_to_environment', { length: 32 }).default('ALL'),
  requiresReconsent: boolean('requires_reconsent').notNull().default(false),
  reconsentIntervalMonths: integer('reconsent_interval_months').default(12),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('ld_doc_id_version_idx').on(table.documentId, table.version),
  index('ld_required_idx').on(table.isRequired),
  index('ld_mode_idx').on(table.appliesToMode),
]);

// ============================================================
// 39. LEGAL DOCUMENT VERSIONS
// ============================================================

export const legalDocumentVersions = ac.table('legal_document_versions', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id').notNull().references(() => legalDocuments.id),
  version: integer('version').notNull(),
  content: text('content').notNull(),
  contentHash: varchar('content_hash', { length: 128 }).notNull(),
  effectiveDate: timestamp('effective_date', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('ldv_doc_version_idx').on(table.documentId, table.version),
]);

// ============================================================
// 40. LEGAL ACCEPTANCES
// ============================================================

export const legalAcceptances = ac.table('legal_acceptances', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  documentId: integer('document_id').notNull().references(() => legalDocuments.id),
  documentVersion: integer('document_version').notNull(),
  acceptanceType: varchar('acceptance_type', { length: 32 }).notNull(),
  environment: varchar('environment', { length: 32 }).notNull(),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  fingerprint: varchar('fingerprint', { length: 256 }),
  isFirstTime: boolean('is_first_time').notNull().default(false),
  withdrawalTimestamp: timestamp('withdrawal_timestamp', { withTimezone: true }),
  withdrawnBy: integer('withdrawn_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('la_user_doc_version_env_idx').on(table.userId, table.documentId, table.documentVersion, table.environment),
  index('la_user_idx').on(table.userId),
  index('la_doc_idx').on(table.documentId),
  index('la_first_time_idx').on(table.isFirstTime),
  index('la_withdrawn_idx').on(table.withdrawalTimestamp),
]);

// ============================================================
// 41. LEGAL ACCEPTANCE EVENTS (checkbox-level)
// ============================================================

export const legalAcceptanceEvents = ac.table('legal_acceptance_events', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  acceptanceId: integer('acceptance_id').notNull().references(() => legalAcceptances.id),
  eventType: varchar('event_type', { length: 32 }).notNull(),
  disclosureKey: varchar('disclosure_key', { length: 128 }).notNull(),
  disclosureVersion: integer('disclosure_version').notNull(),
  isChecked: boolean('is_checked').notNull(),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  fingerprint: varchar('fingerprint', { length: 256 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('lae_acceptance_idx').on(table.acceptanceId),
  index('lae_user_idx').on(table.userId),
  index('lae_type_idx').on(table.eventType),
  index('lae_disclosure_idx').on(table.disclosureKey),
]);

// ============================================================
// 42. AUTONOMOUS AUTHORIZATIONS
// ============================================================

export const autonomousAuthorizations = ac.table('autonomous_authorizations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  accountId: integer('account_id').notNull(),
  environment: varchar('environment', { length: 32 }).notNull(),
  isAuthorized: boolean('is_authorized').notNull(),
  authorizedFrom: timestamp('authorized_from', { withTimezone: true }),
  authorizedUntil: timestamp('authorized_until', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('aa_user_idx').on(table.userId),
  index('aa_account_idx').on(table.accountId),
  index('aa_env_idx').on(table.environment),
  index('aa_authorized_idx').on(table.isAuthorized),
]);

// ============================================================
// 43. AUTONOMOUS START EVENTS
// ============================================================

export const autonomousStartEvents = ac.table('autonomous_start_events', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  accountId: integer('account_id').notNull(),
  environment: varchar('environment', { length: 32 }).notNull(),
  action: varchar('action', { length: 32 }).notNull(),
  result: varchar('result', { length: 32 }).notNull(),
  gateStatus: varchar('gate_status', { length: 64 }).notNull(),
  gateFailedReasons: jsonb('gate_failed_reasons'),
  triggeredBy: varchar('triggered_by', { length: 32 }).notNull().default('USER'),
  runId: varchar('run_id', { length: 64 }),
  strategyId: integer('strategy_id').references(() => strategies.id),
  elapsedMs: integer('elapsed_ms'),
  version: varchar('version', { length: 32 }),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('ase_user_idx').on(table.userId),
  index('ase_account_idx').on(table.accountId),
  index('ase_action_idx').on(table.action),
  index('ase_result_idx').on(table.result),
  index('ase_created_idx').on(table.createdAt),
]);

// ============================================================
// 44. STRATEGY DISCLOSURE ACCEPTANCES
// ============================================================

export const strategyDisclosureAcceptances = ac.table('strategy_disclosure_acceptances', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  accountId: integer('account_id').notNull(),
  strategyId: integer('strategy_id').notNull().references(() => strategies.id),
  environment: varchar('environment', { length: 32 }).notNull(),
  isAccepted: boolean('is_accepted').notNull().default(false),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('sda_user_account_strategy_env_idx').on(table.userId, table.accountId, table.strategyId, table.environment),
  index('sda_user_idx').on(table.userId),
  index('sda_strategy_idx').on(table.strategyId),
]);

// ============================================================
// 45. BROKER AUTHORIZATIONS
// ============================================================

export const brokerAuthorizations = ac.table('broker_authorizations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  accountId: integer('account_id').notNull(),
  brokerId: varchar('broker_id', { length: 64 }).notNull(),
  brokerName: varchar('broker_name', { length: 128 }).notNull(),
  isAuthorized: boolean('is_authorized').notNull().default(false),
  consentScope: varchar('consent_scope', { length: 32 }).default('TRADE_EXECUTE'),
  dataSharingAuthorized: boolean('data_sharing_authorized').notNull().default(false),
  authorizedAt: timestamp('authorized_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('ba_user_account_broker_idx').on(table.userId, table.accountId, table.brokerId),
  index('ba_user_idx').on(table.userId),
  index('ba_broker_idx').on(table.brokerId),
]);

// ============================================================
// 46. ELECTRONIC CONSENT RECORDS (E-SIGN)
// ============================================================

export const electronicConsentRecords = ac.table('electronic_consent_records', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  accountId: integer('account_id').notNull(),
  consentType: varchar('consent_type', { length: 64 }).notNull(),
  consentVersion: varchar('consent_version', { length: 32 }).notNull(),
  consentText: text('consent_text').notNull(),
  consentHash: varchar('consent_hash', { length: 128 }).notNull(),
  isConsentGiven: boolean('is_consent_given').notNull().default(false),
  consentTimestamp: timestamp('consent_timestamp', { withTimezone: true }),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('ecr_user_account_type_version_idx').on(table.userId, table.accountId, table.consentType, table.consentVersion),
  index('ecr_user_idx').on(table.userId),
  index('ecr_type_idx').on(table.consentType),
]);

// ============================================================
// 47. LEGAL REQUIREMENTS
// ============================================================

export const legalRequirements = ac.table('legal_requirements', {
  id: serial('id').primaryKey(),
  jurisdiction: varchar('jurisdiction', { length: 64 }).notNull(),
  documentId: integer('document_id').notNull().references(() => legalDocuments.id),
  isRequired: boolean('is_required').notNull().default(true),
  minimumAge: integer('minimum_age').default(18),
  requiresWitness: boolean('requires_witness').notNull().default(false),
  requiresNotary: boolean('requires_notary').notNull().default(false),
  effectiveDate: timestamp('effective_date', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('lr_jurisdiction_doc_idx').on(table.jurisdiction, table.documentId),
  index('lr_jurisdiction_idx').on(table.jurisdiction),
  index('lr_required_idx').on(table.isRequired),
]);

// ============================================================
// 48. LEGAL RECONSENT QUEUE
// ============================================================

export const legalReconsentQueue = ac.table('legal_reconsent_queue', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  accountId: integer('account_id').notNull(),
  documentId: integer('document_id').notNull().references(() => legalDocuments.id),
  environment: varchar('environment', { length: 32 }).notNull(),
  reason: varchar('reason', { length: 64 }).notNull(),
  requiredBy: timestamp('required_by', { withTimezone: true }).notNull(),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  isBlocking: boolean('is_blocking').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('lrq_user_idx').on(table.userId),
  index('lrq_account_idx').on(table.accountId),
  index('lrq_blocking_idx').on(table.isBlocking),
  index('lrq_required_by_idx').on(table.requiredBy),
]);

// ============================================================
// 49. COMPLIANCE EVENTS
// ============================================================

export const complianceEvents = ac.table('compliance_events', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  accountId: integer('account_id'),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  eventCategory: varchar('event_category', { length: 32 }).notNull(),
  severity: varchar('severity', { length: 16 }).notNull().default('INFO'),
  subjectType: varchar('subject_type', { length: 32 }),
  subjectId: varchar('subject_id', { length: 64 }),
  details: jsonb('details'),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('cev_user_idx').on(table.userId),
  index('cev_type_idx').on(table.eventType),
  index('cev_category_idx').on(table.eventCategory),
  index('cev_severity_idx').on(table.severity),
  index('cev_created_idx').on(table.createdAt),
]);
