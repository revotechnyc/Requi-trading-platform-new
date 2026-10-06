import { trpc } from "@/providers/trpc";
import { getAccessToken, getSupabase } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { LOGIN_PATH } from "@/const";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

/** Hard cap — never leave the UI on "Loading your workspace…" longer than this. */
const MAX_BOOT_MS = 3_500;

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = LOGIN_PATH } =
    options ?? {};

  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [bootDone, setBootDone] = useState(false);
  const redirected = useRef(false);

  const config = trpc.auth.config.useQuery(undefined, {
    staleTime: 60_000,
    retry: false,
  });

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
            new Promise((r) => setTimeout(r, 2_000)),
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
    enabled: bootDone,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      window.location.assign(redirectPath);
    },
  });

  const logout = useCallback(() => logoutMutation.mutate(), [logoutMutation]);

  const user = me.data ?? null;
  const meSettled = bootDone && (me.isSuccess || me.isError || !me.isFetching);
  const isLoading = !bootDone || (bootDone && !meSettled && !user);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (isLoading) return;
    if (user) return;
    if (redirected.current) return;
    redirected.current = true;
    // Hard navigation beats a stuck React Router state after HMR / hung queries.
    window.location.replace(redirectPath);
  }, [redirectOnUnauthenticated, isLoading, user, redirectPath]);

  return useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      error: me.error,
      logout,
      refresh: me.refetch,
    }),
    [user, isLoading, me.error, logout, me.refetch],
  );
}
