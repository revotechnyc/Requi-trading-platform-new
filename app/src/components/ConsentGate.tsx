import { useState } from 'react';
import { Link } from 'react-router';
import { ShieldCheck, FileText } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { Button } from '@/components/ui/button';
import { LogoMark } from '@/components/Brand';

/**
 * Clickwrap consent gate (Legal Revision §7, §28, §36).
 * Blocks app access until the user has accepted the current versions of the
 * required documents and attested 18+. Terms and Privacy are individually
 * clickable. Marketing consent is separate and never pre-checked.
 */
export function ConsentGate({ children }: { children: React.ReactNode }) {
  const status = trpc.legal.consentStatus.useQuery(undefined, { retry: false });
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeAge, setAgreeAge] = useState(false);
  const [marketing, setMarketing] = useState(false); // optional — NOT pre-checked
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept = trpc.legal.accept.useMutation();

  if (status.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <LogoMark className="h-12 w-12 animate-pulse" />
      </div>
    );
  }
  if (status.error || !status.data) return <>{children}</>;

  const needsSignup = status.data.pending.length > 0 || !status.data.ageAttested;
  if (!needsSignup) return <>{children}</>;

  const canSubmit = agreeTerms && agreeAge && !busy;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      for (const slug of status.data!.pending) {
        await accept.mutateAsync({
          slug,
          method: 'CLICKWRAP_SIGNUP',
          context: '/app',
          marketingOptIn: marketing,
          ageAttested: agreeAge,
        });
      }
      if (status.data!.pending.length === 0) {
        await accept.mutateAsync({
          slug: 'terms-of-service',
          method: 'CLICKWRAP_SIGNUP',
          context: '/app',
          marketingOptIn: marketing,
          ageAttested: agreeAge,
        });
      }
      await status.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record acceptance — please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background px-5">
      <div className="w-full max-w-lg">
        <div className="glass rounded-3xl p-8 shadow-[0_40px_120px_-30px_hsl(225_73%_50%/0.3)] sm:p-10">
          <div className="flex items-center gap-3">
            <LogoMark className="h-10 w-10" />
            <div>
              <p className="font-display text-lg font-bold text-slate-900">Before you continue</p>
              <p className="text-xs text-slate-500">Legal acceptance — recorded with document version</p>
            </div>
          </div>

          <div className="mt-6 space-y-3 text-sm text-slate-600">
            <p>
              Your account has been created. To use Requi, please review and accept the agreements below.
              Your acceptance is stored with the exact document version, timestamp, and method.
            </p>
            <div className="grid gap-2 rounded-xl border border-slate-900/10 bg-slate-50 p-4">
              <Link to="/legal/terms-of-service" target="_blank" className="inline-flex items-center gap-2 font-medium text-sky-700 hover:underline">
                <FileText className="h-4 w-4" /> Terms of Service
              </Link>
              <Link to="/legal/privacy-policy" target="_blank" className="inline-flex items-center gap-2 font-medium text-sky-700 hover:underline">
                <FileText className="h-4 w-4" /> Privacy Policy
              </Link>
              <Link to="/legal/trading-risk-disclosure" target="_blank" className="inline-flex items-center gap-2 font-medium text-sky-700 hover:underline">
                <FileText className="h-4 w-4" /> Trading Risk Disclosure
              </Link>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} className="mt-1 h-4 w-4 accent-sky-600" />
              <span>
                By creating an account, you acknowledge that you have read and agree to Requi's{' '}
                <Link to="/legal/terms-of-service" target="_blank" className="font-medium text-sky-700 hover:underline">Terms of Service</Link>{' '}
                and acknowledge the{' '}
                <Link to="/legal/privacy-policy" target="_blank" className="font-medium text-sky-700 hover:underline">Privacy Policy</Link>.
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input type="checkbox" checked={agreeAge} onChange={(e) => setAgreeAge(e.target.checked)} className="mt-1 h-4 w-4 accent-sky-600" />
              <span>I am at least 18 years old and meet the eligibility requirements of my jurisdiction and brokerage.</span>
            </label>
            <label className="flex items-start gap-3 text-sm text-slate-500">
              <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-1 h-4 w-4 accent-sky-600" />
              <span>Optional: send me product updates and market insights by email. You can change this anytime in the Privacy Center.</span>
            </label>
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <Button
            size="lg"
            disabled={!canSubmit}
            onClick={submit}
            className="btn-glow mt-7 h-12 w-full bg-royal-500 text-base font-semibold text-white hover:bg-royal-600 disabled:opacity-50"
          >
            <ShieldCheck className="mr-1.5 h-4.5 w-4.5" />
            {busy ? 'Recording acceptance…' : 'Agree and continue'}
          </Button>
          <p className="mt-3 text-center text-[11px] text-slate-400">
            Documents are counsel-review drafts pending final attorney approval; material updates will be presented for re-acceptance.
          </p>
        </div>
      </div>
    </div>
  );
}
