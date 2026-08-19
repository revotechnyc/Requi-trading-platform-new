import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play, Pause, Square, OctagonX, ShieldCheck, Radio, Wallet, Activity,
  ChevronDown, ChevronUp, CircleDot, CheckCircle2, AlertTriangle, XCircle, Info,
} from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';

/* ─── formatting helpers ────────────────────────────────────────────────── */

const fmt$ = (n: number | null | undefined, sign = false) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const v = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign ? (n >= 0 ? '+' : '−') : n < 0 ? '−' : ''}$${v}`;
};
const time = (d: string | Date) =>
  new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });

const STATUS_STYLE: Record<string, { dot: string; text: string; bg: string }> = {
  RUNNING: { dot: 'bg-teal-500', text: 'text-teal-700', bg: 'bg-teal-500/10 border-teal-600/20' },
  PAUSED: { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-500/10 border-amber-600/20' },
  STOPPED: { dot: 'bg-slate-400', text: 'text-slate-500', bg: 'bg-slate-400/10 border-slate-400/20' },
  ERROR: { dot: 'bg-red-500', text: 'text-red-600', bg: 'bg-red-500/10 border-red-500/20' },
  BROKER_DISCONNECTED: { dot: 'bg-red-500', text: 'text-red-600', bg: 'bg-red-500/10 border-red-500/20' },
};

const EVENT_ICON: Record<string, typeof Info> = {
  success: CheckCircle2,
  warn: AlertTriangle,
  risk: ShieldCheck,
  trade: CircleDot,
  error: XCircle,
  info: Info,
};
const EVENT_COLOR: Record<string, string> = {
  success: 'text-teal-600',
  warn: 'text-amber-600',
  risk: 'text-red-500',
  trade: 'text-royal-600',
  error: 'text-red-500',
  info: 'text-slate-400',
};

/* ─── main page ─────────────────────────────────────────────────────────── */

export default function Autonomous() {
  const utils = trpc.useUtils();
  const { data: state, refetch: refetchState } = trpc.autonomous.state.useQuery(undefined, { refetchInterval: 5000 });
  const { data: streamRows } = trpc.autonomous.stream.useQuery({}, { refetchInterval: 2500 });
  const { data: openPositions } = trpc.autonomous.positions.useQuery(undefined, { refetchInterval: 5000 });
  const { data: orders } = trpc.autonomous.orders.useQuery(undefined, { refetchInterval: 8000 });
  const { data: trades } = trpc.autonomous.trades.useQuery(undefined, { refetchInterval: 8000 });
  const { data: accounts } = trpc.trading.accounts.useQuery();

  const [tab, setTab] = useState<'positions' | 'orders' | 'trades'>('positions');
  const [setupOpen, setSetupOpen] = useState(false);
  const [liveConfirm, setLiveConfirm] = useState('');
  const [stopConfirm, setStopConfirm] = useState('');
  const [showLiveDialog, setShowLiveDialog] = useState(false);
  const [showStopDialog, setShowStopDialog] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  const invalidate = () => {
    refetchState();
    utils.autonomous.positions.invalidate();
    utils.autonomous.orders.invalidate();
    utils.autonomous.trades.invalidate();
    utils.autonomous.stream.invalidate();
  };
  const onError = (e: { message: string }) => setActionError(e.message);

  const mStart = trpc.autonomous.start.useMutation({ onSuccess: () => { setActionError(null); invalidate(); }, onError });
  const mPause = trpc.autonomous.pause.useMutation({ onSuccess: invalidate, onError });
  const mResume = trpc.autonomous.resume.useMutation({ onSuccess: invalidate, onError });
  const mStop = trpc.autonomous.stop.useMutation({ onSuccess: invalidate, onError });
  const mEmergency = trpc.autonomous.emergencyStop.useMutation({
    onSuccess: () => { setShowStopDialog(false); setStopConfirm(''); invalidate(); },
    onError,
  });
  const mRelease = trpc.autonomous.releaseKillSwitch.useMutation({ onSuccess: invalidate, onError });
  const mSetMode = trpc.autonomous.setMode.useMutation({
    onSuccess: () => { setShowLiveDialog(false); setLiveConfirm(''); invalidate(); },
    onError,
  });
  const mConfig = trpc.autonomous.updateConfig.useMutation({ onSuccess: () => { setActionError(null); invalidate(); }, onError });
  const mConnectPaper = trpc.trading.connectPaperAccount.useMutation({
    onSuccess: (row) => {
      utils.trading.accounts.invalidate();
      mConfig.mutate({ accountId: row.id });
    },
    onError,
  });

  const events = useMemo(() => [...(streamRows ?? [])].reverse(), [streamRows]);
  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight });
  }, [events.length]);

  const status = state?.session?.status ?? 'STOPPED';
  const mode = state?.config?.mode ?? 'PAPER';
  const metrics = state?.metrics;
  const running = status === 'RUNNING';
  const paused = status === 'PAUSED' || status === 'ERROR';
  const killSwitch = state?.killSwitch ?? false;

  return (
    <div className="space-y-6">
      {/* ── top bar: Requi Trading / Autonomous · Broker · Mode · Status ── */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-slate-500">Requi Trading</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Autonomous</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-slate-900/10 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600">
            <Wallet className="h-3.5 w-3.5 text-sky-600" />
            {state?.account ? `${state.account.broker} · ${state.account.label}` : 'No account selected'}
          </span>
          <span
            className={cn(
              'rounded-full border px-3 py-1.5 text-[11px] font-bold tracking-wide',
              mode === 'LIVE' ? 'border-red-500/25 bg-red-500/10 text-red-600' : 'border-sky-600/25 bg-sky-600/10 text-sky-700',
            )}
          >
            {mode}
          </span>
          <span className={cn('flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold', STATUS_STYLE[status].bg, STATUS_STYLE[status].text)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_STYLE[status].dot, running && 'animate-pulse')} />
            {status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {killSwitch && (
        <div className="flex items-center justify-between rounded-2xl border border-red-500/25 bg-red-500/[0.06] px-5 py-3.5">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-600">
            <OctagonX className="h-4 w-4" /> Emergency stop engaged — all autonomous order flow is blocked.
          </p>
          <button
            onClick={() => mRelease.mutate({ confirm: 'RELEASE' })}
            className="rounded-lg border border-red-500/30 px-3 py-1.5 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-500/10"
          >
            Release kill switch
          </button>
        </div>
      )}
      {actionError && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-5 py-3 text-sm font-medium text-amber-700">
          {actionError}
        </div>
      )}

      {/* ── performance cards ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Today's P&L", value: fmt$(metrics?.todayPnl, true), tone: (metrics?.todayPnl ?? 0) >= 0 ? 'text-teal-600' : 'text-red-500' },
          { label: 'Total P&L', value: fmt$(metrics?.totalPnl, true), tone: (metrics?.totalPnl ?? 0) >= 0 ? 'text-teal-600' : 'text-red-500' },
          { label: 'Capital deployed', value: fmt$(metrics?.deployed), tone: 'text-slate-900' },
          { label: 'Open positions', value: String(metrics?.openPositions ?? 0), tone: 'text-slate-900' },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-slate-900/8 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <p className={cn('font-display text-2xl font-bold tabular-nums tracking-tight sm:text-3xl', c.tone)}>{c.value}</p>
            <p className="mt-1 text-[11px] font-medium text-slate-500">{c.label}</p>
          </div>
        ))}
      </div>

      {/* ── primary workspace: live run stream + positions/orders/trades ── */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* live run stream */}
        <div className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-slate-900/8 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between border-b border-slate-900/5 px-5 py-3.5">
            <div>
              <p className="text-sm font-semibold text-slate-900">Live Run Stream</p>
              <p className="text-[11px] text-slate-500">What the engine is doing, as it happens</p>
            </div>
            {running && (
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-teal-600">
                <Radio className="h-3 w-3 animate-pulse" /> STREAMING
              </span>
            )}
          </div>
          <div ref={streamRef} className="flex-1 space-y-1 overflow-y-auto px-5 py-4">
            {events.length === 0 && (
              <p className="py-16 text-center text-xs text-slate-400">
                No activity yet. Start Autonomous and the engine's decisions will stream here.
              </p>
            )}
            {events.map((e) => {
              const Icon = EVENT_ICON[e.kind] ?? Info;
              return (
                <div key={e.id} className="flex gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-900/[0.02]">
                  <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', EVENT_COLOR[e.kind] ?? 'text-slate-400')} />
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium tabular-nums text-slate-400">{time(e.createdAt)}</p>
                    <p className="text-xs leading-relaxed text-slate-700">{e.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {/* controls */}
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-900/5 px-5 py-3.5">
            {!running && !paused && (
              <button
                onClick={() => mStart.mutate()}
                disabled={mStart.isPending || killSwitch}
                className="flex items-center gap-1.5 rounded-xl bg-royal-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-royal-600 disabled:opacity-40"
              >
                <Play className="h-3.5 w-3.5" /> Start Autonomous
              </button>
            )}
            {running && (
              <button
                onClick={() => mPause.mutate()}
                className="flex items-center gap-1.5 rounded-xl border border-slate-900/10 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-900/[0.04]"
              >
                <Pause className="h-3.5 w-3.5" /> Pause
              </button>
            )}
            {paused && (
              <button
                onClick={() => mResume.mutate()}
                className="flex items-center gap-1.5 rounded-xl bg-royal-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-royal-600"
              >
                <Play className="h-3.5 w-3.5" /> Resume
              </button>
            )}
            {(running || paused) && (
              <button
                onClick={() => mStop.mutate()}
                className="flex items-center gap-1.5 rounded-xl border border-slate-900/10 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-900/[0.04]"
              >
                <Square className="h-3.5 w-3.5" /> Stop
              </button>
            )}
            <button
              onClick={() => setShowStopDialog(true)}
              className="ml-auto flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-500/10"
            >
              <OctagonX className="h-3.5 w-3.5" /> Emergency Stop
            </button>
          </div>
        </div>

        {/* positions / orders / history tabs */}
        <div className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-slate-900/8 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex border-b border-slate-900/5">
            {(
              [
                ['positions', `Open Positions${metrics?.openPositions ? ` (${metrics.openPositions})` : ''}`],
                ['orders', 'Orders'],
                ['trades', 'Trade History'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  'flex-1 border-b-2 px-2 py-3 text-[11px] font-semibold transition-colors',
                  tab === key ? 'border-royal-500 text-royal-600' : 'border-transparent text-slate-400 hover:text-slate-600',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {tab === 'positions' && (
              <PositionsTable rows={openPositions ?? []} />
            )}
            {tab === 'orders' && <OrdersTable rows={orders ?? []} />}
            {tab === 'trades' && <TradesTable rows={trades ?? []} />}
          </div>
        </div>
      </div>

      {/* ── setup & risk (progressive disclosure) ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-900/8 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <button
          onClick={() => setSetupOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900">Setup & Risk Controls</p>
            <p className="text-[11px] text-slate-500">
              Broker account · capital allocation · trading mode · risk limits
            </p>
          </div>
          {setupOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>

        {setupOpen && state && (
          <div className="grid gap-6 border-t border-slate-900/5 px-5 py-5 lg:grid-cols-3">
            {/* broker account */}
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Broker account</p>
              {(accounts ?? []).map((a) => (
                <button
                  key={a.id}
                  onClick={() => mConfig.mutate({ accountId: a.id })}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl border p-3.5 text-left transition-colors',
                    state.config.accountId === a.id
                      ? 'border-royal-500/50 bg-royal-500/[0.05]'
                      : 'border-slate-900/10 bg-white hover:border-sky-600/30',
                  )}
                >
                  <div>
                    <p className="text-xs font-semibold text-slate-900">{a.broker} · {a.label}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      {a.type} · buying power {fmt$(parseFloat(a.equity))}
                    </p>
                  </div>
                  <span className={cn('flex items-center gap-1 text-[10px] font-semibold', a.status === 'Connected' ? 'text-teal-600' : 'text-amber-600')}>
                    <CheckCircle2 className="h-3 w-3" /> {a.status}
                  </span>
                </button>
              ))}
              <button
                onClick={() => mConnectPaper.mutate({ label: `Paper ${(accounts?.length ?? 0) + 1}` })}
                disabled={mConnectPaper.isPending}
                className="w-full rounded-xl border border-dashed border-slate-900/15 px-3 py-2.5 text-[11px] font-semibold text-slate-500 transition-colors hover:border-sky-600/40 hover:text-sky-600"
              >
                + Connect broker (paper account)
              </button>
              <p className="text-[10px] leading-relaxed text-slate-400">
                Credentials never appear here — live broker connections use their official OAuth adapters.
              </p>
            </div>

            {/* capital allocation + mode */}
            <div className="space-y-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Capital allocation</p>
              <AllocationEditor
                key={state.config.id + state.config.allocationValue + state.config.allocationType}
                allocationType={state.config.allocationType as 'DOLLAR' | 'PERCENT'}
                allocationValue={parseFloat(state.config.allocationValue)}
                equity={state.account ? parseFloat(state.account.equity) : 0}
                allocated={metrics?.allocated ?? 0}
                deployed={metrics?.deployed ?? 0}
                onSave={(t, v) => mConfig.mutate({ allocationType: t, allocationValue: v })}
              />
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Trading mode</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => mode !== 'PAPER' && mSetMode.mutate({ mode: 'PAPER' })}
                    className={cn(
                      'flex-1 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors',
                      mode === 'PAPER' ? 'border-sky-600/40 bg-sky-600/10 text-sky-700' : 'border-slate-900/10 text-slate-500 hover:bg-slate-900/[0.03]',
                    )}
                  >
                    Paper Trading
                  </button>
                  <button
                    onClick={() => mode !== 'LIVE' && setShowLiveDialog(true)}
                    className={cn(
                      'flex-1 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors',
                      mode === 'LIVE' ? 'border-red-500/40 bg-red-500/10 text-red-600' : 'border-slate-900/10 text-slate-500 hover:bg-slate-900/[0.03]',
                    )}
                  >
                    Live Trading
                  </button>
                </div>
              </div>
            </div>

            {/* risk controls */}
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Risk controls</p>
              <RiskEditor
                key={state.config.id + 'risk' + state.config.updatedAt}
                cfg={{
                  maxPositionSizePct: parseFloat(state.config.maxPositionSizePct),
                  maxDailyLoss: parseFloat(state.config.maxDailyLoss),
                  maxPositions: state.config.maxPositions,
                  stopLossPct: parseFloat(state.config.stopLossPct),
                  trailingStopPct: parseFloat(state.config.trailingStopPct),
                }}
                onSave={(patch) => mConfig.mutate(patch)}
              />
              <p className="text-[10px] leading-relaxed text-slate-400">
                Limits are enforced by the execution engine on every order — changing them here changes
                what the bot is allowed to do, not just what the UI shows.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── live confirmation dialog ── */}
      {showLiveDialog && (
        <ConfirmDialog
          title="Switch to Live Trading?"
          body="Real capital will be used and orders may be executed through your connected brokerage account. Type LIVE to confirm."
          value={liveConfirm}
          onChange={setLiveConfirm}
          expect="LIVE"
          confirmLabel="Switch to Live"
          pending={mSetMode.isPending}
          error={mSetMode.error?.message}
          onCancel={() => { setShowLiveDialog(false); setLiveConfirm(''); }}
          onConfirm={() => mSetMode.mutate({ mode: 'LIVE', confirm: liveConfirm })}
        />
      )}

      {/* ── emergency stop dialog ── */}
      {showStopDialog && (
        <ConfirmDialog
          title="Emergency Stop"
          body="This immediately blocks all new autonomous orders and initiates the safe shutdown of the engine. Type STOP to engage."
          value={stopConfirm}
          onChange={setStopConfirm}
          expect="STOP"
          confirmLabel="Engage Emergency Stop"
          danger
          pending={mEmergency.isPending}
          error={mEmergency.error?.message}
          onCancel={() => { setShowStopDialog(false); setStopConfirm(''); }}
          onConfirm={() => mEmergency.mutate({ confirm: 'STOP' })}
        />
      )}
    </div>
  );
}

/* ─── allocation editor ─────────────────────────────────────────────────── */

function AllocationEditor(props: {
  allocationType: 'DOLLAR' | 'PERCENT';
  allocationValue: number;
  equity: number;
  allocated: number;
  deployed: number;
  onSave: (t: 'DOLLAR' | 'PERCENT', v: number) => void;
}) {
  const [type, setType] = useState(props.allocationType);
  const [value, setValue] = useState(String(props.allocationValue));
  const num = parseFloat(value) || 0;
  const dirty = type !== props.allocationType || num !== props.allocationValue;
  return (
    <div className="space-y-2.5">
      <div className="flex gap-2">
        <div className="flex rounded-lg border border-slate-900/10 p-0.5">
          {(['DOLLAR', 'PERCENT'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn('rounded-md px-2.5 py-1 text-[10px] font-semibold', type === t ? 'bg-royal-500 text-white' : 'text-slate-500')}
            >
              {t === 'DOLLAR' ? '$ Amount' : '% Equity'}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-28 rounded-lg border border-slate-900/10 px-3 py-1.5 text-xs tabular-nums text-slate-700 outline-none focus:border-sky-600/50"
        />
        {dirty && (
          <button
            onClick={() => props.onSave(type, num)}
            className="rounded-lg bg-royal-500 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-royal-600"
          >
            Save
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <span className="text-slate-500">Account equity</span>
        <span className="text-right font-semibold tabular-nums text-slate-800">{fmt$(props.equity)}</span>
        <span className="text-slate-500">Allocated to Autonomous</span>
        <span className="text-right font-semibold tabular-nums text-slate-800">{fmt$(props.allocated)}</span>
        <span className="text-slate-500">In use (deployed)</span>
        <span className="text-right font-semibold tabular-nums text-slate-800">{fmt$(props.deployed)}</span>
        <span className="text-slate-500">Available to deploy</span>
        <span className="text-right font-semibold tabular-nums text-teal-600">{fmt$(Math.max(0, props.allocated - props.deployed))}</span>
      </div>
    </div>
  );
}

/* ─── risk editor ───────────────────────────────────────────────────────── */

function RiskEditor(props: {
  cfg: { maxPositionSizePct: number; maxDailyLoss: number; maxPositions: number; stopLossPct: number; trailingStopPct: number };
  onSave: (patch: Record<string, number>) => void;
}) {
  const [v, setV] = useState(props.cfg);
  const dirty = JSON.stringify(v) !== JSON.stringify(props.cfg);
  const field = (key: keyof typeof v, label: string, suffix: string) => (
    <label className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-slate-500">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={v[key]}
          onChange={(e) => setV({ ...v, [key]: parseFloat(e.target.value) || 0 })}
          className="w-20 rounded-lg border border-slate-900/10 px-2 py-1 text-right text-[11px] tabular-nums text-slate-700 outline-none focus:border-sky-600/50"
        />
        <span className="w-6 text-slate-400">{suffix}</span>
      </span>
    </label>
  );
  return (
    <div className="space-y-2">
      {field('maxPositionSizePct', 'Max position size', '%')}
      {field('maxDailyLoss', 'Max daily loss', '$')}
      {field('maxPositions', 'Max open positions', '')}
      {field('stopLossPct', 'Stop-loss', '%')}
      {field('trailingStopPct', 'Trailing stop', '%')}
      {dirty && (
        <button
          onClick={() => props.onSave(v)}
          className="w-full rounded-lg bg-royal-500 py-1.5 text-[11px] font-semibold text-white hover:bg-royal-600"
        >
          Save risk limits
        </button>
      )}
    </div>
  );
}

/* ─── tables ────────────────────────────────────────────────────────────── */

function PositionsTable({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <Empty text="No open autonomous positions." />;
  return (
    <div className="space-y-2">
      {rows.map((p) => {
        const entry = parseFloat(p.avgEntry);
        const trail = p.trailPrice ? parseFloat(p.trailPrice) : null;
        return (
          <div key={p.id} className="rounded-xl border border-slate-900/8 p-3.5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">{p.symbol}</p>
              <span className="rounded-full bg-teal-600/10 px-2 py-0.5 text-[10px] font-bold text-teal-700">OPEN</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-[10.5px]">
              <span className="text-slate-500">Qty <b className="text-slate-800">{p.quantity}</b></span>
              <span className="text-slate-500">Entry <b className="tabular-nums text-slate-800">{fmt$(entry)}</b></span>
              <span className="text-slate-500">Value <b className="tabular-nums text-slate-800">{fmt$(entry * p.quantity)}</b></span>
              <span className="text-slate-500">Stop <b className="tabular-nums text-slate-800">{p.stopPrice ?? '—'}</b></span>
              <span className="text-slate-500">Trail <b className="tabular-nums text-slate-800">{trail ?? '—'}</b></span>
              <span className="text-slate-500">Opened <b className="text-slate-800">{time(p.openedAt)}</b></span>
            </div>
            {p.strategy && <p className="mt-1.5 text-[10px] text-slate-400">{p.strategy}</p>}
          </div>
        );
      })}
    </div>
  );
}

function OrdersTable({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <Empty text="No autonomous orders yet." />;
  return (
    <div className="space-y-2">
      {rows.map((o) => (
        <div key={o.id} className="flex items-center justify-between rounded-xl border border-slate-900/8 p-3.5">
          <div>
            <p className="text-xs font-semibold text-slate-900">
              {o.side} {o.filledQuantity ?? o.quantity} {o.symbol} <span className="font-normal text-slate-400">· {o.ticketId}</span>
            </p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {o.orderType} {o.limitPrice ? `@ ${o.limitPrice}` : ''} · {o.strategy} · {o.submittedAt ? time(o.submittedAt) : ''}
            </p>
          </div>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-bold',
              o.state === 'FILLED' ? 'bg-teal-600/10 text-teal-700' : o.state.includes('REJECT') || o.state === 'CANCELLED' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-600',
            )}
          >
            {o.state}
          </span>
        </div>
      ))}
    </div>
  );
}

function TradesTable({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <Empty text="No completed autonomous trades yet." />;
  return (
    <div className="space-y-2">
      {rows.map((t) => {
        const pnl = t.realizedPnl !== null ? parseFloat(t.realizedPnl) : null;
        return (
          <div key={t.id} className="rounded-xl border border-slate-900/8 p-3.5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">{t.symbol}</p>
              <span className={cn('text-sm font-bold tabular-nums', (pnl ?? 0) >= 0 ? 'text-teal-600' : 'text-red-500')}>
                {fmt$(pnl, true)}
              </span>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-1 text-[10.5px] text-slate-500">
              <span>Entry <b className="tabular-nums text-slate-800">{t.avgEntry}</b></span>
              <span>Exit <b className="tabular-nums text-slate-800">{t.exitPrice ?? '—'}</b></span>
              <span>Return <b className="tabular-nums text-slate-800">{t.returnPct !== null ? `${t.returnPct >= 0 ? '+' : ''}${t.returnPct.toFixed(2)}%` : '—'}</b></span>
              <span>Opened <b className="text-slate-800">{time(t.openedAt)}</b></span>
              <span>Closed <b className="text-slate-800">{t.closedAt ? time(t.closedAt) : '—'}</b></span>
              <span>Reason <b className="text-slate-800">{t.exitReason ?? '—'}</b></span>
            </div>
            {t.strategy && <p className="mt-1.5 text-[10px] text-slate-400">{t.strategy}</p>}
          </div>
        );
      })}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center py-16">
      <p className="flex items-center gap-2 text-xs text-slate-400">
        <Activity className="h-3.5 w-3.5" /> {text}
      </p>
    </div>
  );
}

/* ─── typed-confirmation dialog ─────────────────────────────────────────── */

function ConfirmDialog(props: {
  title: string;
  body: string;
  value: string;
  onChange: (v: string) => void;
  expect: string;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-slate-900/10 bg-white p-6 shadow-xl">
        <h3 className={cn('font-display text-lg font-bold', props.danger ? 'text-red-600' : 'text-slate-900')}>{props.title}</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">{props.body}</p>
        <input
          value={props.value}
          onChange={(e) => props.onChange(e.target.value.toUpperCase())}
          placeholder={`Type ${props.expect}`}
          autoFocus
          className="mt-4 w-full rounded-xl border border-slate-900/10 px-4 py-2.5 text-center text-sm font-bold tracking-widest text-slate-800 outline-none focus:border-royal-500/60"
        />
        {props.error && <p className="mt-2 text-[11px] font-medium text-red-500">{props.error}</p>}
        <div className="mt-5 flex gap-2">
          <button
            onClick={props.onCancel}
            className="flex-1 rounded-xl border border-slate-900/10 px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-900/[0.03]"
          >
            Cancel
          </button>
          <button
            onClick={props.onConfirm}
            disabled={props.value !== props.expect || props.pending}
            className={cn(
              'flex-1 rounded-xl px-3 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-40',
              props.danger ? 'bg-red-500 hover:bg-red-600' : 'bg-royal-500 hover:bg-royal-600',
            )}
          >
            {props.pending ? 'Working…' : props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
