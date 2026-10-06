import { useMemo } from 'react'
import { Clock, Zap, Wifi, Server, Activity } from 'lucide-react'
import { colors, layout } from './design'
import { trpc } from '@/providers/trpc'

type PhasePoint = { id: string; label: string; time: string; latency: string; type: string }

function fmtMs(ms: number | null) {
  if (ms == null || !Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

export default function LatencyTab() {
  const { data: events = [] } = trpc.autonomous.stream.useQuery(undefined, { refetchInterval: 4000 })
  const { data: ibkr } = trpc.trading.ibkrStatus.useQuery(undefined, { refetchInterval: 10_000 })
  const { data: brokers } = trpc.execution.brokers.useQuery(undefined, { refetchInterval: 15_000 })

  const chronological = useMemo(() => {
    return [...events].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }, [events])

  const points: PhasePoint[] = useMemo(() => {
    if (chronological.length === 0) return []
    const start = new Date(chronological[0].createdAt).getTime()
    let prev = start
    return chronological.slice(-20).map((ev, i) => {
      const t = new Date(ev.createdAt).getTime()
      const delta = i === 0 ? 0 : t - prev
      prev = t
      const fromStart = t - start
      return {
        id: `E${i}`,
        label: `${ev.phase}${ev.symbol ? ` · ${ev.symbol}` : ''}`,
        time: new Date(ev.createdAt).toLocaleTimeString(),
        latency: i === 0 ? 'T0' : `+${fmtMs(delta)} (Σ ${fmtMs(fromStart)})`,
        type: ev.phase.includes('BROKER') || ev.phase.includes('ORDER') ? 'BROKER' : ev.phase.includes('MARKET') ? 'NETWORK' : 'INTERNAL',
      }
    })
  }, [chronological])

  const brokerList = Array.isArray(brokers) ? brokers : []
  const ibkrRow = brokerList.find((b: { code?: string }) => b.code === 'IBKR') as
    | { code?: string; ok?: boolean; detail?: string; degraded?: boolean }
    | undefined

  const summary = [
    { label: 'Stream Events', value: String(events.length), color: colors.textSecondary, icon: Zap },
    { label: 'IBKR Gateway', value: ibkr?.gatewayOk ? 'OK' : 'DOWN', color: ibkr?.gatewayOk ? colors.green : colors.red, icon: Wifi },
    { label: 'IBKR Session', value: ibkr?.connectedForUser ? 'AUTH' : (ibkr?.detail?.slice(0, 18) ?? '—'), color: ibkr?.connectedForUser ? colors.green : colors.orange, icon: Server },
    { label: 'Broker Adapter', value: ibkrRow?.ok ? 'OK' : (ibkrRow?.detail?.slice(0, 18) ?? '—'), color: ibkrRow?.ok ? colors.green : colors.orange, icon: Server },
    { label: 'Engine Session', value: String(ibkr?.label ?? 'IBKR Paper'), color: colors.textPrimary, icon: Activity },
    { label: 'Observed Span', value: points.length >= 2 ? points[points.length - 1]!.latency : '—', color: colors.blue, icon: Clock },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <Clock size={16} color={colors.blue} strokeWidth={2} />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>Latency Observatory</h2>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textMuted, marginLeft: 8 }}>
          live · autonomous event deltas (not demo T0–T12)
        </span>
      </div>

      <div style={{ background: colors.bgPanel, border: `1px solid ${colors.border}`, borderRadius: layout.cardRadius, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: colors.bgSecondary }}>
              {['POINT', 'STAGE', 'TIMESTAMP', 'LATENCY', 'TYPE'].map((h) => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, borderBottom: `1px solid ${colors.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {points.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 24, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.textMuted }}>
                  No autonomous events yet. Start the engine — scan / risk / order phases appear here with real timestamps.
                </td>
              </tr>
            ) : (
              points.map((pt) => {
                const typeColor = pt.type === 'INTERNAL' ? colors.textSecondary : pt.type === 'NETWORK' ? colors.blue : colors.orange
                return (
                  <tr key={pt.id + pt.time} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.blue, fontWeight: 600 }}>{pt.id}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: colors.textSecondary }}>{pt.label}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textPrimary }}>{pt.time}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textPrimary }}>{pt.latency}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: typeColor, padding: '3px 10px', background: `${typeColor}15`, borderRadius: 6, fontWeight: 500 }}>{pt.type}</span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {summary.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.label} style={{ background: colors.bgPanel, border: `1px solid ${colors.border}`, borderRadius: layout.cardRadius, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Icon size={16} color={item.color} />
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase' }}>{item.label}</span>
              </div>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 600, color: item.color, margin: 0, letterSpacing: '-0.02em', wordBreak: 'break-word' }}>{item.value}</p>
            </div>
          )
        })}
      </div>

      <div style={{ padding: 20, background: `${colors.blue}08`, borderRadius: layout.cardRadius, border: `1px solid ${colors.blue}18` }}>
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.textPrimary, margin: '0 0 8px 0', fontWeight: 600 }}>NOTE</p>
        <p style={{ fontSize: 13, color: colors.textMuted, margin: 0, lineHeight: 1.6 }}>
          Latencies here are measured from the autonomous event stream (poll cadence ≈ 2.5–4s). They are operational observations, not exchange-grade microsecond claims.
        </p>
      </div>
    </div>
  )
}
