import { trpc } from "@/providers/trpc";
import { getAccessToken, getSupabase, signOutSupabaseLocal } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { LOGIN_PATH } from "@/const";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

/** Hard cap — never leave the UI on "Loading your workspace…" longer than this. */
const MAX_BOOT_MS = 2_500;

/** Set for the duration of a sign-out so /app cannot re-bootstrap a stale session. */
export const SIGNING_OUT_KEY = "requi.signingOut";

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = LOGIN_PATH } =
    options ?? {};

  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [bootDone, setBootDone] = useState(false);
  const redirected = useRef(false);
  const loggingOut = useRef(false);

  const config = trpc.auth.config.useQuery(undefined, {
    staleTime: 60_000,
    retry: false,
  });

  // If a previous tab set the signing-out flag, force login immediately.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SIGNING_OUT_KEY) === "1" && redirectOnUnauthenticated) {
        window.location.replace(`${redirectPath}?signedOut=1`);
      }
    } catch {
      /* ignore */
    }
  }, [redirectOnUnauthenticated, redirectPath]);

  // Bootstrap Supabase client + access token, but never block past MAX_BOOT_MS.
  useEffect(() => {
    let cancelled = false;
    const hardStop = window.setTimeout(() => {
      if (!cancelled) setBootDone(true);
    }, MAX_BOOT_MS);

    (async () => {
      try {
        if (config.data?.supabaseUrl && config.data.supabaseAnonKey) {
          getSupabase(config.data.supabaseUrl, config.data.supabaseAnonKey);
        }
        if (!config.isLoading) {
          await Promise.race([
            getAccessToken(),
            new Promise((r) => setTimeout(r, 1_500)),
          ]);
        }
      } catch {
        /* signed out */
      } finally {
        if (!cancelled) setBootDone(true);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(hardStop);
    };
  }, [config.isLoading, config.data?.supabaseUrl, config.data?.supabaseAnonKey]);

  const me = trpc.auth.me.useQuery(undefined, {
    enabled: bootDone && !loggingOut.current,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const logout = useCallback(() => {
    if (loggingOut.current) return;
    loggingOut.current = true;
    try {
      sessionStorage.setItem(SIGNING_OUT_KEY, "1");
    } catch {
      /* ignore */
    }

    void (async () => {
      // 1) Best-effort clear httpOnly cookie — never block the redirect on API hang.
      try {
        await Promise.race([
          utils.client.auth.logout.mutate(),
          new Promise((r) => setTimeout(r, 1_200)),
        ]);
      } catch {
        /* ignore — still leave the app */
      }

      // 2) Wipe Supabase bearer session (root cause of login↔/app bounce).
      await signOutSupabaseLocal();

      try {
        utils.auth.me.setData(undefined, undefined);
      } catch {
        /* ignore */
      }

      // 3) Hard navigation — do not wait for React Query invalidate (can hang UI on /app).
      window.location.replace(`${redirectPath}?signedOut=1`);
    })();
  }, [redirectPath, utils.auth.me, utils.client.auth.logout]);

  const user = me.data ?? null;
  const meSettled = bootDone && (me.isSuccess || me.isError || !me.isFetching);
  // While signing out, never report authenticated/loading for protected routes.
  const isLoading =
    loggingOut.current
      ? false
      : !bootDone || (bootDone && !meSettled && !user);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (loggingOut.current) return;
    if (isLoading) return;
    if (user) return;
    if (redirected.current) return;
    redirected.current = true;
    window.location.replace(redirectPath);
  }, [redirectOnUnauthenticated, isLoading, user, redirectPath]);

  return useMemo(
    () => ({
      user,
      isAuthenticated: !!user && !loggingOut.current,
      isLoading,
      error: me.error,
      logout,
      refresh: me.refetch,
    }),
    [user, isLoading, me.error, logout, me.refetch],
  );
}
