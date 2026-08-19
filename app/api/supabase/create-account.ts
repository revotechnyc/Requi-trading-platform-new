import { createClient } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";
import { env } from "../lib/env";

/**
 * Create (or confirm) an Auth user without sending a verification email.
 * Temporary: skip Confirm-email / mailer rate limits for local testing.
 * Restore supabase.auth.signUp (email confirm) before public launch.
 */
export async function createConfirmedAuthUser(email: string, password: string) {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Supabase admin is not configured.",
    });
  }

  const admin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!created.error) return { ok: true as const };

  const already =
    created.error.status === 422 ||
    /already|registered|exists/i.test(created.error.message);

  if (!already) {
    throw new TRPCError({ code: "BAD_REQUEST", message: created.error.message });
  }

  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listed.error) {
    throw new TRPCError({ code: "BAD_REQUEST", message: listed.error.message });
  }
  const existing = listed.data.users.find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  if (!existing) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: created.error.message,
    });
  }

  const updated = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  });
  if (updated.error) {
    throw new TRPCError({ code: "BAD_REQUEST", message: updated.error.message });
  }
  return { ok: true as const };
}
