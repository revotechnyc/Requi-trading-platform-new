/**
 * Per-user Robinhood Agentic MCP connection persistence (new setup — text user ids).
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../queries/connection";
import { brokerAccounts } from "@db/schema";
import { env } from "../../lib/env";
import { openSecret, sealSecret } from "../../lib/secret-box";
import {
  buildAuthorizeUrlAsync,
  exchangeAuthorizationCode,
  newOAuthState,
  newPkce,
  refreshAccessToken,
  registerRhPublicClient,
  type RhTokenSet,
} from "./oauth";
import { probeRhMcp } from "./mcp-health";

export const RH_BROKER_CODE = "ROBINHOOD_MCP" as const;
export const RH_BROKER_LABEL = "Robinhood Agentic";

export type BrokerConnectionPublic = {
  id: number;
  broker: string;
  label: string;
  status: "Connected" | "Syncing" | "Attention";
  accountRef: string | null;
  connectedAt: string | null;
  lastHealthAt: string | null;
  lastHealthOk: boolean | null;
  lastHealthDetail: string | null;
  toolCount: number | null;
};

type ConnectionRow = {
  id: number;
  userId: string;
  broker: string;
  label: string;
  status: string;
  accountRef: string | null;
  clientId: string;
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
  expiresAt: Date | null;
  scope: string | null;
  metaJson: string | null;
  connectedAt: Date | null;
  updatedAt: Date | null;
  lastHealthAt: Date | null;
  lastHealthOk: boolean | null;
  lastHealthDetail: string | null;
};

let schemaReady: Promise<void> | null = null;

function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

/** Idempotent DDL for Robinhood OAuth tables (text userId for new Supabase users). */
export async function ensureRhBrokerSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getDb();
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS broker_connections (
          id serial PRIMARY KEY,
          "userId" text NOT NULL,
          broker varchar(64) NOT NULL,
          label varchar(255) NOT NULL,
          status varchar(24) NOT NULL DEFAULT 'Connected',
          "accountRef" varchar(128),
          "clientId" varchar(255) NOT NULL,
          "accessTokenEnc" text NOT NULL,
          "refreshTokenEnc" text,
          "expiresAt" timestamptz,
          scope varchar(255),
          "metaJson" text,
          "connectedAt" timestamptz NOT NULL DEFAULT now(),
          "updatedAt" timestamptz NOT NULL DEFAULT now(),
          "lastHealthAt" timestamptz,
          "lastHealthOk" boolean,
          "lastHealthDetail" text
        )
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS broker_connections_user_broker_uidx
        ON broker_connections ("userId", broker)
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS broker_oauth_states (
          id serial PRIMARY KEY,
          "userId" text NOT NULL,
          broker varchar(64) NOT NULL,
          state varchar(128) NOT NULL UNIQUE,
          "codeVerifier" text NOT NULL,
          "clientId" varchar(255) NOT NULL,
          "redirectUri" text NOT NULL,
          "createdAt" timestamptz NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS broker_oauth_states_user_idx
        ON broker_oauth_states ("userId", "createdAt" DESC)
      `);
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  await schemaReady;
}

function isLoopbackHost(host: string): boolean {
  return (
    /^localhost(?::\d+)?$/i.test(host) ||
    /^127\.0\.0\.1(?::\d+)?$/.test(host) ||
    /^\[::1\](?::\d+)?$/.test(host)
  );
}

/** Canonical HTTPS callback Robinhood will redirect to after authorize. */
export function resolveRobinhoodRedirectUri(origin: string): string {
  const forced = env.robinhoodRedirectUri;
  if (forced) return forced.replace(/\/$/, "");
  if (env.publicAppUrl) {
    return `${env.publicAppUrl.replace(/\/$/, "")}/auth/robinhood/callback`;
  }
  let base = origin.replace(/\/$/, "");
  try {
    const u = new URL(base);
    if (!isLoopbackHost(u.host) && u.protocol === "http:") {
      u.protocol = "https:";
      base = u.origin;
    }
  } catch {
    /* keep base */
  }
  return `${base}/auth/robinhood/callback`;
}

function publicFromRow(row: ConnectionRow): BrokerConnectionPublic {
  let toolCount: number | null = null;
  if (row.metaJson) {
    try {
      const meta = JSON.parse(row.metaJson) as { toolCount?: number };
      if (typeof meta.toolCount === "number") toolCount = meta.toolCount;
    } catch {
      /* ignore */
    }
  }
  const status =
    row.status === "Connected" || row.status === "Syncing" || row.status === "Attention"
      ? row.status
      : "Attention";
  return {
    id: row.id,
    broker: row.broker,
    label: row.label,
    status,
    accountRef: row.accountRef,
    connectedAt: row.connectedAt ? new Date(row.connectedAt).toISOString() : null,
    lastHealthAt: row.lastHealthAt ? new Date(row.lastHealthAt).toISOString() : null,
    lastHealthOk: row.lastHealthOk,
    lastHealthDetail: row.lastHealthDetail,
    toolCount,
  };
}

async function getConnection(userId: string): Promise<ConnectionRow | null> {
  await ensureRhBrokerSchema();
  const db = getDb();
  const rows = asRows<ConnectionRow>(
    await db.execute(sql`
      SELECT id, "userId", broker, label, status, "accountRef", "clientId",
             "accessTokenEnc", "refreshTokenEnc", "expiresAt", scope, "metaJson",
             "connectedAt", "updatedAt", "lastHealthAt", "lastHealthOk", "lastHealthDetail"
      FROM broker_connections
      WHERE "userId" = ${userId} AND broker = ${RH_BROKER_CODE}
      ORDER BY id DESC
      LIMIT 1
    `),
  );
  return rows[0] ?? null;
}

export async function getRobinhoodConnectionPublic(
  userId: string,
): Promise<BrokerConnectionPublic | null> {
  const row = await getConnection(userId);
  return row ? publicFromRow(row) : null;
}

export async function startRobinhoodConnect(input: {
  userId: string;
  origin: string;
}): Promise<{ authorizeUrl: string; redirectUri: string }> {
  await ensureRhBrokerSchema();
  const redirectUri = resolveRobinhoodRedirectUri(input.origin);
  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    throw new Error(
      "Invalid Robinhood redirect URI — set PUBLIC_APP_URL or ROBINHOOD_MCP_REDIRECT_URI on the live host.",
    );
  }
  if (isLoopbackHost(parsed.host)) {
    throw new Error(
      "Robinhood rejects localhost OAuth. Deploy this build to HTTPS, set PUBLIC_APP_URL=https://YOUR_LIVE_HOST (and optionally ROBINHOOD_MCP_REDIRECT_URI=https://YOUR_LIVE_HOST/auth/robinhood/callback), then Connect from that live URL in a desktop browser. You need a Robinhood Agentic Trading account, not only a regular brokerage login.",
    );
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Robinhood OAuth redirect must be https:// — set PUBLIC_APP_URL to your live HTTPS origin.");
  }
  if (!parsed.pathname.endsWith("/auth/robinhood/callback")) {
    throw new Error(
      `Robinhood redirect URI must end with /auth/robinhood/callback (got ${parsed.pathname}).`,
    );
  }

  const { clientId } = await registerRhPublicClient({
    clientName: "Requi Trading",
    redirectUri,
  });
  const { verifier, challenge } = newPkce();
  const state = newOAuthState();
  const db = getDb();

  await db.execute(sql`
    DELETE FROM broker_oauth_states
    WHERE "userId" = ${input.userId}
       OR "createdAt" < now() - interval '2 hours'
  `);

  await db.execute(sql`
    INSERT INTO broker_oauth_states
      ("userId", broker, state, "codeVerifier", "clientId", "redirectUri", "createdAt")
    VALUES
      (${input.userId}, ${RH_BROKER_CODE}, ${state}, ${verifier}, ${clientId}, ${redirectUri}, now())
  `);

  const authorizeUrl = await buildAuthorizeUrlAsync({
    clientId,
    redirectUri,
    state,
    codeChallenge: challenge,
  });
  return { authorizeUrl, redirectUri };
}

export async function completeRobinhoodConnect(input: {
  code: string;
  state: string;
}): Promise<BrokerConnectionPublic> {
  await ensureRhBrokerSchema();
  const db = getDb();
  const pendingList = asRows<{
    id: number;
    userId: string;
    state: string;
    codeVerifier: string;
    clientId: string;
    redirectUri: string;
  }>(
    await db.execute(sql`
      SELECT id, "userId", state, "codeVerifier", "clientId", "redirectUri"
      FROM broker_oauth_states
      WHERE state = ${input.state} AND broker = ${RH_BROKER_CODE}
        AND "createdAt" > now() - interval '30 minutes'
      LIMIT 1
    `),
  );
  const pending = pendingList[0];
  if (!pending) {
    throw new Error("OAuth state missing or expired — start Connect again from Accounts");
  }

  const tokens = await exchangeAuthorizationCode({
    code: input.code,
    redirectUri: String(pending.redirectUri),
    clientId: String(pending.clientId),
    codeVerifier: String(pending.codeVerifier),
  });

  const health = await probeRhMcp(tokens.accessToken);
  const status = health.ok ? "Connected" : "Attention";
  const metaJson = JSON.stringify({
    toolCount: health.toolCount,
    source: "agentic_mcp",
  });

  await upsertConnection(String(pending.userId), {
    clientId: String(pending.clientId),
    tokens,
    status,
    health,
    metaJson,
  });

  await db.execute(sql`DELETE FROM broker_oauth_states WHERE id = ${Number(pending.id)}`);
  await upsertBrokerAccountRow(String(pending.userId), status);

  const row = await getConnection(String(pending.userId));
  if (!row) throw new Error("Connection saved but could not be reloaded");
  return publicFromRow(row);
}

async function upsertConnection(
  userId: string,
  data: {
    clientId: string;
    tokens: RhTokenSet;
    status: string;
    health: { ok: boolean; detail: string; toolCount: number | null };
    metaJson: string;
  },
) {
  const db = getDb();
  const accessEnc = sealSecret(data.tokens.accessToken);
  const refreshEnc = data.tokens.refreshToken ? sealSecret(data.tokens.refreshToken) : null;
  const existing = await getConnection(userId);
  const expiresAt = data.tokens.expiresAt ? data.tokens.expiresAt.toISOString() : null;
  if (existing) {
    await db.execute(sql`
      UPDATE broker_connections SET
        label = ${RH_BROKER_LABEL},
        status = ${data.status},
        "clientId" = ${data.clientId},
        "accessTokenEnc" = ${accessEnc},
        "refreshTokenEnc" = ${refreshEnc},
        "expiresAt" = ${expiresAt},
        scope = ${data.tokens.scope},
        "metaJson" = ${data.metaJson},
        "updatedAt" = now(),
        "lastHealthAt" = now(),
        "lastHealthOk" = ${data.health.ok},
        "lastHealthDetail" = ${data.health.detail}
      WHERE id = ${existing.id}
    `);
  } else {
    await db.execute(sql`
      INSERT INTO broker_connections
        ("userId", broker, label, status, "accountRef", "clientId",
         "accessTokenEnc", "refreshTokenEnc", "expiresAt", scope, "metaJson",
         "connectedAt", "updatedAt", "lastHealthAt", "lastHealthOk", "lastHealthDetail")
      VALUES
        (${userId}, ${RH_BROKER_CODE}, ${RH_BROKER_LABEL}, ${data.status}, NULL, ${data.clientId},
         ${accessEnc}, ${refreshEnc}, ${expiresAt}, ${data.tokens.scope}, ${data.metaJson},
         now(), now(), now(), ${data.health.ok}, ${data.health.detail})
    `);
  }
}

async function upsertBrokerAccountRow(
  userId: string,
  status: "Connected" | "Syncing" | "Attention" | string,
) {
  const db = getDb();
  const existing = await db
    .select()
    .from(brokerAccounts)
    .where(and(eq(brokerAccounts.userId, userId), eq(brokerAccounts.broker, "Robinhood")))
    .limit(1);
  const st =
    status === "Connected" || status === "Syncing" || status === "Attention" ? status : "Attention";
  if (existing[0]) {
    await db
      .update(brokerAccounts)
      .set({
        label: "Agentic MCP",
        type: "Live",
        status: st,
        equity: "0",
        dayPnl: "0",
      })
      .where(eq(brokerAccounts.id, existing[0].id));
  } else {
    await db.insert(brokerAccounts).values({
      userId,
      broker: "Robinhood",
      label: "Agentic MCP",
      type: "Live",
      equity: "0",
      dayPnl: "0",
      status: st,
      strategies: 0,
    });
  }
}

export async function disconnectRobinhood(userId: string): Promise<{ ok: true }> {
  await ensureRhBrokerSchema();
  const db = getDb();
  await db.execute(sql`
    DELETE FROM broker_connections
    WHERE "userId" = ${userId} AND broker = ${RH_BROKER_CODE}
  `);
  await db
    .delete(brokerAccounts)
    .where(and(eq(brokerAccounts.userId, userId), eq(brokerAccounts.broker, "Robinhood")));
  return { ok: true };
}

export async function refreshRobinhoodHealth(userId: string): Promise<BrokerConnectionPublic> {
  await ensureRhBrokerSchema();
  let row = await getConnection(userId);
  if (!row) throw new Error("Robinhood Agentic MCP is not connected");

  let access = openSecret(row.accessTokenEnc);
  const expiresMs = row.expiresAt ? new Date(row.expiresAt).getTime() : null;
  const needsRefresh =
    expiresMs != null && expiresMs < Date.now() + 60_000 && Boolean(row.refreshTokenEnc);

  if (needsRefresh && row.refreshTokenEnc) {
    try {
      const refreshed = await refreshAccessToken({
        refreshToken: openSecret(row.refreshTokenEnc),
        clientId: row.clientId,
      });
      await upsertConnection(userId, {
        clientId: row.clientId,
        tokens: {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken ?? openSecret(row.refreshTokenEnc),
          expiresAt: refreshed.expiresAt,
          scope: refreshed.scope,
          tokenType: refreshed.tokenType,
        },
        status: row.status,
        health: { ok: true, detail: "token refreshed", toolCount: null },
        metaJson: row.metaJson ?? "{}",
      });
      access = refreshed.accessToken;
      row = (await getConnection(userId))!;
    } catch (e) {
      const detail = e instanceof Error ? e.message : "Token refresh failed";
      await getDb().execute(sql`
        UPDATE broker_connections SET
          status = 'Attention',
          "lastHealthAt" = now(),
          "lastHealthOk" = false,
          "lastHealthDetail" = ${detail},
          "updatedAt" = now()
        WHERE id = ${row.id}
      `);
      await upsertBrokerAccountRow(userId, "Attention");
      const failed = await getConnection(userId);
      if (!failed) throw e;
      return publicFromRow(failed);
    }
  }

  const health = await probeRhMcp(access);
  const status = health.ok ? "Connected" : "Attention";
  const metaJson = JSON.stringify({
    toolCount: health.toolCount,
    source: "agentic_mcp",
  });
  await getDb().execute(sql`
    UPDATE broker_connections SET
      status = ${status},
      "metaJson" = ${metaJson},
      "lastHealthAt" = now(),
      "lastHealthOk" = ${health.ok},
      "lastHealthDetail" = ${health.detail},
      "updatedAt" = now()
    WHERE id = ${row.id}
  `);
  await upsertBrokerAccountRow(userId, status);
  const updated = await getConnection(userId);
  if (!updated) throw new Error("Health refresh lost connection row");
  return publicFromRow(updated);
}
