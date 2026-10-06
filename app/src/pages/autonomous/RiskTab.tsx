import { useMemo } from 'react'
import { Shield, Lock, AlertTriangle } from 'lucide-react'
import { colors, layout } from './design'
import { trpc } from '@/providers/trpc'

function Card({ title, icon: Icon, children, accent }: { title: string; icon: React.ElementType; children: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      background: colors.bgPanel,
      border: `1px solid ${accent ? accent + '30' : colors.border}`,
      borderRadius: layout.cardRadius,
      overflow: 'hidden',
    }}>
      <div style={{ padding: 20, borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon size={16} color={accent || colors.blue} strokeWidth={2} />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>{title}</h2>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

function RiskRow({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
      <span style={{ fontSize: 13, color: warning ? colors.orange : colors.textSecondary }}>{label}</span>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: warning ? colors.orange : colors.textPrimary, fontWeight: warning ? 600 : 400 }}>{value}</span>
    </div>
  )
}

function money(n: number, d = 0) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export default function RiskTab() {
  const { data: state } = trpc.autonomous.state.useQuery(undefined, { refetchInterval: 5000 })
  const { data: ibkr } = trpc.trading.ibkrStatus.useQuery(undefined, { refetchInterval: 10_000 })
  const { data: positions = [] } = trpc.autonomous.positions.useQuery(undefined, { refetchInterval: 5000 })
  const { data: brokerPos } = trpc.execution.positions.useQuery({ broker: 'IBKR' }, { refetchInterval: 15_000, retry: 1 })
  const { data: orders = [] } = trpc.autonomous.orders.useQuery(undefined, { refetchInterval: 5000 })

  const cfg = state?.config
  const equity = Number(ibkr?.equity || state?.account?.equity || 0)
  const allocated = Number(state?.metrics?.allocated || 0)
  const deployed = Number(state?.metrics?.deployed || 0)
  const available = Number(state?.metrics?.available || Math.max(0, allocated - deployed))
  const maxDailyLoss = cfg?.maxDailyLoss != null ? parseFloat(String(cfg.maxDailyLoss)) : 0
  const todayPnl = Number(state?.metrics?.todayPnl || 0)
  // Daily loss consumed = adverse today P&L against the configured ceiling.
  const dailyUsed = maxDailyLoss > 0 ? Math.min(maxDailyLoss, Math.max(0, -todayPnl)) : 0
  const dailyPct = maxDailyLoss > 0 ? (dailyUsed / maxDailyLoss) * 100 : 0
  const maxPosPct = cfg?.maxPositionSizePct != null ? parseFloat(String(cfg.maxPositionSizePct)) : 0
  const stopLossPct = cfg?.stopLossPct != null ? parseFloat(String(cfg.stopLossPct)) : 0
  const trailPct = cfg?.trailingStopPct != null ? parseFloat(String(cfg.trailingStopPct)) : 0
  const maxPositions = cfg?.maxPositions ?? 0
  const openCount = Math.max(
    positions.length,
    (brokerPos?.positions ?? []).filter((p) => Number(p.quantity) !== 0).length,
  )

  const grossExposure = useMemo(() => {
    const gw = (brokerPos?.positions ?? []).reduce(
      (s, p) => s + Math.abs(Number(p.marketValue) || Number(p.averageCost) * Number(p.quantity) || 0),
      0,
    )
    if (gw > 0) return gw
    return positions.reduce((s, p) => s + p.quantity * parseFloat(p.avgEntry), 0)
  }, [brokerPos, positions])

  const singleNameMax = useMemo(() => {
    const notionals = (brokerPos?.positions ?? [])
      .filter((p) => Number(p.quantity) !== 0)
      .map((p) => Math.abs(Number(p.marketValue) || Number(p.averageCost) * Number(p.quantity) || 0))
    if (notionals.length) return Math.max(...notionals)
    return positions.reduce((m, p) => Math.max(m, p.quantity * parseFloat(p.avgEntry)), 0)
  }, [brokerPos, positions])

  const openOrdersNotional = useMemo(() => {
    return orders
      .filter((o) => ['READY_FOR_CONFIRMATION', 'WORKING', 'SUBMITTING'].includes(o.state))
      .reduce((s, o) => {
        const px = o.limitPrice != null ? parseFloat(String(o.limitPrice)) : o.entry != null ? parseFloat(String(o.entry)) : 0
        return s + (px > 0 ? px * o.quantity : 0)
      }, 0)
  }, [orders])

  const kill = state?.killSwitch ? 'ENGAGED' : 'SAFE'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <Shield size={16} color={colors.blue} strokeWidth={2} />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>Risk Management</h2>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>
          live · autonomous config + IBKR Paper exposure
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
        <Card title='Live Risk Controls' icon={Shield}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <RiskRow label='IBKR Equity' value={equity > 0 ? `$${money(equity, 2)}` : '—'} />
            <RiskRow label='Engine Allocation' value={`$${money(allocated)}`} />
            <RiskRow label='Deployed' value={`$${money(deployed)}`} />
            <RiskRow label='Available' value={`$${money(available)}`} />
            <RiskRow label='Max Daily Loss' value={maxDailyLoss > 0 ? `$${money(maxDailyLoss)}` : '—'} />
            <RiskRow label='Today P&L' value={`$${money(todayPnl, 2)}`} warning={todayPnl < 0} />
            <RiskRow label='Remaining Daily Risk' value={maxDailyLoss > 0 ? `$${money(Math.max(0, maxDailyLoss - dailyUsed))}` : '—'} warning={dailyPct > 50} />
            <RiskRow label='Gross Exposure' value={`$${money(grossExposure)}`} />
            <RiskRow label='Largest Single Name' value={`$${money(singleNameMax)}`} />
            <RiskRow label='Open Orders Notional' value={`$${money(openOrdersNotional)}`} />
            <RiskRow label='Open Positions' value={`${openCount} / ${maxPositions || '—'}`} warning={maxPositions > 0 && openCount >= maxPositions} />
            <RiskRow label='Kill Switch' value={kill} warning={kill === 'ENGAGED'} />
          </div>
          {maxDailyLoss > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' }}>Daily Loss Consumed</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: dailyPct > 75 ? colors.red : dailyPct > 50 ? colors.orange : colors.green, fontWeight: 600 }}>{dailyPct.toFixed(1)}%</span>
              </div>
              <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, dailyPct)}%`, height: '100%', background: dailyPct > 75 ? colors.red : dailyPct > 50 ? colors.orange : colors.green, borderRadius: 4 }} />
              </div>
            </div>
          )}
        </Card>

        <Card title='Position Authority' icon={Lock} accent={colors.orange}>
          <p style={{ fontSize: 12, color: colors.textMuted, margin: '0 0 16px 0', lineHeight: 1.6 }}>
            Share size is capped by allocation × max position % and stop distance — signal strength cannot increase quantity beyond this ceiling.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <RiskRow label='Max Position Size %' value={maxPosPct > 0 ? `${maxPosPct}%` : '—'} />
            <RiskRow label='Stop Loss %' value={stopLossPct > 0 ? `${stopLossPct}%` : '—'} />
            <RiskRow label='Trailing Stop %' value={trailPct > 0 ? `${trailPct}%` : '—'} />
            <RiskRow label='Max Simultaneous Positions' value={String(maxPositions || '—')} />
            <RiskRow label='Mode' value={String(cfg?.mode ?? '—')} />
            <RiskRow label='Session' value={String(state?.session?.status ?? 'IDLE')} />
          </div>
          <div style={{ marginTop: 16, padding: 12, background: `${colors.orange}10`, borderRadius: layout.cardRadiusSmall, border: `1px solid ${colors.orange}25` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <AlertTriangle size={14} color={colors.orange} style={{ marginTop: 2 }} />
              <p style={{ margin: 0, fontSize: 12, color: colors.textSecondary, lineHeight: 1.5 }}>
                Edit limits in Settings. Changes apply to new autonomous tickets; existing IBKR Paper positions are unchanged.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
