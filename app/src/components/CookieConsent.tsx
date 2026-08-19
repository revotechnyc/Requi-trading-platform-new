import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Cookie, ShieldCheck } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { Button } from '@/components/ui/button';

/**
 * Cookie consent (Legal Revision §14–§15). Statutory choices are stored
 * SERVER-SIDE; the browser cookie holds only the consent record ID.
 * GPC (Sec-GPC / navigator.globalPrivacyControl) forces optional categories
 * off and displays the "Opt-Out Preference Signal Honored" confirmation.
 */
const COOKIE_NAME = 'requi_consent_id';

function readConsentId(): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function writeConsentId(id: string) {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(id)}; path=/; max-age=${365 * 24 * 3600}; samesite=lax`;
}
function newId(): string {
  return crypto.randomUUID();
}

declare global {
  interface Navigator { globalPrivacyControl?: boolean }
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [gpc, setGpc] = useState(false);
  const [functional, setFunctional] = useState(false); // never pre-check optional consent
  const [analytics, setAnalytics] = useState(false); // default off — none deployed
  const [honored, setHonored] = useState(false);
  const record = trpc.legal.recordCookieConsent.useMutation();

  useEffect(() => {
    const g = navigator.globalPrivacyControl === true;
    setGpc(g);
    if (g) { setAnalytics(false); }
    if (!readConsentId()) setVisible(true);
    else if (g) setHonored(true); // returning visitor with GPC — still show honored badge option
  }, []);

  const save = async (fn: boolean, an: boolean) => {
    const id = readConsentId() ?? newId();
    writeConsentId(id);
    const res = await record.mutateAsync({
      consentId: id,
      functional: fn,
      analytics: gpc ? false : an,
      advertising: false,
      gpcSignal: gpc,
    });
    if (res.gpcHonored) setHonored(true);
    setVisible(false);
  };

  if (!visible) {
    // Persistent GPC confirmation (CCPA 2026 regs: display that the signal was honored)
    if (honored && gpc) {
      return (
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full border border-teal-600/30 bg-white/95 px-4 py-2 text-xs font-medium text-teal-800 shadow-lg backdrop-blur">
          <ShieldCheck className="h-3.5 w-3.5" /> Opt-Out Preference Signal Honored
        </div>
      );
    }
    return null;
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-2xl border border-slate-900/10 bg-white/95 p-5 shadow-2xl backdrop-blur">
      <div className="flex items-start gap-3">
        <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
        <div className="text-sm text-slate-600">
          <p className="font-semibold text-slate-900">Cookies & privacy choices</p>
          <p className="mt-1 leading-relaxed">
            We use one strictly-necessary session cookie and optional functional preferences.
            No advertising or analytics trackers are deployed. Your choice is stored on our
            servers, not just in this browser. See the{' '}
            <Link to="/legal/cookie-policy" className="font-medium text-sky-700 hover:underline">Cookie Policy</Link>.
          </p>
          {gpc && (
            <p className="mt-2 rounded-lg bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800">
              Global Privacy Control detected — optional categories are off. Opt-Out Preference Signal Honored.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
            <span className="text-slate-400">Strictly necessary — always on</span>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={functional} onChange={(e) => setFunctional(e.target.checked)} className="h-3.5 w-3.5 accent-sky-600" />
              Functional (layout preferences)
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={analytics} disabled={gpc} onChange={(e) => setAnalytics(e.target.checked)} className="h-3.5 w-3.5 accent-sky-600 disabled:opacity-40" />
              Analytics (none currently deployed)
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={() => save(functional, analytics)} className="bg-royal-500 text-white hover:bg-royal-600">
              Save choices
            </Button>
            <Button size="sm" variant="outline" onClick={() => save(false, false)}>
              Decline optional
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
