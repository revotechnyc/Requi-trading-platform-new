import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import {
  emergencyStop,
  getState,
  listAutonomousOrders,
  listAutonomousPositions,
  listAutonomousTrades,
  pause,
  releaseKillSwitch,
  resume,
  setMode,
  start,
  stop,
  stream,
  updateConfig,
} from "./autonomous/service";
import { writeAudit } from "./platform/audit";

/**
 * Autonomous Trading control center — API surface.
 * All state is server-persisted (autonomous_configs / autonomous_sessions /
 * autonomous_events + canonical order_tickets / positions). Risk limits are
 * enforced in the service/runner layer, never trusted to the browser.
 */
export const autonomousRouter = createRouter({
  /** Full dashboard state: config + session + account + metrics + kill switch. */
  state: authedQuery.query(({ ctx }) => getState(ctx.user.id)),

  updateConfig: authedQuery
    .input(
      z.object({
        accountId: z.string().max(64).nullable().optional(),
        allocationType: z.enum(["DOLLAR", "PERCENT"]).optional(),
        allocationValue: z.number().min(0).max(100_000_000).optional(),
        maxPositionSizePct: z.number().min(0.1).max(100).optional(),
        maxDailyLoss: z.number().min(1).max(100_000_000).optional(),
        maxPositions: z.number().int().min(1).max(50).optional(),
        stopLossPct: z.number().min(0.1).max(50).optional(),
        trailingStopPct: z.number().min(0.1).max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const cfg = await updateConfig(ctx.user.id, input);
      await writeAudit({
        actorUserId: ctx.user.id,
        action: "autonomous.config_updated",
        targetType: "autonomous_configs",
        targetId: cfg.id,
        after: input,
      });
      return cfg;
    }),

  /** Switch PAPER/LIVE. Going LIVE requires confirm: "LIVE" (typed). */
  setMode: authedQuery
    .input(z.object({ mode: z.enum(["PAPER", "LIVE"]), confirm: z.string().max(16).optional() }))
    .mutation(async ({ ctx, input }) => {
      const cfg = await setMode(ctx.user.id, input.mode, input.confirm);
      await writeAudit({
        actorUserId: ctx.user.id,
        action: "autonomous.mode_changed",
        targetType: "autonomous_configs",
        targetId: cfg.id,
        after: { mode: input.mode },
      });
      return cfg;
    }),

  start: authedQuery.mutation(async ({ ctx }) => {
    const s = await start(ctx.user.id);
    await writeAudit({ actorUserId: ctx.user.id, action: "autonomous.started", targetType: "autonomous_sessions", targetId: s?.id ?? undefined });
    return s;
  }),

  pause: authedQuery.mutation(async ({ ctx }) => {
    const s = await pause(ctx.user.id);
    await writeAudit({ actorUserId: ctx.user.id, action: "autonomous.paused", targetType: "autonomous_sessions", targetId: s?.id ?? undefined });
    return s;
  }),

  resume: authedQuery.mutation(async ({ ctx }) => {
    const s = await resume(ctx.user.id);
    await writeAudit({ actorUserId: ctx.user.id, action: "autonomous.resumed", targetType: "autonomous_sessions", targetId: s?.id ?? undefined });
    return s;
  }),

  stop: authedQuery.mutation(async ({ ctx }) => {
    const s = await stop(ctx.user.id, "USER_STOP");
    await writeAudit({ actorUserId: ctx.user.id, action: "autonomous.stopped", targetType: "autonomous_sessions", targetId: s?.id ?? undefined });
    return s;
  }),

  /** Emergency stop — kill switch ON + session halted. Requires typed "STOP". */
  emergencyStop: authedQuery
    .input(z.object({ confirm: z.literal("STOP") }))
    .mutation(async ({ ctx }) => {
      const res = await emergencyStop(ctx.user.id);
      await writeAudit({ actorUserId: ctx.user.id, action: "autonomous.emergency_stop", targetType: "ai_limits", targetId: ctx.user.id });
      return res;
    }),

  releaseKillSwitch: authedQuery
    .input(z.object({ confirm: z.literal("RELEASE") }))
    .mutation(async ({ ctx }) => {
      const res = await releaseKillSwitch(ctx.user.id);
      await writeAudit({ actorUserId: ctx.user.id, action: "autonomous.kill_switch_released", targetType: "ai_limits", targetId: ctx.user.id });
      return res;
    }),

  /** Live Run Stream — poll with the last seen event id for deltas. */
  stream: authedQuery
    .input(z.object({ afterId: z.string().max(64).optional() }).optional())
    .query(({ ctx, input }) => stream(ctx.user.id, input?.afterId)),

  positions: authedQuery.query(({ ctx }) => listAutonomousPositions(ctx.user.id)),
  orders: authedQuery.query(({ ctx }) => listAutonomousOrders(ctx.user.id)),
  trades: authedQuery.query(({ ctx }) => listAutonomousTrades(ctx.user.id)),
});

/** Re-throw helper kept for parity with other routers (typed errors surface cleanly). */
export function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}
