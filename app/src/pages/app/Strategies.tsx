import { useMemo, useState } from 'react';
import { Search, Copy, Check, ClipboardPaste, FileText, Layers, Wallet, Activity, ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import type { Strategy } from '@/lib/data';
import { trpc } from '@/providers/trpc';
import { Pnl } from '@/components/Reveal';
import { cn } from '@/lib/utils';

const tabs = ['All', 'Live', 'Paper', 'Paused'] as const;

const statusStyle: Record<Strategy['status'], string> = {
  Live: 'border-teal-600/25 bg-teal-600/10 text-teal-700',
  Paper: 'border-amber-500/25 bg-amber-500/10 text-amber-600',
  Paused: 'border-slate-400/25 bg-slate-400/10 text-slate-500',
};

function StrategyTextCard({ s }: { s: Strategy }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(s.prompt).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="glass glass-hover flex flex-col rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display truncate text-base font-semibold text-slate-900">{s.name}</h3>
            <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold', statusStyle[s.status])}>
              <span className={cn('h-1.5 w-1.5 rounded-full', s.status === 'Live' ? 'live-dot bg-teal-600' : s.status === 'Paper' ? 'bg-amber-500' : 'bg-slate-500')} />
              {s.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{s.id} · {s.source} · {s.asset} · routes to {s.accounts} account{s.accounts > 1 ? 's' : ''}</p>
        </div>
        <FileText className="h-5 w-5 shrink-0 text-sky-600/70" />
      </div>

      {/* text-based strategy body */}
      <pre className="font-mono-num mt-4 flex-1 whitespace-pre-wrap rounded-xl border border-slate-900/8 bg-slate-100 p-4 text-[11.5px] leading-relaxed text-slate-600">
        {s.prompt}
      </pre>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <span className="text-slate-500">30d P&L <span className="font-mono-num font-semibold"><Pnl value={s.pnl30d} /></span></span>
        <span className="text-slate-500">Win rate <span className="font-mono-num font-semibold text-slate-700">{s.winRate}%</span></span>
        <span className="text-slate-500">Trades <span className="font-mono-num font-semibold text-slate-700">{s.trades}</span></span>
      </div>

      <div className="mt-4 flex gap-2 border-t border-slate-900/5 pt-4">
        <button
          onClick={copy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-900/10 bg-slate-900/[0.03] px-3 py-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-900/[0.07]"
        >
          {copied ? <Check className="h-4 w-4 text-teal-600" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied to clipboard' : 'Copy strategy text'}
        </button>
        <Button asChild className="btn-glow flex-1 bg-royal-500 text-xs font-semibold text-white hover:bg-royal-600">
          <Link to="/app">
            <ClipboardPaste className="mr-1.5 h-4 w-4" /> Paste into Intelligence
          </Link>
        </Button>
      </div>
    </div>
  );
}

export default function Strategies() {
  const [tab, setTab] = useState<(typeof tabs)[number]>('All');
  const [query, setQuery] = useState('');
  const { data, isLoading } = trpc.trading.strategies.useQuery();

  const all = useMemo<Strategy[]>(
    () =>
      (data ?? []).map((s) => ({
        id: `STR-${String(s.id).padStart(2, '0')}`,
        name: s.name,
        source: s.source as Strategy['source'],
        asset: s.asset as Strategy['asset'],
        status: s.status as Strategy['status'],
        accounts: s.accounts,
        pnl30d: parseFloat(s.pnl30d),
        winRate: s.winRate,
        trades: s.trades,
        prompt: s.prompt,
      })),
    [data],
  );

  const list = useMemo(
    () =>
      all.filter(
        (s) =>
          (tab === 'All' || s.status === tab) &&
          (s.name.toLowerCase().includes(query.toLowerCase()) ||
            s.asset.toLowerCase().includes(query.toLowerCase()) ||
            s.prompt.toLowerCase().includes(query.toLowerCase())),
      ),
    [all, tab, query],
  );

  const summary = [
    { icon: Layers, label: 'Total strategies', value: String(all.length) },
    { icon: Activity, label: 'Live now', value: String(all.filter((s) => s.status === 'Live').length) },
    { icon: Wallet, label: 'Accounts routed', value: String(all.reduce((n, s) => n + s.accounts, 0)) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-slate-500">Automation · text-based</p>
          <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">Strategies</h1>
          <p className="mt-1.5 max-w-xl text-sm text-slate-500">
            Strategies are plain text — copy one, paste it into{' '}
            <Link to="/app" className="font-medium text-sky-600 hover:text-sky-600">
              Intelligence <ArrowRight className="inline h-3.5 w-3.5" />
            </Link>
            , and Requi parses and routes it to your accounts.
          </p>
        </div>
        <div className="flex gap-2.5">
          {summary.map((k) => (
            <div key={k.label} className="glass flex items-center gap-2.5 rounded-xl px-3.5 py-2.5">
              <k.icon className="h-4 w-4 text-sky-600" />
              <div className="leading-tight">
                <p className="font-mono-num text-sm font-semibold text-slate-900">{k.value}</p>
                <p className="text-[10px] text-slate-500">{k.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex w-fit gap-1 rounded-xl border border-slate-900/8 bg-slate-900/[0.03] p-1">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
                tab === t ? 'bg-royal-500/20 text-sky-600' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, asset, or strategy text…"
            className="h-10 w-full rounded-xl border border-slate-900/8 bg-slate-900/[0.03] pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-600 outline-none focus:border-sky-600/50"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {list.map((s) => (
          <StrategyTextCard key={s.id} s={s} />
        ))}
        {list.length === 0 && (
          <div className="glass col-span-full rounded-2xl p-12 text-center text-sm text-slate-500">
            {isLoading
              ? 'Loading your strategies…'
              : query || tab !== 'All'
                ? 'No strategies match your filters.'
                : 'No strategies yet. Paste a text strategy into Intelligence to create your first one.'}
          </div>
        )}
      </div>
    </div>
  );
}
