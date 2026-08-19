import { getDb } from "./connection";
import { marketplaceItems, marketplaceEntitlements } from "@db/schema";
import { eq, and, sql } from "drizzle-orm";
import { MARKETPLACE_CATALOG } from "../marketplace/catalog";

/**
 * RTI Strategy Marketplace — Master Build.
 * Source of truth: the RTI strategy documents (Live-Scan/Research/Execution
 * pack — 150 prompts — and the Institutional Strategy Playbook). Seller is
 * always RTI; price is always $29. Fabricated inventory (ratings, sales
 * counts, 90-day returns, third-party sellers) was purged in this revision.
 *
 * Public surfaces receive preview metadata only. The full paid strategy
 * content (`prompt`) is served exclusively through myLibrary for users
 * holding an entitlement row.
 */

export interface MarketplacePreview {
  slug: string;
  name: string;
  author: string;
  kind: "Strategy" | "AI Prompt";
  asset: string;
  price: number;
  category: string;
  description: string;
  outcome: string;
  tags: string[];
}

function toPreview(r: typeof marketplaceItems.$inferSelect): MarketplacePreview {
  return {
    slug: r.slug,
    name: r.name,
    author: r.author,
    kind: r.kind as "Strategy" | "AI Prompt",
    asset: r.asset,
    price: r.price,
    category: r.category,
    description: r.description,
    outcome: r.outcome,
    tags: JSON.parse(r.tags || "[]") as string[],
  };
}

let seeded = false;

export async function ensureMarketplaceSeeded() {
  if (seeded) return;
  const db = getDb();
  const existing = await db.select({ slug: marketplaceItems.slug }).from(marketplaceItems);
  const have = new Set(existing.map((r) => r.slug));
  const want = new Set(MARKETPLACE_CATALOG.map((c) => c.slug));
  const inSync =
    have.size === want.size && MARKETPLACE_CATALOG.every((c) => have.has(c.slug));
  if (!inSync) {
    // Catalog revision: the embedded RTI catalog is the single source of truth.
    // Full replace — no fabricated or stale rows may survive a copy refresh.
    await db.execute(sql`DELETE FROM marketplace_items`);
    for (const c of MARKETPLACE_CATALOG) {
      await db.insert(marketplaceItems).values({
        slug: c.slug,
        name: c.name,
        author: c.author,
        kind: c.kind,
        asset: c.asset,
        price: c.price,
        category: c.category,
        description: c.description,
        outcome: c.outcome,
        tags: JSON.stringify(c.tags),
        prompt: c.prompt,
      });
    }
  }
  seeded = true;
}

export async function listMarketplace(): Promise<MarketplacePreview[]> {
  await ensureMarketplaceSeeded();
  const db = getDb();
  const rows = await db.select().from(marketplaceItems);
  return rows.map(toPreview);
}

export async function getMarketplaceItem(slug: string, userId?: string) {
  await ensureMarketplaceSeeded();
  const db = getDb();
  const row = await db.query.marketplaceItems.findFirst({ where: eq(marketplaceItems.slug, slug) });
  if (!row) return null;
  const owned = userId
    ? !!(await db.query.marketplaceEntitlements.findFirst({
        where: and(eq(marketplaceEntitlements.userId, userId), eq(marketplaceEntitlements.itemSlug, slug)),
      }))
    : false;
  return { ...toPreview(row), owned };
}

export async function myLibrary(userId: string) {
  await ensureMarketplaceSeeded();
  const db = getDb();
  const ents = await db
    .select()
    .from(marketplaceEntitlements)
    .where(eq(marketplaceEntitlements.userId, userId));
  const out = [];
  for (const e of ents) {
    const row = await db.query.marketplaceItems.findFirst({
      where: eq(marketplaceItems.slug, e.itemSlug),
    });
    if (row) out.push({ ...toPreview(row), prompt: row.prompt, grantedAt: e.grantedAt, pricePaid: e.pricePaid });
  }
  return out;
}

export async function hasEntitlement(userId: string, slug: string) {
  const db = getDb();
  return !!(await db.query.marketplaceEntitlements.findFirst({
    where: and(eq(marketplaceEntitlements.userId, userId), eq(marketplaceEntitlements.itemSlug, slug)),
  }));
}

/** Internal grant path — used only after a verified payment event. */
export async function grantEntitlement(userId: string, slug: string, pricePaid: number, method: string) {
  const db = getDb();
  const row = await db.query.marketplaceItems.findFirst({ where: eq(marketplaceItems.slug, slug) });
  if (!row) throw new Error("ITEM_NOT_FOUND");
  await db
    .insert(marketplaceEntitlements)
    .values({ userId, itemId: row.id, itemSlug: slug, pricePaid, method })
    .onConflictDoUpdate({ target: [marketplaceEntitlements.userId, marketplaceEntitlements.itemSlug], set: { method } });
}
