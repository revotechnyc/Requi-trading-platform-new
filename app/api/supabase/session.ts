import * as jose from "jose";
import { env } from "../lib/env";

/**
 * Supabase access-token verification.
 *
 * Preferred: asymmetric verification against the project JWKS
 * (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`) — no shared secret on the
 * server. Legacy HS256 projects can set SUPABASE_JWT_SECRET instead.
 * The service-role key is NEVER used for token verification and never
 * exposed to the frontend.
 */
export type SupabaseClaims = {
  sub: string;
  email?: string;
  provider: string;
  name?: string;
  avatarUrl?: string;
  emailConfirmed: boolean;
};

let remoteJwks: ReturnType<typeof jose.createRemoteJWKSet> | null = null;

function getJwks() {
  if (!remoteJwks) {
    remoteJwks = jose.createRemoteJWKSet(
      new URL(`${env.supabaseUrl}/auth/v1/.well-known/jwks.json`),
    );
  }
  return remoteJwks;
}

function issuer() {
  return `${env.supabaseUrl}/auth/v1`;
}

export async function verifySupabaseToken(
  token: string,
): Promise<SupabaseClaims | null> {
  if (!env.supabaseUrl) return null;
  try {
    let payload: jose.JWTPayload;
    if (env.supabaseJwtSecret) {
      try {
        const secret = new TextEncoder().encode(env.supabaseJwtSecret);
        ({ payload } = await jose.jwtVerify(token, secret, {
          algorithms: ["HS256"],
          issuer: issuer(),
          audience: "authenticated",
        }));
      } catch {
        ({ payload } = await jose.jwtVerify(token, getJwks(), {
          issuer: issuer(),
          audience: "authenticated",
        }));
      }
    } else {
      ({ payload } = await jose.jwtVerify(token, getJwks(), {
        issuer: issuer(),
        audience: "authenticated",
      }));
    }
    const sub = payload.sub;
    if (!sub) return null;
    const meta = (payload.user_metadata ?? {}) as Record<string, unknown>;
    const appMeta = (payload.app_metadata ?? {}) as Record<string, unknown>;
    return {
      sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      provider:
        typeof appMeta.provider === "string" ? appMeta.provider : "email",
      name:
        (meta.full_name as string | undefined) ??
        (meta.name as string | undefined),
      avatarUrl: meta.avatar_url as string | undefined,
      emailConfirmed:
        Boolean(meta.email_verified) ||
        typeof payload.email_confirmed_at === "string" ||
        typeof payload.confirmed_at === "string",
    };
  } catch (error) {
    console.warn("[supabase] access-token verification failed:", error);
    return null;
  }
}
