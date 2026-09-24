-- Auto-wrapped for Requi platform (schema ac)
CREATE SCHEMA IF NOT EXISTS ac;
SET search_path TO ac, public;

-- ============================================================
-- MIGRATION: Legal, Compliance & Audit Infrastructure
-- Tables: 38-49 + Seed Data
-- ============================================================

-- 38. LEGAL DOCUMENTS
CREATE TABLE IF NOT EXISTS legal_documents (
  id SERIAL PRIMARY KEY,
  document_id VARCHAR(64) NOT NULL UNIQUE,
  title VARCHAR(256) NOT NULL,
  version INTEGER NOT NULL,
  version_effective_date TIMESTAMPTZ NOT NULL,
  content_hash VARCHAR(128) NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT true,
  applies_to_mode VARCHAR(32) DEFAULT 'ALL',
  applies_to_environment VARCHAR(32) DEFAULT 'ALL',
  requires_reconsent BOOLEAN NOT NULL DEFAULT false,
  reconsent_interval_months INTEGER DEFAULT 12,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(document_id, version)
);
CREATE INDEX IF NOT EXISTS ld_required_idx ON legal_documents(is_required);
CREATE INDEX IF NOT EXISTS ld_mode_idx ON legal_documents(applies_to_mode);

-- 39. LEGAL DOCUMENT VERSIONS
CREATE TABLE IF NOT EXISTS legal_document_versions (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES legal_documents(id),
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_hash VARCHAR(128) NOT NULL,
  effective_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(document_id, version)
);

-- 40. LEGAL ACCEPTANCES
CREATE TABLE IF NOT EXISTS legal_acceptances (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  document_id INTEGER NOT NULL REFERENCES legal_documents(id),
  document_version INTEGER NOT NULL,
  acceptance_type VARCHAR(32) NOT NULL,
  environment VARCHAR(32) NOT NULL,
  ip_address VARCHAR(64),
  user_agent TEXT,
  fingerprint VARCHAR(256),
  is_first_time BOOLEAN NOT NULL DEFAULT false,
  withdrawal_timestamp TIMESTAMPTZ,
  withdrawn_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, document_id, document_version, environment)
);
CREATE INDEX IF NOT EXISTS la_user_idx ON legal_acceptances(user_id);
CREATE INDEX IF NOT EXISTS la_doc_idx ON legal_acceptances(document_id);
CREATE INDEX IF NOT EXISTS la_first_time_idx ON legal_acceptances(is_first_time);
CREATE INDEX IF NOT EXISTS la_withdrawn_idx ON legal_acceptances(withdrawal_timestamp);

-- 41. LEGAL ACCEPTANCE EVENTS
CREATE TABLE IF NOT EXISTS legal_acceptance_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  acceptance_id INTEGER NOT NULL REFERENCES legal_acceptances(id),
  event_type VARCHAR(32) NOT NULL,
  disclosure_key VARCHAR(128) NOT NULL,
  disclosure_version INTEGER NOT NULL,
  is_checked BOOLEAN NOT NULL,
  ip_address VARCHAR(64),
  user_agent TEXT,
  fingerprint VARCHAR(256),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS lae_acceptance_idx ON legal_acceptance_events(acceptance_id);
CREATE INDEX IF NOT EXISTS lae_user_idx ON legal_acceptance_events(user_id);
CREATE INDEX IF NOT EXISTS lae_type_idx ON legal_acceptance_events(event_type);
CREATE INDEX IF NOT EXISTS lae_disclosure_idx ON legal_acceptance_events(disclosure_key);

-- 42. AUTONOMOUS AUTHORIZATIONS
CREATE TABLE IF NOT EXISTS autonomous_authorizations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  account_id INTEGER NOT NULL,
  environment VARCHAR(32) NOT NULL,
  is_authorized BOOLEAN NOT NULL,
  authorized_from TIMESTAMPTZ,
  authorized_until TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS aa_user_idx ON autonomous_authorizations(user_id);
CREATE INDEX IF NOT EXISTS aa_account_idx ON autonomous_authorizations(account_id);
CREATE INDEX IF NOT EXISTS aa_env_idx ON autonomous_authorizations(environment);
CREATE INDEX IF NOT EXISTS aa_authorized_idx ON autonomous_authorizations(is_authorized);

-- 43. AUTONOMOUS START EVENTS
CREATE TABLE IF NOT EXISTS autonomous_start_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  account_id INTEGER NOT NULL,
  environment VARCHAR(32) NOT NULL,
  action VARCHAR(32) NOT NULL,
  result VARCHAR(32) NOT NULL,
  gate_status VARCHAR(64) NOT NULL,
  gate_failed_reasons JSONB,
  triggered_by VARCHAR(32) NOT NULL DEFAULT 'USER',
  run_id VARCHAR(64),
  strategy_id INTEGER REFERENCES strategies(id),
  elapsed_ms INTEGER,
  version VARCHAR(32),
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS ase_user_idx ON autonomous_start_events(user_id);
CREATE INDEX IF NOT EXISTS ase_account_idx ON autonomous_start_events(account_id);
CREATE INDEX IF NOT EXISTS ase_action_idx ON autonomous_start_events(action);
CREATE INDEX IF NOT EXISTS ase_result_idx ON autonomous_start_events(result);
CREATE INDEX IF NOT EXISTS ase_created_idx ON autonomous_start_events(created_at);

-- 44. STRATEGY DISCLOSURE ACCEPTANCES
CREATE TABLE IF NOT EXISTS strategy_disclosure_acceptances (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  account_id INTEGER NOT NULL,
  strategy_id INTEGER NOT NULL REFERENCES strategies(id),
  environment VARCHAR(32) NOT NULL,
  is_accepted BOOLEAN NOT NULL DEFAULT false,
  accepted_at TIMESTAMPTZ,
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, account_id, strategy_id, environment)
);
CREATE INDEX IF NOT EXISTS sda_user_idx ON strategy_disclosure_acceptances(user_id);
CREATE INDEX IF NOT EXISTS sda_strategy_idx ON strategy_disclosure_acceptances(strategy_id);

-- 45. BROKER AUTHORIZATIONS
CREATE TABLE IF NOT EXISTS broker_authorizations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  account_id INTEGER NOT NULL,
  broker_id VARCHAR(64) NOT NULL,
  broker_name VARCHAR(128) NOT NULL,
  is_authorized BOOLEAN NOT NULL DEFAULT false,
  consent_scope VARCHAR(32) DEFAULT 'TRADE_EXECUTE',
  data_sharing_authorized BOOLEAN NOT NULL DEFAULT false,
  authorized_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, account_id, broker_id)
);
CREATE INDEX IF NOT EXISTS ba_user_idx ON broker_authorizations(user_id);
CREATE INDEX IF NOT EXISTS ba_broker_idx ON broker_authorizations(broker_id);

-- 46. ELECTRONIC CONSENT RECORDS
CREATE TABLE IF NOT EXISTS electronic_consent_records (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  account_id INTEGER NOT NULL,
  consent_type VARCHAR(64) NOT NULL,
  consent_version VARCHAR(32) NOT NULL,
  consent_text TEXT NOT NULL,
  consent_hash VARCHAR(128) NOT NULL,
  is_consent_given BOOLEAN NOT NULL DEFAULT false,
  consent_timestamp TIMESTAMPTZ,
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, account_id, consent_type, consent_version)
);
CREATE INDEX IF NOT EXISTS ecr_user_idx ON electronic_consent_records(user_id);
CREATE INDEX IF NOT EXISTS ecr_type_idx ON electronic_consent_records(consent_type);

-- 47. LEGAL REQUIREMENTS
CREATE TABLE IF NOT EXISTS legal_requirements (
  id SERIAL PRIMARY KEY,
  jurisdiction VARCHAR(64) NOT NULL,
  document_id INTEGER NOT NULL REFERENCES legal_documents(id),
  is_required BOOLEAN NOT NULL DEFAULT true,
  minimum_age INTEGER DEFAULT 18,
  requires_witness BOOLEAN NOT NULL DEFAULT false,
  requires_notary BOOLEAN NOT NULL DEFAULT false,
  effective_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(jurisdiction, document_id)
);
CREATE INDEX IF NOT EXISTS lr_jurisdiction_idx ON legal_requirements(jurisdiction);
CREATE INDEX IF NOT EXISTS lr_required_idx ON legal_requirements(is_required);

-- 48. LEGAL RECONSENT QUEUE
CREATE TABLE IF NOT EXISTS legal_reconsent_queue (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  account_id INTEGER NOT NULL,
  document_id INTEGER NOT NULL REFERENCES legal_documents(id),
  environment VARCHAR(32) NOT NULL,
  reason VARCHAR(64) NOT NULL,
  required_by TIMESTAMPTZ NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  is_blocking BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS lrq_user_idx ON legal_reconsent_queue(user_id);
CREATE INDEX IF NOT EXISTS lrq_account_idx ON legal_reconsent_queue(account_id);
CREATE INDEX IF NOT EXISTS lrq_blocking_idx ON legal_reconsent_queue(is_blocking);
CREATE INDEX IF NOT EXISTS lrq_required_by_idx ON legal_reconsent_queue(required_by);

-- 49. COMPLIANCE EVENTS
CREATE TABLE IF NOT EXISTS compliance_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  account_id INTEGER,
  event_type VARCHAR(64) NOT NULL,
  event_category VARCHAR(32) NOT NULL,
  severity VARCHAR(16) NOT NULL DEFAULT 'INFO',
  subject_type VARCHAR(32),
  subject_id VARCHAR(64),
  details JSONB,
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS cev_user_idx ON compliance_events(user_id);
CREATE INDEX IF NOT EXISTS cev_type_idx ON compliance_events(event_type);
CREATE INDEX IF NOT EXISTS cev_category_idx ON compliance_events(event_category);
CREATE INDEX IF NOT EXISTS cev_severity_idx ON compliance_events(severity);
CREATE INDEX IF NOT EXISTS cev_created_idx ON compliance_events(created_at);

-- ============================================================
-- SEED: Legal Documents
-- ============================================================

INSERT INTO legal_documents (document_id, title, version, version_effective_date, content_hash, is_required, applies_to_mode, requires_reconsent, reconsent_interval_months)
VALUES
  ('MATERIAL_RISK_DISCLOSURE', 'Material Risk Disclosure', 1, now(), 'sha256:material_risk_v1', true, 'ALL', true, 12),
  ('AUTONOMOUS_TRADING_DISCLOSURE', 'Autonomous Trading Disclosure', 1, now(), 'sha256:auto_trading_v1', true, 'ALL', true, 12),
  ('EXTENDED_HOURS_DISCLOSURE', 'Extended Hours Trading Disclosure', 1, now(), 'sha256:extended_hours_v1', true, 'ALL', true, 12),
  ('OPTIONS_RISK_DISCLOSURE', 'Options Risk Disclosure (ODD)', 1, now(), 'sha256:options_odd_v1', true, 'ALL', true, 12),
  ('BROKER_RELATIONSHIP_CONSENT', 'Broker Relationship Consent', 1, now(), 'sha256:broker_rel_v1', true, 'ALL', false, 0),
  ('ELECTRONIC_COMMUNICATIONS_CONSENT', 'Electronic Communications Consent', 1, now(), 'sha256:electronic_comm_v1', true, 'ALL', false, 0),
  ('CONSTITUTION_DISCLOSURE', 'Constitution Disclosure', 1, now(), 'sha256:constitution_v1', true, 'ALL', true, 12)
ON CONFLICT DO NOTHING;

-- Seed E-SIGN consent (only if seed user exists)
INSERT INTO electronic_consent_records (user_id, account_id, consent_type, consent_version, consent_text, consent_hash, is_consent_given, consent_timestamp)
SELECT id, id, 'E_SIGN', '1.0', 'I consent to receive all disclosures electronically in accordance with E-SIGN and UETA.', 'sha256:esign_v1', false, NULL
FROM users WHERE email = 'console-seed@requi.local'
ON CONFLICT DO NOTHING;


SET search_path TO public;
