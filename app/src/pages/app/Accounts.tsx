import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Plus, RefreshCw, AlertTriangle, CheckCircle2, Unplug, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fmtUsd, type BrokerAccount } from '@/lib/data';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';

const typeStyle: Record<string, string> = {
  Live: 'border-sky-600/25 bg-royal-500/10 text-sky-600',
  Paper: 'border-amber-500/25 bg-amber-500/10 text-amber-600',
  IRA: 'border-sky-600/25 bg-sky-600/10 text-sky-800',
  Prop: 'border-teal-600/25 bg-teal-600/10 text-cyan-300',
};

/** Brokers available in the Connect picker. Add entries here as integrations ship. */
const BROKER_OPTIONS = [
  {
    id: 'robinhood_mcp' as const,
    name: 'Robinhood',
    subtitle: 'Agentic Trading (MCP) — OAuth',
    available: true,
  },
];

export default function Accounts() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.trading.accounts.useQuery();
  const [banner, setBanner] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const startMut = trpc.trading.robinhoodMcpStart.useMutation({
    onSuccess: (res) => {
      setPickerOpen(false);
      setBanner('Redirecting to Robinhood to authorize Agentic MCP…');
      window.location.assign(res.authorizeUrl);
    },
    onError: (err) => setBanner(err.message),
  });
  const disconnectMut = trpc.trading.robinhoodMcpDisconnect.useMutation({
    onSuccess: async () => {
      setBanner('Robinhood Agentic MCP disconnected.');
      await utils.trading.accounts.invalidate();
    },
    onError: (err) => setBanner(err.message),
  });
  const refreshMut = trpc.trading.robinhoodMcpRefresh.useMutation({
    onSuccess: async (res) => {
      setBanner(res.lastHealthDetail ?? 'Health refreshed.');
      await utils.trading.accounts.invalidate();
    },
    onError: (err) => setBanner(err.message),
  });

  const accounts = useMemo<BrokerAccount[]>(
    () =>
      (data?.accounts ?? []).map((a) => ({
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

  const rh = data?.robinhoodMcp ?? null;
  const total = accounts.reduce((a, b) => a + b.equity, 0);
  const dayPnl = accounts.reduce((a, b) => a + b.dayPnl, 0);
  const connecting = startMut.isPending;
  const none = !isLoading && accounts.length === 0;

  function openBrokerPicker() {
    setBanner(null);
    setPickerOpen(true);
  }

  function selectBroker(id: (typeof BROKER_OPTIONS)[number]['id']) {
    if (id === 'robinhood_mcp') {
      if (rh) {
        setBanner('Robinhood Agentic MCP is already connected.');
        setPickerOpen(false);
        return;
      }
      setBanner(null);
      startMut.mutate();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-slate-500">Multi-account management</p>
          <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">Connected Accounts</h1>
        </div>
        <Button
          className="btn-glow bg-royal-500 font-semibold text-white hover:bg-sky-600"
          disabled={connecting}
          onClick={openBrokerPicker}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          {connecting ? 'Starting…' : 'Connect broker account'}
        </Button>
      </div>

      {banner && (
        <div className="rounded-xl border border-slate-900/10 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {banner}
        </div>
      )}

      <div className="glass rounded-2xl p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Robinhood Agentic Trading (MCP)</p>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
              Each user connects their own Robinhood Agentic account via{' '}
              <a
                href="https://robinhood.com/us/en/agentic-trading/"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-sky-700 hover:underline"
              >
                Robinhood Agentic Trading
              </a>
              . Connect only from the{' '}
              <span className="font-semibold text-slate-700">live HTTPS</span> site in a desktop browser —
              localhost is blocked because Robinhood rejects it.
            </p>
          </div>
          <a
            href="https://robinhood.com/us/en/support/articles/agentic-trading-overview/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline"
          >
            Setup docs <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        {rh ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-900/10 bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">{rh.label}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {rh.lastHealthDetail ?? 'Connected'}
                {rh.toolCount != null ? ` · ${rh.toolCount} tools` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={refreshMut.isPending}
                onClick={() => refreshMut.mutate()}
              >
                <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', refreshMut.isPending && 'animate-spin')} />
                Refresh health
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={disconnectMut.isPending}
                onClick={() => {
                  if (window.confirm('Disconnect Robinhood Agentic MCP for this user?')) {
                    disconnectMut.mutate();
                  }
                }}
              >
                <Unplug className="mr-1.5 h-3.5 w-3.5" />
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            Not connected yet — use <span className="font-medium text-slate-700">Connect broker account</span>,
            then choose Robinhood to authorize (desktop browser).
          </p>
        )}

        {data?.ibkrServerLinked && (
          <p className="mt-3 text-[11px] text-slate-500">
            Server-linked IBKR ({data.ibkrAccountId ?? 'configured'}) is unchanged. Robinhood MCP connect does
            not replace it in this phase.
          </p>
        )}
      </div>

      {!none && (
        <div className="glass flex flex-wrap items-center gap-x-10 gap-y-4 rounded-2xl p-5">
          <div>
            <p className="text-xs text-slate-500">Aggregate equity</p>
            <p className="font-mono-num text-2xl font-semibold text-slate-900">{fmtUsd(total)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Day P&amp;L</p>
            <p className={cn('font-mono-num text-2xl font-semibold', dayPnl >= 0 ? 'text-teal-600' : 'text-red-600')}>
              {dayPnl >= 0 ? '+' : ''}
              {fmtUsd(dayPnl)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Accounts</p>
            <p className="font-mono-num text-2xl font-semibold text-slate-900">{accounts.length}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading && (
          <div className="glass col-span-full rounded-2xl p-12 text-center text-sm text-slate-500">
            Syncing your broker accounts…
          </div>
        )}
        {none && (
          <div className="glass col-span-full flex flex-col items-center gap-3 rounded-2xl p-12 text-center">
            <AlertTriangle className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">Not Connected</p>
            <p className="max-w-md text-xs leading-relaxed text-slate-500">
              No brokerage accounts are connected. Balances appear only after a real connection is established.
              The paper engine remains available in Autonomous without a connection.
            </p>
            <Button
              className="mt-2 bg-royal-500 font-semibold text-white hover:bg-sky-600"
              disabled={connecting}
              onClick={openBrokerPicker}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Connect broker account
            </Button>
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
                {a.dayPnl >= 0 ? '+' : ''}
                {fmtUsd(a.dayPnl)}
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
              <span className="text-slate-500">
                {a.broker === 'Robinhood' ? (
                  <Link to="/app/accounts" className="hover:underline">
                    Agentic MCP
                  </Link>
                ) : (
                  `${a.strategies} strateg${a.strategies > 1 ? 'ies' : 'y'} routed`
                )}
              </span>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-md border-slate-200 bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle>Connect broker account</DialogTitle>
            <DialogDescription>
              Choose a broker to connect. More brokers can be added here later; Robinhood Agentic MCP is
              available now.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 space-y-2">
            {BROKER_OPTIONS.map((opt) => {
              const already = opt.id === 'robinhood_mcp' && Boolean(rh);
              const disabled = !opt.available || connecting || already;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectBroker(opt.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition',
                    disabled
                      ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-70'
                      : 'border-slate-200 bg-white hover:border-sky-400 hover:bg-sky-50/60',
                  )}
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-royal-500/25 to-sky-500/15 text-xs font-bold text-sky-800 ring-1 ring-sky-600/20">
                    {opt.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{opt.name}</p>
                    <p className="text-xs text-slate-500">{opt.subtitle}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-slate-500">
                    {already ? 'Connected' : connecting && opt.id === 'robinhood_mcp' ? 'Starting…' : 'Connect'}
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
