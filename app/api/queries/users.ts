import { eq } from "drizzle-orm";
import * as schema from "@db/schema";
import type { InsertUser } from "@db/schema";
import { getDb } from "./connection";
import { env } from "../lib/env";

export async function findUserByEmail(email: string) {
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  return rows.at(0);
}

export async function findUserByUnionId(unionId: string) {
  const rows = await getDb()
    .select()
    .from(schema.users)
    .where(eq(schema.users.unionId, unionId))
    .limit(1);
  return rows.at(0);
}

export async function upsertUser(data: InsertUser) {
  const values = { ...data };
  const updateSet: Partial<InsertUser> = {
    lastSignInAt: new Date(),
    ...data,
  };

  if (
    values.role === undefined &&
    values.unionId &&
    values.unionId === env.ownerUnionId
  ) {
    values.role = "admin";
    updateSet.role = "admin";
    values.govRole = "GOVERNANCE_ADMIN";
    updateSet.govRole = "GOVERNANCE_ADMIN";
  }

  // SaaS owner designation by email allowlist (least privilege — everyone
  // else stays NONE regardless of role claims).
  const email = values.email ?? undefined;
  if (email && env.platformOwnerEmails.includes(email.toLowerCase())) {
    values.platformRole = "SAAS_OWNER";
    updateSet.platformRole = "SAAS_OWNER";
  }

  await getDb()
    .insert(schema.users)
    .values(values)
    .onConflictDoUpdate({ target: schema.users.unionId, set: updateSet });
}
