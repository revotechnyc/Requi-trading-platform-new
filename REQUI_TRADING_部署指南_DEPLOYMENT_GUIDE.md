# Requi Trading — Deployment Guide (Version 467f15d)

**This version supersedes all previous versions.** The platform is now a production-ready, multi-tenant SaaS on PostgreSQL (Supabase-compatible) with version-controlled migrations, Supabase Auth, database-enforced tenant isolation, an Owner Control Center, billing architecture, and a system health platform.

---

## 0. What Changed (Summary)

| Area | Before | Now |
|---|---|---|
| Database | MySQL, runtime auto-DDL | PostgreSQL (Supabase-compatible), 67 tables, **version-controlled migrations** (`db/migrations/0000–0005`) |
| Auth | Kimi OAuth only | **Supabase Auth** (email/password, email verification, password reset, Google OAuth-ready) + JWKS token verification; Kimi/demo retained as dev fallback |
| Tenancy | none | ORGANIZATION → WORKSPACE → TEAM → USER, **RLS-enforced isolation** (12/12 automated isolation tests pass) |
| Admin | basic admin pages | **Owner Control Center**: business metrics, user management (suspend / restore / revoke sessions with confirmation + audit), incidents, feature flags, health dashboard, audit trail |
| Billing | none | plans / subscriptions / invoices / payments / refunds / credits tables, **verified + idempotent Stripe webhook** (`POST /api/webhooks/stripe`), Request Cancellation workflow |
| Health | manual system check | Continuous **light checks (5 min)** + **deep audit (2×/day)**, auto-incident creation with OPEN → ACKNOWLEDGED → INVESTIGATING → MONITORING → RESOLVED |
| Audit | none | **Append-only audit log** (DB trigger rejects UPDATE/DELETE; role-level revocation) |
| Secrets | a hard-coded fake API key in Settings | Removed; all secrets via env; `.env.example` placeholders only |

---

## 1. Infrastructure Prerequisites

- **Supabase project** (or any PostgreSQL 14+): create a project at supabase.com → note the connection string, anon key, service-role key.
- **Node.js 20+** host for the app server.
- Optional: Stripe account (billing), SMTP provider (email notifications).

## 2. Environment Variables

Copy `.env.example` → `.env` and fill in:

```bash
# Database (Supabase Postgres)
DATABASE_URL=postgres://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres

# Supabase Auth
SUPABASE_URL=https://[PROJECT].supabase.co
SUPABASE_ANON_KEY=...            # publishable — safe
SUPABASE_SERVICE_ROLE_KEY=...    # server only — NEVER expose to the browser
SUPABASE_JWT_SECRET=             # optional (legacy HS256); JWKS verification is preferred and needs nothing

# Platform owner (gets the SAAS_OWNER role at first sign-in)
PLATFORM_OWNER_EMAILS=manisha@requitrrading.com

# Stripe (optional until billing launches)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PUBLISHABLE_KEY=
```

No production secrets are hard-coded anywhere in the codebase.

## 3. Module-by-Module Deployment

### 3.1 Database & Migrations
```bash
node scripts/migrate.mjs        # applies 0000_init → 0005 in order, tracked in drizzle.__drizzle_migrations
```
Deterministic dev → staging → prod: the same migration files apply everywhere. Seed data (plans BASIC $0 / PRO $49 / ENTERPRISE *Contact Sales*, feature flags, notification templates, alert rules) is included and idempotent.

### 3.2 Row-Level Security (tenant isolation)
Applied by migration `0001`/`0003`/`0005` — no app config needed. Verify anytime:
```bash
node scripts/rls-test.mjs       # expect: 12/12 RLS checks passed
```

### 3.3 Supabase Auth
1. In the Supabase dashboard: enable **Email** provider; add Google under **Authentication → Providers** for OAuth.
2. Add your domain to **Authentication → URL Configuration** (redirect URL: `https://requitrrading.com/login`).
3. Set the four `SUPABASE_*` env vars. The login page automatically switches to the Supabase UI (email/password, Google, reset). Without them, the app gracefully falls back to the existing sign-in.
4. First sign-in auto-provisions: profile → personal organization → OWNER membership (audit-logged).

### 3.4 Application Server
```bash
npm install
npm run build                   # builds frontend (dist/) + API bundle
NODE_ENV=production node dist/boot.js
```
On boot the server runs migrations, starts the health scheduler, engine loops, and serves the app on `PORT` (default 3000).

### 3.5 Owner Control Center
- Granted via `PLATFORM_OWNER_EMAILS` only (least privilege — regular staff stay `NONE`).
- Routes: owner overview, user search / suspend (`SUSPEND`) / restore (`RESTORE`) / revoke sessions (`REVOKE`), incidents, feature flags (`SET FLAG`), audit trail, health dashboard.
- Every destructive action requires typing a confirmation string and is written to the append-only audit log.

### 3.6 Billing & Stripe Webhook
1. Create the webhook in Stripe: endpoint `https://requitrrading.com/api/webhooks/stripe`, events: `payment_intent.*`, `invoice.*`, `customer.subscription.*`.
2. Set `STRIPE_WEBHOOK_SECRET`. Signature verification (HMAC-SHA256 + 5-min tolerance) and event dedup (`webhook_events` unique key) are built in.
3. Marketplace checkout stays **fail-closed** until the `marketplace_checkout` feature flag is enabled in the Owner Console — no charge can ever be made accidentally.

### 3.7 System Health Platform
Starts automatically with the server: light checks every 5 minutes, deep audit twice daily. HIGH/CRITICAL failures auto-create incidents visible in the Owner Console. Health checks never generate real financial transactions.

### 3.8 Notifications
In-app notifications work out of the box. Email deliveries queue in `notification_deliveries` and are sent once an email provider is configured; nothing is ever reported as "sent" unless it actually was.

## 4. Post-Deploy Verification Checklist

```bash
node scripts/rls-test.mjs                      # 12/12 tenant isolation checks
curl https://requitrrading.com/api/trpc/ping   # {"status":"ok",...}
```
Then in the browser: sign in via Supabase → workspace loads → Owner Console shows metrics → run a deep audit from the health dashboard → confirm zero FAILs.

## 5. Rollback

Any previous snapshot can be restored from the version history (previous version IDs: `12b1cc5`, `598864c`, `d05edcd`). The database is forward-only via migrations — roll back the app, never the schema.
