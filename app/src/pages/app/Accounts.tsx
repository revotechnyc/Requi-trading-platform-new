import { useMemo } from 'react';
import { Plus, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtUsd, type BrokerAccount } from '@/lib/data';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';

const typeStyle: Record<string, string> = {
  Live: 'border-sky-600/25 bg-royal-500/10 text-sky-600',
  Paper: 'border-amber-500/25 bg-amber-500/10 text-amber-600',
  IRA: 'border-sky-600/25 bg-sky-600/10 text-sky-800',
  Prop: 'border-teal-600/25 bg-teal-600/10 text-cyan-300',
};

export default function Accounts() {
  const { data, isLoading } = trpc.trading.accounts.useQuery();

  const accounts = useMemo<BrokerAccount[]>(
    () =>
      (data ?? []).map((a) => ({
        id: `ACC-${a.id}`,
        broker: a.broker,
        label: a.label,
        type: a.type as BrokerAccount['type'],
        equity: parseFloat(a.equity),
        dayPnl: parseFloat(a.dayPnl),
        status: a.status as BrokerAccount['status'],
        strategies: a.strategies,
      })),
    [data],
  );

  const total = accounts.reduce((a, b) => a + b.equity, 0);
  const dayPnl = accounts.reduce((a, b) => a + b.dayPnl, 0);
  const none = !isLoading && accounts.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-slate-500">Multi-account management</p>
          <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">Connected Accounts</h1>
        </div>
        <Button className="btn-glow bg-royal-500 font-semibold text-white hover:bg-sky-600">
          <Plus className="mr-1.5 h-4 w-4" /> Connect broker
        </Button>
      </div>

      {/* Aggregate strip — only when real connections exist; otherwise the
          explicit Not Connected state (Production Revision §2/§5). */}
      {!none && (
        <div className="glass flex flex-wrap items-center gap-x-10 gap-y-4 rounded-2xl p-5">
          <div>
            <p className="text-xs text-slate-500">Aggregate equity</p>
            <p className="font-mono-num text-2xl font-semibold text-slate-900">{fmtUsd(total)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Day P&L</p>
            <p className={cn('font-mono-num text-2xl font-semibold', dayPnl >= 0 ? 'text-teal-600' : 'text-red-600')}>
              {dayPnl >= 0 ? '+' : ''}{fmtUsd(dayPnl)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Accounts</p>
            <p className="font-mono-num text-2xl font-semibold text-slate-900">{accounts.length}</p>
          </div>
          <p className="ml-auto hidden max-w-xs text-xs leading-relaxed text-slate-500 lg:block">
            One signal fans out to every subscribed account with per-account position sizing and risk rules.
          </p>
        </div>
      )}

      {none && (
        <div className="glass flex flex-col items-center gap-3 rounded-2xl p-12 text-center">
          <AlertTriangle className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">Not Connected</p>
          <p className="max-w-md text-xs leading-relaxed text-slate-500">
            No brokerage accounts are connected. Balances, equity and day P&amp;L appear here only after a
            real connection is established and synchronized — this module never displays assumed values.
            The paper engine remains available in Autonomous without a connection.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading && (
          <div className="glass col-span-full rounded-2xl p-12 text-center text-sm text-slate-500">
            Syncing your broker accounts…
          </div>
        )}
        {accounts.map((a) => (
          <div key={a.id} className="glass glass-hover rounded-2xl p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-royal-500/25 to-sky-500/15 text-sm font-bold text-sky-800 ring-1 ring-sky-600/20">
                  {a.broker.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{a.broker}</p>
                  <p className="text-xs text-slate-500">{a.label}</p>
                </div>
              </div>
              <span className={cn('rounded-full border px-2.5 py-0.5 text-[10px] font-bold', typeStyle[a.type])}>
                {a.type}
              </span>
            </div>

            <div className="mt-5 flex items-end justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Equity</p>
                <p className="font-mono-num text-xl font-semibold text-slate-900">{fmtUsd(a.equity)}</p>
              </div>
              <p className={cn('font-mono-num text-sm font-semibold', a.dayPnl >= 0 ? 'text-teal-600' : 'text-red-600')}>
                {a.dayPnl >= 0 ? '+' : ''}{fmtUsd(a.dayPnl)}
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-900/5 pt-4 text-xs">
              {a.status === 'Connected' && (
                <span className="flex items-center gap-1.5 text-teal-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                </span>
              )}
              {a.status === 'Syncing' && (
                <span className="flex items-center gap-1.5 text-amber-600">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Syncing…
                </span>
              )}
              {a.status === 'Attention' && (
                <span className="flex items-center gap-1.5 text-red-600">
                  <AlertTriangle className="h-3.5 w-3.5" /> Attention
                </span>
              )}
              <span className="text-slate-500">{a.strategies} strateg{a.strategies > 1 ? 'ies' : 'y'} routed</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
