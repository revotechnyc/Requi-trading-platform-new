-- Auto-wrapped for Requi platform (schema ac)
CREATE SCHEMA IF NOT EXISTS ac;
SET search_path TO ac, public;

-- ============================================================
-- MIGRATION: User-Controlled Settings + Configuration System
-- Tables: 30-37 + Views
-- ============================================================

-- ============================================================
-- 30. USER SETTINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS user_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  account_id INTEGER REFERENCES users(id),
  setting_group VARCHAR(64) NOT NULL,
  setting_key VARCHAR(128) NOT NULL,
  value JSONB,
  default_value JSONB,
  source VARCHAR(32) NOT NULL DEFAULT 'USER',
  editable BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  UNIQUE(user_id, account_id, setting_group, setting_key)
);

CREATE INDEX IF NOT EXISTS us_user_idx ON user_settings(user_id);
CREATE INDEX IF NOT EXISTS us_group_idx ON user_settings(setting_group);

-- ============================================================
-- 31. RISK PROFILES
-- ============================================================

CREATE TABLE IF NOT EXISTS risk_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  account_id INTEGER NOT NULL,
  profile_name VARCHAR(64) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  max_daily_loss NUMERIC(18,2),
  max_daily_loss_type VARCHAR(16) DEFAULT 'USD',
  max_event_risk NUMERIC(18,2),
  max_event_risk_type VARCHAR(16) DEFAULT 'USD',
  max_single_name_exposure NUMERIC(6,2),
  max_sector_exposure NUMERIC(6,2),
  max_gross_exposure NUMERIC(6,2),
  max_net_exposure NUMERIC(6,2),
  max_correlated_exposure NUMERIC(6,2),
  halt_on_consecutive_losses INTEGER DEFAULT 3,
  max_open_positions INTEGER,
  max_open_orders INTEGER,
  max_daily_trades INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS rp_user_idx ON risk_profiles(user_id);
CREATE INDEX IF NOT EXISTS rp_account_idx ON risk_profiles(account_id);
CREATE INDEX IF NOT EXISTS rp_active_idx ON risk_profiles(is_active);

-- ============================================================
-- 32. RISK PROFILE VERSIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS risk_profile_versions (
  id SERIAL PRIMARY KEY,
  risk_profile_id INTEGER NOT NULL REFERENCES risk_profiles(id),
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  change_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS rpv_profile_idx ON risk_profile_versions(risk_profile_id);
CREATE INDEX IF NOT EXISTS rpv_version_idx ON risk_profile_versions(version);

-- ============================================================
-- 33. STRATEGY USER PREFERENCES
-- ============================================================

CREATE TABLE IF NOT EXISTS strategy_user_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  account_id INTEGER NOT NULL,
  strategy_id INTEGER NOT NULL REFERENCES strategies(id),
  enabled BOOLEAN NOT NULL DEFAULT true,
  preferred BOOLEAN NOT NULL DEFAULT false,
  selection_priority INTEGER NOT NULL DEFAULT 0,
  max_allocation NUMERIC(18,2),
  max_event_risk NUMERIC(18,2),
  max_concurrent_positions INTEGER,
  allowed_sessions JSONB,
  settings JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, account_id, strategy_id)
);

CREATE INDEX IF NOT EXISTS sup_user_idx ON strategy_user_preferences(user_id);
CREATE INDEX IF NOT EXISTS sup_strategy_idx ON strategy_user_preferences(strategy_id);
CREATE INDEX IF NOT EXISTS sup_enabled_idx ON strategy_user_preferences(enabled);

-- ============================================================
-- 34. STRATEGY SELECTION PROFILES
-- ============================================================

CREATE TABLE IF NOT EXISTS strategy_selection_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  account_id INTEGER NOT NULL,
  selection_mode VARCHAR(32) NOT NULL DEFAULT 'AUTO',
  locked_strategy_id INTEGER REFERENCES strategies(id),
  preferred_strategy_ids JSONB,
  allow_router_fallback BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, account_id)
);

CREATE INDEX IF NOT EXISTS ssp_user_idx ON strategy_selection_profiles(user_id);
CREATE INDEX IF NOT EXISTS ssp_mode_idx ON strategy_selection_profiles(selection_mode);

-- ============================================================
-- 35. PROTECTION PROFILES
-- ============================================================

CREATE TABLE IF NOT EXISTS protection_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  account_id INTEGER NOT NULL,
  strategy_id INTEGER REFERENCES strategies(id),
  profile_name VARCHAR(64) DEFAULT 'Default',
  is_active BOOLEAN NOT NULL DEFAULT true,
  synthetic_stop_enabled BOOLEAN NOT NULL DEFAULT true,
  synthetic_trail_enabled BOOLEAN NOT NULL DEFAULT false,
  initial_stop_type VARCHAR(32) DEFAULT 'PERCENTAGE',
  initial_stop_value NUMERIC(10,4),
  trail_type VARCHAR(32) DEFAULT 'PERCENTAGE',
  trail_value NUMERIC(10,4),
  atr_multiplier NUMERIC(6,2),
  spread_floor_multiplier NUMERIC(6,2),
  minimum_protection_distance NUMERIC(10,4),
  reprice_enabled BOOLEAN NOT NULL DEFAULT false,
  reprice_interval_ms INTEGER,
  max_reprice_attempts INTEGER,
  apma_enabled BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_by INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS pp_user_idx ON protection_profiles(user_id);
CREATE INDEX IF NOT EXISTS pp_account_idx ON protection_profiles(account_id);
CREATE INDEX IF NOT EXISTS pp_strategy_idx ON protection_profiles(strategy_id);
CREATE INDEX IF NOT EXISTS pp_active_idx ON protection_profiles(is_active);

-- ============================================================
-- 36. CONFIGURATION EVENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS configuration_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  account_id INTEGER,
  configuration_type VARCHAR(64) NOT NULL,
  configuration_id INTEGER,
  setting_key VARCHAR(128) NOT NULL,
  old_value JSONB,
  new_value JSONB,
  source VARCHAR(32) NOT NULL DEFAULT 'UI',
  status VARCHAR(32) NOT NULL DEFAULT 'REQUESTED',
  reason TEXT,
  timestamp TIMESTAMPTZ DEFAULT now() NOT NULL,
  runtime_applied_at TIMESTAMPTZ,
  runtime_version VARCHAR(32)
);

CREATE INDEX IF NOT EXISTS ce_user_idx ON configuration_events(user_id);
CREATE INDEX IF NOT EXISTS ce_type_idx ON configuration_events(configuration_type);
CREATE INDEX IF NOT EXISTS ce_status_idx ON configuration_events(status);
CREATE INDEX IF NOT EXISTS ce_timestamp_idx ON configuration_events(timestamp);

-- ============================================================
-- 37. USER PERMISSIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS user_permissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  role VARCHAR(32) NOT NULL DEFAULT 'VIEWER',
  scope VARCHAR(64) NOT NULL DEFAULT 'GLOBAL',
  resource_type VARCHAR(64),
  resource_id INTEGER,
  permissions JSONB,
  granted_by INTEGER REFERENCES users(id),
  granted_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS up_user_idx ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS up_role_idx ON user_permissions(role);
CREATE INDEX IF NOT EXISTS up_scope_idx ON user_permissions(scope);

-- ============================================================
-- EFFECTIVE CONFIGURATION VIEWS
-- ============================================================

CREATE OR REPLACE VIEW v_active_risk_profile AS
SELECT rp.*, u.email as user_email
FROM risk_profiles rp
LEFT JOIN users u ON rp.user_id = u.id
WHERE rp.is_active = true;

CREATE OR REPLACE VIEW v_user_strategy_preferences AS
SELECT 
  sup.*,
  s.strategy_id as strategy_code,
  s.name as strategy_name,
  s.display_name as strategy_display_name,
  s.status as strategy_status,
  s.version as strategy_version
FROM strategy_user_preferences sup
JOIN strategies s ON sup.strategy_id = s.id;

CREATE OR REPLACE VIEW v_effective_strategy_settings AS
SELECT 
  s.id as strategy_id,
  s.strategy_id as strategy_code,
  s.name as strategy_name,
  sp.selection_mode,
  sp.locked_strategy_id,
  sp.preferred_strategy_ids,
  sup.enabled as user_enabled,
  sup.preferred as user_preferred,
  sup.selection_priority,
  sup.max_allocation as user_max_allocation,
  sup.max_event_risk as user_max_event_risk,
  sup.max_concurrent_positions as user_max_concurrent_positions,
  COALESCE(sup.settings, '{}'::jsonb) as user_settings
FROM strategies s
LEFT JOIN strategy_user_preferences sup ON s.id = sup.strategy_id
LEFT JOIN strategy_selection_profiles sp ON sup.user_id = sp.user_id AND sup.account_id = sp.account_id;

CREATE OR REPLACE VIEW v_effective_risk_limits AS
SELECT 
  rp.id as profile_id,
  rp.user_id,
  rp.account_id,
  rp.profile_name,
  rp.max_daily_loss,
  rp.max_daily_loss_type,
  rp.max_event_risk,
  rp.max_event_risk_type,
  rp.max_single_name_exposure,
  rp.max_sector_exposure,
  rp.max_gross_exposure,
  rp.max_net_exposure,
  rp.max_correlated_exposure,
  rp.halt_on_consecutive_losses,
  rp.max_open_positions,
  rp.max_open_orders,
  rp.max_daily_trades,
  rp.version,
  rp.is_active,
  u.email as user_email
FROM risk_profiles rp
LEFT JOIN users u ON rp.user_id = u.id
WHERE rp.is_active = true;

CREATE OR REPLACE VIEW v_effective_protection_profile AS
SELECT 
  pp.*,
  s.name as strategy_name,
  s.strategy_id as strategy_code,
  u.email as user_email
FROM protection_profiles pp
LEFT JOIN strategies s ON pp.strategy_id = s.id
LEFT JOIN users u ON pp.user_id = u.id
WHERE pp.is_active = true;

CREATE OR REPLACE VIEW v_strategy_dropdown AS
SELECT 
  s.id,
  s.strategy_id,
  s.name,
  s.display_name,
  s.category,
  s.status,
  s.version,
  s.is_active,
  s.is_default,
  -- strategy_versions has contract_definition/is_live, not contract_version/validation_status
  COALESCE(sv.contract_definition->>'version', sv.version) AS contract_version,
  CASE
    WHEN sv.is_live THEN 'VALIDATED'
    WHEN sv.id IS NOT NULL THEN 'DRAFT'
    ELSE NULL
  END AS validation_status,
  CASE 
    WHEN s.status = 'LIVE' THEN 'PRODUCTION'
    WHEN s.status = 'PAPER' THEN 'PAPER'
    WHEN s.status = 'BACKTEST' THEN 'BACKTEST'
    ELSE s.status
  END as mode
FROM strategies s
LEFT JOIN strategy_versions sv ON s.id = sv.strategy_id AND s.version = sv.version
WHERE s.is_active = true
ORDER BY s.priority DESC, s.name ASC;

CREATE OR REPLACE VIEW v_configuration_history AS
SELECT 
  ce.*,
  u.email as user_email,
  CASE 
    WHEN ce.status = 'REQUESTED' THEN 'PENDING'
    WHEN ce.status = 'VALIDATED' THEN 'PENDING'
    WHEN ce.status = 'APPLIED' THEN 'ACTIVE'
    WHEN ce.status = 'REJECTED' THEN 'REVERTED'
    WHEN ce.status = 'ROLLED_BACK' THEN 'REVERTED'
    ELSE ce.status
  END as ui_status
FROM configuration_events ce
LEFT JOIN users u ON ce.user_id = u.id
ORDER BY ce.timestamp DESC;

CREATE OR REPLACE VIEW v_runtime_configuration AS
SELECT 
  'RISK' as config_category,
  rp.profile_name as config_name,
  jsonb_build_object(
    'max_daily_loss', rp.max_daily_loss,
    'max_event_risk', rp.max_event_risk,
    'max_single_name_exposure', rp.max_single_name_exposure,
    'max_sector_exposure', rp.max_sector_exposure,
    'max_gross_exposure', rp.max_gross_exposure,
    'max_net_exposure', rp.max_net_exposure,
    'max_correlated_exposure', rp.max_correlated_exposure,
    'halt_on_consecutive_losses', rp.halt_on_consecutive_losses
  ) as config_value,
  rp.version,
  rp.updated_at as last_updated
FROM risk_profiles rp
WHERE rp.is_active = true

UNION ALL

SELECT 
  'STRATEGY_SELECTION' as config_category,
  ssp.selection_mode as config_name,
  jsonb_build_object(
    'selection_mode', ssp.selection_mode,
    'locked_strategy_id', ssp.locked_strategy_id,
    'preferred_strategy_ids', ssp.preferred_strategy_ids,
    'allow_router_fallback', ssp.allow_router_fallback
  ) as config_value,
  ssp.version,
  ssp.updated_at as last_updated
FROM strategy_selection_profiles ssp

UNION ALL

SELECT 
  'PROTECTION' as config_category,
  COALESCE(pp.profile_name, 'Default') as config_name,
  jsonb_build_object(
    'synthetic_stop_enabled', pp.synthetic_stop_enabled,
    'synthetic_trail_enabled', pp.synthetic_trail_enabled,
    'initial_stop_type', pp.initial_stop_type,
    'initial_stop_value', pp.initial_stop_value,
    'trail_type', pp.trail_type,
    'trail_value', pp.trail_value,
    'apma_enabled', pp.apma_enabled
  ) as config_value,
  pp.version,
  pp.updated_at as last_updated
FROM protection_profiles pp
WHERE pp.is_active = true;

-- ============================================================
-- SEED DATA FOR CONFIGURATION SYSTEM
-- ============================================================

-- Seed user required by FK seed rows (idempotent)
INSERT INTO users (email, name, role)
VALUES ('console-seed@requi.local', 'Console Seed', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Seed default risk profile
INSERT INTO risk_profiles (user_id, account_id, profile_name, is_active, max_daily_loss, max_daily_loss_type, max_event_risk, max_event_risk_type, max_single_name_exposure, max_sector_exposure, max_gross_exposure, max_net_exposure, max_correlated_exposure, halt_on_consecutive_losses, max_open_positions, max_open_orders, max_daily_trades, version)
SELECT id, id, 'BALANCED', true, 5000, 'USD', 2500, 'USD', 10.0, 25.0, 100.0, 100.0, 20.0, 3, 10, 20, 50, 1
FROM users WHERE email = 'console-seed@requi.local'
AND NOT EXISTS (
  SELECT 1 FROM risk_profiles rp
  JOIN users u ON rp.user_id = u.id
  WHERE u.email = 'console-seed@requi.local' AND rp.profile_name = 'BALANCED'
);

-- Seed conservative profile
INSERT INTO risk_profiles (user_id, account_id, profile_name, is_active, max_daily_loss, max_daily_loss_type, max_event_risk, max_event_risk_type, max_single_name_exposure, max_sector_exposure, max_gross_exposure, max_net_exposure, max_correlated_exposure, halt_on_consecutive_losses, max_open_positions, max_open_orders, max_daily_trades, version)
SELECT id, id, 'CONSERVATIVE', false, 2500, 'USD', 1000, 'USD', 5.0, 15.0, 50.0, 50.0, 10.0, 2, 5, 10, 20, 1
FROM users WHERE email = 'console-seed@requi.local'
AND NOT EXISTS (
  SELECT 1 FROM risk_profiles rp
  JOIN users u ON rp.user_id = u.id
  WHERE u.email = 'console-seed@requi.local' AND rp.profile_name = 'CONSERVATIVE'
);

-- Seed aggressive profile
INSERT INTO risk_profiles (user_id, account_id, profile_name, is_active, max_daily_loss, max_daily_loss_type, max_event_risk, max_event_risk_type, max_single_name_exposure, max_sector_exposure, max_gross_exposure, max_net_exposure, max_correlated_exposure, halt_on_consecutive_losses, max_open_positions, max_open_orders, max_daily_trades, version)
SELECT id, id, 'AGGRESSIVE', false, 10000, 'USD', 5000, 'USD', 20.0, 40.0, 150.0, 150.0, 35.0, 5, 20, 40, 100, 1
FROM users WHERE email = 'console-seed@requi.local'
AND NOT EXISTS (
  SELECT 1 FROM risk_profiles rp
  JOIN users u ON rp.user_id = u.id
  WHERE u.email = 'console-seed@requi.local' AND rp.profile_name = 'AGGRESSIVE'
);

-- Seed default strategy selection profile
INSERT INTO strategy_selection_profiles (user_id, account_id, selection_mode, allow_router_fallback, version)
SELECT id, id, 'AUTO', true, 1
FROM users WHERE email = 'console-seed@requi.local'
AND NOT EXISTS (
  SELECT 1 FROM strategy_selection_profiles ssp
  JOIN users u ON ssp.user_id = u.id
  WHERE u.email = 'console-seed@requi.local'
);

-- Seed default protection profile
INSERT INTO protection_profiles (user_id, account_id, synthetic_stop_enabled, synthetic_trail_enabled, initial_stop_type, initial_stop_value, trail_type, trail_value, atr_multiplier, minimum_protection_distance, reprice_enabled, max_reprice_attempts, apma_enabled, version)
SELECT id, id, true, false, 'PERCENTAGE', 2.0, 'PERCENTAGE', 1.5, 2.0, 0.10, false, 3, true, 1
FROM users WHERE email = 'console-seed@requi.local'
AND NOT EXISTS (
  SELECT 1 FROM protection_profiles pp
  JOIN users u ON pp.user_id = u.id
  WHERE u.email = 'console-seed@requi.local'
);

-- Seed user permissions
INSERT INTO user_permissions (user_id, role, scope, permissions)
SELECT id, 'TRADER', 'GLOBAL', '["read", "write", "trade", "configure_risk", "configure_strategies", "configure_protection"]'::jsonb
FROM users WHERE email = 'console-seed@requi.local'
AND NOT EXISTS (
  SELECT 1 FROM user_permissions up
  JOIN users u ON up.user_id = u.id
  WHERE u.email = 'console-seed@requi.local' AND up.role = 'TRADER' AND up.scope = 'GLOBAL'
);


SET search_path TO public;
