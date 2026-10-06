import { getSql } from "../queries/connection";

/**
 * Ensures public autonomous trading tables exist (session runner).
 * Separate from `ac.*` console schema — these power start/pause/tick + IBKR paper.
 * Idempotent CREATE TABLE IF NOT EXISTS (no drizzle SQL migrations in repo yet).
 */
export async function ensureAutonomousTradingSchema(): Promise<void> {
  const sql = getSql();

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS autonomous_configs (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "userId" text NOT NULL UNIQUE,
      "organizationId" text,
      "accountId" text,
      mode varchar(8) NOT NULL DEFAULT 'PAPER',
      "allocationType" varchar(8) NOT NULL DEFAULT 'DOLLAR',
      "allocationValue" numeric(16, 2) NOT NULL DEFAULT 0,
      "maxPositionSizePct" numeric(5, 2) NOT NULL DEFAULT 10,
      "maxDailyLoss" numeric(14, 2) NOT NULL DEFAULT 1000,
      "maxPositions" integer NOT NULL DEFAULT 5,
      "stopLossPct" numeric(5, 2) NOT NULL DEFAULT 2,
      "trailingStopPct" numeric(5, 2) NOT NULL DEFAULT 1.5,
      "liveConfirmedAt" timestamptz,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS autonomous_sessions (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "userId" text NOT NULL,
      "organizationId" text,
      "configId" text REFERENCES autonomous_configs(id),
      mode varchar(8) NOT NULL DEFAULT 'PAPER',
      "accountId" text,
      status varchar(24) NOT NULL DEFAULT 'STOPPED',
      "startedAt" timestamptz NOT NULL DEFAULT now(),
      "pausedAt" timestamptz,
      "stoppedAt" timestamptz,
      "lastEventAt" timestamptz,
      "lastError" varchar(500),
      "endedReason" varchar(32),
      arc varchar(24) NOT NULL DEFAULT 'idle',
      symbol varchar(16),
      entry numeric(12, 2),
      stop numeric(12, 2),
      target numeric(12, 2),
      quantity integer,
      "dayPnl" numeric(14, 2) NOT NULL DEFAULT 0,
      "tradesToday" integer NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS autonomous_sessions_status_idx ON autonomous_sessions (status);
    CREATE INDEX IF NOT EXISTS autonomous_sessions_user_idx ON autonomous_sessions ("userId");

    CREATE TABLE IF NOT EXISTS autonomous_events (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      "sessionId" text NOT NULL REFERENCES autonomous_sessions(id),
      "userId" text NOT NULL,
      "organizationId" text,
      phase varchar(24) NOT NULL,
      kind varchar(16) NOT NULL DEFAULT 'info',
      symbol varchar(16),
      message text NOT NULL,
      payload jsonb,
      "createdAt" timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS autonomous_events_user_created_idx
      ON autonomous_events ("userId", "createdAt" DESC);
  `);

  console.log("[autonomous] trading schema ensured (configs / sessions / events)");
}
