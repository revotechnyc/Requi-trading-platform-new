import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { authedQuery, createRouter } from "./middleware";
import { t } from "./middleware";
import { getDb } from "./queries/connection";
import { governancePackages } from "@db/schema";
import { compileGovernance } from "./governance/compiler";
import { documentRegistry, ensureGovernanceReady, publicPackageStatus, runtimePreflight } from "./governance/runtime";

/**
 * Governance API — principle of least disclosure.
 *
 * USER-level clients receive only safe projections (package version, short
 * hash, deployment status). Compilation, documents registry, reports, and
 * activation require the GOVERNANCE_ADMIN role. Raw documents, artifact
 * content, rules, thresholds, and traces are NEVER returned by any endpoint.
 */

const requireGovernanceAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user || ctx.user.govRole !== "GOVERNANCE_ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Requires GOVERNANCE_ADMIN role" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const govAdmin = authedQuery.use(requireGovernanceAdmin);

export const governanceRouter = createRouter({
  /** Any authenticated user: minimal deployment status (operator-safe fields). */
  status: authedQuery.query(async ({ ctx }) => {
    const packages = await publicPackageStatus();
    const active = packages.find((p) => p.status === "ACTIVE");
    return {
      activePackage: active ? { version: active.version, hashShort: active.hashShort, activatedAt: active.activatedAt } : null,
      packageCount: packages.length,
      role: ctx.user!.govRole,
    };
  }),

  /** GOVERNANCE_ADMIN: authenticated document registry (metadata only, never content). */
  documents: govAdmin.query(async () => documentRegistry()),

  /** GOVERNANCE_ADMIN: package version history (hashes/statuses, never artifact content). */
  packages: govAdmin.query(async () => publicPackageStatus()),

  /** GOVERNANCE_ADMIN: compilation report of a package (stage results + unresolved markers). */
  report: govAdmin.input(z.object({ packageId: z.string() })).query(async ({ input }) => {
    const db = getDb();
    const [row] = await db.select().from(governancePackages).where(eq(governancePackages.id, input.packageId)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Package not found" });
    return JSON.parse(row.report) as unknown;
  }),

  /** GOVERNANCE_ADMIN: run the full compilation pipeline → new STAGED package. */
  compile: govAdmin.mutation(async ({ ctx }) => {
    await ensureGovernanceReady();
    try {
      const compiled = await compileGovernance({ approvedBy: ctx.user!.name ?? ctx.user!.unionId });
      const db = getDb();
      const [inserted] = await db
        .insert(governancePackages)
        .values({
          version: compiled.version,
          hash: compiled.hash,
          signature: compiled.signature,
          status: "STAGED",
          artifact: compiled.artifact,
          report: JSON.stringify(compiled.report),
        })
        .returning();
      return { ok: true, packageId: inserted.id, version: compiled.version, hashShort: compiled.hash.slice(0, 12), report: compiled.report };
    } catch (e) {
      const err = e as Error & { report?: unknown };
      if (err.report) return { ok: false, report: err.report };
      throw e;
    }
  }),

  /** GOVERNANCE_ADMIN: promote a STAGED package to ACTIVE (previous ACTIVE rolls back). */
  activate: govAdmin.input(z.object({ packageId: z.string() })).mutation(async ({ input }) => {
    const db = getDb();
    const [row] = await db.select().from(governancePackages).where(eq(governancePackages.id, input.packageId)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Package not found" });
    if (row.status !== "STAGED") throw new TRPCError({ code: "BAD_REQUEST", message: "Only STAGED packages can be activated" });
    await db.update(governancePackages).set({ status: "ROLLED_BACK" }).where(eq(governancePackages.status, "ACTIVE"));
    await db.update(governancePackages).set({ status: "ACTIVE", activatedAt: new Date() }).where(eq(governancePackages.id, input.packageId));
    return { ok: true, version: row.version };
  }),

  /** GOVERNANCE_ADMIN: dry-run the autonomous preflight against the active signed package. */
  preflightCheck: govAdmin.query(async () =>
    runtimePreflight({ killSwitchArmed: true, accountReconciled: true, dataCurrent: true, brokerOperational: true }),
  ),

  /** GOVERNANCE_ADMIN: recent packages for the deployment timeline. */
  history: govAdmin.query(async () => {
    const db = getDb();
    const rows = await db.select().from(governancePackages).orderBy(desc(governancePackages.id)).limit(20);
    return rows.map((r) => ({ id: r.id, version: r.version, status: r.status, hashShort: r.hash.slice(0, 12), createdAt: r.createdAt, activatedAt: r.activatedAt }));
  }),
});
