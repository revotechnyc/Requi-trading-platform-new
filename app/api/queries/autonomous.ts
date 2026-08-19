import { getDb } from "./connection";
import { aiLimits } from "@db/schema";
import { eq } from "drizzle-orm";

/** Fetch the user's AI limit row, creating governance defaults on first access. */
export async function getAiLimits(userId: string) {
  const db = getDb();
  const [row] = await db.select().from(aiLimits).where(eq(aiLimits.userId, userId));
  if (row) return row;
  await db.insert(aiLimits).values({ userId }).onConflictDoNothing();
  const [created] = await db.select().from(aiLimits).where(eq(aiLimits.userId, userId));
  return created;
}

export async function setKillSwitch(userId: string, active: boolean) {
  await getAiLimits(userId);
  await getDb().update(aiLimits).set({ killSwitch: active }).where(eq(aiLimits.userId, userId));
  return { killSwitch: active };
}

/** AUTONOMOUS_PAPER maps to paperOnly=true; AUTONOMOUS_LIVE to false. */
export async function setAutonomyMode(userId: string, mode: "AUTONOMOUS_PAPER" | "AUTONOMOUS_LIVE") {
  await getAiLimits(userId);
  const paperOnly = mode === "AUTONOMOUS_PAPER";
  await getDb().update(aiLimits).set({ paperOnly }).where(eq(aiLimits.userId, userId));
  return { mode, paperOnly };
}
