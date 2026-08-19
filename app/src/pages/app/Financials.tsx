import { useMemo, useState } from 'react';
import { Download, Landmark, Search, Inbox } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import OrdersPanel from '@/components/OrdersPanel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * FINANCIALS (Production Revision §12–§16) — the canonical reporting center.
 * Every number derives from the same backend services Autonomous and
 * Intelligence consume. Empty/unavailable data renders explicit states —
 * never $0.00 fabrications. CSV export is the user's own filtered dataset,
 * generated server-side.
 */

const RANGES = ['Today', '1W', '1M', '3M', 'YTD', '1Y', 'All'] as const;
type Range = (typeof RANGES)[number];

const fmtUsd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

function rangeStart(r: Range): number | null {
  const now = Date.now();
  switch (r) {
    case 'Today': {
      const et = new Date(now).toLocaleDateString('en-US', { timeZone: 'America/New_York' });
      return new Date(`${et}T00:00:00`).getTime();
    }
    case '1W': return now - 7 * 86_400_000;
    case '1M': return now - 30 * 86_400_000;
    case '3M': return now - 91 * 86_400_000;
    case 'YTD': return new Date(new Date(now).getFullYear(), 0, 1).getTime();
    case '1Y': return now - 365 * 86_400_000;
    case 'All': return null;
  }
}

const STATUS_OPTIONS = ['FILLED', 'WORKING', 'REJECTED', 'EXPIRED', 'CANCELED', 'FAILED'];

export default function Financials() {
  const [range, setRange] = useState<Range>('All');
  const [search, setSearch] = useState('');
  const [symbol, setSymbol] = useState('');
  const [status, setStatus] = useState('');

  const { data: pnl } = trpc.financials.summary.useQuery(undefined, { refetchInterval: 15000 });
  const { data: positions } = trpc.financials.positions.useQuery(undefined, { refetchInterval: 15000 });
  const { data: orders, isLoading: ordersLoading } = trpc.financials.orders.useQuery(
    { search: search || undefined, symbol: symbol || undefined, status: status || undefined, limit: 500 },
    { refetchInterval: 30000 },
  );
  const csvQuery = trpc.financials.ordersCsv.useQuery(
    { search: search || undefined, symbol: symbol || undefined, status: status || undefined, limit: 500 },
    { enabled: false },
  );

  // Range-scoped realized P&L computed from canonical position rows — never a
  // separate formula: realized = Σ realizedPnl of positions closed in range.
  const realized = useMemo(() => {
    if (!positions) return null;
    const start = rangeStart(range);
    return positions
      .filter((p) => p.status === 'CLOSED' && p.realizedPnl !== null)
      .filter((p) => start === null || (p.closedAt !== null && new Date(p.closedAt).getTime() >= start))
      .reduce((a, p) => a + (p.realizedPnl ?? 0), 0);
  }, [positions, range]);

  const unrealized = useMemo(() => {
    if (!positions) return null;
    const open = positions.filter((p) => p.status === 'OPEN' && p.unrealizedPnl !== null);
    return open.length === 0 ? null : open.reduce((a, p) => a + (p.unrealizedPnl ?? 0), 0);
  }, [positions]);

  const openCount = positions?.filter((p) => p.status === 'OPEN').length ?? null;
  const total = realized !== null || unrealized !== null ? (realized ?? 0) + (unrealized ?? 0) : null;

  async function downloadCsv() {
    const res = await csvQuery.refetch();
    if (!res.data) return;
    const blob = new Blob([res.data.csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.data.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-slate-500">Reporting</p>
          <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">Financials</h1>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                range === r ? 'bg-royal-500/15 text-sky-600 ring-1 ring-sky-600/25' : 'text-slate-500 hover:bg-slate-900/5',
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* P&L cards — canonical figures, explicit states when data is absent */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="glass rounded-2xl p-5">
          <p className="text-xs text-slate-500">Realized P&L ({range})</p>
          {realized === null ? (
            <p className="mt-1 text-sm font-medium text-slate-400">No closed positions</p>
          ) : (
            <p className={cn('font-mono-num text-2xl font-semibold', realized >= 0 ? 'text-teal-600' : 'text-red-600')}>
              {realized >= 0 ? '+' : ''}{fmtUsd(realized)}
            </p>
          )}
        </div>
        <div className="glass rounded-2xl p-5">
          <p className="text-xs text-slate-500">Unrealized P&L (open)</p>
          {unrealized === null ? (
            <p className="mt-1 text-sm font-medium text-slate-400">Awaiting market data</p>
          ) : (
            <p className={cn('font-mono-num text-2xl font-semibold', unrealized >= 0 ? 'text-teal-600' : 'text-red-600')}>
              {unrealized >= 0 ? '+' : ''}{fmtUsd(unrealized)}
            </p>
          )}
        </div>
        <div className="glass rounded-2xl p-5">
          <p className="text-xs text-slate-500">Total P&L</p>
          {total === null ? (
            <p className="mt-1 text-sm font-medium text-slate-400">No data</p>
          ) : (
            <p className={cn('font-mono-num text-2xl font-semibold', total >= 0 ? 'text-teal-600' : 'text-red-600')}>
              {total >= 0 ? '+' : ''}{fmtUsd(total)}
            </p>
          )}
          {pnl && (
            <p className="mt-1 text-[11px] text-slate-500">
              Paper {fmtUsd(pnl.byMode.paper.realizedTotal + pnl.byMode.paper.unrealizedTotal)} · Live {fmtUsd(pnl.byMode.live.realizedTotal + pnl.byMode.live.unrealizedTotal)}
            </p>
          )}
        </div>
        <div className="glass rounded-2xl p-5">
          <p className="text-xs text-slate-500">Open positions</p>
          {openCount === null ? (
            <p className="mt-1 text-sm font-medium text-slate-400">Syncing</p>
          ) : (
            <p className="font-mono-num text-2xl font-semibold text-slate-900">{openCount}</p>
          )}
          {pnl && (
            <p className="mt-1 text-[11px] text-slate-500">
              {pnl.closedCount} closed · {pnl.winCount}W / {pnl.lossCount}L
            </p>
          )}
        </div>
      </div>

      {/* Order history explorer (§14) + CSV export (§15) */}
      <div className="glass overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-900/5 px-6 py-4">
          <Landmark className="h-4.5 w-4.5 text-sky-600" />
          <h2 className="font-display text-base font-semibold text-slate-900">Order history</h2>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ticket, symbol, strategy…"
              className="h-9 w-52 rounded-lg border border-slate-900/8 bg-slate-900/[0.03] pl-9 pr-3 text-xs text-slate-700 outline-none focus:border-royal-500/50"
            />
          </div>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Symbol"
            className="h-9 w-24 rounded-lg border border-slate-900/8 bg-slate-900/[0.03] px-3 text-xs text-slate-700 outline-none focus:border-royal-500/50"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-lg border border-slate-900/8 bg-slate-900/[0.03] px-2 text-xs text-slate-700 outline-none"
          >
            <option value="">All states</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={downloadCsv} disabled={csvQuery.isFetching}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {csvQuery.isFetching ? 'Preparing…' : 'Export CSV'}
          </Button>
        </div>

        {ordersLoading && <div className="p-12 text-center text-sm text-slate-500">Loading the order ledger…</div>}

        {!ordersLoading && (!orders || orders.length === 0) && (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <Inbox className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No orders match</p>
            <p className="max-w-md text-xs leading-relaxed text-slate-500">
              Orders appear here once a ticket is confirmed or auto-executed. The export downloads exactly
              this filtered dataset.
            </p>
          </div>
        )}

        {orders && orders.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-slate-900/5 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-3 font-medium">Order ID</th>
                  <th className="px-4 py-3 font-medium">Symbol</th>
                  <th className="px-4 py-3 font-medium">Side</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Qty</th>
                  <th className="px-4 py-3 font-medium">Filled</th>
                  <th className="px-4 py-3 font-medium">Avg fill</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Venue</th>
                  <th className="px-4 py-3 font-medium">Strategy</th>
                  <th className="px-6 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.ticketId} className="border-b border-slate-900/[0.04] hover:bg-slate-900/[0.02]">
                    <td className="font-mono-num px-6 py-3 text-xs text-slate-600">{o.ticketId}</td>
                    <td className="font-mono-num px-4 py-3 font-semibold text-slate-900">{o.symbol}</td>
                    <td className={cn('px-4 py-3 text-xs font-bold', o.side === 'BUY' ? 'text-teal-600' : 'text-red-500')}>{o.side}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{o.orderType}</td>
                    <td className="font-mono-num px-4 py-3 text-slate-600">{o.quantity}</td>
                    <td className="font-mono-num px-4 py-3 text-slate-600">{o.filledQuantity ?? '—'}</td>
                    <td className="font-mono-num px-4 py-3 text-slate-600">{o.averageFillPrice !== null ? o.averageFillPrice.toFixed(2) : '—'}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                      {o.state}{o.autoExecuted ? ' · AUTO' : ''}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-bold',
                        o.broker.toUpperCase() === 'PAPER' ? 'bg-sky-600/10 text-sky-600' : 'bg-teal-600/10 text-teal-700',
                      )}>
                        {o.broker}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{o.strategy}</td>
                    <td className="font-mono-num px-6 py-3 text-xs text-slate-500">
                      {new Date(o.createdAt).toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Positions, protection controls and the mode-split P&L detail */}
      <OrdersPanel />
    </div>
  );
}
