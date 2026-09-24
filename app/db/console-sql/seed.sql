-- Auto-wrapped for Requi platform (schema ac)
CREATE SCHEMA IF NOT EXISTS ac;
SET search_path TO ac, public;

-- ============================================================
-- seed.sql — Requi Auto v3 Initial Seed Data
-- Run via: psql $DATABASE_URL -f supabase/seed.sql
-- ============================================================

-- 1. Engine State
INSERT INTO engine_state (version, mode, status, kill_switch_armed, cycle_count, total_events, total_orders, total_positions, uptime_seconds)
VALUES ('3.2.1', 'PAPER', 'ARMED', true, 4821, 47, 89, 12, 86400)
ON CONFLICT DO NOTHING;

-- 2. Engine Config
INSERT INTO engine_config (key, value, description, category, is_secret) VALUES
('IBKR_ACCOUNT_ID', 'DU1234567', 'Interactive Brokers paper account ID', 'Broker', false),
('IBKR_GATEWAY_URL', 'https://localhost:5000', 'TWS/Gateway API endpoint', 'Broker', false),
('POLYGON_API_KEY', '', 'Polygon.io API key', 'Market Data', true),
('FINNHUB_API_KEY', '', 'Finnhub API key', 'Alternative Data', true),
('MASSIVE_API_KEY', '', 'Massive API key', 'Alternative Data', true),
('BENZINGA_API_KEY', '', 'Benzinga Pro API key', 'News', true),
('DATABENTO_API_KEY', '', 'Databento API key', 'Market Data', true),
('REQUI_DATA_URL', 'https://data.requi.trading', 'Requi internal data platform URL', 'Internal', false),
('MAX_DAILY_LOSS_PCT', '1.0', 'Maximum daily loss as % of equity', 'Risk', false),
('MAX_EVENT_RISK_PCT', '0.5', 'Maximum per-event risk as % of equity', 'Risk', false),
('ALLOCATION_CEILING_PCT', '5.0', 'Default position allocation ceiling %', 'Risk', false),
('FIS_THRESHOLD', '2.0', 'FIS qualification threshold', 'Strategy', false),
('MODE', 'PAPER', 'Engine operating mode', 'Engine', false),
('AUTO_TRADE_WINDOW_START', '04:00', 'Auto-trade window start time (ET)', 'Engine', false),
('AUTO_TRADE_WINDOW_END', '09:35', 'Auto-trade window end time (ET)', 'Engine', false)
ON CONFLICT (key) DO NOTHING;

-- 3. Pipeline Stages
INSERT INTO pipeline_stages (stage_id, name, description, sequence_order, sla_microseconds, is_critical) VALUES
('S1', 'S1: Raw Ingest', 'Ingest raw data from external feeds', 1, 5000, false),
('S2', 'S2: Validate', 'Validate data integrity and schema', 2, 2000, true),
('S3', 'S3: Transform', 'Transform and normalize data formats', 3, 3000, false),
('S4', 'S4: Enrich', 'Enrich with derived metrics and signals', 4, 5000, false),
('S5', 'S5: Score', 'Run FIS/RCS scoring models', 5, 8000, true),
('S6', 'S6: Persist', 'Persist to database and emit events', 6, 3000, true)
ON CONFLICT (stage_id) DO NOTHING;

-- 4. Latency Points
INSERT INTO latency_points (point_id, label, description, category, sequence_order, is_internal) VALUES
('T0', 'T0: Event Detection', 'Earnings event detected', 'Detection', 0, true),
('T1', 'T1: Raw Ingest Complete', 'All raw data ingested', 'Ingest', 1, true),
('T2', 'T2: Validation Pass', 'Data validation complete', 'Validation', 2, true),
('T3', 'T3: Transform Complete', 'Data transformation complete', 'Transform', 3, true),
('T4', 'T4: Enrichment Complete', 'Data enrichment complete', 'Enrich', 4, true),
('T5', 'T5: FIS Calculated', 'FIS score computed', 'Score', 5, true),
('T6', 'T6: Pre-Event Position Check', 'Pre-event position authority verified', 'Decision', 6, true),
('T7', 'T7: RCS Calculated', 'RCS score computed', 'Score', 7, true),
('T8', 'T8: Event Position Check', 'Event position authority verified', 'Decision', 8, true),
('T9', 'T9: Order Ready', 'Order parameters finalized', 'Decision', 9, true),
('T10', 'T10: Order Submitted', 'Order sent to broker', 'Execution', 10, false),
('T11', 'T11: Broker Ack', 'Broker acknowledged order', 'Execution', 11, false),
('T12', 'T12: Fill Confirm', 'Order fill confirmed', 'Execution', 12, false)
ON CONFLICT (point_id) DO NOTHING;

-- 5. Decision States
INSERT INTO decision_states (state_id, label, description, category, is_terminal, is_success, is_failure) VALUES
('EVENT_DETECTED', 'Event Detected', 'Earnings event has been detected', 'Detection', false, false, false),
('RESEARCH_COMPLETE', 'Research Complete', 'Pre-event research metrics available', 'Research', false, false, false),
('FIS_QUALIFIED', 'FIS Qualified', 'Fundamental impact score exceeds threshold', 'Filter', false, false, false),
('FIS_DISQUALIFIED', 'FIS Disqualified', 'Fundamental impact score below threshold', 'Filter', true, false, true),
('PRE_EVENT_POSITION_OK', 'Pre-Event Position OK', 'Pre-event position authority passed', 'Authority', false, false, false),
('RCS_QUALIFIED', 'RCS Qualified', 'Reaction confirmation score exceeds threshold', 'Filter', false, false, false),
('RCS_DISQUALIFIED', 'RCS Disqualified', 'Reaction confirmation score below threshold', 'Filter', true, false, true),
('EVENT_POSITION_OK', 'Event Position OK', 'Event position authority passed', 'Authority', false, false, false),
('ORDER_READY', 'Order Ready', 'Order parameters finalized and ready', 'Decision', false, false, false),
('REACTION_CONFIRMED', 'Reaction Confirmed', 'Price action confirms entry signal', 'Decision', false, true, false),
('NO_ACTION', 'No Action', 'Event did not qualify for any action', 'Terminal', true, false, false),
('WAITING', 'Waiting', 'Engine is waiting for next condition', 'Wait', false, false, false),
('ORDER_SUBMITTED', 'Order Submitted', 'Order has been submitted to broker', 'Execution', false, false, false),
('ORDER_FILLED', 'Order Filled', 'Order has been completely filled', 'Execution', true, true, false),
('ORDER_PARTIAL', 'Order Partial Fill', 'Order has been partially filled', 'Execution', false, false, false),
('ORDER_REJECTED', 'Order Rejected', 'Order was rejected by broker', 'Execution', true, false, true),
('POSITION_OPEN', 'Position Open', 'Position has been opened', 'Position', false, false, false),
('POSITION_HOLDING', 'Position Holding', 'Position is being held with APMA', 'Position', false, false, false),
('POSITION_EXITING', 'Position Exiting', 'Position is being exited', 'Position', false, false, false),
('POSITION_CLOSED', 'Position Closed', 'Position has been closed', 'Position', true, true, false)
ON CONFLICT (state_id) DO NOTHING;

-- 6. Data Feeds
INSERT INTO data_feeds (name, source, category, type, status, health, frequency, latency, last_message, error_rate) VALUES
('Earnings Calendar', 'Polygon', 'Research', 'Calendar API', 'CONNECTED', 'HEALTHY', 'Daily', '<100ms', now(), '0.00%'),
('Fundamentals', 'Polygon', 'Research', 'REST API', 'CONNECTED', 'HEALTHY', 'On-demand', '<200ms', now(), '0.00%'),
('Ownership Data', 'Finnhub', 'Research', 'REST API', 'CONNECTED', 'HEALTHY', 'Quarterly', '<500ms', now(), '0.00%'),
('Consumer Velocity', 'Massive', 'Research', 'REST API', 'CONNECTED', 'HEALTHY', 'Weekly', '<1s', now(), '0.00%'),
('Analyst Ratings', 'Benzinga', 'Research', 'REST API', 'CONNECTED', 'HEALTHY', 'Real-time', '<300ms', now(), '0.00%'),
('News Feed', 'Benzinga', 'Research', 'WebSocket', 'CONNECTED', 'HEALTHY', 'Real-time', '<100ms', now(), '0.00%'),
('Price Quotes', 'Polygon', 'Hot-Path', 'WebSocket', 'CONNECTED', 'HEALTHY', 'Real-time', '<10ms', now(), '0.00%'),
('Trade Prints', 'Polygon', 'Hot-Path', 'WebSocket', 'CONNECTED', 'HEALTHY', 'Real-time', '<10ms', now(), '0.00%'),
('Level 2 Book', 'Polygon', 'Hot-Path', 'WebSocket', 'CONNECTED', 'HEALTHY', 'Real-time', '<20ms', now(), '0.00%'),
('Volume Analytics', 'Polygon', 'Hot-Path', 'WebSocket', 'CONNECTED', 'HEALTHY', 'Real-time', '<50ms', now(), '0.00%'),
('RPERS Scores', 'Requi Data', 'Hot-Path', 'Internal API', 'CONNECTED', 'HEALTHY', 'Real-time', '<5ms', now(), '0.00%'),
('FIS Engine', 'Requi Data', 'Hot-Path', 'Internal API', 'CONNECTED', 'HEALTHY', 'Real-time', '<5ms', now(), '0.00%'),
('RCS Engine', 'Requi Data', 'Hot-Path', 'Internal API', 'CONNECTED', 'HEALTHY', 'Real-time', '<5ms', now(), '0.00%'),
('Historical Bars', 'Databento', 'Hot-Path', 'REST API', 'CONNECTED', 'HEALTHY', 'On-demand', '<100ms', now(), '0.00%'),
('Order Entry', 'IBKR', 'Execution', 'TWS API', 'CONNECTED', 'HEALTHY', 'Real-time', '<5ms', now(), '0.00%'),
('Order Status', 'IBKR', 'Execution', 'TWS API', 'CONNECTED', 'HEALTHY', 'Real-time', '<5ms', now(), '0.00%'),
('Portfolio Updates', 'IBKR', 'Execution', 'TWS API', 'CONNECTED', 'HEALTHY', 'Real-time', '<10ms', now(), '0.00%'),
('Account Summary', 'IBKR', 'Execution', 'TWS API', 'CONNECTED', 'HEALTHY', 'Real-time', '<10ms', now(), '0.00%'),
('Position Updates', 'IBKR', 'Execution', 'TWS API', 'CONNECTED', 'HEALTHY', 'Real-time', '<10ms', now(), '0.00%'),
('P&L Updates', 'IBKR', 'Execution', 'TWS API', 'CONNECTED', 'HEALTHY', 'Real-time', '<10ms', now(), '0.00%')
ON CONFLICT (name, source) DO NOTHING;

-- 7. Risk Config
INSERT INTO risk_config (key, value, description, category) VALUES
('max_daily_loss_pct', '1.0', 'Maximum daily loss as percentage of equity', 'Daily Limit'),
('max_event_risk_pct', '0.5', 'Maximum per-event risk as percentage of equity', 'Event Limit'),
('allocation_ceiling_pct', '5.0', 'Default position allocation ceiling percentage', 'Position'),
('max_single_name_pct', '5.0', 'Maximum single name exposure percentage', 'Concentration'),
('max_sector_pct', '15.0', 'Maximum sector exposure percentage', 'Concentration'),
('max_correlated_pct', '20.0', 'Maximum correlated exposure percentage', 'Concentration'),
('max_gross_exposure_pct', '100.0', 'Maximum gross exposure percentage', 'Leverage'),
('max_net_exposure_pct', '50.0', 'Maximum net exposure percentage', 'Leverage'),
('max_open_orders_pct', '25.0', 'Maximum open orders exposure percentage', 'Orders'),
('volatility_adj_threshold', '30.0', 'Implied move threshold for volatility adjustment', 'Adjustment'),
('liquidity_adj_threshold', '1000000', 'Minimum daily volume for no liquidity discount', 'Adjustment'),
('spread_adj_threshold', '0.005', 'Maximum spread percentage before adjustment', 'Adjustment')
ON CONFLICT (key) DO NOTHING;

-- 8. APMA Config
INSERT INTO apma_config (action, "desc", "trigger", color, "order", is_enabled) VALUES
('Auto-Trail', 'Trailing stop activates after +$0.50 unrealized', 'Unrealized P&L >= $0.50', 'green', 1, true),
('Breakeven', 'Stop moves to breakeven after +$0.25 unrealized', 'Unrealized P&L >= $0.25', 'green', 2, true),
('Time-Decay Exit', 'Flat exit if position held > 5 minutes without progress', 'Hold time > 5min AND price flat', 'orange', 3, true),
('Hard Stop', 'Immediate exit at -$0.50 loss', 'Unrealized P&L <= -$0.50', 'red', 4, true),
('Profit Target', 'Scale out 50% at +$1.00, remainder at +$2.00', 'Unrealized P&L >= $1.00', 'green', 5, true),
('Volatility Expansion', 'Widen stops if VIX spikes > 30%', 'VIX > 30 AND in position', 'orange', 6, true),
('Correlation Hedge', 'Reduce size if sector correlation > 0.8', 'Sector correlation > 0.8', 'orange', 7, true),
('Earnings Overrun', 'Force exit if held through next earnings', 'Next earnings < 48h', 'red', 8, true)
ON CONFLICT DO NOTHING;

-- 9. Integration Adapters
INSERT INTO integration_adapters (name, display_name, category, description, status, circuit_state) VALUES
('ibkr', 'Interactive Brokers', 'Broker', 'Order execution, portfolio, and account data via TWS/Gateway API', 'HEALTHY', 'CLOSED'),
('polygon', 'Polygon.io', 'Market Data', 'Real-time & historical equities, options, forex, crypto data', 'HEALTHY', 'CLOSED'),
('finnhub', 'Finnhub', 'Alternative Data', 'Earnings calendar, sentiment, insider transactions, ownership', 'HEALTHY', 'CLOSED'),
('massive', 'Massive', 'Alternative Data', 'Consumer transaction data, foot traffic, web traffic, app engagement', 'HEALTHY', 'CLOSED'),
('benzinga', 'Benzinga Pro', 'News & Analytics', 'Real-time news feed, analyst ratings, earnings whisper, options activity', 'HEALTHY', 'CLOSED'),
('sec_edgar', 'SEC EDGAR', 'Regulatory', '10-K, 10-Q, 8-K filings, insider transactions, institutional ownership', 'HEALTHY', 'CLOSED'),
('gdelt', 'GDELT Project', 'Macro & Geopolitical', 'Global news sentiment, geopolitical event database, social tension indices', 'HEALTHY', 'CLOSED'),
('yahoo_finance', 'Yahoo Finance', 'Market Data', 'Historical prices, fundamentals, analyst estimates, options chain', 'HEALTHY', 'CLOSED'),
('databento', 'Databento', 'Market Data', 'Historical & real-time L1/L2 market data, OHLCV bars, order book snapshots', 'HEALTHY', 'CLOSED'),
('requi_data', 'Requi Data Platform', 'Internal', 'Internal ML/AI platform: RPERS models, FIS/RCS scoring, regime classification', 'HEALTHY', 'CLOSED')
ON CONFLICT (name) DO NOTHING;

-- 10. System Health
INSERT INTO system_health (component, status, latency_ms, error_rate, message, checked_at) VALUES
('Database', 'HEALTHY', 2, 0.0000, 'PostgreSQL connection pool healthy', now()),
('IBKR Gateway', 'HEALTHY', 5, 0.0000, 'TWS API connected', now()),
('Polygon WebSocket', 'HEALTHY', 8, 0.0000, 'Real-time feed active', now()),
('Requi Data Platform', 'HEALTHY', 3, 0.0000, 'ML models responsive', now()),
('Event Processor', 'HEALTHY', 12, 0.0000, 'S1-S6 pipeline running', now()),
('Risk Engine', 'HEALTHY', 1, 0.0000, 'All limits within bounds', now()),
('Order Router', 'HEALTHY', 4, 0.0000, 'Order submission queue normal', now()),
('Audit Logger', 'HEALTHY', 1, 0.0000, 'Audit events persisting', now())
ON CONFLICT DO NOTHING;

-- 11. Users
INSERT INTO users (email, name, role, is_active) VALUES
('admin@requi.trading', 'System Administrator', 'admin', true),
('operator@requi.trading', 'Trading Operator', 'operator', true),
('viewer@requi.trading', 'Read-Only Viewer', 'viewer', true)
ON CONFLICT (email) DO NOTHING;


SET search_path TO public;
