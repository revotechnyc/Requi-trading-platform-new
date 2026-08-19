import { and, desc, eq, ne } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb, getSql } from "../queries/connection";
import { env, supabaseAuthConfigured } from "../lib/env";

/**
 * System Health platform.
 *
 * LIGHT checks run continuously (every few minutes) and are cheap: DB ping,
 * migration head, auth config, engine heartbeat. DEEP audits run twice daily:
 * RLS spot checks, orphaned-tenant scan, webhook backlog, kill-switch
 * integrity. HIGH/CRITICAL failures auto-create incidents. Health checks
 * never generate real financial transactions.
 */

type CheckResult = {
  component: string;
  test: string;
  status: "PASS" | "WARN" | "FAIL";
  latencyMs: number;
  error?: string;
  severity: "INFO" | "WARNING" | "HIGH" | "CRITICAL";
  module?: string;
};

async function timed(fn: () => Promise<void>): Promise<{ ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    await fn();
    return { ms: Date.now() - t0 };
  } catch (e) {
    return { ms: Date.now() - t0, error: (e as Error).message };
  }
}

// ─── LIGHT checks ────────────────────────────────────────────────────────────

const lightChecks: Array<Omit<CheckResult, "status" | "latencyMs" | "error"> & { run: () => Promise<void> }> = [
  {
    component: "database",
    test: "connectivity",
    severity: "CRITICAL",
    module: "core",
    run: async () => {
      await getSql()`select 1`;
    },
  },
  {
    component: "database",
    test: "migration-head",
    severity: "HIGH",
    module: "core",
    run: async () => {
      const rows = await getSql()`select count(*)::int as n from drizzle.__drizzle_migrations`;
      if ((rows[0]?.n ?? 0) < 5) throw new Error("migration head behind expected baseline");
    },
  },
  {
    component: "auth",
    test: "provider-config",
    severity: "WARNING",
    module: "auth",
    run: async () => {
      if (!supabaseAuthConfigured && !env.appSecret) {
        throw new Error("no identity provider configured (Supabase URL/anon key missing)");
      }
    },
  },
  {
    component: "rls",
    test: "claim-helpers-present",
    severity: "HIGH",
    module: "core",
    run: async () => {
      const rows = await getSql()`
        select count(*)::int as n from pg_proc
        where proname in ('current_app_user','current_app_org','is_platform_admin')`;
      if ((rows[0]?.n ?? 0) < 3) throw new Error("RLS claim helper functions missing");
    },
  },
];

// ─── DEEP checks ─────────────────────────────────────────────────────────────

const deepChecks: typeof lightChecks = [
  {
    component: "rls",
    test: "forced-on-tenant-tables",
    severity: "CRITICAL",
    module: "core",
    run: async () => {
      const rows = await getSql()`
        select c.relname from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and c.relrowsecurity = false
          and c.relname in ('strategies','support_tickets','subscriptions','payments','audit_log','users','organizations')`;
      if (rows.length > 0) throw new Error(`RLS disabled on: ${rows.map((r) => r.relname).join(", ")}`);
    },
  },
  {
    component: "tenancy",
    test: "orphaned-memberships",
    severity: "WARNING",
    module: "tenancy",
    run: async () => {
      const rows = await getSql()`
        select count(*)::int as n from memberships m
        left join organizations o on o.id = m."organizationId"
        where o.id is null`;
      if ((rows[0]?.n ?? 0) > 0) throw new Error(`${rows[0].n} memberships reference missing organizations`);
    },
  },
  {
    component: "webhooks",
    test: "unprocessed-backlog",
    severity: "HIGH",
    module: "billing",
    run: async () => {
      const rows = await getSql()`
        select count(*)::int as n from webhook_events
        where "processedAt" is null and "createdAt" < now() - interval '1 hour'`;
      if ((rows[0]?.n ?? 0) > 0) throw new Error(`${rows[0].n} webhook events unprocessed for >1h`);
    },
  },
  {
    component: "safety",
    test: "kill-switch-integrity",
    severity: "HIGH",
    module: "autonomous",
    run: async () => {
      const rows = await getSql()`
        select count(*)::int as n from kill_switches where scope is null or scope = ''`;
      if ((rows[0]?.n ?? 0) > 0) throw new Error("kill switch rows with empty scope");
    },
  },
  {
    component: "audit",
    test: "append-only-trigger",
    severity: "CRITICAL",
    module: "compliance",
    run: async () => {
      const rows = await getSql()`
        select count(*)::int as n from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        where c.relname = 'audit_log' and t.tgname like '%reject%'`;
      if ((rows[0]?.n ?? 0) < 1) throw new Error("audit_log append-only trigger missing");
    },
  },
];

async function recordAndEscalate(
  layer: "LIGHT" | "DEEP",
  def: Omit<CheckResult, "status" | "latencyMs" | "error"> & { run: () => Promise<void> },
): Promise<CheckResult> {
  const { ms, error } = await timed(def.run);
  const status = error ? (def.severity === "WARNING" ? "WARN" : "FAIL") : "PASS";
  const result: CheckResult = { ...def, status, latencyMs: ms, error };
  const db = getDb();
  await db.insert(schema.healthChecks).values({
    component: result.component,
    test: result.test,
    layer,
    status,
    latencyMs: ms,
    error,
    severity: result.severity,
    module: result.module,
    startedAt: new Date(Date.now() - ms),
    completedAt: new Date(),
  });

  if (status === "FAIL" && (result.severity === "HIGH" || result.severity === "CRITICAL")) {
    // Auto-incident: reuse an open incident for the same component/test.
    const existing = await db
      .select()
      .from(schema.incidents)
      .where(
        and(
          eq(schema.incidents.service, `${result.component}/${result.test}`),
          ne(schema.incidents.status, "RESOLVED"),
        ),
      )
      .limit(1)
      .then((r) => r.at(0));
    if (!existing) {
      const [incident] = await db
        .insert(schema.incidents)
        .values({
          service: `${result.component}/${result.test}`,
          title: `Automated ${layer.toLowerCase()} check failed: ${result.component} · ${result.test}`,
          error,
          severity: result.severity,
          status: "OPEN",
        })
        .returning();
      await db.insert(schema.incidentUpdates).values({
        incidentId: incident.id,
        action: "AUTO_CREATED",
        note: `Severity ${result.severity}. Error: ${error}`,
      });
    }
  }
  return result;
}

export async function runLightChecks(): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  for (const c of lightChecks) out.push(await recordAndEscalate("LIGHT", c));
  return out;
}

export async function runDeepAudit(): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  for (const c of deepChecks) out.push(await recordAndEscalate("DEEP", c));
  return out;
}

export async function latestHealth(limit = 60) {
  return getDb()
    .select()
    .from(schema.healthChecks)
    .orderBy(desc(schema.healthChecks.createdAt))
    .limit(limit);
}

export async function healthSummary() {
  const latest = await latestHealth(200);
  const byKey = new Map<string, (typeof latest)[number]>();
  for (const row of latest) {
    const k = `${row.component}/${row.test}`;
    if (!byKey.has(k)) byKey.set(k, row);
  }
  const checks = [...byKey.values()];
  return {
    checks,
    passing: checks.filter((c) => c.status === "PASS").length,
    warning: checks.filter((c) => c.status === "WARN").length,
    failing: checks.filter((c) => c.status === "FAIL").length,
    overall: checks.some((c) => c.status === "FAIL") ? "DEGRADED" : checks.some((c) => c.status === "WARN") ? "WARNING" : "HEALTHY",
  };
}
