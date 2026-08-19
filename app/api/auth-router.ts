import * as cookie from "cookie";
import { z } from "zod";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { signSessionToken } from "./kimi/session";
import { upsertUser, findUserByUnionId } from "./queries/users";
import { ensurePersonalOrg } from "./supabase/provision";
import { createConfirmedAuthUser } from "./supabase/create-account";
import { env, supabaseAuthConfigured } from "./lib/env";

const DEMO_UNION_ID = "requi-demo-user";

export const authRouter = createRouter({
  me: authedQuery.query((opts) => opts.ctx.user),

  // Public auth-surface advertisement so the login page renders only the
  // providers that are actually configured server-side.
  config: publicQuery.query(() => ({
    supabase: supabaseAuthConfigured,
    supabaseUrl: supabaseAuthConfigured ? env.supabaseUrl : "",
    supabaseAnonKey: supabaseAuthConfigured ? env.supabaseAnonKey : "",
    google: Boolean(env.googleClientId) || supabaseAuthConfigured,
    demo: true,
    kimi: Boolean(env.appId && env.appSecret),
  })),

  // Temporary: confirmed signup (no verification email). Swap back to
  // supabase.auth.signUp before public launch.
  createAccount: publicQuery
    .input(
      z.object({
        email: z.string().trim().email().max(255),
        password: z.string().min(8).max(128),
      }),
    )
    .mutation(async ({ input }) => {
      await createConfirmedAuthUser(input.email, input.password);
      return { success: true };
    }),

  // One-click demo access: real session for a seeded demo account (admin role
  // so the owner console is viewable). Remove before public launch.
  demoLogin: publicQuery.mutation(async ({ ctx }) => {
    await upsertUser({
      unionId: DEMO_UNION_ID,
      name: "Demo Trader",
      email: "demo@requi.trading",
      role: "admin",
      govRole: "GOVERNANCE_ADMIN",
      platformRole: "SAAS_OWNER", // demo sandbox doubles as the owner-console preview (dev only)
      authProvider: "DEMO",
      lastSignInAt: new Date(),
    });
    const demoUser = await findUserByUnionId(DEMO_UNION_ID);
    if (demoUser) await ensurePersonalOrg(demoUser);
    const token = await signSessionToken({ unionId: DEMO_UNION_ID, clientId: env.appId });
    const opts = getSessionCookieOptions(ctx.req.headers);
    ctx.resHeaders.append(
      "set-cookie",
      cookie.serialize(Session.cookieName, token, {
        httpOnly: opts.httpOnly,
        path: opts.path,
        sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
        secure: opts.secure,
        maxAge: Session.maxAgeMs / 1000,
      }),
    );
    return { success: true };
  }),
  logout: authedQuery.mutation(async ({ ctx }) => {
    const opts = getSessionCookieOptions(ctx.req.headers);
    ctx.resHeaders.append(
      "set-cookie",
      cookie.serialize(Session.cookieName, "", {
        httpOnly: opts.httpOnly,
        path: opts.path,
        sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
        secure: opts.secure,
        maxAge: 0,
      }),
    );
    return { success: true };
  }),
});
