import { useEffect, useMemo, useState } from 'react'
import { Zap, Eye, Activity, BarChart3 } from 'lucide-react'
import { colors, layout } from './design'
import { trpc } from '@/providers/trpc'

const ACTIVE_ORDER_STATES = new Set(['READY_FOR_CONFIRMATION', 'WORKING', 'SUBMITTING'])

function Card({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      background: colors.bgPanel,
      border: `1px solid ${accent ? accent + '40' : colors.border}`,
      borderRadius: layout.cardRadius,
      overflow: 'hidden',
    }}>
      {children}
    </div>
  )
}

function SectionHeader({ icon: Icon, title, right }: { icon: React.ElementType; title: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon size={16} color={colors.blue} strokeWidth={2} />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>{title}</h2>
      </div>
      {right}
    </div>
  )
}

function MetricRow({ label, value, highlight, muted }: { label: string; value: string; highlight?: boolean; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${colors.border}` }}>
      <span style={{ fontSize: 13, color: colors.textSecondary }}>{label}</span>
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 13,
        color: muted ? colors.textMuted : highlight ? colors.green : colors.textPrimary,
        fontWeight: highlight ? 600 : 400,
      }}>
        {value}
      </span>
    </div>
  )
}

function ReactionMetric({ label, value, color, note }: { label: string; value: string; color?: string; note?: string }) {
  return (
    <div style={{ background: colors.bgSecondary, borderRadius: layout.cardRadiusSmall, padding: '12px 14px' }}>
      <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em', margin: '0 0 4px 0' }}>{label}</p>
      <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 15, fontWeight: 500, color: color || colors.textPrimary, margin: 0, letterSpacing: '-0.01em' }}>{value}</p>
      {note ? (
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, margin: '4px 0 0' }}>{note}</p>
      ) : null}
    </div>
  )
}

function fmtPct(n: number | null, digits = 2): string {
  if (n == null || Number.isNaN(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(digits)}%`
}

function fmtNum(n: number | null, digits = 2): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

export default function ReactionTab() {
  const [symbolOverride, setSymbolOverride] = useState<string | null>(null)

  const { data: state } = trpc.autonomous.state.useQuery(undefined, { refetchInterval: 4000 })
  const { data: positions = [] } = trpc.autonomous.positions.useQuery(undefined, { refetchInterval: 4000 })
  const { data: orders = [] } = trpc.autonomous.orders.useQuery(undefined, { refetchInterval: 4000 })
  const { data: events = [] } = trpc.autonomous.stream.useQuery(undefined, { refetchInterval: 4000 })

  const candidates = useMemo(() => {
    const syms: string[] = []
    const add = (raw?: string | null) => {
      const s = String(raw || '').trim().toUpperCase()
      if (!s || syms.includes(s)) return
      syms.push(s)
    }
    for (const p of positions) add(p.symbol)
    for (const o of orders) {
      if (ACTIVE_ORDER_STATES.has(o.state)) add(o.symbol)
    }
    return syms.slice(0, 12)
  }, [positions, orders])

  const symbol = (symbolOverride && candidates.includes(symbolOverride) ? symbolOverride : candidates[0]) || ''

  useEffect(() => {
    if (symbolOverride && !candidates.includes(symbolOverride)) {
      setSymbolOverride(null)
    }
  }, [candidates, symbolOverride])

  const { data: snap, isLoading: snapLoading } = trpc.marketData.gatewaySnapshot.useQuery(
    { symbol },
    { refetchInterval: 15_000, retry: 1, enabled: Boolean(symbol) },
  )
  const { data: hist, isLoading: histLoading } = trpc.marketData.gatewayHistory.useQuery(
    { symbol, period: '1d', interval: '1m', limit: 120 },
    { refetchInterval: 60_000, retry: 1, enabled: Boolean(symbol) },
  )

  const bars = hist?.bars ?? []
  const loading = snapLoading || histLoading

  const reaction = useMemo(() => {
    if (bars.length < 2) {
      return {
        priceChangePct: null as number | null,
        velocityPctPerMin: null as number | null,
        accelPctPerMin2: null as number | null,
        volumePerMin: null as number | null,
        dollarVolPerMin: null as number | null,
        relVol: null as number | null,
        vwap: null as number | null,
        distVwapPct: null as number | null,
        hwm: null as number | null,
        ddFromHwmPct: null as number | null,
        last: null as number | null,
        open: null as number | null,
        source: hist?.source ?? null,
        barCount: bars.length,
      }
    }

    const first = bars[0]
    const last = bars[bars.length - 1]
    const prev = bars[bars.length - 2]
    const priceChangePct = first.open > 0 ? ((last.close - first.open) / first.open) * 100 : null

    const retLast = prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : null
    const prev2 = bars.length >= 3 ? bars[bars.length - 3] : null
    const retPrev = prev2 && prev2.close > 0 ? ((prev.close - prev2.close) / prev2.close) * 100 : null
    const velocityPctPerMin = retLast
    const accelPctPerMin2 = retLast != null && retPrev != null ? retLast - retPrev : null

    const window = bars.slice(-5)
    const volSum = window.reduce((s, b) => s + (b.volume || 0), 0)
    const dollarSum = window.reduce((s, b) => s + (b.volume || 0) * b.close, 0)
    const volumePerMin = volSum / window.length
    const dollarVolPerMin = dollarSum / window.length

    const allVol = bars.map((b) => b.volume || 0)
    const avgVol = allVol.reduce((a, b) => a + b, 0) / Math.max(allVol.length, 1)
    const relVol = avgVol > 0 ? volumePerMin / avgVol : null

    let cumPv = 0
    let cumV = 0
    for (const b of bars) {
      cumPv += b.close * (b.volume || 0)
      cumV += b.volume || 0
    }
    // If volume is missing (common on some Yahoo bars), use close average as proxy VWAP label only when volume exists
    const vwap = cumV > 0 ? cumPv / cumV : null
    const distVwapPct = vwap && vwap > 0 ? ((last.close - vwap) / vwap) * 100 : null

    const hwm = bars.reduce((m, b) => Math.max(m, b.high), bars[0].high)
    const ddFromHwmPct = hwm > 0 ? ((last.close - hwm) / hwm) * 100 : null

    return {
      priceChangePct,
      velocityPctPerMin,
      accelPctPerMin2,
      volumePerMin: volSum > 0 ? volumePerMin : null,
      dollarVolPerMin: dollarSum > 0 ? dollarVolPerMin : null,
      relVol: volSum > 0 ? relVol : null,
      vwap,
      distVwapPct,
      hwm,
      ddFromHwmPct,
      last: last.close,
      open: first.open,
      source: hist?.source ?? null,
      barCount: bars.length,
    }
  }, [bars, hist?.source])

  const snapOk = Boolean(snap && 'market_data_available' in snap && snap.market_data_available)
  const snapPrice = snapOk && 'price' in snap ? Number(snap.price) : null
  const snapPrev = snapOk && 'previous_close' in snap && snap.previous_close != null ? Number(snap.previous_close) : null
  const dayChangePct = snapPrice != null && snapPrev != null && snapPrev > 0
    ? ((snapPrice - snapPrev) / snapPrev) * 100
    : reaction.priceChangePct

  const symbolOrders = orders.filter((o) => o.symbol === symbol)
  const staged = symbolOrders.filter((o) => o.state === 'READY_FOR_CONFIRMATION')
  const working = symbolOrders.filter((o) => ['WORKING', 'SUBMITTING', 'CONFIRMED'].includes(o.state))
  const filled = symbolOrders.filter((o) => o.state === 'FILLED')
  const openPos = positions.filter((p) => p.symbol === symbol)

  const decisionState = staged.length > 0
    ? 'AWAITING_CONFIRM'
    : working.length > 0
      ? 'WORKING'
      : filled.length > 0 || openPos.length > 0
        ? 'IN_POSITION'
        : sessionRunning(state?.session?.status)
          ? 'MONITORING'
          : 'IDLE'

  const decisionColor =
    decisionState === 'AWAITING_CONFIRM' ? colors.orange
      : decisionState === 'WORKING' || decisionState === 'IN_POSITION' ? colors.green
        : decisionState === 'MONITORING' ? colors.blue
          : colors.textMuted

  const symbolEvents = events
    .filter((e) => !e.symbol || e.symbol === symbol)
    .filter((e) => ['OPPORTUNITY', 'STRATEGY_SELECTED', 'RISK_CHECK', 'ORDER_SUBMITTED', 'BROKER_CONFIRM', 'POSITION_MONITOR'].includes((e.phase || '').toUpperCase()))
    .slice(0, 8)

  const sessionStatus = state?.session?.status ?? 'IDLE'
  const unavailableNote = 'Not provided by current feed'

  // Honest reaction readiness: based on live price move + staged/working state — not a fake RCS.
  const move = Math.abs(dayChangePct ?? 0)
  const readiness =
    decisionState === 'AWAITING_CONFIRM' ? 'TICKET STAGED — CONFIRM IN ORDERS'
      : decisionState === 'WORKING' ? 'ORDER AT BROKER'
        : decisionState === 'IN_POSITION' ? 'POSITION OPEN'
          : move >= 1 ? 'MOVE DETECTED — MONITORING'
            : hist?.available ? 'FEED LIVE — NO STRONG MOVE'
              : 'FEED UNAVAILABLE'

  const readinessColor =
    readiness.includes('CONFIRM') ? colors.orange
      : readiness.includes('BROKER') || readiness.includes('POSITION') ? colors.green
        : readiness.includes('MOVE') ? colors.blue
          : colors.textMuted

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Zap size={16} color={colors.blue} strokeWidth={2} />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>Reaction</h2>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>
          live gateway · IBKR Paper flow
        </span>
        {candidates.length > 0 ? (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {candidates.map((s) => (
              <button
                key={s}
                type='button'
                onClick={() => setSymbolOverride(s)}
                style={{
                  padding: '4px 10px',
                  borderRadius: layout.pillRadius,
                  border: `1px solid ${s === symbol ? colors.borderPurple : colors.border}`,
                  background: s === symbol ? colors.activePurpleBg : colors.bgElevated,
                  color: s === symbol ? colors.purple : colors.textMuted,
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
        ) : (
          <span style={{ marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>
            NO ACTIVE TRADES
          </span>
        )}
      </div>

      <div style={{
        padding: '10px 14px',
        background: `${colors.chipBlue}10`,
        border: `1px solid ${colors.chipBlue}35`,
        borderRadius: layout.cardRadiusSmall,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        color: colors.textSecondary,
      }}>
        {!symbol
          ? 'No live executions — tickers appear when there is an open position or working order.'
          : (
            <>
              {symbol} · session {sessionStatus} · decision <span style={{ color: decisionColor, fontWeight: 600 }}>{decisionState}</span>
              {' · '}
              bars {reaction.barCount}
              {reaction.source ? ` via ${reaction.source}` : ''}
              {loading ? ' · loading…' : ''}
            </>
          )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <Card>
          <div style={{ padding: 20, borderBottom: `1px solid ${colors.border}` }}>
            <SectionHeader icon={Eye} title='Live context' />
          </div>
          <div style={{ padding: 20 }}>
            <MetricRow label='Symbol' value={symbol} highlight />
            <MetricRow
              label='Last / snapshot'
              value={snapPrice != null ? `$${fmtNum(snapPrice)}` : reaction.last != null ? `$${fmtNum(reaction.last)}` : '—'}
              highlight={snapPrice != null || reaction.last != null}
            />
            <MetricRow label='Session open (bars)' value={reaction.open != null ? `$${fmtNum(reaction.open)}` : '—'} />
            <MetricRow label='Day / session change' value={fmtPct(dayChangePct)} highlight={dayChangePct != null && dayChangePct !== 0} />
            <MetricRow label='Prev close' value={snapPrev != null ? `$${fmtNum(snapPrev)}` : '—'} muted={snapPrev == null} />
            <MetricRow label='Data source' value={snapOk && 'source_name' in snap ? String(snap.source_name) : (reaction.source ?? '—')} />
            <MetricRow label='Staged tickets' value={String(staged.length)} highlight={staged.length > 0} />
            <MetricRow label='Working / filled' value={`${working.length} / ${filled.length}`} />
            <MetricRow label='Open positions' value={String(openPos.length)} highlight={openPos.length > 0} />
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, margin: '12px 0 0 0', fontStyle: 'italic' }}>
              Beat probability / RPERS / FIS require earnings research feeds — shown as unavailable until wired (not invented).
            </p>
          </div>
        </Card>

        <Card accent={colors.blue}>
          <div style={{ padding: 20, borderBottom: `1px solid ${colors.border}` }}>
            <SectionHeader icon={BarChart3} title='Research / FIS (honest)' />
          </div>
          <div style={{ padding: 20 }}>
            <MetricRow label='EPS Surprise' value='—' muted />
            <MetricRow label='Revenue Surprise' value='—' muted />
            <MetricRow label='Guidance Surprise' value='—' muted />
            <MetricRow label='KPI Surprise' value='—' muted />
            <MetricRow label='RPERS' value='—' muted />
            <MetricRow label='Beat Probability' value='—' muted />
            <div style={{ marginTop: 16, padding: 16, background: `${colors.blue}12`, borderRadius: layout.cardRadiusSmall, border: `1px solid ${colors.blue}25` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.textSecondary }}>FIS TOTAL</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 28, fontWeight: 600, color: colors.textMuted }}>—</span>
              </div>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textMuted, margin: '4px 0 0 0' }}>
                Status: <span style={{ color: colors.orange, fontWeight: 600 }}>UNAVAILABLE</span> · no fabricated surplus score
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card accent={colors.green}>
        <div style={{ padding: 20, borderBottom: `1px solid ${colors.border}` }}>
          <SectionHeader icon={Activity} title='Real-time reaction (from live bars)' />
        </div>
        <div style={{ padding: 20 }}>
          {!hist?.available && !loading && (
            <p style={{ margin: '0 0 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.textMuted }}>
              No verified 1m bars for {symbol}. Metrics stay empty rather than inventing reaction data.
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <ReactionMetric label='Price Change' value={fmtPct(reaction.priceChangePct)} color={signedColor(reaction.priceChangePct)} />
            <ReactionMetric label='Price Velocity' value={reaction.velocityPctPerMin != null ? `${fmtPct(reaction.velocityPctPerMin)}/min` : '—'} color={signedColor(reaction.velocityPctPerMin)} />
            <ReactionMetric label='Price Acceleration' value={reaction.accelPctPerMin2 != null ? `${fmtPct(reaction.accelPctPerMin2)}/min²` : '—'} color={colors.orange} />
            <ReactionMetric label='Volume / min' value={reaction.volumePerMin != null ? fmtNum(reaction.volumePerMin, 0) : '—'} note={reaction.volumePerMin == null ? 'Volume often 0 on delayed feed' : undefined} />
            <ReactionMetric label='$ Volume / min' value={reaction.dollarVolPerMin != null ? `$${fmtNum(reaction.dollarVolPerMin, 0)}` : '—'} />
            <ReactionMetric label='Rel. Vol' value={reaction.relVol != null ? `${reaction.relVol.toFixed(2)}x` : '—'} />
            <ReactionMetric label='Event VWAP' value={reaction.vwap != null ? `$${fmtNum(reaction.vwap)}` : '—'} note={reaction.vwap == null ? 'Needs volume' : undefined} />
            <ReactionMetric label='Dist from VWAP' value={fmtPct(reaction.distVwapPct)} color={signedColor(reaction.distVwapPct)} />
            <ReactionMetric label='High-Water Mark' value={reaction.hwm != null ? `$${fmtNum(reaction.hwm)}` : '—'} color={colors.green} />
            <ReactionMetric label='Drawdown from HWM' value={fmtPct(reaction.ddFromHwmPct)} color={colors.orange} />
            <ReactionMetric label='Trades/sec' value='—' note={unavailableNote} color={colors.textMuted} />
            <ReactionMetric label='Buy/Sell Imbalance' value='—' note={unavailableNote} color={colors.textMuted} />
            <ReactionMetric label='Bid/Ask Imbalance' value='—' note={unavailableNote} color={colors.textMuted} />
            <ReactionMetric label='Spread' value='—' note={unavailableNote} color={colors.textMuted} />
            <ReactionMetric label='Depth Imbalance' value='—' note={unavailableNote} color={colors.textMuted} />
            <ReactionMetric label='Large Print Freq' value='—' note={unavailableNote} color={colors.textMuted} />
          </div>

          <div style={{
            marginTop: 20, padding: 20,
            background: `${readinessColor}10`,
            borderRadius: layout.cardRadius,
            border: `1px solid ${readinessColor}30`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <div>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, margin: '0 0 6px 0', textTransform: 'uppercase' }}>
                Reaction status (no fake RCS)
              </p>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 600, color: readinessColor, margin: 0 }}>
                {readiness}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, margin: '0 0 6px 0', textTransform: 'uppercase' }}>Decision</p>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 16, fontWeight: 600, color: decisionColor, margin: 0 }}>{decisionState}</p>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ padding: 20, borderBottom: `1px solid ${colors.border}` }}>
          <SectionHeader icon={Zap} title={`${symbol} engine events`} right={
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>{symbolEvents.length} recent</span>
          } />
        </div>
        <div style={{ padding: 8 }}>
          {symbolEvents.length === 0 ? (
            <p style={{ padding: 16, margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.textMuted }}>
              No opportunity / risk / order events for {symbol} yet. With ENGINE RUNNING, reactions stream here.
            </p>
          ) : (
            symbolEvents.map((ev) => (
              <div key={ev.id} style={{ padding: '12px 14px', borderBottom: `1px solid ${colors.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600, color: colors.textPrimary }}>
                    {(ev.phase || '').replace(/_/g, ' ')}
                  </span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>
                    {ago(ev.createdAt)}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: colors.textSecondary }}>{ev.message}</p>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  )
}

function sessionRunning(status?: string | null) {
  return status === 'RUNNING'
}

function signedColor(n: number | null) {
  if (n == null) return colors.textMuted
  if (n > 0) return colors.green
  if (n < 0) return colors.red
  return colors.textSecondary
}

function ago(iso: Date | string | null | undefined): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  return `${Math.floor(ms / 3_600_000)}h ago`
}
