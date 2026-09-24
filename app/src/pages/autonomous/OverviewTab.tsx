import { useState } from 'react'
import {
  Activity, Radio, TrendingUp, Shield, Zap, Clock, ChevronDown,
  Search, Filter, ArrowUpRight, ArrowDownRight
} from 'lucide-react'
import { colors, layout } from './design'
import { engineConfig, activeEvents, winsPerOrder, riskConfig } from './autonomous.config'
import { trpc } from '@/providers/trpc'
import TradingChart from './charts/TradingChart'
import { generateCandleData } from './charts/chartData'

function useOverviewData() {
  const { data: overview } = trpc.autonomous.getOverviewStats.useQuery(undefined, { retry: false });
  return { overview };
}

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
  const isPositive = delta && delta.startsWith('+');
  const isNegative = delta && delta.startsWith('-');
  const deltaColor = isPositive ? colors.green : isNegative ? colors.red : colors.textMuted;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '12px 16px', background: colors.bgElevated,
      borderRadius: layout.cardRadiusSmall, minWidth: 140,
    }}>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 20, fontWeight: 600, color: color || colors.textPrimary, letterSpacing: '-0.02em' }}>{value}</span>
      {delta && (
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: deltaColor, fontWeight: 500 }}>
          {isPositive ? <ArrowUpRight size={10} style={{ display: 'inline', marginRight: 2 }} /> : null}
          {isNegative ? <ArrowDownRight size={10} style={{ display: 'inline', marginRight: 2 }} /> : null}
          {delta}
        </span>
      )}
    </div>
  )
}

function TimeRangePill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: layout.pillRadius,
      background: active ? colors.activePurpleBg : 'transparent',
      border: `1px solid ${active ? colors.borderPurple : colors.border}`,
      color: active ? colors.purple : colors.textMuted,
      fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600,
      cursor: 'pointer', transition: 'all 150ms ease',
    }}>
      {label}
    </button>
  )
}

function RiskBadge({ level }: { level: 'High' | 'Medium' | 'Low' }) {
  const colorMap = { High: colors.red, Medium: colors.orange, Low: colors.green };
  const bgMap = { High: `${colors.red}15`, Medium: `${colors.orange}15`, Low: `${colors.green}15` };
  return (
    <span style={{
      fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 600,
      color: colorMap[level], padding: '3px 10px',
      background: bgMap[level], borderRadius: 20,
      border: `1px solid ${colorMap[level]}25`,
    }}>{level}</span>
  )
}

function StatusDot({ color }: { color: string }) {
  return <div style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />;
}

function AllocationGauge({ deployed, cash, hedged }: { deployed: number; cash: number; hedged: number }) {
  const size = 140;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const total = deployed + cash + hedged;
  const deployedPct = (deployed / total) * 100;
  const cashPct = (cash / total) * 100;
  const hedgedPct = (hedged / total) * 100;
  const circumference = 2 * Math.PI * r;
  const getDash = (pct: number) => (pct / 100) * circumference;
  const d1 = getDash(deployedPct);
  const d2 = getDash(cashPct);
  const d3 = getDash(hedgedPct);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill='none' stroke='rgba(255,255,255,0.04)' strokeWidth={stroke} />
        <circle cx={cx} cy={cy} r={r} fill='none' stroke={colors.purple} strokeWidth={stroke}
          strokeDasharray={`${d1} ${circumference}`} strokeDashoffset={0}
          strokeLinecap='round' transform={`rotate(-90 ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={r} fill='none' stroke={colors.blue} strokeWidth={stroke}
          strokeDasharray={`${d2} ${circumference}`} strokeDashoffset={-d1}
          strokeLinecap='round' transform={`rotate(-90 ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={r} fill='none' stroke={colors.green} strokeWidth={stroke}
          strokeDasharray={`${d3} ${circumference}`} strokeDashoffset={-(d1 + d2)}
          strokeLinecap='round' transform={`rotate(-90 ${cx} ${cy})`} />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusDot color={colors.purple} />
          <span style={{ fontSize: 12, color: colors.textSecondary }}>Deployed</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginLeft: 'auto' }}>{deployedPct.toFixed(1)}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusDot color={colors.blue} />
          <span style={{ fontSize: 12, color: colors.textSecondary }}>Cash Reserve</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginLeft: 'auto' }}>{cashPct.toFixed(1)}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusDot color={colors.green} />
          <span style={{ fontSize: 12, color: colors.textSecondary }}>Hedged</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600, color: colors.textPrimary, marginLeft: 'auto' }}>{hedgedPct.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

function FeedItem({ icon: Icon, iconColor, title, detail, time, highlight }: {
  icon: React.ElementType; iconColor: string;
  title: string; detail: string; time: string; highlight?: boolean;
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
  );
}

export default function OverviewTab() {
  const { overview } = useOverviewData()
  const [timeRange, setTimeRange] = useState<'1D' | '1W' | '1M' | 'YTD'>('1D')
  const [showAllActions, setShowAllActions] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [riskFilter, setRiskFilter] = useState<'all' | 'High' | 'Medium' | 'Low'>('all')

  const engine = overview?.engine ?? null
  const equity = engineConfig.equity
  const nav = `$${equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
  const navDelta = `+${engineConfig.dailyReturnPct}%`
  const candleData = generateCandleData(120)
  const buyMarkers = [
    { time: candleData[30].time, position: 'belowBar' as const, color: colors.green, shape: 'arrowUp' as const, text: 'BUY' },
    { time: candleData[55].time, position: 'belowBar' as const, color: colors.green, shape: 'arrowUp' as const, text: 'BUY' },
    { time: candleData[85].time, position: 'aboveBar' as const, color: colors.red, shape: 'arrowDown' as const, text: 'SELL' },
  ]

  const holdings = [
    { ticker: 'SNOW', strategy: 'Post-Earnings Momentum', qty: 80, entry: 184.50, current: 192.15, exposure: 15372, pnl: '+4.2%', risk: 'Medium' as const, status: 'OPEN' },
    { ticker: 'NVDA', strategy: 'Gap Continuation', qty: 45, entry: 124.30, current: 127.80, exposure: 5751, pnl: '+2.8%', risk: 'High' as const, status: 'OPEN' },
    { ticker: 'TSLA', strategy: 'Fade the Move', qty: 120, entry: 248.20, current: 245.10, exposure: 29412, pnl: '-1.2%', risk: 'Low' as const, status: 'OPEN' },
    { ticker: 'AAPL', strategy: 'Post-Earnings Momentum', qty: 200, entry: 189.40, current: 191.25, exposure: 38250, pnl: '+1.0%', risk: 'Low' as const, status: 'CLOSED' },
    { ticker: 'META', strategy: 'Contrarian Reversal', qty: 60, entry: 512.80, current: 518.40, exposure: 31104, pnl: '+1.1%', risk: 'Medium' as const, status: 'CLOSED' },
  ]

  const filteredHoldings = holdings.filter(h => {
    if (riskFilter !== 'all' && h.risk !== riskFilter) return false;
    if (searchQuery && !h.ticker.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  })

  const feedActions = [
    { icon: Zap, iconColor: colors.purple, title: 'Strategy Selected', detail: 'Post-Earnings Momentum for SNOW', time: '2m ago', highlight: true },
    { icon: TrendingUp, iconColor: colors.green, title: 'Order Filled', detail: 'Bought 80 SNOW @ $184.50', time: '5m ago' },
    { icon: Shield, iconColor: colors.orange, title: 'Dynamic Stop Adjusted', detail: 'SNOW trail tightened to $183.10', time: '8m ago' },
    { icon: Activity, iconColor: colors.blue, title: 'Risk Check Passed', detail: 'Event exposure within limits', time: '12m ago' },
    { icon: Radio, iconColor: colors.purple, title: 'New Earnings Event', detail: 'ZS detected at 16:30 ET', time: '15m ago' },
    { icon: TrendingUp, iconColor: colors.green, title: 'Position Exited', detail: 'Sold 200 AAPL @ $191.25 (+$370)', time: '32m ago' },
    { icon: Shield, iconColor: colors.red, title: 'Risk Warning', detail: 'Sector exposure at 22% (limit 25%)', time: '45m ago' },
    { icon: Zap, iconColor: colors.purple, title: 'APMA Tightened', detail: 'NVDA stop moved to breakeven', time: '1h ago' },
  ]
  const displayedActions = showAllActions ? feedActions : feedActions.slice(0, 5)
  const openPositions = holdings.filter(h => h.status === 'OPEN').length
  const totalExposure = holdings.filter(h => h.status === 'OPEN').reduce((s, h) => s + h.exposure, 0)
  const unhedgedRisk = totalExposure * 0.15

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* HEADER: Quick Metrics + Time Range */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <MetricPill label='Total NAV' value={nav} delta={navDelta} color={colors.textPrimary} />
        <MetricPill label='Active Positions' value={openPositions.toString()} />
        <MetricPill label='Open Orders' value={overview?.openOrderCount?.toString() ?? '3'} />
        <MetricPill label='Unhedged Risk' value={`$${unhedgedRisk.toLocaleString()}`} delta='-2.1%' />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: colors.bgElevated, borderRadius: layout.pillRadius, padding: 4, border: `1px solid ${colors.border}` }}>
          {(['1D', '1W', '1M', 'YTD'] as const).map(r => (
            <TimeRangePill key={r} label={r} active={timeRange === r} onClick={() => setTimeRange(r)} />
          ))}
        </div>
      </div>

      {/* MAIN GRID: Chart + Right Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Interactive Chart */}
          <Card noPadding>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Activity size={16} color={colors.purple} strokeWidth={2} />
                <h3 style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>Live Execution</h3>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, padding: '2px 8px', background: colors.bgElevated, borderRadius: 4 }}>PAPER MODE</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.green }}>● LIVE</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>{timeRange}</span>
              </div>
            </div>
            <div style={{ padding: 12 }}>
              <TradingChart data={candleData} height={280} markers={buyMarkers} showVolume={true} showVwap={true} />
            </div>
          </Card>

          {/* Asset Allocation + Metrics */}
          <Card>
            <SectionHeader icon={Shield} title='Asset Allocation' right={
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>Total Assets</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 20, fontWeight: 600, color: colors.textPrimary, letterSpacing: '-0.02em' }}>284,750.50</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.green, fontWeight: 500, padding: '2px 8px', background: `${colors.green}12`, borderRadius: 12 }}>+0.44%</span>
              </div>
            } />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'center' }}>
              <AllocationGauge deployed={39.5} cash={51.4} hedged={9.1} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: colors.textSecondary }}>Active Exposure</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 600, color: colors.purple }}>$112,535</span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 2 }}>
                  <div style={{ width: '39.5%', height: '100%', background: colors.purple, borderRadius: 2 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: colors.textSecondary }}>Drawdown Risk</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 600, color: colors.red }}>-$2,850</span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 2 }}>
                  <div style={{ width: '12%', height: '100%', background: colors.red, borderRadius: 2 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: colors.textSecondary }}>Cash Reserve</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 600, color: colors.blue }}>$146,428</span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 2 }}>
                  <div style={{ width: '51.4%', height: '100%', background: colors.blue, borderRadius: 2 }} />
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          {/* Active Agents */}
          <Card>
            <SectionHeader icon={Zap} title='Active Agents' right={
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.purple, fontWeight: 600 }}>3 SWARMS</span>
            } />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {['Post-Earnings Momentum', 'Gap Continuation', 'APMA Monitor'].map((agent, i) => (
                <div key={agent} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: colors.bgElevated, borderRadius: layout.cardRadiusSmall }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${colors.purple}30, ${colors.violet}40)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Zap size={14} color={colors.purple} strokeWidth={2.5} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 500, color: colors.textSecondary, margin: '0 0 2px 0' }}>{agent}</p>
                    <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, margin: 0 }}>{['SNOW', 'NVDA', 'ALL'][i]} • {['LIVE', 'LIVE', 'ACTIVE'][i]}</p>
                  </div>
                  <StatusDot color={colors.green} />
                </div>
              ))}
            </div>
          </Card>

          {/* Last Actions Feed */}
          <Card>
            <SectionHeader icon={Clock} title='Last Actions' right={
              <button onClick={() => setShowAllActions(!showAllActions)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: colors.textMuted, fontSize: 11 }}>
                <ChevronDown size={14} />
                {showAllActions ? 'Collapse' : 'Show all'}
              </button>
            } />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {displayedActions.map((action, i) => (
                <FeedItem key={i} {...action} />
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* BOTTOM: Holdings & Risk Table */}
      <Card noPadding>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Shield size={16} color={colors.purple} strokeWidth={2} />
            <h3 style={{ fontSize: 15, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>Active Holdings & Risk</h3>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, padding: '2px 8px', background: colors.bgElevated, borderRadius: 4 }}>{filteredHoldings.length} POSITIONS</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: colors.bgElevated, borderRadius: layout.cardRadiusControl, border: `1px solid ${colors.border}` }}>
              <Search size={14} color={colors.textMuted} />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder='Filter ticker...'
                style={{ background: 'transparent', border: 'none', color: colors.textSecondary, fontSize: 12, outline: 'none', width: 120, fontFamily: 'inherit' }}
              />
            </div>
            <button onClick={() => setRiskFilter(riskFilter === 'all' ? 'High' : riskFilter === 'High' ? 'Medium' : riskFilter === 'Medium' ? 'Low' : 'all')} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: colors.bgElevated, border: `1px solid ${riskFilter !== 'all' ? colors.borderPurple : colors.border}`, borderRadius: layout.cardRadiusControl, color: colors.textMuted, fontSize: 12, cursor: 'pointer' }}>
              <Filter size={14} />
              {riskFilter === 'all' ? 'All Risk' : `${riskFilter} Risk`}
            </button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Ticker', 'Strategy', 'Qty', 'Entry', 'Current', 'Exposure', 'P&L', 'Risk', 'Status'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500, borderBottom: `1px solid ${colors.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredHoldings.map((h, i) => {
                const pnlPositive = h.pnl.startsWith('+');
                const pnlNegative = h.pnl.startsWith('-');
                return (
                  <tr key={i} style={{ transition: 'background 150ms ease' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '14px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 600, color: colors.textPrimary, borderBottom: `1px solid ${colors.border}` }}>{h.ticker}</td>
                    <td style={{ padding: '14px 16px', fontSize: 12, color: colors.textSecondary, borderBottom: `1px solid ${colors.border}` }}>{h.strategy}</td>
                    <td style={{ padding: '14px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: colors.textPrimary, borderBottom: `1px solid ${colors.border}` }}>{h.qty}</td>
                    <td style={{ padding: '14px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: colors.textSecondary, borderBottom: `1px solid ${colors.border}` }}>${h.entry.toFixed(2)}</td>
                    <td style={{ padding: '14px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: colors.textPrimary, borderBottom: `1px solid ${colors.border}` }}>${h.current.toFixed(2)}</td>
                    <td style={{ padding: '14px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: colors.textPrimary, borderBottom: `1px solid ${colors.border}` }}>${h.exposure.toLocaleString()}</td>
                    <td style={{ padding: '14px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 600, color: pnlPositive ? colors.green : pnlNegative ? colors.red : colors.textSecondary, borderBottom: `1px solid ${colors.border}` }}>
                      {pnlPositive ? <ArrowUpRight size={12} style={{ display: 'inline', marginRight: 2 }} /> : null}
                      {pnlNegative ? <ArrowDownRight size={12} style={{ display: 'inline', marginRight: 2 }} /> : null}
                      {h.pnl}
                    </td>
                    <td style={{ padding: '14px 16px', borderBottom: `1px solid ${colors.border}` }}>
                      <RiskBadge level={h.risk} />
                    </td>
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

      {/* Active Events (Bottom) */}
      <div>
        <SectionHeader icon={Radio} title='Active Earnings Events' right={
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>{activeEvents.length} EVENTS</span>
        } />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
          {activeEvents.slice(0, 3).map((evt) => {
            const isGood = evt.fis && evt.fis >= 2.0 && evt.rcs && evt.rcs >= 0.5
            return (
              <div key={evt.ticker} style={{
                background: colors.bgPanel, border: `1px solid ${isGood ? colors.borderPurple : colors.border}`,
                borderRadius: layout.cardRadius, padding: 16,
                transition: 'border-color 200ms ease',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h4 style={{ fontSize: 16, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>{evt.ticker}</h4>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, padding: '2px 8px', background: colors.bgElevated, borderRadius: 4 }}>{evt.earningsTime}</span>
                  </div>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: evt.decisionState === 'ORDER_READY' ? colors.green : evt.decisionState === 'NO_ACTION' ? colors.red : colors.orange, fontWeight: 600, padding: '3px 10px', background: `${evt.decisionState === 'ORDER_READY' ? colors.green : evt.decisionState === 'NO_ACTION' ? colors.red : colors.orange}12`, borderRadius: 6 }}>
                    {evt.decisionState}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px 12px', fontFamily: 'JetBrains Mono, monospace' }}>
                  <div><span style={{ fontSize: 9, color: colors.textMuted }}>RPERS</span><p style={{ fontSize: 13, color: evt.rpers >= 80 ? colors.purple : evt.rpers >= 60 ? colors.orange : colors.red, fontWeight: 500, margin: '2px 0 0 0' }}>{evt.rpers}</p></div>
                  <div><span style={{ fontSize: 9, color: colors.textMuted }}>FIS</span><p style={{ fontSize: 13, color: evt.fis && evt.fis >= 2.0 ? colors.purple : colors.orange, fontWeight: 500, margin: '2px 0 0 0' }}>{evt.fis !== null ? evt.fis.toFixed(1) : '—'}</p></div>
                  <div><span style={{ fontSize: 9, color: colors.textMuted }}>RCS</span><p style={{ fontSize: 13, color: evt.rcs && evt.rcs >= 0.5 ? colors.purple : colors.red, fontWeight: 500, margin: '2px 0 0 0' }}>{evt.rcs !== null ? evt.rcs.toFixed(2) : '—'}</p></div>
                  <div><span style={{ fontSize: 9, color: colors.textMuted }}>REACTION</span><p style={{ fontSize: 13, color: evt.priceReaction.startsWith('+') ? colors.green : colors.red, fontWeight: 500, margin: '2px 0 0 0' }}>{evt.priceReaction}</p></div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
