import { useEffect, useMemo, useState } from 'react'
import {
  Activity, Radio, TrendingUp, Shield, Zap, Clock, ChevronDown,
  Search, Filter, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import { colors, layout } from './design'
import { trpc } from '@/providers/trpc'
import TradingChart from './charts/TradingChart'

/** In-flight order states that count as live execution (not completed FILLED). */
const ACTIVE_ORDER_STATES = new Set(['READY_FOR_CONFIRMATION', 'WORKING', 'SUBMITTING'])

function Card({ children, style, noPadding = false }: { children: React.ReactNode; style?: React.CSSProperties; noPadding?: boolean }) {
  return (
    <div style={{
      background: colors.bgPanel,
      border: `1px solid ${colors.border}`,
      borderRadius: layout.cardRadius,
      overflow: 'hidden',
      ...style,
    }}>
      {!noPadding ? <div style={{ padding: 20 }}>{children}</div> : children}
    </div>
  )
}

function SectionHeader({ icon: Icon, title, right }: { icon: React.ElementType; title: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon size={16} color={colors.purple} strokeWidth={2} />
        <h3 style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>{title}</h3>
      </div>
      {right}
    </div>
  )
}

function MetricPill({ label, value, delta, color }: { label: string; value: string; delta?: string; color?: string }) {
  const isPositive = delta?.startsWith('+')
  const isNegative = delta?.startsWith('-')
  const deltaColor = isPositive ? colors.green : isNegative ? colors.red : colors.textMuted
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '12px 16px', background: colors.bgElevated,
      borderRadius: layout.cardRadiusSmall, minWidth: 140,
    }}>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 20, fontWeight: 600, color: color || colors.textPrimary, letterSpacing: '-0.02em' }}>{value}</span>
      {delta ? (
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: deltaColor, fontWeight: 500 }}>
          {isPositive ? <ArrowUpRight size={10} style={{ display: 'inline', marginRight: 2 }} /> : null}
          {isNegative ? <ArrowDownRight size={10} style={{ display: 'inline', marginRight: 2 }} /> : null}
          {delta}
        </span>
      ) : null}
    </div>
  )
}

function StatusDot({ color }: { color: string }) {
  return <div style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
}

function RiskBadge({ level }: { level: 'High' | 'Medium' | 'Low' | '—' }) {
  if (level === '—') {
    return <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>—</span>
  }
  const colorMap = { High: colors.red, Medium: colors.orange, Low: colors.green }
  const bgMap = { High: `${colors.red}15`, Medium: `${colors.orange}15`, Low: `${colors.green}15` }
  return (
    <span style={{
      fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 600,
      color: colorMap[level], padding: '3px 10px',
      background: bgMap[level], borderRadius: 20,
      border: `1px solid ${colorMap[level]}25`,
    }}>{level}</span>
  )
}

function AllocationGauge({ deployed, cash }: { deployed: number; cash: number }) {
  const size = 140
  const stroke = 14
  const r = (size - stroke) / 2
  const cx = size / 2
  const cy = size / 2
  const total = Math.max(deployed + cash, 1)
  const deployedPct = (deployed / total) * 100
  const cashPct = (cash / total) * 100
  const circumference = 2 * Math.PI * r
  const d1 = (deployedPct / 100) * circumference
  const d2 = (cashPct / 100) * circumference

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill='none' stroke='rgba(15,23,42,0.06)' strokeWidth={stroke} />
        <circle cx={cx} cy={cy} r={r} fill='none' stroke={colors.purple} strokeWidth={stroke}
          strokeDasharray={`${d1} ${circumference}`} strokeDashoffset={0}
          strokeLinecap='round' transform={`rotate(-90 ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={r} fill='none' stroke={colors.blue} strokeWidth={stroke}
          strokeDasharray={`${d2} ${circumference}`} strokeDashoffset={-d1}
          strokeLinecap='round' transform={`rotate(-90 ${cx} ${cy})`} />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 120 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusDot color={colors.purple} />
          <span style={{ fontSize: 12, color: colors.textSecondary }}>Deployed</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginLeft: 'auto' }}>{deployedPct.toFixed(1)}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusDot color={colors.blue} />
          <span style={{ fontSize: 12, color: colors.textSecondary }}>Cash / buying power</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginLeft: 'auto' }}>{cashPct.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  )
}

function FeedItem({ icon: Icon, iconColor, title, detail, time, highlight }: {
  icon: React.ElementType; iconColor: string
  title: string; detail: string; time: string; highlight?: boolean
}) {
  return (
    <div style={{
      display: 'flex', gap: 12, padding: '12px 0',
      borderBottom: `1px solid ${colors.border}`,
      opacity: highlight ? 1 : 0.85,
    }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${iconColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={14} color={iconColor} strokeWidth={2} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, color: colors.textSecondary, fontWeight: 500, margin: '0 0 2px 0', lineHeight: 1.4 }}>{title}</p>
        <p style={{ fontSize: 11, color: colors.textMuted, margin: 0 }}>{detail}</p>
      </div>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, flexShrink: 0, whiteSpace: 'nowrap' }}>{time}</span>
    </div>
  )
}

function money(n: number, digits = 0) {
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function ago(iso: Date | string | null | undefined): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

function phaseIcon(phase: string, kind?: string | null) {
  const p = (phase || '').toUpperCase()
  const k = (kind || '').toLowerCase()
  if (p.includes('ERROR') || k === 'error') return { icon: Shield, color: colors.red }
  if (p.includes('RISK')) return { icon: Shield, color: colors.orange }
  if (p.includes('ORDER') || p.includes('BROKER') || p.includes('FILL')) return { icon: TrendingUp, color: colors.green }
  if (p.includes('STRATEGY') || p.includes('OPPORTUNITY')) return { icon: Zap, color: colors.purple }
  if (p.includes('SCAN') || p.includes('MARKET')) return { icon: Radio, color: colors.blue }
  if (p.includes('LIFE')) return { icon: Activity, color: colors.green }
  return { icon: Clock, color: colors.textMuted }
}

function riskFromStop(entry: number, stop: number | null): 'High' | 'Medium' | 'Low' | '—' {
  if (!(entry > 0) || stop == null || !(stop > 0)) return '—'
  const pct = Math.abs(entry - stop) / entry
  if (pct >= 0.04) return 'High'
  if (pct >= 0.02) return 'Medium'
  return 'Low'
}

export default function OverviewTab() {
  const [showAllActions, setShowAllActions] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [riskFilter, setRiskFilter] = useState<'all' | 'High' | 'Medium' | 'Low'>('all')
  const [chartSymbolOverride, setChartSymbolOverride] = useState<string | null>(null)

  const { data: state } = trpc.autonomous.state.useQuery(undefined, { refetchInterval: 4000 })
  const { data: ibkr } = trpc.trading.ibkrStatus.useQuery(undefined, { refetchInterval: 10000 })
  const { data: positions = [], isLoading: posLoading } = trpc.autonomous.positions.useQuery(undefined, { refetchInterval: 4000 })
  const { data: orders = [], isLoading: ordLoading } = trpc.autonomous.orders.useQuery(undefined, { refetchInterval: 4000 })
  const { data: events = [] } = trpc.autonomous.stream.useQuery(undefined, { refetchInterval: 4000 })
  const { data: brokerPos } = trpc.execution.positions.useQuery(
    { broker: 'IBKR' },
    { refetchInterval: 12_000, retry: 1 },
  )
  const { data: scan } = trpc.autonomous.scanPicks.useQuery(undefined, {
    refetchInterval: 20_000,
    retry: 1,
  })

  // Live execution chips: only symbols with an open position or in-flight order.
  // No hardcoded fallbacks (e.g. SPY) — empty when nothing is actively trading.
  const chartCandidates = useMemo(() => {
    const syms: string[] = []
    const add = (raw?: string | null) => {
      const s = String(raw || '').trim().toUpperCase()
      if (!s || syms.includes(s)) return
      syms.push(s)
    }
    for (const p of positions) add(p.symbol)
    for (const r of brokerPos?.positions ?? []) {
      if (Number(r.quantity) !== 0) add(String(r.symbol))
    }
    for (const o of orders) {
      if (ACTIVE_ORDER_STATES.has(o.state)) add(o.symbol)
    }
    return syms.slice(0, 12)
  }, [positions, orders, brokerPos])

  const chartSymbol = (chartSymbolOverride && chartCandidates.includes(chartSymbolOverride)
    ? chartSymbolOverride
    : chartCandidates[0]) || ''

  // Drop selection when that symbol is no longer in the active set.
  useEffect(() => {
    if (chartSymbolOverride && !chartCandidates.includes(chartSymbolOverride)) {
      setChartSymbolOverride(null)
    }
  }, [chartCandidates, chartSymbolOverride])

  const { data: history, isLoading: histLoading, isError: histError } = trpc.marketData.gatewayHistory.useQuery(
    { symbol: chartSymbol, period: '1d', interval: '1m', limit: 120 },
    { refetchInterval: 60_000, retry: 1, enabled: Boolean(chartSymbol) },
  )

  const candleData = useMemo(() => {
    const bars = history?.bars ?? []
    let cumPv = 0
    let cumV = 0
    return bars.map((b) => {
      cumPv += b.close * (b.volume || 0)
      cumV += b.volume || 0
      return {
        time: b.time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
        vwap: cumV > 0 ? cumPv / cumV : b.close,
      }
    })
  }, [history?.bars])

  const chartMarkers = useMemo(() => {
    if (candleData.length === 0) return []
    const times = candleData.map((b) => b.time)
    const nearest = (iso: Date | string | null | undefined) => {
      if (!iso) return null
      const sec = Math.floor(new Date(iso).getTime() / 1000)
      let best = times[0]
      let bestDiff = Math.abs(times[0] - sec)
      for (const t of times) {
        const d = Math.abs(t - sec)
        if (d < bestDiff) {
          best = t
          bestDiff = d
        }
      }
      // Only mark if within ~30 minutes of a bar
      return bestDiff <= 1800 ? best : null
    }
    const out: Array<{
      time: number
      position: 'aboveBar' | 'belowBar'
      color: string
      shape: 'arrowUp' | 'arrowDown'
      text: string
    }> = []
    for (const o of orders) {
      if (o.symbol !== chartSymbol) continue
      if (!['FILLED', 'WORKING', 'PARTIALLY_FILLED'].includes(o.state)) continue
      const t = nearest(o.submittedAt ?? o.createdAt)
      if (t == null) continue
      const buy = o.side === 'BUY'
      out.push({
        time: t,
        position: buy ? 'belowBar' : 'aboveBar',
        color: buy ? colors.green : colors.red,
        shape: buy ? 'arrowUp' : 'arrowDown',
        text: buy ? 'BUY' : 'SELL',
      })
    }
    return out
  }, [orders, chartSymbol, candleData])

  const equity = Number(ibkr?.equity || state?.account?.equity || 0)
  const cash = Number(ibkr?.cash || 0)
  const buyingPower = Number(ibkr?.buyingPower || 0)
  const allocated = Number(state?.metrics?.allocated || 0)
  const deployed = Number(state?.metrics?.deployed || 0)
  const todayPnl = Number(state?.metrics?.todayPnl || 0)
  const sessionStatus = state?.session?.status ?? 'IDLE'
  const mode = state?.config?.mode ?? 'PAPER'
  const accountLabel = state?.account?.label ?? ibkr?.label ?? 'IBKR Paper'
  const accountId = ibkr?.accountId ?? null

  // Open at broker ≠ strategy picks KPI (engine-selected tickets, auto path).
  const openAtBroker = orders.filter((o) =>
    ['WORKING', 'SUBMITTING', 'CONFIRMED', 'BROKER_ACK', 'PARTIALLY_FILLED'].includes(o.state),
  )
  const scanPicks = scan?.picks ?? []
  const strategyPickCount = scanPicks.length
  const workingOnlyCount = openAtBroker.filter((o) =>
    ['WORKING', 'SUBMITTING', 'BROKER_ACK', 'PARTIALLY_FILLED'].includes(o.state),
  ).length
  const filledCount = orders.filter((o) => o.state === 'FILLED').length

  const holdings = useMemo(() => {
    const localSyms = new Set(positions.map((p) => p.symbol.toUpperCase()))
    const fromLedger = positions.map((p) => {
      const entry = parseFloat(p.avgEntry)
      const mark = p.highestPrice != null ? parseFloat(p.highestPrice) : entry
      const stop = p.stopPrice != null ? parseFloat(p.stopPrice) : null
      const exp = p.quantity * entry
      const unreal = (mark - entry) * p.quantity
      const pnlPct = entry > 0 && p.quantity ? (unreal / (entry * p.quantity)) * 100 : 0
      const pnlStr = mark === entry ? '—' : `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`
      return {
        ticker: p.symbol,
        strategy: p.strategy ?? 'Autonomous',
        qty: p.quantity,
        entry,
        current: mark,
        exposure: exp,
        pnl: pnlStr,
        risk: riskFromStop(entry, stop),
        status: p.status as string,
        broker: p.broker === 'IBKR' ? 'IBKR Paper' : p.broker,
      }
    })
    const fromGateway = (brokerPos?.positions ?? [])
      .filter((r) => Number(r.quantity) !== 0 && r.symbol && !localSyms.has(String(r.symbol).toUpperCase()))
      .map((r) => {
        const entry = Number(r.averageCost) || 0
        const qty = Number(r.quantity)
        const mkt = Number(r.marketValue) || entry * qty
        const mark = qty !== 0 ? mkt / qty : entry
        const unreal = Number(r.unrealizedPnl)
        const pnlPct = entry > 0 && qty ? (unreal / (entry * Math.abs(qty))) * 100 : 0
        return {
          ticker: String(r.symbol),
          strategy: 'IBKR Paper account',
          qty,
          entry,
          current: mark,
          exposure: Math.abs(entry * qty),
          pnl: Number.isFinite(pnlPct) ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%` : '—',
          risk: 'Low' as const,
          status: 'OPEN',
          broker: 'IBKR Paper',
        }
      })
    return [...fromLedger, ...fromGateway]
  }, [positions, brokerPos])

  const openPositions = holdings.length
  const exposure = holdings.reduce((sum, h) => sum + h.exposure, 0)
  // Notional at risk to stop (when stop known); otherwise show deployed exposure honestly — never invent %.
  const stopRisk = positions.reduce((sum, p) => {
    const entry = parseFloat(p.avgEntry)
    const stop = p.stopPrice != null ? parseFloat(p.stopPrice) : null
    if (!(entry > 0) || stop == null || !(stop > 0)) return sum
    return sum + Math.abs(entry - stop) * p.quantity
  }, 0)

  const navDelta =
    equity > 0 && todayPnl !== 0
      ? `${todayPnl >= 0 ? '+' : ''}${((todayPnl / equity) * 100).toFixed(2)}%`
      : todayPnl !== 0
        ? `${todayPnl >= 0 ? '+' : ''}$${money(Math.abs(todayPnl), 2)}`
        : undefined

  const cashReserve = cash > 0 ? cash : Math.max(0, equity - exposure)
  const gaugeDeployed = exposure > 0 ? exposure : deployed
  const gaugeCash = cashReserve > 0 ? cashReserve : Math.max(buyingPower || allocated || equity - gaugeDeployed, 0)

  const filteredHoldings = holdings.filter((h) => {
    if (riskFilter !== 'all' && h.risk !== riskFilter) return false
    if (searchQuery && !h.ticker.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const feedActions = useMemo(() => {
    return (events ?? []).slice(0, 20).map((ev) => {
      const { icon, color } = phaseIcon(ev.phase, ev.kind)
      return {
        icon,
        iconColor: color,
        title: ev.phase.replace(/_/g, ' '),
        detail: ev.symbol ? `${ev.symbol} · ${ev.message}` : ev.message,
        time: ago(ev.createdAt),
        highlight: ev.kind === 'success' || ev.kind === 'trade' || ev.phase === 'ORDER_SUBMITTED',
      }
    })
  }, [events])

  const displayedActions = showAllActions ? feedActions : feedActions.slice(0, 6)

  const recentWorking = orders
    .filter((o) =>
      ['WORKING', 'SUBMITTING', 'FILLED', 'READY_FOR_CONFIRMATION'].includes(o.state) &&
      !String(o.strategy ?? '').toUpperCase().startsWith('INTELL'),
    )
    .slice(0, 6)

  const engineLive = sessionStatus === 'RUNNING'
  const ibkrLive = Boolean(ibkr?.gatewayOk && ibkr?.connectedForUser)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{
        padding: '10px 14px',
        background: `${colors.chipBlue}10`,
        border: `1px solid ${colors.chipBlue}35`,
        borderRadius: layout.cardRadiusSmall,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        color: colors.textSecondary,
      }}>
        Live IBKR Paper overview · {accountLabel}
        {accountId ? ` (${accountId})` : ''} · gateway {ibkrLive ? 'authenticated' : (ibkr?.detail ?? 'checking…')}
        {' · '}session {sessionStatus} · mode {mode}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <MetricPill
          label='IBKR Paper NAV'
          value={equity > 0 ? `$${money(equity, 0)}` : '—'}
          delta={navDelta}
          color={colors.textPrimary}
        />
        <MetricPill
          label='Cash'
          value={cash > 0 ? `$${money(cash, 0)}` : '—'}
          color={colors.blue}
        />
        <MetricPill label='Buying Power' value={buyingPower > 0 ? `$${money(buyingPower, 0)}` : '—'} />
        <MetricPill label='Active Positions' value={posLoading ? '…' : String(openPositions)} />
        <MetricPill
          label='Open Orders'
          value={ordLoading ? '…' : String(openAtBroker.length)}
          delta={
            ordLoading
              ? undefined
              : openAtBroker.length > 0
                ? `${workingOnlyCount} working at IBKR`
                : 'none at broker'
          }
          color={openAtBroker.length > 0 ? colors.orange : undefined}
        />
        <MetricPill
          label='Strategy Picks'
          value={scan ? String(strategyPickCount) : '…'}
          delta={
            scan
              ? strategyPickCount > 0
                ? `${scan.scanned} scanned`
                : 'none met criteria'
              : undefined
          }
          color={strategyPickCount > 0 ? colors.orange : undefined}
        />
        <MetricPill
          label='Stop Risk (known)'
          value={stopRisk > 0 ? `$${money(stopRisk, 0)}` : (exposure > 0 ? `$${money(exposure, 0)} notional` : '$0')}
          delta={todayPnl !== 0 ? `${todayPnl >= 0 ? '+' : '−'}$${money(Math.abs(todayPnl), 2)} today` : undefined}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 340px)', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card noPadding>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Activity size={16} color={colors.purple} strokeWidth={2} />
                <h3 style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>Live execution</h3>
                {chartSymbol ? (
                  <>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, padding: '2px 8px', background: colors.bgElevated, borderRadius: 4 }}>
                      {chartSymbol} · 1m
                    </span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: history?.available ? colors.green : colors.textMuted, padding: '2px 8px', background: colors.bgElevated, borderRadius: 4 }}>
                      {histLoading ? 'LOADING…' : history?.available ? `via ${history.source ?? 'gateway'}` : 'NO BARS'}
                    </span>
                  </>
                ) : (
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, padding: '2px 8px', background: colors.bgElevated, borderRadius: 4 }}>
                    NO ACTIVE TRADES
                  </span>
                )}
              </div>
              {chartCandidates.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {chartCandidates.map((s) => (
                    <button
                      key={s}
                      type='button'
                      onClick={() => setChartSymbolOverride(s)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: layout.pillRadius,
                        border: `1px solid ${s === chartSymbol ? colors.borderPurple : colors.border}`,
                        background: s === chartSymbol ? colors.activePurpleBg : colors.bgElevated,
                        color: s === chartSymbol ? colors.purple : colors.textMuted,
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 10,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: 12, minHeight: 280 }}>
              {chartCandidates.length === 0 && (
                <p style={{ margin: 40, textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.textMuted }}>
                  No live executions right now. Tickers appear here only when there is an open position or a working order.
                </p>
              )}
              {chartSymbol && histLoading && (
                <p style={{ margin: 40, textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.textMuted }}>
                  Fetching {chartSymbol} bars from market-data gateway…
                </p>
              )}
              {chartSymbol && !histLoading && (histError || !history?.available || candleData.length === 0) && (
                <p style={{ margin: 40, textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.textMuted }}>
                  No verified {chartSymbol} candles right now (gateway/Yahoo unavailable or market closed). Nothing invented.
                </p>
              )}
              {chartSymbol && !histLoading && candleData.length > 0 && (
                <TradingChart data={candleData} height={280} markers={chartMarkers} showVolume={true} showVwap={true} />
              )}
            </div>
          </Card>

          <Card>
            <SectionHeader
              icon={Activity}
              title='Session status'
              right={
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: engineLive ? colors.green : colors.textMuted }}>
                  ● {engineLive ? 'ENGINE RUNNING' : sessionStatus}
                </span>
              }
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Broker', value: ibkrLive ? 'IBKR PAPER · LIVE GATEWAY' : 'IBKR PAPER · CHECK GATEWAY' },
                { label: 'Allocation authorized', value: allocated > 0 ? `$${money(allocated, 0)}` : '—' },
                { label: 'Deployed (autonomous)', value: `$${money(deployed, 0)}` },
                { label: 'Buying power', value: buyingPower > 0 ? `$${money(buyingPower, 0)}` : (cash > 0 ? `$${money(cash, 0)} cash` : '—') },
                { label: 'Trades today', value: String(state?.metrics?.tradesToday ?? 0) },
                { label: 'Realized P&L', value: `$${money(Number(state?.metrics?.realizedPnl || 0), 2)}` },
              ].map((row) => (
                <div key={row.label} style={{ padding: '12px 14px', background: colors.bgElevated, borderRadius: layout.cardRadiusSmall }}>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>{row.label}</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>{row.value}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionHeader icon={Shield} title='Capital allocation (paper)' right={
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>IBKR equity</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 600, color: colors.textPrimary }}>
                  {equity > 0 ? money(equity, 2) : '—'}
                </span>
              </div>
            } />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'center' }}>
              <AllocationGauge deployed={gaugeDeployed} cash={gaugeCash} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: colors.textSecondary }}>Open exposure</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 600, color: colors.purple }}>${money(exposure, 0)}</span>
                </div>
                <div style={{ height: 4, background: 'rgba(15,23,42,0.06)', borderRadius: 2 }}>
                  <div style={{ width: `${Math.min(100, equity > 0 ? (exposure / equity) * 100 : 0)}%`, height: '100%', background: colors.purple, borderRadius: 2 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: colors.textSecondary }}>Cash reserve</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 600, color: colors.blue }}>${money(cashReserve, 0)}</span>
                </div>
                <div style={{ height: 4, background: 'rgba(15,23,42,0.06)', borderRadius: 2 }}>
                  <div style={{ width: `${Math.min(100, equity > 0 ? (cashReserve / equity) * 100 : 0)}%`, height: '100%', background: colors.blue, borderRadius: 2 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: colors.textSecondary }}>Autonomous allocation</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>${money(allocated, 0)}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <Card>
            <SectionHeader icon={Zap} title='Strategy Picks' right={
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.purple, fontWeight: 600 }}>
                {scanPicks.length} PICK{scanPicks.length === 1 ? '' : 'S'}
              </span>
            } />
            {scanPicks.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: colors.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>
                {scan?.message
                  || 'Scanning liquid universe + earnings calendar. Picks appear only when criteria are met — nothing invented.'}
              </p>
            ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {scanPicks.slice(0, 8).map((t) => (
                  <div key={`${t.sleeve}-${t.symbol}-${t.strategy}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: colors.bgElevated, borderRadius: layout.cardRadiusSmall }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `${colors.purple}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Zap size={14} color={colors.purple} strokeWidth={2.5} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 500, color: colors.textSecondary, margin: '0 0 2px 0' }}>
                        {t.symbol} · {t.strategy}
                      </p>
                      <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, margin: 0 }}>
                        {t.price.toFixed(2)}
                        {t.dailyChangePct != null ? ` · ${t.dailyChangePct >= 0 ? '+' : ''}${t.dailyChangePct.toFixed(2)}%` : ''}
                        {' · '}{t.executable ? 'EXECUTABLE' : 'EVALUATE-ONLY'}
                      </p>
                    </div>
                    <StatusDot color={t.executable ? colors.green : colors.orange} />
                  </div>
                ))}
              </div>
            )}
            {recentWorking.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${colors.border}` }}>
                <p style={{ margin: '0 0 8px', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' }}>
                  Live tickets · {workingOnlyCount} working · {filledCount} filled
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recentWorking.map((t) => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                      <span style={{ color: colors.textSecondary }}>
                        {t.side} {t.quantity} {t.symbol} · {t.strategy || 'engine'}
                      </span>
                      <span style={{ color: t.state === 'FILLED' ? colors.green : colors.orange }}>{t.state}</span>
                </div>
              ))}
            </div>
              </div>
            )}
          </Card>

          <Card>
            <SectionHeader icon={Clock} title='Last actions' right={
              <button
                type='button'
                onClick={() => setShowAllActions(!showAllActions)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: colors.textMuted, fontSize: 11 }}
              >
                <ChevronDown size={14} />
                {showAllActions ? 'Collapse' : 'Show more'}
              </button>
            } />
            {displayedActions.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: colors.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>
                No autonomous events yet. Start the engine to see live scans and tickets here.
              </p>
            ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {displayedActions.map((action, i) => (
                <FeedItem key={i} {...action} />
              ))}
            </div>
            )}
          </Card>
        </div>
      </div>

      <Card noPadding>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Shield size={16} color={colors.purple} strokeWidth={2} />
            <h3 style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>Open holdings (IBKR / autonomous)</h3>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, padding: '2px 8px', background: colors.bgElevated, borderRadius: 4 }}>
              {filteredHoldings.length} OPEN
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: colors.bgElevated, borderRadius: layout.cardRadiusControl, border: `1px solid ${colors.border}` }}>
              <Search size={14} color={colors.textMuted} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='Filter ticker...'
                style={{ background: 'transparent', border: 'none', color: colors.textSecondary, fontSize: 12, outline: 'none', width: 120, fontFamily: 'inherit' }}
              />
            </div>
            <button
              type='button'
              onClick={() => setRiskFilter(riskFilter === 'all' ? 'High' : riskFilter === 'High' ? 'Medium' : riskFilter === 'Medium' ? 'Low' : 'all')}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: colors.bgElevated, border: `1px solid ${riskFilter !== 'all' ? colors.borderPurple : colors.border}`, borderRadius: layout.cardRadiusControl, color: colors.textMuted, fontSize: 12, cursor: 'pointer' }}
            >
              <Filter size={14} />
              {riskFilter === 'all' ? 'All Risk' : `${riskFilter} Risk`}
            </button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Ticker', 'Strategy', 'Qty', 'Entry', 'Session high', 'Exposure', 'P&L vs entry', 'Risk', 'Broker', 'Status'].map((h) => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500, borderBottom: `1px solid ${colors.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {posLoading && (
                <tr>
                  <td colSpan={10} style={{ padding: 24, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.textMuted }}>Loading positions…</td>
                </tr>
              )}
              {!posLoading && filteredHoldings.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ padding: 24, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.textMuted }}>
                    No open positions yet. Confirm a staged IBKR Paper ticket under Orders — fills show here (not demo SNOW/NVDA rows).
                  </td>
                </tr>
              )}
              {filteredHoldings.map((h) => {
                const pnlPositive = h.pnl.startsWith('+')
                const pnlNegative = h.pnl.startsWith('-')
                return (
                  <tr key={`${h.ticker}-${h.entry}-${h.qty}`}>
                    <td style={{ padding: '14px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 600, color: colors.textPrimary, borderBottom: `1px solid ${colors.border}` }}>{h.ticker}</td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: colors.textSecondary, borderBottom: `1px solid ${colors.border}` }}>{h.strategy}</td>
                    <td style={{ padding: '14px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: colors.textPrimary, borderBottom: `1px solid ${colors.border}` }}>{h.qty}</td>
                    <td style={{ padding: '14px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: colors.textSecondary, borderBottom: `1px solid ${colors.border}` }}>${h.entry.toFixed(2)}</td>
                    <td style={{ padding: '14px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: colors.textPrimary, borderBottom: `1px solid ${colors.border}` }}>${h.current.toFixed(2)}</td>
                    <td style={{ padding: '14px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: colors.textPrimary, borderBottom: `1px solid ${colors.border}` }}>${money(h.exposure, 0)}</td>
                    <td style={{ padding: '14px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600, color: pnlPositive ? colors.green : pnlNegative ? colors.red : colors.textSecondary, borderBottom: `1px solid ${colors.border}` }}>
                      {h.pnl}
                    </td>
                    <td style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.border}` }}>
                      <RiskBadge level={h.risk} />
                    </td>
                    <td style={{ padding: '14px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textMuted, borderBottom: `1px solid ${colors.border}` }}>{h.broker}</td>
                    <td style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.border}` }}>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 600, color: h.status === 'OPEN' ? colors.purple : colors.textMuted, padding: '2px 8px', background: h.status === 'OPEN' ? colors.activePurpleBg : 'transparent', borderRadius: 4 }}>
                        {h.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
