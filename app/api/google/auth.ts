import type { Context } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import * as jose from "jose";
import * as crypto from "node:crypto";
import { env } from "../lib/env";
import { getSessionCookieOptions } from "../lib/cookies";
import { Session } from "@contracts/constants";
import { signSessionToken } from "../kimi/session";
import { findUserByEmail, findUserByUnionId, upsertUser } from "../queries/users";

/**
 * GOOGLE SIGN-IN — preliminary, credential-free integration.
 *
 * The full authorization-code flow is implemented and production-shaped, but
 * it activates only when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are present.
 * Until then the start route fails gracefully (redirect to /login with a
 * notice) and nothing else in the auth system is affected.
 *
 * Identity scope is minimal by design: openid + email + profile only. No
 * Gmail/Drive/Calendar/Contacts scopes are requested — see GOOGLE_AUTH_SETUP.md.
 * The client secret is server-side only; the browser receives nothing but a
 * redirect. State is a random nonce stored in an httpOnly cookie (CSRF).
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS = jose.createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const STATE_COOKIE = "google_oauth_state";

function redirectUri(c: Context): string {
  const url = new URL(c.req.url);
  return `${url.origin}/api/auth/google/callback`;
}

function configured(): boolean {
  return Boolean(env.googleClientId);
}

export function createGoogleStartHandler() {
  return async (c: Context) => {
    if (!configured()) {
      // Graceful: credentials not configured yet — inform, never crash.
      return c.redirect("/login?auth=google_not_configured", 302);
    }
    const state = crypto.randomBytes(24).toString("base64url");
    const opts = getSessionCookieOptions(c.req.raw.headers);
    setCookie(c, STATE_COOKIE, state, {
      httpOnly: true,
      path: "/",
      sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
      secure: opts.secure,
      maxAge: 600,
    });
    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set("client_id", env.googleClientId);
    url.searchParams.set("redirect_uri", redirectUri(c));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    return c.redirect(url.toString(), 302);
  };
}

interface GoogleIdClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

async function exchangeCode(code: string, redirect: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    redirect_uri: redirect,
  });
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google token exchange failed (${resp.status}): ${text}`);
  }
  return (await resp.json()) as { id_token?: string };
}

async function verifyIdToken(idToken: string): Promise<GoogleIdClaims> {
  const { payload } = await jose.jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: env.googleClientId,
  });
  if (!payload.sub) throw new Error("Google id_token missing sub");
  return payload as unknown as GoogleIdClaims;
}

export function createGoogleCallbackHandler() {
  return async (c: Context) => {
    const error = c.req.query("error");
    if (error) {
      deleteCookie(c, STATE_COOKIE, { path: "/" });
      // User cancelled at Google, or Google returned an error — both are
      // routine; return to login with a notice, never a stack trace.
      return c.redirect(
        error === "access_denied" ? "/login?auth=google_cancelled" : "/login?auth=google_error",
        302,
      );
    }

    const code = c.req.query("code");
    const state = c.req.query("state");
    const expectedState = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: "/" });
    if (!code || !state || !expectedState || state !== expectedState) {
      return c.json({ error: "invalid_callback", message: "Missing or invalid state/code." }, 400);
    }
    if (!configured()) {
      return c.redirect("/login?auth=google_not_configured", 302);
    }

    try {
      const { id_token } = await exchangeCode(code, redirectUri(c));
      if (!id_token) throw new Error("Google token response missing id_token");
      const claims = await verifyIdToken(id_token);
      if (!claims.email) throw new Error("Google account did not return an email address");

      // No duplicate users: an existing account with this email is signed in
      // (and back-filled with the Google provider id); otherwise a new account
      // is provisioned with unionId = google:{sub}.
      const existing = await findUserByEmail(claims.email);
      const unionId = existing ? existing.unionId : `google:${claims.sub}`;
      await upsertUser({
        unionId,
        name: claims.name ?? existing?.name ?? claims.email.split("@")[0],
        email: claims.email,
        avatar: claims.picture ?? existing?.avatar,
        authProvider: existing ? existing.authProvider : "GOOGLE",
        providerUserId: claims.sub,
        emailVerified: claims.email_verified ?? false,
        lastSignInAt: new Date(),
      });

      const user = await findUserByUnionId(unionId);
      if (user?.deactivatedAt) {
        return c.redirect("/login?auth=account_disabled", 302);
      }

      const token = await signSessionToken({ unionId, clientId: env.appId });
      const opts = getSessionCookieOptions(c.req.raw.headers);
      setCookie(c, Session.cookieName, token, {
        ...opts,
        maxAge: Session.maxAgeMs / 1000,
      });
      return c.redirect("/app", 302);
    } catch (e) {
      console.error("[google-oauth] callback failed", e);
      return c.redirect("/login?auth=google_error", 302);
    }
  };
}
