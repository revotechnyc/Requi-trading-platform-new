import { and, desc, eq, isNull, lte } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { conversations, scheduledTaskRuns, scheduledTasks } from "@db/schema";
import { runIntelligenceChat } from "./intelligence-router";

/**
 * Scheduled Intelligence tasks — the runner executes a due task's prompt
 * through the exact same pipeline as interactive chat (runIntelligenceChat),
 * so risk gates, intent routing and the anti-exposure guard all apply
 * unchanged. Results land in a fresh conversation plus a scheduled_task_runs
 * audit row; failures are recorded, never swallowed silently.
 *
 * Schedules are interpreted in the task's stored timezone (IANA name).
 */

const TICK_MS = 60_000;

function nowInZone(tz: string): { day: number; hh: number; mm: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { day: days[get("weekday")] ?? 0, hh: Number(get("hour")) % 24, mm: Number(get("minute")) };
  } catch {
    return { day: new Date().getUTCDay(), hh: new Date().getUTCHours(), mm: new Date().getUTCMinutes() };
  }
}

export function computeNextRunAt(task: {
  scheduleType: string;
  timeOfDay: string | null;
  timezone: string | null;
  daysOfWeek: unknown;
  intervalMinutes: number | null;
}, from = new Date()): Date {
  const tz = task.timezone || "America/New_York";
  const [hh, mm] = (task.timeOfDay || "09:30").split(":").map((n) => Number(n) || 0);

  if (task.scheduleType === "INTERVAL") {
    return new Date(from.getTime() + Math.max(5, task.intervalMinutes ?? 60) * 60_000);
  }

  // Time-of-day schedules: walk forward day-by-day in the task timezone.
  const allowedDays: number[] = Array.isArray(task.daysOfWeek)
    ? (task.daysOfWeek as number[]).filter((d) => d >= 0 && d <= 6)
    : [];
  for (let i = 0; i < 8; i++) {
    const probe = new Date(from.getTime() + i * 86_400_000);
    const z = nowInZone(tz === "America/New_York" ? tz : tz); // probe evaluated below at target time
    void z;
    // Build the candidate instant: the wall time hh:mm in tz on probe's tz-day.
    const probeZ = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(probe);
    const candidate = zonedWallTimeToUtc(probeZ, hh, mm, tz);
    if (candidate <= from) continue;
    const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(candidate);
    const dayNum = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[day] ?? 0;
    if (task.scheduleType === "DAILY") return candidate;
    if (task.scheduleType === "WEEKDAYS" && dayNum >= 1 && dayNum <= 5) return candidate;
    if (task.scheduleType === "MARKET_OPEN" && dayNum >= 1 && dayNum <= 5) return candidate;
    if (task.scheduleType === "WEEKLY" && (allowedDays.length === 0 || allowedDays.includes(dayNum))) return candidate;
  }
  return new Date(from.getTime() + 86_400_000);
}

/** Convert "YYYY-MM-DD" + hh:mm wall time in an IANA zone to a UTC Date. */
function zonedWallTimeToUtc(dateStr: string, hh: number, mm: number, tz: string): Date {
  const guess = new Date(`${dateStr}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`);
  // Offset = what UTC guess renders as in tz vs the intended wall time.
  const rendered = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(guess);
  const rH = Number(rendered.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const rM = Number(rendered.find((p) => p.type === "minute")?.value ?? 0);
  return new Date(guess.getTime() + ((hh * 60 + mm) - (rH * 60 + rM)) * 60_000);
}

export async function runTaskNow(taskId: string, trigger: "SCHEDULED" | "MANUAL"): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const [task] = await db.select().from(scheduledTasks).where(and(eq(scheduledTasks.id, taskId), isNull(scheduledTasks.deletedAt))).limit(1);
  if (!task) return { ok: false, error: "Task not found." };

  const [run] = await db
    .insert(scheduledTaskRuns)
    .values({ taskId: task.id, userId: task.userId, organizationId: task.organizationId, status: "RUNNING" })
    .returning();

  try {
    // Each run opens its own conversation so the full result is reviewable
    // under Recent Conversations, titled with the task name and run time.
    const stamp = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const [convo] = await db
      .insert(conversations)
      .values({ userId: task.userId, organizationId: task.organizationId, title: `${task.name} — ${stamp}` })
      .returning();
    const result = await runIntelligenceChat({ id: task.userId }, task.prompt, convo.id);
    const excerpt = (result.reply ?? (result.kind === "parsed" ? "Strategy parsed and saved." : JSON.stringify(result).slice(0, 400))).slice(0, 500);
    await db
      .update(scheduledTaskRuns)
      .set({ status: "SUCCESS", replyExcerpt: excerpt, conversationId: convo.id, finishedAt: new Date() })
      .where(eq(scheduledTaskRuns.id, run.id));
    await db
      .update(scheduledTasks)
      .set({ lastRunAt: new Date(), lastRunStatus: "SUCCESS", nextRunAt: computeNextRunAt(task) })
      .where(eq(scheduledTasks.id, task.id));
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 500) : "Unknown error";
    await db
      .update(scheduledTaskRuns)
      .set({ status: "ERROR", error: `${trigger}: ${msg}`, finishedAt: new Date() })
      .where(eq(scheduledTaskRuns.id, run.id));
    await db
      .update(scheduledTasks)
      .set({ lastRunAt: new Date(), lastRunStatus: "ERROR", nextRunAt: computeNextRunAt(task) })
      .where(eq(scheduledTasks.id, task.id));
    return { ok: false, error: msg };
  }
}

async function tick(): Promise<void> {
  const db = getDb();
  const due = await db
    .select({ id: scheduledTasks.id })
    .from(scheduledTasks)
    .where(and(eq(scheduledTasks.enabled, true), isNull(scheduledTasks.deletedAt), lte(scheduledTasks.nextRunAt, new Date())))
    .orderBy(desc(scheduledTasks.nextRunAt))
    .limit(10);
  for (const t of due) {
    await runTaskNow(t.id, "SCHEDULED").catch(() => undefined);
  }
}

export function startTaskScheduler(): void {
  const timer = setInterval(() => {
    tick().catch((err) => console.error("[scheduler] tick failed:", err instanceof Error ? err.message : err));
  }, TICK_MS);
  timer.unref();
  setTimeout(() => tick().catch(() => undefined), 20_000).unref();
  console.log("[scheduler] Intelligence task runner started (60s tick)");
}
