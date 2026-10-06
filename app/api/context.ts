import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "@db/schema";
import { authenticateRequest } from "./kimi/auth";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
};

/** Prevent hung DB / Supabase provision from freezing every tRPC call (incl. auth.config). */
const AUTH_CONTEXT_MS = 4_000;

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };
  try {
    ctx.user = await Promise.race([
      authenticateRequest(opts.req.headers),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("auth-timeout")), AUTH_CONTEXT_MS);
      }),
    ]);
  } catch {
    // Authentication is optional here — unauthenticated requests continue without user.
  }
  return ctx;
}
