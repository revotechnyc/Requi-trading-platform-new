import { useState } from 'react';
import { KeyRound, BellRing, ShieldCheck } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';

function Row({ label, hint, defaultOn = true }: { label: string; hint: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
      </div>
      <Switch checked={on} onCheckedChange={setOn} />
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">Workspace</p>
        <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">Settings</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* profile */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 text-slate-700">
            <ShieldCheck className="h-4.5 w-4.5 text-sky-600" />
            <h2 className="font-display text-base font-semibold">Profile & Security</h2>
          </div>
          <div className="mt-5 flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-royal-500 to-teal-500 text-lg font-bold text-white">
              {(user?.name ?? 'D T').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-slate-900">{user?.name ?? 'Demo Trader'}</p>
              <p className="text-sm text-slate-500">{user?.email ?? 'demo@requi.trading'}</p>
              <span className="mt-1 inline-block rounded-full border border-teal-600/25 bg-teal-600/10 px-2.5 py-0.5 text-[10px] font-bold text-teal-700">
                PRO · Trial day 6 of 14
              </span>
            </div>
          </div>
          <div className="mt-5 divide-y divide-slate-900/5 border-t border-slate-900/5">
            <Row label="Two-factor authentication" hint="Require an authenticator code at sign-in" />
            <Row label="Read-only broker mode" hint="Prevent order placement; sync positions only" defaultOn={false} />
          </div>
        </div>

        {/* api */}
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 text-slate-700">
            <KeyRound className="h-4.5 w-4.5 text-sky-600" />
            <h2 className="font-display text-base font-semibold">API & Webhooks</h2>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Programmatic access for custom bots on the Unified Broker API.
          </p>
          <div className="mt-4 rounded-xl border border-slate-900/8 bg-slate-100 px-4 py-3">
            <p className="text-xs leading-relaxed text-slate-500">
              API key issuance is not yet enabled on this environment. Keys are generated
              server-side, shown once, and stored hashed only — never in plaintext. Contact
              support to join the API access waitlist.
            </p>
          </div>
          <div className="mt-5 divide-y divide-slate-900/5 border-t border-slate-900/5">
            <Row label="Webhook retries" hint="Retry failed deliveries up to 5 times with backoff" />
            <Row label="Signed payloads" hint="Verify HMAC-SHA256 signature on inbound alerts" />
          </div>
        </div>

        {/* notifications */}
        <div className="glass rounded-2xl p-6 lg:col-span-2">
          <div className="flex items-center gap-2 text-slate-700">
            <BellRing className="h-4.5 w-4.5 text-sky-600" />
            <h2 className="font-display text-base font-semibold">Real-Time Notifications</h2>
          </div>
          <div className="grid gap-x-10 divide-y divide-slate-900/5 sm:grid-cols-2 sm:divide-y-0">
            <div className="divide-y divide-slate-900/5">
              <Row label="Order fills" hint="Push + email on every executed order" />
              <Row label="Strategy errors" hint="Immediate alert when a strategy fails to route" />
            </div>
            <div className="divide-y divide-slate-900/5">
              <Row label="Daily P&L digest" hint="Summary of all accounts at market close" />
              <Row label="Broker disconnects" hint="Alert when a linked account loses sync" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
