import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase browser client. Session must be readable on /app after a full
 * navigation — Login is not mounted there. Use the default sb-<ref>-auth-token
 * storage key (and copy any legacy keys) so getSession() finds the login.
 */
let client: SupabaseClient | null = null;
let clientUrl = '';

function migrateAuthStorage(supabaseUrl: string) {
  if (typeof localStorage === 'undefined') return;
  try {
    const ref = new URL(supabaseUrl).hostname.split('.')[0];
    const defKey = `sb-${ref}-auth-token`;
    if (localStorage.getItem(defKey)) return;
    const candidates = ['requi.supabase.auth'];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) candidates.push(k);
    }
    for (const key of candidates) {
      const raw = localStorage.getItem(key);
      if (raw) {
        localStorage.setItem(defKey, raw);
        return;
      }
    }
  } catch {
    /* ignore */
  }
}

export function getSupabase(url: string, anonKey: string): SupabaseClient {
  if (!client || clientUrl !== url) {
    migrateAuthStorage(url);
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    clientUrl = url;
  }
  return client;
}

function initFromViteEnv() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && anonKey) getSupabase(url, anonKey);
}

initFromViteEnv();

export function getExistingSupabase(): SupabaseClient | null {
  return client;
}

/** Current access token for tRPC Authorization headers (null when signed out). */
export async function getAccessToken(): Promise<string | null> {
  if (!client) initFromViteEnv();
  if (!client) return null;
  try {
    const sessionPromise = client.auth.getSession();
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 2500);
    });
    const raced = await Promise.race([
      sessionPromise.then((r) => r),
      timeoutPromise.then(() => null),
    ]);
    if (!raced) return null;
    return raced.data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
