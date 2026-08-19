import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

export const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

const requireAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated,
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

function requireRole(role: string) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== role) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

export const authedQuery = t.procedure.use(requireAuth);
export const adminQuery = authedQuery.use(requireRole("admin"));

// Platform RBAC (least privilege): SaaS owner console endpoints require an
// explicit platform role — never granted to ordinary users.
const PLATFORM_STAFF = new Set(["SAAS_OWNER", "PLATFORM_ADMIN", "SYSTEM_OPS"]);
const requirePlatformStaff = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user || !PLATFORM_STAFF.has(ctx.user.platformRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Platform staff role required.",
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
export const platformQuery = authedQuery.use(requirePlatformStaff);
