import { useState } from 'react';
import { trpc } from '@/providers/trpc';
import { Badge } from '@/pages/app/owner/shared';
import { Zap, ZapOff, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { AutonomousActivationModal } from '@/components/AutonomousActivation';

interface OrderRow {
  ticketId: string; symbol: string; side: string; quantity: number; orderType: string;
  broker: string; // PAPER | live broker — execution mode
  state: string; autoExecuted: boolean; entry: number | null; stop: number | null;
  target: number | null; filledQuantity: number | null; averageFillPrice: number | null;
  createdAt: string | Date; lastMessage: string | null;
}
function stateTone(s: string): 'teal' | 'amber' | 'red' | 'slate' | 'sky' {
  if (s === 'FILLED') return 'teal';
  if (s === 'WORKING' || s === 'SUBMITTING' || s === 'CONFIRMED') return 'sky';
  if (s === 'FAILED' || s === 'REJECTED') return 'red';
  if (s === 'EXPIRED') return 'amber';
  return 'slate';
}

export default function OrdersPanel() {
  const utils = trpc.useUtils();
  const { data: pnl, refetch } = trpc.engine.pnl.useQuery(undefined, { refetchInterval: 15000 });
  const { data: positions } = trpc.engine.positions.useQuery(undefined, { refetchInterval: 15000 });
  const { data: orders } = trpc.engine.orders.useQuery(undefined, { refetchInterval: 15000 });
  const { data: autoExec } = trpc.engine.getAutoExecute.useQuery(undefined);
  const { data: trailing } = trpc.engine.trailing.useQuery(undefined, { refetchInterval: 15000 });
  const { data: stopMode } = trpc.engine.getStopMode.useQuery(undefined);
  const setMode = trpc.engine.setStopMode.useMutation({
    onSuccess: () => utils.engine.getStopMode.invalidate(),
  });
  const tightenStopMut = trpc.engine.tightenStop.useMutation({ onSuccess: () => { utils.engine.positions.invalidate(); utils.engine.activity.invalidate(); } });
  const tightenTrailMut = trpc.engine.tightenTrail.useMutation({ onSuccess: () => { utils.engine.positions.invalidate(); utils.engine.activity.invalidate(); } });
  const overrideMut = trpc.engine.setPositionOverride.useMutation({ onSuccess: () => { utils.engine.positions.invalidate(); utils.engine.activity.invalidate(); } });
  const flattenMut = trpc.engine.flattenPosition.useMutation({ onSuccess: () => { utils.engine.positions.invalidate(); utils.engine.activity.invalidate(); utils.engine.pnl.invalidate(); } });
  const immediate = stopMode?.mode === 'IMMEDIATE_TRAIL';
  const consent = trpc.legal.consentStatus.useQuery();
  const [showActivation, setShowActivation] = useState(false);
  const setAuto = trpc.engine.setAutoExecute.useMutation({
    onSuccess: () => utils.engine.getAutoExecute.invalidate(),
    onError: (e) => { if (e.message.includes('AUTONOMOUS_CONSENT_REQUIRED')) setShowActivation(true); },
  });

  const autoOn = autoExec?.enabled === true;
  const requestAutoToggle = () => {
    if (autoOn) { setAuto.mutate({ enabled: false }); return; }
    // Legal Revision §18: dedicated activation consent before autonomous execution.
    if (!consent.data?.autonomousAccepted) { setShowActivation(true); return; }
    setAuto.mutate({ enabled: true });
  };
  const openPositions = (positions ?? []).filter((p) => p.status === 'OPEN');

  return (
    <section className="glass rounded-2xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">Orders &amp; P&amp;L</h2>
          <p className="text-xs text-slate-500">Order history, open positions, and the auto-execute switch for autonomous proposals.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            onClick={() => setMode.mutate({ mode: immediate ? 'CLASSIC' : 'IMMEDIATE_TRAIL' })}
            disabled={setMode.isPending}
            title={immediate ? 'Trail live from entry at 0.5%, tightening on gains, with a moving hard bottom — no flat stop' : 'Flat stop until +1R, then a 2.5×ATR trail'}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition border ${
              immediate
                ? 'bg-teal-500/15 text-teal-700 border-teal-500/30 hover:bg-teal-500/25'
                : 'bg-slate-900/[0.05] text-slate-600 border-slate-900/10 hover:bg-slate-900/10'
            }`}
          >
            {immediate ? 'Trail: IMMEDIATE' : 'Trail: CLASSIC'}
          </button>
          <button
            onClick={requestAutoToggle}
            disabled={setAuto.isPending}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              autoOn
                ? 'bg-amber-500/15 text-amber-700 border border-amber-500/30 hover:bg-amber-500/25'
                : 'bg-slate-900/[0.05] text-slate-600 border border-slate-900/10 hover:bg-slate-900/10'
            }`}
          >
            {autoOn ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
            Auto-execute {autoOn ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {autoOn && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-700">
          <b>Auto-execute is ON.</b> Autonomous engine proposals will buy <b>without</b> asking for your CONFIRM string — every fill still creates a ticket, an alert, and an order-history entry marked AUTO. Natural-language (chat) trades still always require confirmation. Turn this off anytime to return to confirm-first mode.
        </div>
      )}

      {immediate && (
        <div className="mb-4 rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-2.5 text-xs text-teal-700">
          <b>Immediate-trail mode.</b> No flat stop-loss is used anywhere — a software trail is live from entry at 0.5% below price, tightening as the trade gains (0.50 → 0.45 → 0.40 → 0.32 → 0.27 → 0.22%), with a hard bottom that moves from entry −0.5% to breakeven at +1% and locks 40% of peak gains beyond +2%. Both ratchets only move up.
        </div>
      )}

      {/* P&L summary */}
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-900/10 p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Realized P&amp;L</p>
          <p className={`mt-1 text-xl font-bold ${(pnl?.realizedTotal ?? 0) >= 0 ? 'text-teal-600' : 'text-red-600'}`}>
            {(pnl?.realizedTotal ?? 0) >= 0 ? '+' : ''}${(pnl?.realizedTotal ?? 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500">{pnl?.closedCount ?? 0} closed · {pnl?.winCount ?? 0}W / {pnl?.lossCount ?? 0}L</p>
        </div>
        <div className="rounded-xl border border-slate-900/10 p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Unrealized P&amp;L</p>
          <p className={`mt-1 text-xl font-bold ${(pnl?.unrealizedTotal ?? 0) >= 0 ? 'text-teal-600' : 'text-red-600'}`}>
            {(pnl?.unrealizedTotal ?? 0) >= 0 ? '+' : ''}${(pnl?.unrealizedTotal ?? 0).toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500">{(pnl?.unmarkedPositions ?? 0) > 0 ? `${pnl?.unmarkedPositions} unmarked` : 'marked to feed'}</p>
        </div>
        <div className="rounded-xl border border-slate-900/10 p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Open positions</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{pnl?.openCount ?? 0}</p>
          <p className="text-[11px] text-slate-500">{openPositions.map((p) => p.symbol).slice(0, 4).join(', ') || '—'}</p>
        </div>
        <div className="rounded-xl border border-slate-900/10 p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Trailing stops</p>
          <p className={`mt-1 text-xl font-bold ${trailing?.running ? 'text-teal-600' : 'text-red-600'}`}>
            {trailing?.running ? (trailing.marketHours ? 'LIVE' : 'ARMED') : 'DOWN'}
          </p>
          <p className="text-[11px] text-slate-500">
            {trailing?.running
              ? `${trailing.managed} protected · ${trailing.firedToday} fired today${trailing.marketHours ? '' : ' · sleeps off-hours'}`
              : 'not running — check System Check'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-900/10 p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Execution mode</p>
          <p className={`mt-1 text-xl font-bold ${autoOn ? 'text-amber-600' : 'text-slate-900'}`}>{autoOn ? 'AUTO' : 'CONFIRM'}</p>
          <p className="text-[11px] text-slate-500">{autoOn ? 'no confirmation required' : 'CONFIRM string required'}</p>
        </div>
      </div>

      {/* Mode-aware P&L split — paper and live are always separable (positions carry broker lineage from the source ticket) */}
      {pnl?.byMode && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700">Paper mode (PAPER broker)</p>
            <p className="mt-1 text-sm text-slate-700">
              Realized <b className={(pnl.byMode.paper.realizedTotal ?? 0) >= 0 ? 'text-teal-600' : 'text-red-600'}>{(pnl.byMode.paper.realizedTotal ?? 0) >= 0 ? '+' : ''}${(pnl.byMode.paper.realizedTotal ?? 0).toLocaleString()}</b>
              {' · '}Unrealized <b className={(pnl.byMode.paper.unrealizedTotal ?? 0) >= 0 ? 'text-teal-600' : 'text-red-600'}>{(pnl.byMode.paper.unrealizedTotal ?? 0) >= 0 ? '+' : ''}${(pnl.byMode.paper.unrealizedTotal ?? 0).toLocaleString()}</b>
            </p>
            <p className="text-[11px] text-slate-500">{pnl.byMode.paper.openCount} open · {pnl.byMode.paper.closedCount} closed · {pnl.byMode.paper.winCount}W / {pnl.byMode.paper.lossCount}L</p>
          </div>
          <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-teal-700">Live mode (IBKR / real broker)</p>
            <p className="mt-1 text-sm text-slate-700">
              Realized <b className={(pnl.byMode.live.realizedTotal ?? 0) >= 0 ? 'text-teal-600' : 'text-red-600'}>{(pnl.byMode.live.realizedTotal ?? 0) >= 0 ? '+' : ''}${(pnl.byMode.live.realizedTotal ?? 0).toLocaleString()}</b>
              {' · '}Unrealized <b className={(pnl.byMode.live.unrealizedTotal ?? 0) >= 0 ? 'text-teal-600' : 'text-red-600'}>{(pnl.byMode.live.unrealizedTotal ?? 0) >= 0 ? '+' : ''}${(pnl.byMode.live.unrealizedTotal ?? 0).toLocaleString()}</b>
            </p>
            <p className="text-[11px] text-slate-500">{pnl.byMode.live.openCount} open · {pnl.byMode.live.closedCount} closed · {pnl.byMode.live.winCount}W / {pnl.byMode.live.lossCount}L</p>
          </div>
        </div>
      )}

      {/* open positions */}
      {openPositions.length > 0 && (
        <div className="mb-5">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Open positions</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-900/5 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Symbol</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Avg entry</th>
                  <th className="px-3 py-2">Mark</th><th className="px-3 py-2">Protection</th><th className="px-3 py-2">Unrealized</th><th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {openPositions.map((p) => (
                  <tr key={p.id} className="border-b border-slate-900/[0.04] last:border-0">
                    <td className="px-3 py-2 font-semibold text-slate-800">
                      {p.symbol} <Badge tone={p.broker === 'PAPER' ? 'sky' : 'teal'}>{p.broker === 'PAPER' ? 'PAPER' : 'LIVE'}</Badge>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{p.quantity}</td>
                    <td className="px-3 py-2 text-slate-600">${p.avgEntry.toFixed(2)}</td>
                    <td className="px-3 py-2 text-slate-600">{p.mark !== null ? `$${p.mark.toFixed(2)}` : 'no mark'}</td>
                    <td className="px-3 py-2">
                      {p.overrideMode === 'MANUAL' ? (
                        <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700">MANUAL — module OFF</span>
                      ) : p.trailArmed && p.trailPrice !== null ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">TRAIL</span>
                          <span className="text-slate-700">${p.trailPrice.toFixed(2)}</span>
                          {p.scaleStage > 0 && <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold text-sky-700">{p.scaleStage >= 2 ? 'T1 FLOOR' : 'BE FLOOR'}</span>}
                          {p.disasterPrice !== null && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500" title={`Disaster stop resting at broker @ $${p.disasterPrice.toFixed(2)}`}>+D</span>}
                        </span>
                      ) : p.stopPrice !== null ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-slate-500">flat ${p.stopPrice.toFixed(2)}</span>
                          {p.disasterPrice !== null && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500" title={`Disaster stop resting at broker @ $${p.disasterPrice.toFixed(2)}`}>+D</span>}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className={`px-3 py-2 font-semibold ${(p.unrealizedPnl ?? 0) >= 0 ? 'text-teal-600' : 'text-red-600'}`}>
                      {p.unrealizedPnl !== null ? (
                        <span className="inline-flex items-center gap-1">
                          {p.unrealizedPnl >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                          {p.unrealizedPnl >= 0 ? '+' : ''}${p.unrealizedPnl.toFixed(2)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1">
                        <button
                          onClick={() => {
                            const v = window.prompt(`Tighten protection for ${p.symbol} (must be ABOVE current level, below mark). Enter new ${p.trailArmed ? 'trail' : 'stop'} price:`);
                            if (v === null) return;
                            const n = Number(v);
                            if (!(n > 0)) { window.alert('Invalid price.'); return; }
                            if (p.trailArmed) tightenTrailMut.mutate({ positionId: p.id, trailPrice: n });
                            else tightenStopMut.mutate({ positionId: p.id, stopPrice: n });
                          }}
                          className="rounded-md bg-slate-900/[0.05] px-1.5 py-0.5 text-[9px] font-bold text-slate-600 hover:bg-slate-900/10"
                        >TIGHTEN</button>
                        <button
                          onClick={() => overrideMut.mutate({ positionId: p.id, manual: p.overrideMode !== 'MANUAL' })}
                          className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${p.overrideMode === 'MANUAL' ? 'bg-teal-100 text-teal-700 hover:bg-teal-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
                          title={p.overrideMode === 'MANUAL' ? 'Return to automatic protection' : 'Take manual control — module stands down (only way to loosen a stop)'}
                        >{p.overrideMode === 'MANUAL' ? 'AUTO' : 'MANUAL'}</button>
                        <button
                          onClick={() => { if (window.confirm(`Flatten ${p.symbol} — market-sell all ${p.quantity} shares now?`)) flattenMut.mutate({ positionId: p.id }); }}
                          className="rounded-md bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700 hover:bg-red-200"
                        >FLATTEN</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* order history */}
      <h3 className="mb-2 text-sm font-semibold text-slate-800">Order history</h3>
      {!orders || orders.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No orders yet — confirmed and auto-executed tickets will appear here.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-900/5 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Ticket</th><th className="px-3 py-2">Symbol</th><th className="px-3 py-2">Side</th>
                <th className="px-3 py-2">Qty</th><th className="px-3 py-2">State</th><th className="px-3 py-2">Fill</th>
                <th className="px-3 py-2">Stop / Target</th><th className="px-3 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {(orders as OrderRow[]).map((o) => (
                <tr key={o.ticketId} className="border-b border-slate-900/[0.04] last:border-0">
                  <td className="px-3 py-2 font-mono text-xs text-slate-600">
                    {o.ticketId}
                    {o.autoExecuted && <Badge tone="amber">AUTO</Badge>}
                    <Badge tone={o.broker === 'PAPER' ? 'sky' : 'teal'}>{o.broker === 'PAPER' ? 'PAPER' : 'LIVE'}</Badge>
                  </td>
                  <td className="px-3 py-2 font-semibold text-slate-800">{o.symbol}</td>
                  <td className="px-3 py-2 text-slate-600">{o.side}</td>
                  <td className="px-3 py-2 text-slate-600">{o.quantity}</td>
                  <td className="px-3 py-2"><Badge tone={stateTone(o.state)}>{o.state}</Badge></td>
                  <td className="px-3 py-2 text-slate-600">
                    {o.averageFillPrice !== null ? `${o.filledQuantity ?? o.quantity} @ $${o.averageFillPrice.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {o.stop !== null ? `$${o.stop.toFixed(2)}` : '—'} / {o.target !== null ? `$${o.target.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{new Date(o.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AutonomousActivationModal
        open={showActivation}
        onClose={() => setShowActivation(false)}
        onActivated={() => setAuto.mutate({ enabled: true })}
      />
    </section>
  );
}
