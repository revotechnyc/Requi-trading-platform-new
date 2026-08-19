/**
 * Legal & privacy router (Legal Revision §7–§15, §33, §38–§41).
 * Public: versioned document serving for the Legal Center + cookie consent.
 * Authed: acceptance recording, consent status, privacy requests, data export,
 * preferences, account deactivation.
 * Admin: document state machine (human approval only — §42) + privacy queue.
 */
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { adminQuery, authedQuery, createRouter, publicQuery } from "./middleware";
import {
  cookieConsents,
  legalAcceptances,
  legalDocuments,
  privacyRequests,
} from "@db/schema";
import { getDb } from "./queries/connection";
import { recordAudit } from "./queries/audit";
import {
  deactivateAccount,
  docHistory,
  getPreferences,
  hasAcceptedCurrent,
  latestDoc,
  listLatestDocs,
  pendingRequirements,
  recordAcceptance,
  recordAgeAttestation,
  recordGpcSeen,
  upsertPreferences,
  AUTONOMOUS_DOC,
} from "./legal/consent";
import { LEGAL_DOC_SEEDS, LEGAL_DOC_SEEDS_2, SEED_VERSION } from "./legal/content";
import { complianceFlagReport } from "./lib/compliance-flags";

function clientMeta(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  return {
    ipAddress: ip,
    userAgent: req.headers.get("user-agent")?.slice(0, 255) ?? null,
    locale: req.headers.get("accept-language")?.split(",")[0]?.slice(0, 16) ?? null,
    gpc: req.headers.get("sec-gpc") === "1",
  };
}

const DOC_STATUSES = ["DRAFT", "LEGAL_REVIEW", "APPROVED", "SCHEDULED", "ACTIVE", "SUPERSEDED"] as const;
/** Legal transitions an authorized human may perform. AI agents never call these. */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["LEGAL_REVIEW"],
  LEGAL_REVIEW: ["APPROVED", "DRAFT"],
  APPROVED: ["SCHEDULED", "ACTIVE"],
  SCHEDULED: ["ACTIVE", "APPROVED"],
  ACTIVE: ["SUPERSEDED"],
  SUPERSEDED: [],
};

export async function ensureLegalDocsSeeded(): Promise<void> {
  const db = getDb();
  for (const seed of [...LEGAL_DOC_SEEDS, ...LEGAL_DOC_SEEDS_2]) {
    const rows = await db
      .select({ id: legalDocuments.id })
      .from(legalDocuments)
      .where(and(eq(legalDocuments.slug, seed.slug), eq(legalDocuments.version, SEED_VERSION)))
      .limit(1);
    if (rows[0]) continue;
    await db.insert(legalDocuments).values({
      slug: seed.slug,
      title: seed.title,
      category: seed.category,
      version: SEED_VERSION,
      status: "LEGAL_REVIEW",
      requiresReconsent: seed.requiresReconsent,
      content: seed.content,
    });
  }
}

// Lazy, exactly-once re-seed guard for request paths: a fresh database (new
// preview container, reset staging env) must never surface "Unknown document"
// just because boot-time seeding has not run yet.
let seedOnce: Promise<void> | null = null;
function ensureDocsReady(): Promise<void> {
  seedOnce ??= ensureLegalDocsSeeded().catch((e) => {
    seedOnce = null; // allow retry on next request
    throw e;
  });
  return seedOnce;
}

function publicDocView(d: typeof legalDocuments.$inferSelect) {
  return {
    slug: d.slug,
    title: d.title,
    category: d.category,
    version: d.version,
    status: d.status,
    effectiveDate: d.effectiveDate,
    content: d.content,
    updatedAt: d.updatedAt,
  };
}

export const legalRouter = createRouter({
  /* ------------------------- Public: Legal Center ------------------------- */
  list: publicQuery.query(async () => {
    await ensureDocsReady();
    const docs = await listLatestDocs();
    return docs.map((d) => ({
      slug: d.slug,
      title: d.title,
      category: d.category,
      version: d.version,
      status: d.status,
      effectiveDate: d.effectiveDate,
      updatedAt: d.updatedAt,
    }));
  }),

  doc: publicQuery
    .input(z.object({ slug: z.string().max(64), version: z.string().max(24).optional() }))
    .query(async ({ input }) => {
      await ensureDocsReady();
      const db = getDb();
      let row;
      if (input.version) {
        const rows = await db
          .select()
          .from(legalDocuments)
          .where(and(eq(legalDocuments.slug, input.slug), eq(legalDocuments.version, input.version)))
          .limit(1);
        row = rows[0];
      } else {
        row = await latestDoc(input.slug);
      }
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
      return publicDocView(row);
    }),

  history: publicQuery.input(z.object({ slug: z.string().max(64) })).query(async ({ input }) => {
    const rows = await docHistory(input.slug);
    return rows.map((d) => ({
      version: d.version,
      status: d.status,
      effectiveDate: d.effectiveDate,
      updatedAt: d.updatedAt,
    }));
  }),

  /** Cookie consent — anonymous or authed; statutory choice lives server-side (§14–§15). */
  recordCookieConsent: publicQuery
    .input(
      z.object({
        consentId: z.string().max(40),
        analytics: z.boolean(),
        functional: z.boolean(),
        advertising: z.boolean(),
        gpcSignal: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const meta = clientMeta(ctx.req);
      const gpc = input.gpcSignal || meta.gpc;
      const existing = await db
        .select()
        .from(cookieConsents)
        .where(eq(cookieConsents.consentId, input.consentId))
        .limit(1);
      const values = {
        userId: ctx.user?.id ?? null,
        analytics: gpc ? false : input.analytics,
        functional: input.functional,
        advertising: gpc ? false : input.advertising,
        gpcSignal: gpc,
        locale: meta.locale,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      };
      if (existing[0]) {
        await db.update(cookieConsents).set(values).where(eq(cookieConsents.consentId, input.consentId));
      } else {
        await db.insert(cookieConsents).values({ consentId: input.consentId, ...values });
      }
      if (ctx.user && gpc) await recordGpcSeen(ctx.user.id);
      return { honored: true, gpcHonored: gpc };
    }),

  /* ------------------------- Authed: consent ------------------------- */
  consentStatus: authedQuery.query(async ({ ctx }) => {
    await ensureDocsReady();
    const meta = clientMeta(ctx.req);
    if (meta.gpc) await recordGpcSeen(ctx.user.id);
    const pending = await pendingRequirements(ctx.user.id);
    const prefs = await getPreferences(ctx.user.id);
    return {
      pending,
      autonomousAccepted: await hasAcceptedCurrent(ctx.user.id, AUTONOMOUS_DOC),
      ageAttested: !!prefs?.ageAttestedAt,
      preferences: prefs
        ? {
            marketingEmail: prefs.marketingEmail,
            marketingSms: prefs.marketingSms,
            analyticsCookies: prefs.analyticsCookies,
            gpcHonored: prefs.gpcHonored,
          }
        : { marketingEmail: false, marketingSms: false, analyticsCookies: false, gpcHonored: false },
    };
  }),

  accept: authedQuery
    .input(
      z.object({
        slug: z.string().max(64),
        method: z.enum(["CLICKWRAP_SIGNUP", "AUTONOMOUS_ACTIVATION", "MARKETPLACE_ACCEPT", "RE_CONSENT", "PRIVACY_CENTER"]),
        context: z.string().max(64).optional(),
        marketingOptIn: z.boolean().optional(),
        ageAttested: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await ensureDocsReady();
      const meta = clientMeta(ctx.req);
      const rec = await recordAcceptance({
        userId: ctx.user.id,
        slug: input.slug,
        method: input.method,
        context: input.context ?? null,
        locale: meta.locale,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      if (!rec) throw new TRPCError({ code: "NOT_FOUND", message: "Unknown document" });
      // Optional marketing consent is stored separately — never bundled (§36).
      if (input.marketingOptIn !== undefined) {
        await upsertPreferences(ctx.user.id, { marketingEmail: input.marketingOptIn });
      }
      if (input.ageAttested) await recordAgeAttestation(ctx.user.id);
      return rec;
    }),

  myAcceptances: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select()
      .from(legalAcceptances)
      .where(eq(legalAcceptances.userId, ctx.user.id))
      .orderBy(desc(legalAcceptances.acceptedAt));
  }),

  /* ------------------------- Authed: privacy center ------------------------- */
  submitPrivacyRequest: authedQuery
    .input(z.object({ type: z.enum(["ACCESS", "DELETE", "CORRECT", "EXPORT", "OPT_OUT", "LIMIT_SENSITIVE"]), details: z.string().max(2000).optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const requestId = `PR-${randomUUID().slice(0, 8).toUpperCase()}`;
      await db.insert(privacyRequests).values({
        requestId,
        userId: ctx.user.id,
        type: input.type,
        details: input.details ?? null,
      });
      void recordAudit({
        userId: ctx.user.id,
        action: "PRIVACY_REQUEST",
        entityType: "SETTING",
        entityId: requestId,
        meta: { type: input.type },
      });
      return { requestId, status: "RECEIVED" as const };
    }),

  myPrivacyRequests: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select()
      .from(privacyRequests)
      .where(eq(privacyRequests.userId, ctx.user.id))
      .orderBy(desc(privacyRequests.createdAt));
  }),

  setPreferences: authedQuery
    .input(
      z.object({
        marketingEmail: z.boolean().optional(),
        marketingSms: z.boolean().optional(),
        analyticsCookies: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await upsertPreferences(ctx.user.id, input);
      return { ok: true };
    }),

  deactivateAccount: authedQuery.mutation(async ({ ctx }) => {
    await deactivateAccount(ctx.user.id);
    return { ok: true };
    }),

  /** Right of access/portability: the user's own records across canonical tables (§38). */
  exportMyData: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const uid = ctx.user.id;
    const { strategies, brokerAccounts, alerts, chatMessages, supportTickets, positions } = await import("@db/schema");
    const [s, a, al, cm, st, pos, acc, pr] = await Promise.all([
      db.select().from(strategies).where(eq(strategies.userId, uid)),
      db.select().from(brokerAccounts).where(eq(brokerAccounts.userId, uid)),
      db.select().from(alerts).where(eq(alerts.userId, uid)),
      db.select().from(chatMessages).where(eq(chatMessages.userId, uid)),
      db.select().from(supportTickets).where(eq(supportTickets.userId, uid)),
      db.select().from(positions).where(eq(positions.userId, uid)),
      db.select().from(legalAcceptances).where(eq(legalAcceptances.userId, uid)),
      db.select().from(privacyRequests).where(eq(privacyRequests.userId, uid)),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      profile: { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email, createdAt: ctx.user.createdAt },
      strategies: s,
      brokerConnections: a.map((x) => ({ ...x, credentials: undefined, apiKey: undefined, secret: undefined })),
      alerts: al,
      chatMessages: cm,
      supportTickets: st,
      positions: pos,
      legalAcceptances: acc,
      privacyRequests: pr,
      note: "Financial and audit records are retained per the Account Deletion & Data Rights Policy even after account closure.",
    };
  }),

  /* ------------------------- Admin: compliance console ------------------------- */
  adminDocs: adminQuery.query(async () => {
    const db = getDb();
    return db.select().from(legalDocuments).orderBy(desc(legalDocuments.updatedAt));
  }),

  transitionDoc: adminQuery
    .input(
      z.object({
        slug: z.string().max(64),
        version: z.string().max(24),
        to: z.enum(DOC_STATUSES),
        approver: z.string().max(191).optional(),
        effectiveDate: z.string().max(10).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(legalDocuments)
        .where(and(eq(legalDocuments.slug, input.slug), eq(legalDocuments.version, input.version)))
        .limit(1);
      const doc = rows[0];
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
      if (!ALLOWED_TRANSITIONS[doc.status]?.includes(input.to)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Illegal transition ${doc.status} → ${input.to}` });
      }
      if ((input.to === "APPROVED" || input.to === "ACTIVE") && !input.approver) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Human approver identity required (§42)" });
      }
      // Activating supersedes the previously ACTIVE version of the same slug.
      if (input.to === "ACTIVE") {
        await db
          .update(legalDocuments)
          .set({ status: "SUPERSEDED" })
          .where(and(eq(legalDocuments.slug, input.slug), eq(legalDocuments.status, "ACTIVE")));
      }
      await db
        .update(legalDocuments)
        .set({
          status: input.to,
          approvedBy: input.approver ?? doc.approvedBy,
          effectiveDate: input.to === "ACTIVE" ? input.effectiveDate ?? new Date().toISOString().slice(0, 10) : doc.effectiveDate,
        })
        .where(eq(legalDocuments.id, doc.id));
      void recordAudit({
        userId: ctx.user.id,
        action: "LEGAL_DOC_TRANSITION",
        entityType: "SETTING",
        entityId: `${input.slug}@${input.version}`,
        prevState: doc.status,
        newState: input.to,
        meta: { approver: input.approver ?? null },
      });
      return { ok: true };
    }),

  adminPrivacyRequests: adminQuery.query(async () => {
    const db = getDb();
    return db.select().from(privacyRequests).orderBy(desc(privacyRequests.createdAt)).limit(500);
  }),

  updatePrivacyRequest: adminQuery
    .input(
      z.object({
        requestId: z.string().max(40),
        status: z.enum(["RECEIVED", "VERIFYING", "IN_PROGRESS", "COMPLETED", "DENIED"]),
        responseNote: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db
        .update(privacyRequests)
        .set({
          status: input.status,
          responseNote: input.responseNote ?? null,
          completedAt: input.status === "COMPLETED" || input.status === "DENIED" ? new Date() : null,
        })
        .where(eq(privacyRequests.requestId, input.requestId));
      void recordAudit({
        userId: ctx.user.id,
        action: "PRIVACY_REQUEST",
        entityType: "SETTING",
        entityId: input.requestId,
        newState: input.status,
      });
      return { ok: true };
    }),

  flags: publicQuery.query(() => complianceFlagReport()),
});
