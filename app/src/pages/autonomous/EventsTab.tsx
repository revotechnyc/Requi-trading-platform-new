import { useMemo, useState } from 'react'
import {
  Radio, Activity, Lock, Zap, Shield, Cpu, Clock, Filter,
  TrendingUp, AlertTriangle,
} from 'lucide-react'
import { colors, layout } from './design'
import { trpc } from '@/providers/trpc'

const PHASE_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  LIFECYCLE: { label: 'Lifecycle', icon: Activity, color: colors.green },
  MARKET_SCAN: { label: 'Market scan', icon: Radio, color: colors.blue },
  MARKET_DATA: { label: 'Market data', icon: Cpu, color: colors.purple },
  OPPORTUNITY: { label: 'Opportunity', icon: Zap, color: colors.orange },
  STRATEGY_SELECTED: { label: 'Strategy', icon: Zap, color: colors.purple },
  RISK_CHECK: { label: 'Risk check', icon: Shield, color: colors.orange },
  ORDER_SUBMITTED: { label: 'Order staged', icon: TrendingUp, color: colors.blue },
  BROKER_CONFIRM: { label: 'Broker', icon: Lock, color: colors.green },
  POSITION_OPENED: { label: 'Position', icon: TrendingUp, color: colors.green },
  POSITION_MONITOR: { label: 'Monitor', icon: Activity, color: colors.blue },
  EXIT_TRIGGERED: { label: 'Exit', icon: AlertTriangle, color: colors.orange },
  POSITION_CLOSED: { label: 'Closed', icon: TrendingUp, color: colors.green },
  ERROR: { label: 'Error', icon: AlertTriangle, color: colors.red },
}

const FILTERS = ['ALL', 'LIFECYCLE', 'MARKET_SCAN', 'OPPORTUNITY', 'RISK_CHECK', 'ORDER_SUBMITTED', 'ERROR'] as const

function ago(iso: Date | string | null | undefined): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

function kindColor(kind?: string | null) {
  switch ((kind || '').toLowerCase()) {
    case 'success':
    case 'trade':
      return colors.green
    case 'warn':
    case 'risk':
      return colors.orange
    case 'error':
      return colors.red
    default:
      return colors.textMuted
  }
}

function metaFor(phase: string) {
  const key = (phase || '').toUpperCase()
  return PHASE_META[key] ?? { label: key.replace(/_/g, ' ') || 'Event', icon: Clock, color: colors.textMuted }
}

export default function EventsTab() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL')
  const [symbolQ, setSymbolQ] = useState('')

  const { data: state } = trpc.autonomous.state.useQuery(undefined, { refetchInterval: 4000 })
  const { data: events = [], isLoading } = trpc.autonomous.stream.useQuery(undefined, { refetchInterval: 3000 })

  const sessionStatus = state?.session?.status ?? 'IDLE'
  const mode = state?.config?.mode ?? 'PAPER'

  const phaseSummary = useMemo(() => {
    const latestByPhase = new Map<string, (typeof events)[0]>()
    for (const ev of events) {
      const p = (ev.phase || '').toUpperCase()
      if (!p) continue
      if (!latestByPhase.has(p)) latestByPhase.set(p, ev)
    }
    const order = [
      'LIFECYCLE',
      'MARKET_DATA',
      'MARKET_SCAN',
      'OPPORTUNITY',
      'STRATEGY_SELECTED',
      'RISK_CHECK',
      'ORDER_SUBMITTED',
      'BROKER_CONFIRM',
      'ERROR',
    ]
    return order
      .filter((p) => latestByPhase.has(p))
      .map((p) => {
        const ev = latestByPhase.get(p)!
        const meta = metaFor(p)
        const ageMs = Date.now() - new Date(ev.createdAt).getTime()
        const live = ageMs < 15_000 && sessionStatus === 'RUNNING'
        return {
          phase: p,
          label: meta.label,
          icon: meta.icon,
          color: meta.color,
          status: live ? 'ACTIVE' : ageMs < 120_000 ? 'RECENT' : 'IDLE',
          lastAt: ev.createdAt,
          message: ev.message,
          symbol: ev.symbol,
          kind: ev.kind,
        }
      })
  }, [events, sessionStatus])

  const filtered = useMemo(() => {
    return events.filter((ev) => {
      if (filter !== 'ALL' && (ev.phase || '').toUpperCase() !== filter) return false
      if (symbolQ.trim()) {
        const q = symbolQ.trim().toUpperCase()
        const sym = (ev.symbol || '').toUpperCase()
        const msg = (ev.message || '').toUpperCase()
        if (!sym.includes(q) && !msg.includes(q)) return false
      }
      return true
    })
  }, [events, filter, symbolQ])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Radio size={16} color={colors.blue} strokeWidth={2} />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>Events</h2>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>
          live · IBKR Paper autonomous stream
        </span>
        <span style={{
          marginLeft: 'auto',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
          fontWeight: 600,
          color: sessionStatus === 'RUNNING' ? colors.green : colors.textMuted,
          padding: '4px 10px',
          background: colors.bgElevated,
          borderRadius: layout.pillRadius,
          border: `1px solid ${colors.border}`,
        }}>
          {mode} · {sessionStatus}
        </span>
      </div>

      {/* Live phase cards derived from real events — not demo S1–S6 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {phaseSummary.length === 0 && !isLoading && (
          <div style={{
            gridColumn: '1 / -1',
            padding: 20,
            background: colors.bgPanel,
            border: `1px solid ${colors.border}`,
            borderRadius: layout.cardRadius,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 12,
            color: colors.textMuted,
          }}>
            No autonomous events yet. Start the engine — scans, opportunities, and staged tickets appear here live.
          </div>
        )}
        {phaseSummary.map((stage) => {
          const Icon = stage.icon
          const isActive = stage.status === 'ACTIVE'
          return (
            <div
              key={stage.phase}
              style={{
                background: colors.bgPanel,
                border: `1px solid ${isActive ? colors.borderPurple : colors.border}`,
                borderRadius: layout.cardRadius,
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: `${stage.color}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={16} color={stage.color} />
                  </div>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>{stage.label}</h3>
                </div>
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 600,
                  color: isActive ? colors.green : stage.status === 'RECENT' ? colors.blue : colors.textMuted,
                  padding: '3px 8px',
                  background: `${isActive ? colors.green : stage.status === 'RECENT' ? colors.blue : colors.textMuted}15`,
                  borderRadius: 6,
                }}>
                  {stage.status}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>LAST</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textSecondary }}>{ago(stage.lastAt)}</span>
                </div>
                {stage.symbol && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>SYMBOL</span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textPrimary }}>{stage.symbol}</span>
                  </div>
                )}
                <p style={{
                  margin: '6px 0 0',
                  fontSize: 11,
                  color: colors.textMuted,
                  lineHeight: 1.4,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {stage.message}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Filter size={14} color={colors.textMuted} />
        {FILTERS.map((f) => (
          <button
            key={f}
            type='button'
            onClick={() => setFilter(f)}
            style={{
              padding: '5px 12px',
              background: filter === f ? `${colors.blue}15` : colors.bgSecondary,
              border: `1px solid ${filter === f ? `${colors.blue}40` : colors.border}`,
              borderRadius: layout.cardRadiusSmall,
              color: filter === f ? colors.blue : colors.textSecondary,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {f.replace(/_/g, ' ')}
          </button>
        ))}
        <input
          value={symbolQ}
          onChange={(e) => setSymbolQ(e.target.value)}
          placeholder='Filter symbol / text…'
          style={{
            marginLeft: 'auto',
            padding: '6px 12px',
            background: colors.bgElevated,
            border: `1px solid ${colors.border}`,
            borderRadius: layout.cardRadiusControl,
            color: colors.textSecondary,
            fontSize: 12,
            fontFamily: 'JetBrains Mono, monospace',
            outline: 'none',
            minWidth: 160,
          }}
        />
      </div>

      {/* Live event log */}
      <div style={{
        background: colors.bgPanel,
        border: `1px solid ${colors.border}`,
        borderRadius: layout.cardRadius,
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <Clock size={14} color={colors.purple} />
          <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>Live run stream</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>
            {isLoading ? 'loading…' : `${filtered.length} events`}
          </span>
        </div>

        {isLoading && (
          <p style={{ padding: 24, margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.textMuted }}>
            Loading events…
          </p>
        )}

        {!isLoading && filtered.length === 0 && (
          <p style={{ padding: 24, margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.textMuted }}>
            No events match this filter. With ENGINE RUNNING, new IBKR Paper scans and tickets stream here.
          </p>
        )}

        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          {filtered.map((ev) => {
            const meta = metaFor(ev.phase)
            const Icon = meta.icon
            return (
              <div
                key={ev.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '12px 16px',
                  borderBottom: `1px solid ${colors.border}`,
                  alignItems: 'flex-start',
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: `${meta.color}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon size={14} color={meta.color} strokeWidth={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600, color: colors.textPrimary }}>
                      {(ev.phase || '').replace(/_/g, ' ')}
                    </span>
                    {ev.symbol && (
                      <span style={{
                        fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.purple,
                        padding: '2px 8px', background: colors.activePurpleBg, borderRadius: 4,
                      }}>
                        {ev.symbol}
                      </span>
                    )}
                    {ev.kind && (
                      <span style={{
                        fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 600,
                        color: kindColor(ev.kind),
                      }}>
                        {ev.kind}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: colors.textSecondary, lineHeight: 1.45 }}>
                    {ev.message}
                  </p>
                </div>
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted,
                  flexShrink: 0, whiteSpace: 'nowrap',
                }}>
                  {ago(ev.createdAt)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
