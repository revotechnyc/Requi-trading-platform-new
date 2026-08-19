import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Eye, EyeOff, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LogoMark } from '@/components/Brand';
import { trpc } from '@/providers/trpc';
import { getSupabase } from '@/lib/supabase';

function getOAuthUrl() {
  const kimiAuthUrl = import.meta.env.VITE_KIMI_AUTH_URL;
  const appID = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${kimiAuthUrl}/api/oauth/authorize`);
  url.searchParams.set('client_id', appID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'profile');
  url.searchParams.set('state', state);

  return url.toString();
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.98 11.98 0 0 0 12 24z"/>
      <path fill="#FBBC05" d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a11.98 11.98 0 0 0 0 10.76l3.98-3.09z"/>
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42A11.97 11.97 0 0 0 12 0 11.98 11.98 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"/>
    </svg>
  );
}

const AUTH_NOTICES: Record<string, string> = {
  google_not_configured: 'Google Sign-In is being configured — please use the primary sign-in for now.',
  google_cancelled: 'Google sign-in was cancelled. No account was created or changed.',
  google_error: 'Google sign-in could not be completed. Please try again or use the primary sign-in.',
  account_disabled: 'This account is deactivated. Contact support to reactivate it.',
};

function authErrorMessage(err: unknown): string {
  const raw =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err ?? 'Something went wrong.');
  try {
    const parsed = JSON.parse(raw) as unknown;
    const issue = Array.isArray(parsed) ? parsed[0] : parsed;
    if (issue && typeof issue === 'object') {
      const rec = issue as { code?: string; path?: unknown; message?: string; minimum?: number };
      const path = Array.isArray(rec.path) ? rec.path.join('.') : '';
      if (path.includes('password') && rec.code === 'too_small') {
        return `Password must be at least ${rec.minimum ?? 8} characters.`;
      }
      if (typeof rec.message === 'string' && rec.message && !rec.message.startsWith('[')) {
        return rec.message;
      }
    }
  } catch {
    /* not JSON */
  }
  return raw;
}

type Mode = 'signin' | 'signup' | 'reset' | 'recovery';

export default function Login() {
  const [params] = useSearchParams();
  const notice = AUTH_NOTICES[params.get('auth') ?? ''];
  const config = trpc.auth.config.useQuery(undefined, { staleTime: 60_000 });
  const demoLogin = trpc.auth.demoLogin.useMutation({
    onSuccess: () => { window.location.href = '/app'; },
  });
  const createAccount = trpc.auth.createAccount.useMutation();

  const supabaseReady = Boolean(config.data?.supabase && config.data.supabaseUrl && config.data.supabaseAnonKey);
  const supabase = useMemo(
    () => (supabaseReady ? getSupabase(config.data!.supabaseUrl, config.data!.supabaseAnonKey) : null),
    [supabaseReady, config.data],
  );

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // OAuth redirect (Google via Supabase) lands back here with a session —
  // forward into the app.
  useEffect(() => {
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('recovery');
        return;
      }
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        window.location.href = '/app';
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.href = '/app';
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'recovery') {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setMessage({ kind: 'ok', text: 'Password updated. Signing you in…' });
        window.location.href = '/app';
        return;
      }
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login?auth=reset`,
        });
        if (error) throw error;
        setMessage({ kind: 'ok', text: 'If that email has an account, a reset link is on its way.' });
      } else if (mode === 'signup') {
        // Email verification (supabase.auth.signUp + inbox confirm) is paused
        // for now — create a confirmed user, then sign in immediately.
        // const { error } = await supabase.auth.signUp({ email, password });
        // if (error) throw error;
        // setMessage({ kind: 'ok', text: 'Check your inbox to verify your email, then sign in.' });
        await createAccount.mutateAsync({ email, password });
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = '/app';
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = '/app';
      }
    } catch (err) {
      setMessage({ kind: 'err', text: authErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    if (!supabase) {
      window.location.href = '/api/auth/google';
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/login` },
    });
    if (error) setMessage({ kind: 'err', text: error.message });
  }

  const inputCls =
    'h-11 w-full rounded-xl border border-slate-900/12 bg-white px-3.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-royal-500';

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5 py-12">
      {/* backdrop */}
      <div className="absolute inset-0 bg-circuit opacity-50" />
      <div className="glow-orb left-1/2 top-[-200px] h-[480px] w-[720px] -translate-x-1/2 bg-royal-600/25" />
      <div className="glow-orb bottom-[-180px] right-[-120px] h-[360px] w-[360px] bg-sky-500/15" />

      <div className="relative w-full max-w-md">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
          <Link to="/" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Back to site
          </Link>

          <div className="glass rounded-3xl p-8 shadow-[0_40px_120px_-30px_hsl(225_73%_50%/0.3)] sm:p-10">
            <div className="flex items-center gap-3">
              <LogoMark className="h-11 w-11" />
              <div>
                <p className="font-display text-xl font-bold text-slate-900">Requi <span className="font-medium text-sky-600">Trading</span></p>
                <p className="text-xs text-slate-500">Intelligence Platform</p>
              </div>
            </div>

            <h1 className="font-display mt-8 text-2xl font-bold text-slate-900">
              {mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : mode === 'recovery' ? 'Choose a new password' : 'Welcome back'}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              {mode === 'signup'
                ? 'Your workspace is provisioned automatically on first sign-in.'
                : mode === 'reset'
                  ? 'We will email you a secure reset link.'
                  : 'Sign in to access your trading intelligence interface.'}
            </p>

            {notice && (
              <div className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3 text-xs leading-relaxed text-amber-700">
                {notice}
              </div>
            )}
            {message && (
              <div className={`mt-5 rounded-xl border p-3 text-xs leading-relaxed ${
                message.kind === 'ok'
                  ? 'border-teal-600/25 bg-teal-600/[0.07] text-teal-700'
                  : 'border-red-500/25 bg-red-500/[0.07] text-red-600'
              }`}>
                {message.text}
              </div>
            )}

            {supabaseReady ? (
              <>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={signInWithGoogle}
                  className="mt-7 h-12 w-full border-slate-900/12 bg-white text-base font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <GoogleMark className="mr-2 h-5 w-5" /> Continue with Google
                </Button>

                <div className="mt-4 flex items-center gap-3">
                  <span className="h-px flex-1 bg-slate-900/10" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">or</span>
                  <span className="h-px flex-1 bg-slate-900/10" />
                </div>

                <form onSubmit={submitEmail} className="mt-4 space-y-3">
                  {mode !== 'recovery' && (
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="you@firm.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputCls}
                    />
                  )}
                  {mode !== 'reset' && (
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        placeholder="Password (8+ characters)"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`${inputCls} pr-11`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 transition-colors hover:text-slate-700"
                      >
                        {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                      </button>
                    </div>
                  )}
                  <Button
                    size="lg"
                    type="submit"
                    disabled={busy}
                    className="btn-glow h-12 w-full bg-royal-500 text-base font-semibold text-white hover:bg-royal-600"
                  >
                    {busy
                      ? 'Working…'
                      : mode === 'signup'
                        ? 'Create Account'
                        : mode === 'reset'
                          ? 'Send Reset Link'
                          : mode === 'recovery'
                            ? 'Update Password'
                            : 'Sign In'}
                    {!busy && <ArrowRight className="ml-1.5 h-4.5 w-4.5" />}
                  </Button>
                </form>

                <div className="mt-4 flex items-center justify-between text-xs">
                  {mode === 'signin' ? (
                    <>
                      <button type="button" onClick={() => { setMode('reset'); setMessage(null); }} className="font-medium text-slate-500 hover:text-slate-700">
                        Forgot password?
                      </button>
                      <button type="button" onClick={() => { setMode('signup'); setMessage(null); }} className="font-medium text-sky-600 hover:text-sky-700">
                        Create account
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => { setMode('signin'); setMessage(null); }} className="font-medium text-sky-600 hover:text-sky-700">
                      ← Back to sign in
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="mt-6 flex items-start gap-3 rounded-xl border border-sky-600/25 bg-sky-600/10 p-3.5">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                  <p className="text-xs leading-relaxed text-slate-600">
                    <span className="font-semibold text-slate-900">One-click sign in.</span> Your account
                    is provisioned automatically on first login — strategies, accounts, and support
                    history are saved to your workspace.
                  </p>
                </div>

                <Button
                  size="lg"
                  onClick={() => { window.location.href = getOAuthUrl(); }}
                  className="btn-glow mt-7 h-12 w-full bg-royal-500 text-base font-semibold text-white hover:bg-royal-600"
                >
                  Sign In to Intelligence <ArrowRight className="ml-1.5 h-4.5 w-4.5" />
                </Button>

                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => { window.location.href = '/api/auth/google'; }}
                  className="mt-3 h-12 w-full border-slate-900/12 bg-white text-base font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <GoogleMark className="mr-2 h-5 w-5" /> Continue with Google
                </Button>
              </>
            )}

            <div className="mt-4 flex items-center gap-3">
              <span className="h-px flex-1 bg-slate-900/10" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">or</span>
              <span className="h-px flex-1 bg-slate-900/10" />
            </div>

            <Button
              size="lg"
              variant="outline"
              onClick={() => demoLogin.mutate()}
              disabled={demoLogin.isPending}
              className="mt-4 h-12 w-full border-teal-600/30 bg-teal-600/[0.06] text-base font-semibold text-teal-700 hover:bg-teal-600/[0.12] hover:text-teal-800"
            >
              <Zap className="mr-1.5 h-4.5 w-4.5" />
              {demoLogin.isPending ? 'Opening demo workspace…' : 'Continue with Demo Account'}
            </Button>
            <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-400">
              Explore the workspace and the autonomous module in paper mode — no sign-up needed. No real accounts or balances are shown.
            </p>

            <div className="mt-6 flex items-center gap-3 text-[11px] text-slate-500">
              <ShieldCheck className="h-4 w-4 text-teal-600" />
              Encrypted transport · httpOnly sessions · your brokerage holds your assets — never Requi
            </div>

            {!supabaseReady && (
              <p className="mt-6 text-center text-sm text-slate-500">
                New to Requi?{' '}
                <span className="font-medium text-sky-600">Your account is created automatically at sign-in</span>
              </p>
            )}
            {/* Email verification paused — restore before public launch.
            {supabaseReady && (
              <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400">
                <Mail className="h-3.5 w-3.5" /> Email verification required before trading features unlock
              </p>
            )}
            */}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
