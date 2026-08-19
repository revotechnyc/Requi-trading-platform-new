import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { scheduledTaskRuns, scheduledTasks } from "@db/schema";
import { computeNextRunAt, runTaskNow } from "./scheduler-runner";

const scheduleTypeEnum = z.enum(["DAILY", "WEEKDAYS", "WEEKLY", "INTERVAL", "MARKET_OPEN"]);

const taskInput = z.object({
  name: z.string().min(1).max(255),
  prompt: z.string().min(1).max(8000),
  scheduleType: scheduleTypeEnum,
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/).default("09:30"),
  timezone: z.string().max(64).default("America/New_York"),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  intervalMinutes: z.number().int().min(5).max(10080).optional(),
  enabled: z.boolean().default(true),
});

export const scheduledTasksRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select()
      .from(scheduledTasks)
      .where(and(eq(scheduledTasks.userId, ctx.user.id), isNull(scheduledTasks.deletedAt)))
      .orderBy(desc(scheduledTasks.createdAt))
      .limit(100);
  }),

  runs: authedQuery
    .input(z.object({ taskId: z.string().max(64) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      return db
        .select()
        .from(scheduledTaskRuns)
        .where(and(eq(scheduledTaskRuns.taskId, input.taskId), eq(scheduledTaskRuns.userId, ctx.user.id)))
        .orderBy(desc(scheduledTaskRuns.startedAt))
        .limit(50);
    }),

  create: authedQuery.input(taskInput).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const draft = {
      scheduleType: input.scheduleType,
      timeOfDay: input.timeOfDay,
      timezone: input.timezone,
      daysOfWeek: input.daysOfWeek ?? [],
      intervalMinutes: input.intervalMinutes ?? null,
    };
    const [row] = await db
      .insert(scheduledTasks)
      .values({
        userId: ctx.user.id,
        name: input.name,
        prompt: input.prompt,
        ...draft,
        enabled: input.enabled,
        nextRunAt: computeNextRunAt(draft),
      })
      .returning();
    return row;
  }),

  update: authedQuery
    .input(z.object({ id: z.string().max(64) }).extend(taskInput.partial().shape))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...patch } = input;
      const [existing] = await db
        .select()
        .from(scheduledTasks)
        .where(and(eq(scheduledTasks.id, id), eq(scheduledTasks.userId, ctx.user.id), isNull(scheduledTasks.deletedAt)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      const merged = {
        scheduleType: patch.scheduleType ?? existing.scheduleType,
        timeOfDay: patch.timeOfDay ?? existing.timeOfDay,
        timezone: patch.timezone ?? existing.timezone,
        daysOfWeek: patch.daysOfWeek ?? existing.daysOfWeek,
        intervalMinutes: patch.intervalMinutes ?? existing.intervalMinutes,
      };
      const { daysOfWeek: _d, intervalMinutes: _i, ...scalarPatch } = patch;
      const [row] = await db
        .update(scheduledTasks)
        .set({
          ...scalarPatch,
          ...(patch.daysOfWeek !== undefined ? { daysOfWeek: patch.daysOfWeek } : {}),
          ...(patch.intervalMinutes !== undefined ? { intervalMinutes: patch.intervalMinutes } : {}),
          nextRunAt: computeNextRunAt(merged),
        })
        .where(eq(scheduledTasks.id, id))
        .returning();
      return row;
    }),

  toggle: authedQuery
    .input(z.object({ id: z.string().max(64), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [row] = await db
        .update(scheduledTasks)
        .set({ enabled: input.enabled, nextRunAt: input.enabled ? computeNextRunAt(await mustGet(ctx.user.id, input.id)) : null })
        .where(and(eq(scheduledTasks.id, input.id), eq(scheduledTasks.userId, ctx.user.id), isNull(scheduledTasks.deletedAt)))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      return row;
    }),

  remove: authedQuery
    .input(z.object({ id: z.string().max(64) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [row] = await db
        .update(scheduledTasks)
        .set({ deletedAt: new Date(), enabled: false })
        .where(and(eq(scheduledTasks.id, input.id), eq(scheduledTasks.userId, ctx.user.id), isNull(scheduledTasks.deletedAt)))
        .returning({ id: scheduledTasks.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      return { ok: true };
    }),

  /** Fire immediately, out of schedule — same pipeline, recorded as MANUAL. */
  runNow: authedQuery
    .input(z.object({ id: z.string().max(64) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [owned] = await db
        .select({ id: scheduledTasks.id })
        .from(scheduledTasks)
        .where(and(eq(scheduledTasks.id, input.id), eq(scheduledTasks.userId, ctx.user.id), isNull(scheduledTasks.deletedAt)))
        .limit(1);
      if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      return runTaskNow(input.id, "MANUAL");
    }),
});

async function mustGet(userId: string, id: string) {
  const db = getDb();
  const [t] = await db
    .select()
    .from(scheduledTasks)
    .where(and(eq(scheduledTasks.id, id), eq(scheduledTasks.userId, userId)))
    .limit(1);
  if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
  return t;
}
