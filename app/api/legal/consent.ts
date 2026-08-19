/**
 * ConsentService (Legal Revision §8, §9, §36, §37) — the single consent authority.
 * Accounts, Autonomous, Marketplace, and Privacy surfaces consume this service;
 * no page implements its own consent logic.
 *
 * - Every acceptance is a versioned LegalAcceptance row (never termsAccepted=true).
 * - Re-consent: when counsel marks a new version requiresReconsent, users with a
 *   prior-version acceptance are re-prompted; historical rows are preserved.
 * - Optional consent (marketing) is never bundled with mandatory acceptance.
 */
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { consentPreferences, legalAcceptances, legalDocuments, users } from "@db/schema";
import { getDb } from "../queries/connection";
import { recordAudit } from "../queries/audit";

/** Documents that gate specific surfaces. version = "latest seeded version" at runtime. */
export const REQUIRED_SIGNUP_DOCS = ["terms-of-service", "privacy-policy"] as const;
export const AUTONOMOUS_DOC = "autonomous-trading-disclosure";
export const MARKETPLACE_DOCS = ["marketplace-terms", "strategy-buyer-terms"] as const;

/** Latest version of a document regardless of status (drafts are served with a banner). */
export async function latestDoc(slug: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(legalDocuments)
    .where(eq(legalDocuments.slug, slug))
    .orderBy(desc(legalDocuments.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listLatestDocs() {
  const db = getDb();
  const rows = await db.select().from(legalDocuments).orderBy(desc(legalDocuments.createdAt));
  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.slug)) latest.set(r.slug, r);
  return [...latest.values()];
}

export async function docHistory(slug: string) {
  const db = getDb();
  return db
    .select()
    .from(legalDocuments)
    .where(eq(legalDocuments.slug, slug))
    .orderBy(desc(legalDocuments.createdAt));
}

export async function recordAcceptance(e: {
  userId: string;
  slug: string;
  method: string;
  context?: string | null;
  locale?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ consentRecordId: string; documentVersion: string } | null> {
  const db = getDb();
  const doc = await latestDoc(e.slug);
  if (!doc) return null;
  // Idempotent: an acceptance of this exact version already on file is returned, not duplicated.
  const existing = await db
    .select()
    .from(legalAcceptances)
    .where(and(eq(legalAcceptances.userId, e.userId), eq(legalAcceptances.documentSlug, e.slug), eq(legalAcceptances.documentVersion, doc.version)))
    .limit(1);
  if (existing[0]) {
    return { consentRecordId: existing[0].consentRecordId, documentVersion: doc.version };
  }
  const consentRecordId = randomUUID();
  await db.insert(legalAcceptances).values({
    consentRecordId,
    userId: e.userId,
    documentSlug: e.slug,
    documentVersion: doc.version,
    documentId: doc.id,
    effectiveDate: doc.effectiveDate,
    method: e.method,
    context: e.context ?? null,
    locale: e.locale ?? null,
    ipAddress: e.ipAddress ?? null,
    userAgent: e.userAgent ?? null,
  });
  void recordAudit({
    userId: e.userId,
    action: "LEGAL_ACCEPTED",
    entityType: "SETTING",
    entityId: `${e.slug}@${doc.version}`,
    meta: { method: e.method, consentRecordId },
  });
  return { consentRecordId, documentVersion: doc.version };
}

/** Required docs the user has NOT accepted at the current version (re-consent aware). */
export async function pendingRequirements(userId: string): Promise<string[]> {
  const db = getDb();
  const pending: string[] = [];
  for (const slug of REQUIRED_SIGNUP_DOCS) {
    const doc = await latestDoc(slug);
    if (!doc) continue;
    const rows = await db
      .select()
      .from(legalAcceptances)
      .where(and(eq(legalAcceptances.userId, userId), eq(legalAcceptances.documentSlug, slug), eq(legalAcceptances.documentVersion, doc.version)))
      .limit(1);
    if (!rows[0]) pending.push(slug);
  }
  return pending;
}

export async function hasAcceptedCurrent(userId: string, slug: string): Promise<boolean> {
  const db = getDb();
  const doc = await latestDoc(slug);
  if (!doc) return false;
  const rows = await db
    .select()
    .from(legalAcceptances)
    .where(and(eq(legalAcceptances.userId, userId), eq(legalAcceptances.documentSlug, slug), eq(legalAcceptances.documentVersion, doc.version)))
    .limit(1);
  return !!rows[0];
}

export async function getPreferences(userId: string) {
  const db = getDb();
  const rows = await db.select().from(consentPreferences).where(eq(consentPreferences.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function upsertPreferences(
  userId: string,
  patch: Partial<Pick<typeof consentPreferences.$inferInsert, "marketingEmail" | "marketingSms" | "analyticsCookies" | "gpcHonored">>,
): Promise<void> {
  const db = getDb();
  const existing = await getPreferences(userId);
  if (!existing) {
    await db.insert(consentPreferences).values({ userId, ...patch });
  } else {
    await db.update(consentPreferences).set(patch).where(eq(consentPreferences.userId, userId));
  }
  void recordAudit({
    userId,
    action: "CONSENT_PREF_CHANGED",
    entityType: "SETTING",
    entityId: "consent_preferences",
    meta: patch,
  });
}

export async function recordGpcSeen(userId: string): Promise<void> {
  const db = getDb();
  const existing = await getPreferences(userId);
  const patch = { gpcHonored: true, gpcLastSeenAt: new Date() };
  if (!existing) await db.insert(consentPreferences).values({ userId, ...patch });
  else await db.update(consentPreferences).set(patch).where(eq(consentPreferences.userId, userId));
}

export async function recordAgeAttestation(userId: string): Promise<void> {
  const db = getDb();
  const existing = await getPreferences(userId);
  const patch = { ageAttestedAt: new Date() };
  if (!existing) await db.insert(consentPreferences).values({ userId, ...patch });
  else await db.update(consentPreferences).set(patch).where(eq(consentPreferences.userId, userId));
}

/** Deactivate = stop logins/automation. Delete and retention are separate (§33). */
export async function deactivateAccount(userId: string): Promise<void> {
  const db = getDb();
  await db.update(users).set({ autoExecute: false, autoUniverse: false, deactivatedAt: new Date() }).where(eq(users.id, userId));
  void recordAudit({ userId, action: "ACCOUNT_DEACTIVATED", entityType: "SETTING", entityId: String(userId) });
}
