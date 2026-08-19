import { Radio, ArrowDownRight, ArrowUpRight, Inbox } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';

/**
 * SIGNALS (Production Revision §10) — renders the canonical signal ledger
 * only. No ledger rows means the explicit "no signals" state — never a
 * fabricated count, never a demo table.
 */

const statusColor: Record<string, string> = {
  GENERATED: 'text-sky-600',
  EXECUTED: 'text-teal-600',
  REJECTED: 'text-red-600',
  EXPIRED: 'text-slate-500',
  CANCELLED: 'text-amber-600',
};

function timeEt(d: Date | string): string {
  return new Date(d).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false });
}

export default function Signals() {
  const { data: signals, isLoading } = trpc.signals.today.useQuery(undefined, { refetchInterval: 15000 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-slate-500">Execution</p>
          <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">Signals</h1>
        </div>
        {signals && signals.length > 0 && (
          <span className="flex w-fit items-center gap-1.5 rounded-full border border-teal-600/20 bg-teal-600/10 px-3 py-1.5 text-xs font-semibold text-teal-700">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-teal-600" /> {signals.length} today
          </span>
        )}
      </div>

      <div className="glass overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 border-b border-slate-900/5 px-6 py-4">
          <Radio className="h-4.5 w-4.5 text-sky-600" />
          <h2 className="font-display text-base font-semibold text-slate-900">Today's signals</h2>
          <span className="ml-auto text-xs text-slate-500">ET session day · from the canonical ledger</span>
        </div>

        {isLoading && (
          <div className="p-12 text-center text-sm text-slate-500">Loading the signal ledger…</div>
        )}

        {!isLoading && (!signals || signals.length === 0) && (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <Inbox className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No signals generated today</p>
            <p className="max-w-md text-xs leading-relaxed text-slate-500">
              This table fills when the engine or Intelligence generates a real signal. Nothing is
              simulated for display — an empty ledger is the honest state.
            </p>
          </div>
        )}

        {signals && signals.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-900/5 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-3 font-medium">Time (ET)</th>
                  <th className="px-4 py-3 font-medium">Signal</th>
                  <th className="px-4 py-3 font-medium">Symbol</th>
                  <th className="px-4 py-3 font-medium">Side</th>
                  <th className="px-4 py-3 font-medium">Qty</th>
                  <th className="px-4 py-3 font-medium">Price at signal</th>
                  <th className="px-4 py-3 font-medium">Origin</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((s) => (
                  <tr key={s.signalId} className="border-b border-slate-900/[0.04] transition-colors hover:bg-slate-900/[0.02]">
                    <td className="font-mono-num px-6 py-3.5 text-slate-500">{timeEt(s.createdAt)}</td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-700">{s.strategyId}</p>
                      <p className="text-xs text-slate-500">{s.signalType} · {s.signalId}</p>
                    </td>
                    <td className="font-mono-num px-4 py-3.5 font-semibold text-slate-900">{s.symbol}</td>
                    <td className="px-4 py-3.5">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold',
                          s.side === 'BUY' ? 'bg-teal-600/15 text-teal-700' : 'bg-red-600/15 text-red-500',
                        )}
                      >
                        {s.side === 'BUY' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {s.side}
                      </span>
                    </td>
                    <td className="font-mono-num px-4 py-3.5 text-slate-600">{s.quantity}</td>
                    <td className="font-mono-num px-4 py-3.5 text-slate-600">
                      {s.priceAtSignal !== null ? Number(s.priceAtSignal).toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-medium text-slate-500">{s.origin}</td>
                    <td className={cn('px-6 py-3.5 text-xs font-semibold', statusColor[s.status] ?? 'text-slate-500')}>
                      {s.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
