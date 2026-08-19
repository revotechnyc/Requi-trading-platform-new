import { useState } from 'react';
import { Link } from 'react-router';
import { ShieldAlert, Zap, X } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { Button } from '@/components/ui/button';

/**
 * Dedicated autonomous-activation consent flow (Legal Revision §18).
 * Never buried in general Terms: before auto-execute or auto-universe can be
 * enabled, the user reviews the autonomous disclosure and accepts the current
 * version — recorded with method AUTONOMOUS_ACTIVATION.
 */
export function AutonomousActivationModal({
  open,
  onClose,
  onActivated,
}: {
  open: boolean;
  onClose: () => void;
  onActivated: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept = trpc.legal.accept.useMutation();
  const utils = trpc.useUtils();

  if (!open) return null;

  const activate = async () => {
    setError(null);
    try {
      await accept.mutateAsync({
        slug: 'autonomous-trading-disclosure',
        method: 'AUTONOMOUS_ACTIVATION',
        context: '/app/autonomous',
      });
      await utils.legal.consentStatus.invalidate();
      onActivated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record activation consent.');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl bg-white p-7 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            <h2 className="font-display text-lg font-bold text-slate-900">Activate autonomous features</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-4 max-h-72 space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">
          <p><b className="text-slate-900">What you are authorizing.</b> Within the parameters you configure, the Requi engine may build and maintain a watchlist, monitor market data, generate entry proposals, manage stops and trailing exits, and — only if you enable auto-execution — submit orders without asking you to confirm each one.</p>
          <p><b className="text-slate-900">Auto-execution is OFF by default</b> and fails closed: if your setting cannot be read, nothing auto-executes. Chat-originated and manual trades always require your confirmation regardless.</p>
          <p><b className="text-slate-900">Risks.</b> Automation can amplify losses: orders continue while conditions deteriorate, without human review of each order. Stale data, provider outages, software defects, and extreme markets can all cause unintended behavior. No guarantee of profit or loss prevention is made.</p>
          <p><b className="text-slate-900">Your controls.</b> The kill switch stops autonomous operation immediately; the AUTONOMOUS TRADING ON/OFF state is displayed whenever the module is active; broker connections can be revoked anytime.</p>
          <p className="text-xs text-slate-500">
            Full text:{' '}
            <Link to="/legal/autonomous-trading-disclosure" target="_blank" className="font-medium text-sky-700 hover:underline">Autonomous Trading Disclosure</Link>
            {' · '}
            <Link to="/legal/trading-risk-disclosure" target="_blank" className="font-medium text-sky-700 hover:underline">Trading Risk Disclosure</Link>
            {' · '}
            <Link to="/legal/brokerage-integration-disclosure" target="_blank" className="font-medium text-sky-700 hover:underline">Brokerage Integration Disclosure</Link>
          </p>
        </div>

        <label className="mt-4 flex items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1 h-4 w-4 accent-amber-600" />
          <span>
            I have reviewed the Autonomous Trading Disclosure and Trading Risk Disclosure, I understand that
            automated trading can lose money, and I authorize autonomous operation within my configured settings.
          </span>
        </label>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex gap-3">
          <Button
            disabled={!checked || accept.isPending}
            onClick={activate}
            className="flex-1 bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
          >
            <Zap className="mr-1.5 h-4 w-4" />
            {accept.isPending ? 'Recording consent…' : 'Record consent & enable'}
          </Button>
          <Button variant="outline" onClick={onClose}>Not now</Button>
        </div>
        <p className="mt-3 text-center text-[11px] text-slate-400">
          Your consent is stored with the document version, timestamp, and method. You can withdraw it anytime by switching autonomous features off.
        </p>
      </div>
    </div>
  );
}
