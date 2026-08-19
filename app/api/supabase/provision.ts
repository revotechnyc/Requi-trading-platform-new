import { eq } from "drizzle-orm";
import * as schema from "@db/schema";
import type { User } from "@db/schema";
import { getDb } from "../queries/connection";
import { findUserByEmail, findUserByUnionId, upsertUser } from "../queries/users";
import type { SupabaseClaims } from "./session";

/**
 * Profile provisioning for Supabase-authenticated identities.
 *
 * The app `users` row is the profile keyed to the Supabase auth user id
 * (`unionId = supabase:{sub}`). On first sign-in we:
 *   1. reuse an existing profile with the same unionId, else
 *   2. link an existing profile by verified email (migration path), else
 *   3. create the profile and bootstrap a PERSONAL organization with an
 *      OWNER membership so every account starts with a valid tenant.
 * Every provisioning event is written to the append-only audit log.
 */
function providerLabel(provider: string): string {
  return provider.toUpperCase().replace(/[^A-Z0-9_]/g, "_") || "SUPABASE";
}

function orgSlug(email: string | undefined, sub: string): string {
  const local = (email?.split("@")[0] ?? "user").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${local || "user"}-${sub.slice(0, 8)}`;
}

/**
 * Ensure a user has a PERSONAL organization + OWNER membership and an
 * activeOrganizationId. Idempotent — used by Supabase provisioning and by
 * legacy/demo sign-in paths.
 */
export async function ensurePersonalOrg(user: User): Promise<void> {
  if (user.activeOrganizationId) return;
  const db = getDb();
  const slug = orgSlug(user.email ?? undefined, user.unionId);
  const existing = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, slug))
    .limit(1)
    .then((r) => r.at(0));
  const orgRow =
    existing ??
    (await db
      .insert(schema.organizations)
      .values({
        name: `${user.name ?? "Personal"} Workspace`,
        slug,
        type: "PERSONAL",
        ownerId: user.id,
      })
      .onConflictDoNothing({ target: schema.organizations.slug })
      .returning()
      .then((r) => r.at(0)));
  if (!orgRow) return;
  await db
    .insert(schema.memberships)
    .values({ organizationId: orgRow.id, userId: user.id, orgRole: "OWNER", status: "ACTIVE" })
    .onConflictDoNothing();
  await db
    .update(schema.users)
    .set({ activeOrganizationId: orgRow.id })
    .where(eq(schema.users.id, user.id));
}

export async function provisionSupabaseUser(
  claims: SupabaseClaims,
  ctx?: { ip?: string; userAgent?: string },
): Promise<User | null> {
  const unionId = `supabase:${claims.sub}`;
  const existing = await findUserByUnionId(unionId);
  if (existing) {
    await upsertUser({
      unionId,
      lastSignInAt: new Date(),
      emailVerified: claims.emailConfirmed,
      ...(claims.avatarUrl ? { avatar: claims.avatarUrl } : {}),
      ...(claims.name && !existing.name ? { name: claims.name } : {}),
    });
    return (await findUserByUnionId(unionId)) ?? null;
  }

  // Link-by-email: adopt a legacy profile when the verified email matches.
  if (claims.email && claims.emailConfirmed) {
    const legacy = await findUserByEmail(claims.email);
    if (legacy) {
      const db = getDb();
      await db
        .update(schema.users)
        .set({
          unionId,
          providerUserId: claims.sub,
          authProvider: providerLabel(claims.provider),
          emailVerified: true,
          lastSignInAt: new Date(),
        })
        .where(eq(schema.users.id, legacy.id));
      await db.insert(schema.auditLog).values({
        actorUserId: legacy.id,
        organizationId: legacy.activeOrganizationId,
        action: "auth.account_linked",
        targetType: "user",
        targetId: legacy.id,
        ip: ctx?.ip,
        userAgent: ctx?.userAgent,
        after: { provider: claims.provider, supabaseSub: claims.sub },
      });
      return (await findUserByUnionId(unionId)) ?? null;
    }
  }

  // New account: profile + personal organization bootstrap.
  await upsertUser({
    unionId,
    name: claims.name ?? claims.email?.split("@")[0] ?? "Trader",
    email: claims.email,
    avatar: claims.avatarUrl,
    providerUserId: claims.sub,
    authProvider: providerLabel(claims.provider),
    emailVerified: claims.emailConfirmed,
    lastSignInAt: new Date(),
  });
  const user = await findUserByUnionId(unionId);
  if (!user) return null;

  const db = getDb();
  const [org] = await db
    .insert(schema.organizations)
    .values({
      name: `${user.name ?? "Personal"} Workspace`,
      slug: orgSlug(claims.email, claims.sub),
      type: "PERSONAL",
      ownerId: user.id,
    })
    .onConflictDoNothing({ target: schema.organizations.slug })
    .returning();
  const orgRow =
    org ??
    (await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, orgSlug(claims.email, claims.sub)))
      .limit(1)
      .then((r) => r.at(0)));
  if (orgRow) {
    await db
      .insert(schema.memberships)
      .values({
        organizationId: orgRow.id,
        userId: user.id,
        orgRole: "OWNER",
        status: "ACTIVE",
      })
      .onConflictDoNothing();
    await db
      .update(schema.users)
      .set({ activeOrganizationId: orgRow.id })
      .where(eq(schema.users.id, user.id));
  }
  await db.insert(schema.auditLog).values({
    actorUserId: user.id,
    organizationId: orgRow?.id,
    action: "auth.account_provisioned",
    targetType: "user",
    targetId: user.id,
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
    after: { provider: claims.provider, emailVerified: claims.emailConfirmed },
  });
  return (await findUserByUnionId(unionId)) ?? null;
}
