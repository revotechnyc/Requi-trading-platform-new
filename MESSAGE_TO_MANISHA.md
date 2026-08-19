# Message to Manisha

---

Hi Manisha,

The new Requi Trading build is ready — **version 467f15d, which supersedes all previous versions.** We've corrected a lot to make deployment much easier for you. Here's what changed and what you need to do.

## What we updated

1. **Database — now production-grade.** We moved the entire platform from MySQL to PostgreSQL (fully Supabase-compatible). All 67 tables are created through version-controlled migration files, so dev, staging, and production deploy identically — no more manual schema fixes. Seed data (plans, feature flags, notification templates) is included automatically.

2. **Supabase Auth is wired in.** Email/password sign-up and sign-in, email verification, password reset, and Google sign-in are all built into the login page. The moment you set the four `SUPABASE_*` environment variables, it goes live. Until then, the app keeps working with the existing sign-in — nothing breaks either way.

3. **Real multi-tenancy with database-level isolation.** Organizations, workspaces, teams, and memberships are in place, and tenant isolation is enforced by Postgres row-level security — not just hidden in the UI. We included an automated test suite (`node scripts/rls-test.mjs`) that proves tenant A cannot read, write, update, or delete tenant B's data — all 12 checks pass.

4. **Owner Control Center.** You'll get a proper console: business metrics (users, organizations, active subscriptions, MRR, open incidents), user management (search, suspend, restore, revoke sessions), incident management, feature flags, a full audit trail, and a live health dashboard. Destructive actions require typing a confirmation and are permanently audit-logged. Access is granted only to emails listed in `PLATFORM_OWNER_EMAILS` — nobody else gets it.

5. **Billing architecture + cancellation workflow.** Plans, subscriptions, invoices, payments, refunds, and credits tables are in place; the Stripe webhook endpoint is verified, idempotent, and logged. Card numbers are never stored — brand/last4 only. Users can request cancellation from Settings; requests go to a review queue and take effect at period end. Checkout remains safely disabled until you flip the feature flag.

6. **System health monitoring.** Lightweight checks run every 5 minutes and a deep audit runs twice a day, covering database, migrations, RLS integrity, webhook backlog, and kill-switch integrity. Failures automatically open incidents in your console.

7. **Security cleanup.** We removed a hard-coded fake API key from the Settings page and audited secrets — everything now comes from environment variables, with placeholders in `.env.example`. The audit log is append-only at the database level; nobody (including admins) can alter history.

## What you need to do

It's three steps, detailed in the attached deployment guide (`REQUI_TRADING_部署指南_DEPLOYMENT_GUIDE.md`):

1. Create a Supabase project and copy the connection string + keys into `.env` (the guide lists exactly which ones).
2. Add your email to `PLATFORM_OWNER_EMAILS`, then run `node scripts/migrate.mjs` and start the server (`npm run build` → `node dist/boot.js`).
3. Verify with `node scripts/rls-test.mjs` (should print 12/12) and sign in once — your workspace and owner access provision automatically.

Stripe, Google sign-in, and email delivery activate as soon as you add their keys — the app detects them and fails gracefully until then, so you can deploy first and enable services one at a time.

Everything is documented per module in the guide. If anything is unclear, send me the exact error message and I'll walk you through it.

Best regards,
The Requi Trading team
