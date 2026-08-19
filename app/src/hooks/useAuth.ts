import { trpc } from "@/providers/trpc";
import { getAccessToken, getSupabase } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { LOGIN_PATH } from "@/const";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = LOGIN_PATH } =
    options ?? {};

  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [sessionReady, setSessionReady] = useState(false);

  const config = trpc.auth.config.useQuery(undefined, { staleTime: 60_000 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (config.data?.supabaseUrl && config.data.supabaseAnonKey) {
        getSupabase(config.data.supabaseUrl, config.data.supabaseAnonKey);
      }
      if (config.isLoading) return;
      await getAccessToken();
      if (!cancelled) setSessionReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [config.isLoading, config.data?.supabaseUrl, config.data?.supabaseAnonKey]);

  const {
    data: user,
    isLoading,
    error,
    refetch,
  } = trpc.auth.me.useQuery(undefined, {
    enabled: sessionReady,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      navigate(redirectPath);
    },
  });

  const logout = useCallback(() => logoutMutation.mutate(), [logoutMutation]);

  const waiting = !sessionReady || isLoading || logoutMutation.isPending;

  useEffect(() => {
    if (redirectOnUnauthenticated && !waiting && !user) {
      const currentPath = window.location.pathname;
      if (currentPath !== redirectPath) {
        navigate(redirectPath);
      }
    }
  }, [redirectOnUnauthenticated, waiting, user, navigate, redirectPath]);

  return useMemo(
    () => ({
      user: user ?? null,
      isAuthenticated: !!user,
      isLoading: waiting,
      error,
      logout,
      refresh: refetch,
    }),
    [user, waiting, error, logout, refetch],
  );
}
