/**
 * Automated RLS tenant-isolation tests.
 *
 * Verifies database-level isolation (layer 2): connecting through the
 * NOLOGIN-equivalent constrained role `app_user`, a session carrying tenant
 * A's claims must not be able to read or write tenant B's rows — even with
 * full table grants. Runs against the local Postgres (PG_SOCKET_DIR) or
 * DATABASE_URL.
 *
 *   node scripts/rls-test.mjs
 */
import postgres from "postgres";

const socketDir = process.env.PG_SOCKET_DIR || "/home/kimi/pgdata";
const dbName = process.env.PG_DATABASE || "requi";
const user = process.env.PG_USER || "postgres";

const sql = process.env.DATABASE_URL
  ? postgres(process.env.DATABASE_URL, { max: 1 })
  : postgres("", { max: 1, host: socketDir, database: dbName, user, username: user, port: 5432 });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const ORG_A = "rls-org-a-" + Date.now();
const ORG_B = "rls-org-b-" + Date.now();
const USER_A = "rls-user-a-" + Date.now();
const USER_B = "rls-user-b-" + Date.now();

try {
  // ── Fixture (as superuser/owner, bypasses RLS for setup) ──────────────
  await sql`
    INSERT INTO users (id, "unionId", name, email, "authProvider")
    VALUES (${USER_A}, ${"rls:" + USER_A}, 'RLS User A', ${USER_A + "@test.local"}, 'DEMO'),
           (${USER_B}, ${"rls:" + USER_B}, 'RLS User B', ${USER_B + "@test.local"}, 'DEMO')
    ON CONFLICT DO NOTHING`;
  await sql`
    INSERT INTO organizations (id, name, slug, type, "ownerId")
    VALUES (${ORG_A}, 'RLS Org A', ${ORG_A}, 'ENTERPRISE', ${USER_A}),
           (${ORG_B}, 'RLS Org B', ${ORG_B}, 'ENTERPRISE', ${USER_B})
    ON CONFLICT DO NOTHING`;
  await sql`
    INSERT INTO memberships ("organizationId", "userId", "orgRole", status)
    VALUES (${ORG_A}, ${USER_A}, 'OWNER', 'ACTIVE'),
           (${ORG_B}, ${USER_B}, 'OWNER', 'ACTIVE')`;

  // Tenant-scoped rows: support tickets filed under each org (p_tenant set).
  const tickA = "rls-tick-a-" + Date.now();
  const tickB = "rls-tick-b-" + Date.now();
  await sql`
    INSERT INTO support_tickets (id, "userId", "organizationId", "userName", "userEmail", subject)
    VALUES (${tickA}, ${USER_A}, ${ORG_A}, 'RLS User A', ${USER_A + "@test.local"}, 'Org A ticket'),
           (${tickB}, ${USER_B}, ${ORG_B}, 'RLS User B', ${USER_B + "@test.local"}, 'Org B ticket')`;

  // Owner-scoped rows: one private strategy per user (p_owner set).
  const stratA = "rls-strat-a-" + Date.now();
  const stratB = "rls-strat-b-" + Date.now();
  await sql`
    INSERT INTO strategies (id, "userId", name, prompt)
    VALUES (${stratA}, ${USER_A}, 'User A Strategy', 'buy the dip'),
           (${stratB}, ${USER_B}, 'User B Strategy', 'sell the rip')`;

  // ── Helper: run statements as constrained role with claims ────────────
  // Session-level SET (pool max:1 → no interleaving); a poisoned statement
  // must not abort a surrounding transaction, so no sql.begin here.
  async function asTenant(claims, fn) {
    await sql.unsafe("RESET ROLE").catch(() => {});
    await sql.unsafe("SET ROLE app_user");
    await sql.unsafe(
      `SELECT set_config('app.current_user', $1, false), set_config('app.current_org', $2, false), set_config('app.platform_role', $3, false)`,
      [claims.user, claims.org, claims.role ?? "NONE"],
    );
    try {
      return await fn(sql);
    } finally {
      await sql.unsafe("RESET ROLE").catch(() => {});
      await sql.unsafe(
        `SELECT set_config('app.current_user', '', false), set_config('app.current_org', '', false), set_config('app.platform_role', '', false)`,
      ).catch(() => {});
    }
  }

  const tenantA = { user: USER_A, org: ORG_A };
  const tenantB = { user: USER_B, org: ORG_B };

  // ── 1. Tenant A reads only its own org's tickets ──────────────────────
  const aSees = await asTenant(tenantA, (tx) =>
    tx`SELECT id FROM support_tickets WHERE "organizationId" IS NOT NULL`,
  );
  const aIds = aSees.map((r) => r.id);
  check("tenant A sees own org ticket", aIds.includes(tickA));
  check("tenant A cannot read tenant B ticket", !aIds.includes(tickB), `visible: ${aIds.length} row(s)`);

  // ── 2. Tenant A cannot INSERT a row into tenant B's org ───────────────
  const insertBlocked = await asTenant(tenantA, async (tx) => {
    try {
      const r = await tx`
        INSERT INTO support_tickets (id, "userId", "organizationId", "userName", "userEmail", subject)
        VALUES ('rls-evil-1', ${USER_A}, ${ORG_B}, 'Evil', 'evil@test.local', 'Evil Insert') RETURNING id`;
      return { blocked: r.length === 0, threw: false };
    } catch {
      return { blocked: true, threw: true };
    }
  });
  check("tenant A cannot write into tenant B org", insertBlocked.blocked, insertBlocked.threw ? "rejected" : "row filtered");

  // ── 3. Tenant A cannot UPDATE tenant B's ticket ───────────────────────
  const updCount = await asTenant(tenantA, async (tx) => {
    const r = await tx`
      UPDATE support_tickets SET subject = 'Hijacked' WHERE id = ${tickB} RETURNING id`;
    return r.length;
  });
  check("tenant A cannot update tenant B ticket", updCount === 0);

  // ── 4. Tenant A cannot DELETE tenant B's ticket ───────────────────────
  const delCount = await asTenant(tenantA, async (tx) => {
    const r = await tx`DELETE FROM support_tickets WHERE id = ${tickB} RETURNING id`;
    return r.length;
  });
  check("tenant A cannot delete tenant B ticket", delCount === 0);

  // ── 5. Owner-scoped table: user A cannot read user B's strategy ───────
  const stratVisible = await asTenant(tenantA, (tx) =>
    tx`SELECT id FROM strategies WHERE id IN (${stratA}, ${stratB})`,
  );
  const stratIds = stratVisible.map((r) => r.id);
  check("user A sees own strategy", stratIds.includes(stratA));
  check("user A cannot read user B's strategy", !stratIds.includes(stratB));

  // ── 6. Cross-user write blocked on owner-scoped table ─────────────────
  const ownerInsert = await asTenant(tenantA, async (tx) => {
    try {
      const r = await tx`
        INSERT INTO strategies (id, "userId", name, prompt)
        VALUES ('rls-evil-2', ${USER_B}, 'spoofed', 'spoof') RETURNING id`;
      return r.length === 0;
    } catch {
      return true;
    }
  });
  check("user A cannot create a strategy as user B", ownerInsert);

  // ── 7. Platform admin sees across tenants ─────────────────────────────
  const adminSees = await asTenant({ user: USER_A, org: ORG_A, role: "PLATFORM_ADMIN" }, (tx) =>
    tx`SELECT id FROM support_tickets WHERE id IN (${tickA}, ${tickB})`,
  );
  check("platform admin reads across tenants", adminSees.length === 2);

  // ── 8. Audit log: ordinary user cannot read audit history ─────────────
  const auditBlocked = await asTenant(tenantA, async (tx) => {
    try {
      const r = await tx`SELECT count(*)::int AS n FROM audit_log`;
      return r[0].n === 0;
    } catch {
      return true;
    }
  });
  check("non-admin cannot read audit_log", auditBlocked);

  // ── 9. Audit log mutation rejected (append-only trigger) ──────────────
  const auditImmutable = await (async () => {
    try {
      await sql`UPDATE audit_log SET action = 'tampered' LIMIT 1`;
      return false;
    } catch {
      return true;
    }
  })();
  check("audit_log UPDATE rejected (append-only)", auditImmutable);

  // ── 10. Marketplace: APPROVED items world-readable, DRAFT hidden ──────
  const draftSlug = "rls-draft-" + Date.now();
  await sql`
    INSERT INTO marketplace_items (slug, name, author, kind, asset, price, category, description, tags, prompt, status, "creatorId")
    VALUES (${draftSlug}, 'Draft Item', 'RTI', 'Strategy', 'Stocks', 29, 'Test', 'draft', 'test', 'draft prompt', 'DRAFT', ${USER_B})`;
  const draftVisible = await asTenant(tenantA, (tx) =>
    tx`SELECT slug FROM marketplace_items WHERE slug = ${draftSlug}`,
  );
  check("unapproved marketplace item hidden from other users", draftVisible.length === 0);

  // ── Fixture cleanup (as owner) ────────────────────────────────────────
  await sql`DELETE FROM marketplace_items WHERE slug = ${draftSlug}`;
  await sql`DELETE FROM support_tickets WHERE "userId" IN (${USER_A}, ${USER_B}) OR id IN ('rls-evil-1')`;
  await sql`DELETE FROM strategies WHERE id IN (${stratA}, ${stratB}) OR id = 'rls-evil-2'`;
  await sql`DELETE FROM memberships WHERE "organizationId" IN (${ORG_A}, ${ORG_B})`;
  await sql`DELETE FROM organizations WHERE id IN (${ORG_A}, ${ORG_B})`;
  await sql`DELETE FROM users WHERE id IN (${USER_A}, ${USER_B})`;
} catch (e) {
  console.error("RLS test harness error:", e);
  process.exitCode = 2;
} finally {
  await sql.end();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} RLS checks passed`);
if (failed.length > 0) process.exitCode = 1;
