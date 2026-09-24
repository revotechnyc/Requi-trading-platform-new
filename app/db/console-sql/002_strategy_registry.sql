-- Auto-wrapped for Requi platform (schema ac)
CREATE SCHEMA IF NOT EXISTS ac;
SET search_path TO ac, public;

-- Strategy registry required by 003_user_configuration FKs
CREATE TABLE IF NOT EXISTS strategies (
  id SERIAL PRIMARY KEY,
  strategy_id VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  category VARCHAR(64) NOT NULL,
  description TEXT NOT NULL,
  version VARCHAR(16) NOT NULL DEFAULT '1.0.0',
  status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  is_active BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  priority INTEGER NOT NULL DEFAULT 0,
  author VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS strategies_id_idx ON strategies(strategy_id);
CREATE INDEX IF NOT EXISTS strategies_status_idx ON strategies(status);
CREATE INDEX IF NOT EXISTS strategies_active_idx ON strategies(is_active);

CREATE TABLE IF NOT EXISTS strategy_versions (
  id SERIAL PRIMARY KEY,
  strategy_id INTEGER NOT NULL REFERENCES strategies(id),
  version VARCHAR(16) NOT NULL,
  change_log TEXT,
  contract_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_live BOOLEAN NOT NULL DEFAULT false,
  deployed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sv_strategy_idx ON strategy_versions(strategy_id);

INSERT INTO strategies (strategy_id, name, display_name, category, description, version, status, is_active, is_default, priority)
VALUES
  ('PEM', 'Post-Earnings Momentum', 'Post-Earnings Momentum', 'EARNINGS', 'Ride post-print momentum when FIS/RCS qualify', '1.0.0', 'ACTIVE', true, true, 1),
  ('GC', 'Gap Continuation', 'Gap Continuation', 'EARNINGS', 'Continue opening gap with volume confirmation', '1.0.0', 'ACTIVE', true, false, 2),
  ('FTM', 'Fade the Move', 'Fade the Move', 'EARNINGS', 'Fade overextended earnings reactions', '1.0.0', 'ACTIVE', true, false, 3),
  ('CR', 'Contrarian Reversal', 'Contrarian Reversal', 'EARNINGS', 'Mean-reversion after failed continuation', '1.0.0', 'PAUSED', false, false, 4)
ON CONFLICT (strategy_id) DO NOTHING;

-- Minimal overview financials so getOverviewStats is non-empty
INSERT INTO account_summary (date, starting_equity, current_equity, cash, buying_power, gross_exposure, net_exposure, realized_pnl, unrealized_pnl, total_pnl, daily_return_pct)
SELECT CURRENT_DATE, 250000, 284750.50, 264980, 500000, 19770.50, 19770.50, 8240.50, 675.30, 8915.80, 0.42
WHERE NOT EXISTS (SELECT 1 FROM account_summary LIMIT 1);

SET search_path TO public;
