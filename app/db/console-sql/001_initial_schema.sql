-- Auto-wrapped for Requi platform (schema ac)
CREATE SCHEMA IF NOT EXISTS ac;
SET search_path TO ac, public;

-- ============================================================
-- 001_initial_schema.sql — Full Requi Auto v3 PostgreSQL schema
-- Target: Supabase PostgreSQL 15+
-- ============================================================

-- Create schemas
-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'engine_mode') THEN
    CREATE TYPE engine_mode AS ENUM ('SHADOW', 'PAPER', 'LIVE');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'engine_status') THEN
    CREATE TYPE engine_status AS ENUM ('ARMED', 'DISARMED', 'ERROR');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_state') THEN
    CREATE TYPE event_state AS ENUM ('DETECTED','RESEARCHING','ANALYZING','QUALIFIED','ORDER_READY','ORDER_SUBMITTED','PARTIAL_FILL','FILLED','HOLDING','EXITING','CLOSED','NO_ACTION');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_side') THEN
    CREATE TYPE order_side AS ENUM ('BUY','SELL');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_type') THEN
    CREATE TYPE order_type AS ENUM ('LIMIT','MARKET','STOP','STOP_LIMIT');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE order_status AS ENUM ('OPEN','SUBMITTED','PARTIAL','FILLED','CANCELED','REJECTED','EXPIRED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_status') THEN
    CREATE TYPE risk_status AS ENUM ('PENDING','RISK_APPROVED','REJECTED','OVERRIDDEN');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'protection_state') THEN
    CREATE TYPE protection_state AS ENUM ('NO_PROTECTION','BREAKEVEN','TRAILING_STOP','HARD_STOP','PROFIT_TARGET','TIME_EXIT');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'data_feed_status') THEN
    CREATE TYPE data_feed_status AS ENUM ('CONNECTED','DEGRADED','DISCONNECTED','ERROR');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'data_feed_health') THEN
    CREATE TYPE data_feed_health AS ENUM ('HEALTHY','DEGRADED','CRITICAL');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_level') THEN
    CREATE TYPE audit_level AS ENUM ('INFO','SUCCESS','WARNING','ERROR','CRITICAL','START','PAUSE','KILL');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'decision_state') THEN
    CREATE TYPE decision_state AS ENUM ('EVENT_DETECTED','RESEARCH_COMPLETE','FIS_QUALIFIED','FIS_DISQUALIFIED','PRE_EVENT_POSITION_OK','RCS_QUALIFIED','RCS_DISQUALIFIED','EVENT_POSITION_OK','ORDER_READY','REACTION_CONFIRMED','NO_ACTION','WAITING','ORDER_SUBMITTED','ORDER_FILLED','ORDER_PARTIAL','ORDER_REJECTED','POSITION_OPEN','POSITION_HOLDING','POSITION_EXITING','POSITION_CLOSED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'strategy_type') THEN
    CREATE TYPE strategy_type AS ENUM ('Post-Earnings Momentum','Gap Continuation','Fade the Move','Contrarian Reversal');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'integration_status') THEN
    CREATE TYPE integration_status AS ENUM ('HEALTHY','DEGRADED','DOWN','UNKNOWN');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'circuit_state') THEN
    CREATE TYPE circuit_state AS ENUM ('CLOSED','OPEN','HALF_OPEN');
  END IF;
END $$;

-- ============================================================
-- 1. ENGINE STATE & CONFIGURATION
-- ============================================================

CREATE TABLE IF NOT EXISTS engine_state (
  id SERIAL PRIMARY KEY,
  version VARCHAR(32) NOT NULL DEFAULT '3.2.1',
  mode engine_mode NOT NULL DEFAULT 'PAPER',
  status engine_status NOT NULL DEFAULT 'ARMED',
  kill_switch_armed BOOLEAN NOT NULL DEFAULT true,
  last_heartbeat TIMESTAMPTZ DEFAULT now(),
  cycle_count INTEGER NOT NULL DEFAULT 0,
  total_events INTEGER NOT NULL DEFAULT 0,
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_positions INTEGER NOT NULL DEFAULT 0,
  uptime_seconds INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS engine_state_status_idx ON engine_state(status);

CREATE TABLE IF NOT EXISTS engine_config (
  id SERIAL PRIMARY KEY,
  key VARCHAR(128) NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  category VARCHAR(64) NOT NULL,
  is_secret BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS engine_config_key_idx ON engine_config(key);
CREATE INDEX IF NOT EXISTS engine_config_category_idx ON engine_config(category);

-- ============================================================
-- 2. PIPELINE STAGES
-- ============================================================

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id SERIAL PRIMARY KEY,
  stage_id VARCHAR(8) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  description TEXT NOT NULL,
  sequence_order INTEGER NOT NULL,
  sla_microseconds INTEGER NOT NULL,
  is_critical BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS pipeline_executions (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL,
  stage_id VARCHAR(8) NOT NULL,
  status VARCHAR(32) NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  latency_microseconds INTEGER,
  data_version VARCHAR(32),
  source_status VARCHAR(64),
  pass_fail VARCHAR(16),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS pipeline_exec_event_idx ON pipeline_executions(event_id);
CREATE INDEX IF NOT EXISTS pipeline_exec_stage_idx ON pipeline_executions(stage_id);
CREATE INDEX IF NOT EXISTS pipeline_exec_status_idx ON pipeline_executions(status);

-- ============================================================
-- 3. EARNINGS EVENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS earnings_events (
  id SERIAL PRIMARY KEY,
  ticker VARCHAR(16) NOT NULL,
  company_name VARCHAR(255),
  earnings_date TIMESTAMPTZ NOT NULL,
  earnings_time VARCHAR(16),
  expected_eps NUMERIC(12,4),
  actual_eps NUMERIC(12,4),
  expected_revenue NUMERIC(18,2),
  actual_revenue NUMERIC(18,2),
  surprise_type VARCHAR(16),
  beat_probability INTEGER,
  rpers INTEGER,
  implied_move NUMERIC(8,4),
  pre5d_return NUMERIC(8,4),
  pre10d_return NUMERIC(8,4),
  pre20d_return NUMERIC(8,4),
  decision_state decision_state NOT NULL DEFAULT 'EVENT_DETECTED',
  risk_status risk_status NOT NULL DEFAULT 'PENDING',
  authorized_qty INTEGER,
  event_vwap NUMERIC(12,4),
  price_reaction VARCHAR(16),
  volume_velocity VARCHAR(32),
  spread VARCHAR(16),
  fis NUMERIC(8,4),
  rcs NUMERIC(8,4),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS events_ticker_idx ON earnings_events(ticker);
CREATE INDEX IF NOT EXISTS events_date_idx ON earnings_events(earnings_date);
CREATE INDEX IF NOT EXISTS events_state_idx ON earnings_events(decision_state);
CREATE UNIQUE INDEX IF NOT EXISTS events_ticker_date_idx ON earnings_events(ticker, earnings_date);

-- ============================================================
-- 4. ORDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(32) NOT NULL UNIQUE,
  event_id INTEGER REFERENCES earnings_events(id),
  ticker VARCHAR(16) NOT NULL,
  side order_side NOT NULL,
  type order_type NOT NULL,
  qty INTEGER NOT NULL,
  limit_price NUMERIC(12,4),
  stop_price NUMERIC(12,4),
  submitted_price NUMERIC(12,4),
  avg_fill_price NUMERIC(12,4),
  filled_qty INTEGER NOT NULL DEFAULT 0,
  remaining_qty INTEGER NOT NULL,
  status order_status NOT NULL DEFAULT 'OPEN',
  broker VARCHAR(64) NOT NULL DEFAULT 'IBKR',
  strategy strategy_type NOT NULL,
  latency_ack INTEGER,
  latency_fill INTEGER,
  slippage_bps INTEGER,
  reject_reason TEXT,
  parent_order_id VARCHAR(32),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS orders_ticker_idx ON orders(ticker);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
CREATE INDEX IF NOT EXISTS orders_event_idx ON orders(event_id);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders(created_at);

-- ============================================================
-- 5. POSITIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS positions (
  id SERIAL PRIMARY KEY,
  ticker VARCHAR(16) NOT NULL,
  order_id VARCHAR(32) NOT NULL UNIQUE,
  event_id INTEGER REFERENCES earnings_events(id),
  strategy strategy_type NOT NULL,
  qty INTEGER NOT NULL,
  avg_fill_price NUMERIC(12,4) NOT NULL,
  current_price NUMERIC(12,4) NOT NULL,
  market_value NUMERIC(18,2) NOT NULL,
  unrealized_pnl NUMERIC(18,2) NOT NULL DEFAULT 0,
  unrealized_pct NUMERIC(8,4) NOT NULL DEFAULT 0,
  realized_pnl NUMERIC(18,2) NOT NULL DEFAULT 0,
  high_water_price NUMERIC(12,4),
  max_profit NUMERIC(18,2) NOT NULL DEFAULT 0,
  max_drawdown NUMERIC(18,2) NOT NULL DEFAULT 0,
  protection_state protection_state NOT NULL DEFAULT 'NO_PROTECTION',
  apma_state VARCHAR(64),
  authorized_qty INTEGER,
  entry_time TIMESTAMPTZ NOT NULL,
  exit_time TIMESTAMPTZ,
  is_open BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS positions_ticker_idx ON positions(ticker);
CREATE INDEX IF NOT EXISTS positions_open_idx ON positions(is_open);
CREATE INDEX IF NOT EXISTS positions_event_idx ON positions(event_id);

-- ============================================================
-- 6. RISK
-- ============================================================

CREATE TABLE IF NOT EXISTS risk_config (
  id SERIAL PRIMARY KEY,
  key VARCHAR(128) NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  category VARCHAR(64) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS risk_config_key_idx ON risk_config(key);

CREATE TABLE IF NOT EXISTS risk_exposure (
  id SERIAL PRIMARY KEY,
  date TIMESTAMPTZ NOT NULL,
  current_equity NUMERIC(18,2) NOT NULL,
  max_daily_loss NUMERIC(18,2) NOT NULL,
  remaining_daily_risk NUMERIC(18,2) NOT NULL,
  max_event_risk NUMERIC(18,2) NOT NULL,
  current_event_exposure NUMERIC(18,2) NOT NULL DEFAULT 0,
  single_name_exposure NUMERIC(18,2) NOT NULL DEFAULT 0,
  sector_exposure NUMERIC(18,2) NOT NULL DEFAULT 0,
  correlated_exposure NUMERIC(18,2) NOT NULL DEFAULT 0,
  gross_exposure NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_exposure NUMERIC(18,2) NOT NULL DEFAULT 0,
  open_orders_exposure NUMERIC(18,2) NOT NULL DEFAULT 0,
  gap_exposure NUMERIC(18,2) NOT NULL DEFAULT 0,
  authorized_qty INTEGER NOT NULL DEFAULT 0,
  current_qty INTEGER NOT NULL DEFAULT 0,
  remaining_authority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS risk_exposure_date_idx ON risk_exposure(date);

-- ============================================================
-- 7. LATENCY
-- ============================================================

CREATE TABLE IF NOT EXISTS latency_points (
  id SERIAL PRIMARY KEY,
  point_id VARCHAR(8) NOT NULL UNIQUE,
  label VARCHAR(128) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(32) NOT NULL,
  sequence_order INTEGER NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS latency_measurements (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL,
  point_id VARCHAR(8) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  latency_microseconds INTEGER,
  type VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS latency_event_idx ON latency_measurements(event_id);
CREATE INDEX IF NOT EXISTS latency_point_idx ON latency_measurements(point_id);

-- ============================================================
-- 8. DATA FEEDS
-- ============================================================

CREATE TABLE IF NOT EXISTS data_feeds (
  id SERIAL PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  source VARCHAR(128) NOT NULL,
  category VARCHAR(32) NOT NULL,
  type VARCHAR(64) NOT NULL,
  status data_feed_status NOT NULL DEFAULT 'CONNECTED',
  health data_feed_health NOT NULL DEFAULT 'HEALTHY',
  frequency VARCHAR(32),
  latency VARCHAR(32),
  last_message TIMESTAMPTZ,
  error_rate VARCHAR(16) NOT NULL DEFAULT '0.00%',
  config JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS feeds_name_idx ON data_feeds(name);
CREATE INDEX IF NOT EXISTS feeds_category_idx ON data_feeds(category);
CREATE INDEX IF NOT EXISTS feeds_status_idx ON data_feeds(status);
CREATE UNIQUE INDEX IF NOT EXISTS feeds_name_source_idx ON data_feeds(name, source);

-- ============================================================
-- 9. AUDIT & REPLAY
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_events (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(64) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  level audit_level NOT NULL,
  source VARCHAR(128) NOT NULL,
  type VARCHAR(64) NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_timestamp_idx ON audit_events(timestamp);
CREATE INDEX IF NOT EXISTS audit_level_idx ON audit_events(level);
CREATE INDEX IF NOT EXISTS audit_source_idx ON audit_events(source);
CREATE INDEX IF NOT EXISTS audit_event_id_idx ON audit_events(event_id);

CREATE TABLE IF NOT EXISTS event_snapshots (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL,
  snapshot_type VARCHAR(32) NOT NULL,
  snapshot_data JSONB NOT NULL,
  frozen_profile_version VARCHAR(32),
  strategy_contract VARCHAR(128),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS snapshot_event_idx ON event_snapshots(event_id);
CREATE INDEX IF NOT EXISTS snapshot_type_idx ON event_snapshots(snapshot_type);

-- ============================================================
-- 10. RESEARCH / PRE-EVENT METRICS
-- ============================================================

CREATE TABLE IF NOT EXISTS pre_event_metrics (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES earnings_events(id),
  beat_probability INTEGER,
  rpers INTEGER,
  expectation_burden VARCHAR(32),
  historical_positive_gap_rate INTEGER,
  beat_but_sell_rate INTEGER,
  implied_move NUMERIC(8,4),
  pre5d NUMERIC(8,4),
  pre10d NUMERIC(8,4),
  pre20d NUMERIC(8,4),
  valuation_state VARCHAR(32),
  peer_regime VARCHAR(32),
  sector_regime VARCHAR(32),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS pre_event_event_idx ON pre_event_metrics(event_id);

-- ============================================================
-- 11. FIS / RCS
-- ============================================================

CREATE TABLE IF NOT EXISTS fis_breakdown (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES earnings_events(id),
  eps_surprise NUMERIC(8,4),
  revenue_surprise NUMERIC(8,4),
  guidance_surprise NUMERIC(8,4),
  kpi_surprise NUMERIC(8,4),
  surprise_acceleration NUMERIC(8,4),
  expectation_burden VARCHAR(32),
  fis_total NUMERIC(8,4),
  threshold NUMERIC(8,4) NOT NULL DEFAULT 2.0,
  is_qualified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS fis_event_idx ON fis_breakdown(event_id);

CREATE TABLE IF NOT EXISTS reaction_metrics (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES earnings_events(id),
  price_change NUMERIC(8,4),
  price_velocity NUMERIC(12,6),
  price_acceleration NUMERIC(12,6),
  volume_per_sec INTEGER,
  dollar_volume_per_sec NUMERIC(18,2),
  relative_volume_velocity NUMERIC(8,4),
  trade_count_per_sec INTEGER,
  buy_sell_imbalance NUMERIC(8,4),
  bid_ask_imbalance NUMERIC(8,4),
  spread NUMERIC(12,4),
  spread_expansion NUMERIC(8,4),
  event_vwap NUMERIC(12,4),
  distance_from_vwap NUMERIC(8,4),
  high_water_mark NUMERIC(12,4),
  drawdown_from_hwm NUMERIC(8,4),
  large_print_frequency INTEGER,
  depth_imbalance NUMERIC(8,4),
  rcs NUMERIC(8,4),
  status VARCHAR(32),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS rcs_event_idx ON reaction_metrics(event_id);

-- ============================================================
-- 12. FINANCIALS
-- ============================================================

CREATE TABLE IF NOT EXISTS account_summary (
  id SERIAL PRIMARY KEY,
  date TIMESTAMPTZ NOT NULL,
  starting_equity NUMERIC(18,2) NOT NULL,
  current_equity NUMERIC(18,2) NOT NULL,
  cash NUMERIC(18,2) NOT NULL,
  buying_power NUMERIC(18,2) NOT NULL,
  gross_exposure NUMERIC(18,2) NOT NULL,
  net_exposure NUMERIC(18,2) NOT NULL,
  realized_pnl NUMERIC(18,2) NOT NULL DEFAULT 0,
  unrealized_pnl NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_pnl NUMERIC(18,2) NOT NULL DEFAULT 0,
  daily_return_pct NUMERIC(8,4),
  weekly_return_pct NUMERIC(8,4),
  monthly_return_pct NUMERIC(8,4),
  ytd_return_pct NUMERIC(8,4),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS account_date_idx ON account_summary(date);

CREATE TABLE IF NOT EXISTS order_financials (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(32) NOT NULL UNIQUE,
  ticker VARCHAR(16) NOT NULL,
  strategy strategy_type NOT NULL,
  event_id INTEGER,
  entry_time TIMESTAMPTZ,
  exit_time TIMESTAMPTZ,
  entry_price NUMERIC(12,4),
  exit_price NUMERIC(12,4),
  qty INTEGER NOT NULL,
  gross_pnl NUMERIC(18,2),
  fees NUMERIC(18,2) NOT NULL DEFAULT 0,
  slippage NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_pnl NUMERIC(18,2),
  return_pct NUMERIC(8,4),
  mfe NUMERIC(18,2),
  mae NUMERIC(18,2),
  hold_period VARCHAR(32),
  outcome VARCHAR(16),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS fin_order_id_idx ON order_financials(order_id);
CREATE INDEX IF NOT EXISTS fin_ticker_idx ON order_financials(ticker);

CREATE TABLE IF NOT EXISTS wins_per_order (
  id SERIAL PRIMARY KEY,
  period VARCHAR(32) NOT NULL,
  total_orders INTEGER NOT NULL DEFAULT 0,
  winning_orders INTEGER NOT NULL DEFAULT 0,
  losing_orders INTEGER NOT NULL DEFAULT 0,
  win_rate NUMERIC(6,2),
  average_win NUMERIC(18,2),
  average_loss NUMERIC(18,2),
  largest_win NUMERIC(18,2),
  largest_loss NUMERIC(18,2),
  median_win NUMERIC(18,2),
  median_loss NUMERIC(18,2),
  win_loss_ratio NUMERIC(8,4),
  profit_factor NUMERIC(8,4),
  expectancy_per_order NUMERIC(18,2),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS wpo_period_idx ON wins_per_order(period);

CREATE TABLE IF NOT EXISTS earnings_breakdown (
  id SERIAL PRIMARY KEY,
  period VARCHAR(32) NOT NULL,
  total_trades INTEGER NOT NULL DEFAULT 0,
  positive_reaction INTEGER NOT NULL DEFAULT 0,
  negative_reaction INTEGER NOT NULL DEFAULT 0,
  correct_predictions INTEGER NOT NULL DEFAULT 0,
  incorrect_predictions INTEGER NOT NULL DEFAULT 0,
  reaction_accuracy NUMERIC(6,2),
  gap_accuracy NUMERIC(6,2),
  avg_gap_captured NUMERIC(8,4),
  avg_profit_per_event NUMERIC(18,2),
  avg_loss_per_event NUMERIC(18,2),
  beat_positive INTEGER NOT NULL DEFAULT 0,
  beat_negative INTEGER NOT NULL DEFAULT 0,
  miss_positive INTEGER NOT NULL DEFAULT 0,
  miss_negative INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS eb_period_idx ON earnings_breakdown(period);

CREATE TABLE IF NOT EXISTS strategy_performance (
  id SERIAL PRIMARY KEY,
  period VARCHAR(32) NOT NULL,
  strategy strategy_type NOT NULL,
  trades INTEGER NOT NULL DEFAULT 0,
  win_rate NUMERIC(6,2),
  avg_return NUMERIC(8,4),
  net_pnl NUMERIC(18,2),
  profit_factor NUMERIC(8,4),
  mdd NUMERIC(8,4),
  sharpe NUMERIC(8,4),
  avg_hold VARCHAR(32),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS sp_period_strategy_idx ON strategy_performance(period, strategy);

CREATE TABLE IF NOT EXISTS ticker_performance (
  id SERIAL PRIMARY KEY,
  period VARCHAR(32) NOT NULL,
  ticker VARCHAR(16) NOT NULL,
  trades INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  win_rate NUMERIC(6,2),
  gross_pnl NUMERIC(18,2),
  net_pnl NUMERIC(18,2),
  avg_trade NUMERIC(18,2),
  best_trade NUMERIC(18,2),
  worst_trade NUMERIC(18,2),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS tp_period_ticker_idx ON ticker_performance(period, ticker);

CREATE TABLE IF NOT EXISTS sector_performance (
  id SERIAL PRIMARY KEY,
  period VARCHAR(32) NOT NULL,
  sector VARCHAR(64) NOT NULL,
  trades INTEGER NOT NULL DEFAULT 0,
  win_rate NUMERIC(6,2),
  pnl NUMERIC(18,2),
  avg_gap NUMERIC(8,4),
  avg_mfe NUMERIC(18,2),
  avg_mae NUMERIC(18,2),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS sp2_period_sector_idx ON sector_performance(period, sector);

CREATE TABLE IF NOT EXISTS regime_performance (
  id SERIAL PRIMARY KEY,
  period VARCHAR(32) NOT NULL,
  regime VARCHAR(64) NOT NULL,
  trades INTEGER NOT NULL DEFAULT 0,
  win_rate NUMERIC(6,2),
  avg_pnl NUMERIC(18,2),
  avg_gap NUMERIC(8,4),
  false_positive_rate NUMERIC(6,2),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS rp_period_regime_idx ON regime_performance(period, regime);

CREATE TABLE IF NOT EXISTS rpers_performance (
  id SERIAL PRIMARY KEY,
  period VARCHAR(32) NOT NULL,
  bucket VARCHAR(32) NOT NULL,
  predicted_prob NUMERIC(6,2),
  realized_rate NUMERIC(6,2),
  trades INTEGER NOT NULL DEFAULT 0,
  avg_pnl NUMERIC(18,2),
  avg_gap NUMERIC(8,4),
  mfe NUMERIC(18,2),
  mae NUMERIC(18,2),
  calibration_error NUMERIC(6,2),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS rpers_period_bucket_idx ON rpers_performance(period, bucket);

-- ============================================================
-- 13. POSITION AUTHORITY
-- ============================================================

CREATE TABLE IF NOT EXISTS position_authority (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES earnings_events(id),
  account_equity NUMERIC(18,2) NOT NULL,
  default_allocation_ceiling NUMERIC(6,4) NOT NULL,
  strategy_allocation_ceiling NUMERIC(6,4) NOT NULL,
  volatility_adjustment NUMERIC(6,4) NOT NULL,
  liquidity_adjustment NUMERIC(6,4) NOT NULL,
  spread_adjustment NUMERIC(6,4) NOT NULL,
  gap_risk_adjustment NUMERIC(6,4) NOT NULL,
  whole_share_adjustment NUMERIC(6,4) NOT NULL,
  authorized_qty INTEGER NOT NULL,
  max_capital NUMERIC(18,2) NOT NULL,
  max_loss NUMERIC(18,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS pa_event_idx ON position_authority(event_id);

-- ============================================================
-- 14. APMA
-- ============================================================

CREATE TABLE IF NOT EXISTS apma_config (
  id SERIAL PRIMARY KEY,
  action VARCHAR(64) NOT NULL,
  "desc" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  color VARCHAR(16) NOT NULL,
  "order" INTEGER NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS apma_state (
  id SERIAL PRIMARY KEY,
  ticker VARCHAR(16) NOT NULL,
  action_id INTEGER NOT NULL REFERENCES apma_config(id),
  status VARCHAR(32) NOT NULL,
  max_exposure NUMERIC(18,2),
  current_exposure NUMERIC(18,2),
  peak_exposure NUMERIC(18,2),
  low_water_mark NUMERIC(18,2),
  high_water_mark NUMERIC(18,2),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS apma_ticker_idx ON apma_state(ticker);

-- ============================================================
-- 15. DECISION STATES
-- ============================================================

CREATE TABLE IF NOT EXISTS decision_states (
  id SERIAL PRIMARY KEY,
  state_id VARCHAR(64) NOT NULL UNIQUE,
  label VARCHAR(128) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(64) NOT NULL,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  is_success BOOLEAN NOT NULL DEFAULT false,
  is_failure BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS state_transitions (
  id SERIAL PRIMARY KEY,
  from_state_id VARCHAR(64) NOT NULL,
  to_state_id VARCHAR(64) NOT NULL,
  condition TEXT NOT NULL,
  is_automatic BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS st_from_idx ON state_transitions(from_state_id);
CREATE INDEX IF NOT EXISTS st_to_idx ON state_transitions(to_state_id);

-- ============================================================
-- 16. INTEGRATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS integration_adapters (
  id SERIAL PRIMARY KEY,
  name VARCHAR(64) NOT NULL UNIQUE,
  display_name VARCHAR(128) NOT NULL,
  category VARCHAR(64) NOT NULL,
  description TEXT NOT NULL,
  status integration_status NOT NULL DEFAULT 'UNKNOWN',
  last_health_check TIMESTAMPTZ,
  latency_ms INTEGER,
  error_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  circuit_state circuit_state NOT NULL DEFAULT 'CLOSED',
  config_schema JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS ia_name_idx ON integration_adapters(name);
CREATE INDEX IF NOT EXISTS ia_status_idx ON integration_adapters(status);
CREATE INDEX IF NOT EXISTS ia_category_idx ON integration_adapters(category);

CREATE TABLE IF NOT EXISTS integration_credentials (
  id SERIAL PRIMARY KEY,
  adapter_id INTEGER NOT NULL REFERENCES integration_adapters(id),
  key_name VARCHAR(128) NOT NULL,
  key_value TEXT NOT NULL,
  is_encrypted BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS ic_adapter_idx ON integration_credentials(adapter_id);

-- ============================================================
-- 17. KILL SWITCH LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS kill_switch_log (
  id SERIAL PRIMARY KEY,
  action VARCHAR(32) NOT NULL,
  triggered_by VARCHAR(128) NOT NULL,
  reason TEXT,
  previous_state VARCHAR(32) NOT NULL,
  new_state VARCHAR(32) NOT NULL,
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS ks_action_idx ON kill_switch_log(action);
CREATE INDEX IF NOT EXISTS ks_created_idx ON kill_switch_log(created_at);

-- ============================================================
-- 18. SYSTEM HEALTH
-- ============================================================

CREATE TABLE IF NOT EXISTS system_health (
  id SERIAL PRIMARY KEY,
  component VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  latency_ms INTEGER,
  error_rate NUMERIC(6,4),
  message TEXT,
  checked_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS sh_component_idx ON system_health(component);
CREATE INDEX IF NOT EXISTS sh_status_idx ON system_health(status);
CREATE INDEX IF NOT EXISTS sh_checked_idx ON system_health(checked_at);

-- ============================================================
-- 19. USERS
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(320) NOT NULL UNIQUE,
  name VARCHAR(255),
  role VARCHAR(32) NOT NULL DEFAULT 'viewer',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

-- ============================================================
-- 20. DEPLOYMENT LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS deployment_log (
  id SERIAL PRIMARY KEY,
  environment VARCHAR(32) NOT NULL,
  version VARCHAR(32) NOT NULL,
  commit_hash VARCHAR(64),
  deployed_by VARCHAR(255),
  deployed_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(32) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS deploy_env_idx ON deployment_log(environment);
CREATE INDEX IF NOT EXISTS deploy_at_idx ON deployment_log(deployed_at);


SET search_path TO public;
