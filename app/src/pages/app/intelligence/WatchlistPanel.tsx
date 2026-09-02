import { useState } from 'react';
import { Plus, Trash2, Star } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';

export default function WatchlistPanel() {
  const [symbol, setSymbol] = useState('');
  const utils = trpc.useUtils();
  const { data: rows, isLoading } = trpc.intelligenceData.watchlist.useQuery();
  const add = trpc.intelligenceData.addWatchlist.useMutation({
    onSuccess: () => {
      utils.intelligenceData.watchlist.invalidate();
      setSymbol('');
    },
  });
  const remove = trpc.intelligenceData.removeWatchlist.useMutation({
    onSuccess: () => utils.intelligenceData.watchlist.invalidate(),
  });

  const submit = () => {
    const s = symbol.trim().toUpperCase();
    if (!s || add.isPending) return;
    add.mutate({ symbol: s });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-slate-900/5 px-5 py-3.5">
        <p className="text-sm font-semibold text-slate-900">Watchlist</p>
        <p className="text-[11px] text-slate-500">
          Tracked across prices, news, filings, sentiment & earnings
        </p>
      </div>
      <div className="border-b border-slate-900/5 p-4">
        <div className="flex gap-2">
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Add ticker (e.g. AAPL)"
            className="font-mono-num flex-1 rounded-lg border border-slate-900/10 bg-slate-900/[0.03] px-3 py-2 text-xs uppercase outline-none focus:border-sky-600/50"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!symbol.trim() || add.isPending}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-royal-500 text-white disabled:opacity-40"
            aria-label="Add symbol"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {isLoading && <p className="text-center text-xs text-slate-400">Loading…</p>}
        {!isLoading && (rows?.length ?? 0) === 0 && (
          <p className="px-1 py-6 text-center text-xs leading-relaxed text-slate-400">
            No symbols yet. Add tickers to prefetch market data, news, filings, and earnings alerts.
          </p>
        )}
        {(rows ?? []).map((row) => (
          <div
            key={row.id}
            className="flex items-center justify-between rounded-xl border border-slate-900/8 bg-slate-900/[0.02] px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <Star className="h-3.5 w-3.5 text-amber-500" />
              <span className="font-mono-num text-sm font-semibold text-slate-900">{row.symbol}</span>
            </div>
            <button
              type="button"
              onClick={() => remove.mutate({ symbol: row.symbol })}
              disabled={remove.isPending}
              className={cn(
                'rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600',
              )}
              aria-label={`Remove ${row.symbol}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
