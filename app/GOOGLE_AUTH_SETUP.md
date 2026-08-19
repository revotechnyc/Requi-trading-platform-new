# Google Sign-In — Developer Handoff

**Status: Google Cloud configuration still required.** The application-side
integration is complete and production-shaped (start route, callback route,
state/CSRF cookie, ID-token verification against Google's JWKS, user
create/link-by-email, session creation, and all failure paths). It is
intentionally **credential-free**: with `GOOGLE_CLIENT_ID` empty, the
"Continue with Google" button redirects back to `/login` with a graceful
notice and the rest of authentication is unaffected.

## What is already built

| Piece | Location |
|---|---|
| Start route (redirects to Google) | `GET /api/auth/google` |
| Callback route | `GET /api/auth/google/callback` |
| Handler implementation | `api/google/auth.ts` |
| Provider fields on `users` | `authProvider`, `providerUserId`, `emailVerified` (db/schema.ts) |
| Continue with Google button | `src/pages/Login.tsx` |
| Account linking by email (no duplicate users) | `api/google/auth.ts` + `api/queries/users.ts` |

Design notes:

- **Minimal scope.** Requests `openid email profile` only — no Gmail, Drive,
  Calendar, Contacts, or any other Google service.
- **Provider-agnostic model.** Identity is `authProvider` + `providerUserId`
  (Google accounts get `unionId = google:{sub}`). Apple/Microsoft/LinkedIn can
  be added later without rebuilding the user system.
- **Link-by-email.** If a Requi account already exists with the Google email,
  the user is signed into that account (Google `sub` is back-filled); no
  duplicate user is created.
- **Security.** The client secret is server-side only; state is a random
  nonce in an httpOnly cookie (CSRF); the ID token is verified server-side
  (issuer + audience + signature); sessions use the existing secure httpOnly
  cookie; use HTTPS in production (Google requires it for registered origins).
- **Failure handling.** User cancel → `/login?auth=google_cancelled`; Google
  error → `/login?auth=google_error`; invalid callback → 400 JSON; missing
  credentials → `/login?auth=google_not_configured`; deactivated account →
  `/login?auth=account_disabled`.

## Developer must later

1. Create/select the Google Cloud project.
2. Configure Google Auth Platform / OAuth consent screen.
3. Create a **Web Application** OAuth Client.
4. Add the production Authorized JavaScript Origin.
5. Add the development Authorized JavaScript Origin.
6. Add the exact authorized redirect URI (below).
7. Copy the Client ID into `GOOGLE_CLIENT_ID`.
8. Copy the Client Secret into `GOOGLE_CLIENT_SECRET`.
9. Store both values securely in the production hosting environment
   (never in source, never in Git, never in frontend code).
10. Test both flows: brand-new Google account (creates a Requi account) and a
    Google email that already has a Requi account (signs into the same account).

## Exact values for Google Cloud (from the current codebase)

- **Production JavaScript Origin:** `https://requitrrading.com`
- **Development JavaScript Origin:** `http://localhost:3000`
- **Production Redirect URI:** `https://requitrrading.com/api/auth/google/callback`
- **Development Redirect URI:** `http://localhost:3000/api/auth/google/callback`
- **Environment variables required:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

## Verified after implementation

- Existing Kimi sign-in: unchanged and working.
- Demo sign-in: unchanged and working.
- Google button renders on the login page (single page serves sign-in and
  sign-up — accounts auto-provision on first login).
- Missing Google credentials fail gracefully (notice, no crash).
- The Google code path is ready for credentials — activation = set two env
  vars and restart.
