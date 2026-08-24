/**
 * Robinhood Trading MCP — OAuth 2.1 + PKCE (public client).
 * Discovery verified against agent.robinhood.com well-known documents.
 */
import { createHash, randomBytes } from "node:crypto";

export const RH_MCP_RESOURCE = "https://agent.robinhood.com/mcp/trading";
export const RH_MCP_ENDPOINT = "https://agent.robinhood.com/mcp/trading";

const FALLBACK_AUTH = {
  authorization_endpoint: "https://robinhood.com/oauth",
  token_endpoint: "https://api.robinhood.com/oauth2/token/",
  registration_endpoint: "https://agent.robinhood.com/oauth/trading/register",
  scopes_supported: ["internal"],
} as const;

export type RhOAuthMeta = {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  scopes_supported: string[];
};

let cachedMeta: { at: number; meta: RhOAuthMeta } | null = null;

export async function getRhOAuthMeta(): Promise<RhOAuthMeta> {
  const now = Date.now();
  if (cachedMeta && now - cachedMeta.at < 60 * 60 * 1000) return cachedMeta.meta;
  try {
    const res = await fetch("https://agent.robinhood.com/.well-known/oauth-authorization-server", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`oauth discovery HTTP ${res.status}`);
    const raw = (await res.json()) as Record<string, unknown>;
    const meta: RhOAuthMeta = {
      authorization_endpoint: String(raw.authorization_endpoint ?? FALLBACK_AUTH.authorization_endpoint),
      token_endpoint: String(raw.token_endpoint ?? FALLBACK_AUTH.token_endpoint),
      registration_endpoint: String(
        raw.registration_endpoint ?? FALLBACK_AUTH.registration_endpoint,
      ),
      scopes_supported: Array.isArray(raw.scopes_supported)
        ? (raw.scopes_supported as string[]).map(String)
        : [...FALLBACK_AUTH.scopes_supported],
    };
    cachedMeta = { at: now, meta };
    return meta;
  } catch {
    return { ...FALLBACK_AUTH, scopes_supported: [...FALLBACK_AUTH.scopes_supported] };
  }
}

export function newPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function newOAuthState(): string {
  return randomBytes(24).toString("base64url");
}

export async function registerRhPublicClient(input: {
  clientName: string;
  redirectUri: string;
}): Promise<{ clientId: string }> {
  const meta = await getRhOAuthMeta();
  const res = await fetch(meta.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: input.clientName,
      redirect_uris: [input.redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Robinhood client registration failed (${res.status}): ${text.slice(0, 300)}`);
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("Robinhood client registration returned non-JSON");
  }
  const clientId = String(body.client_id ?? "");
  if (!clientId) throw new Error("Robinhood registration missing client_id");
  return { clientId };
}

export async function buildAuthorizeUrlAsync(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope?: string;
}): Promise<string> {
  const meta = await getRhOAuthMeta();
  const u = new URL(meta.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", input.clientId);
  u.searchParams.set("redirect_uri", input.redirectUri);
  u.searchParams.set("state", input.state);
  u.searchParams.set("code_challenge", input.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("scope", input.scope ?? meta.scopes_supported[0] ?? "internal");
  u.searchParams.set("resource", RH_MCP_RESOURCE);
  return u.toString();
}

export type RhTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
  tokenType: string | null;
};

function parseTokenResponse(raw: Record<string, unknown>): RhTokenSet {
  const accessToken = String(raw.access_token ?? "");
  if (!accessToken) throw new Error("Token response missing access_token");
  const expiresIn = Number(raw.expires_in);
  const expiresAt =
    Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000)
      : null;
  return {
    accessToken,
    refreshToken: raw.refresh_token ? String(raw.refresh_token) : null,
    expiresAt,
    scope: raw.scope ? String(raw.scope) : null,
    tokenType: raw.token_type ? String(raw.token_type) : null,
  };
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  redirectUri: string;
  clientId: string;
  codeVerifier: string;
}): Promise<RhTokenSet> {
  const meta = await getRhOAuthMeta();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    code_verifier: input.codeVerifier,
    resource: RH_MCP_RESOURCE,
  });
  const res = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Robinhood token exchange failed (${res.status}): ${text.slice(0, 400)}`);
  }
  return parseTokenResponse(JSON.parse(text) as Record<string, unknown>);
}

export async function refreshAccessToken(input: {
  refreshToken: string;
  clientId: string;
}): Promise<RhTokenSet> {
  const meta = await getRhOAuthMeta();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    resource: RH_MCP_RESOURCE,
  });
  const res = await fetch(meta.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Robinhood token refresh failed (${res.status}): ${text.slice(0, 400)}`);
  }
  return parseTokenResponse(JSON.parse(text) as Record<string, unknown>);
}
