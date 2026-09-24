import { Clock, Zap, Wifi, Server, Activity } from 'lucide-react'
import { colors, layout } from './design'
import { latencyPoints, latencySummary } from './autonomous.config'

export default function LatencyTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Clock size={16} color={colors.blue} strokeWidth={2} />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>Latency Observatory</h2>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textMuted, marginLeft: 8 }}>T0 to T12</span>
      </div>

      {/* T0-T12 Timeline */}
      <div style={{ background: colors.bgPanel, border: `1px solid ${colors.border}`, borderRadius: layout.cardRadius, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: colors.bgSecondary }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, borderBottom: `1px solid ${colors.border}` }}>POINT</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, borderBottom: `1px solid ${colors.border}` }}>STAGE</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, borderBottom: `1px solid ${colors.border}` }}>TIMESTAMP</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, borderBottom: `1px solid ${colors.border}` }}>LATENCY</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, borderBottom: `1px solid ${colors.border}` }}>TYPE</th>
            </tr>
          </thead>
          <tbody>
            {latencyPoints.map((pt, i) => {
              const type = i <= 7 ? 'INTERNAL' : i <= 9 ? 'NETWORK' : i <= 11 ? 'BROKER' : 'EXCHANGE'
              const typeColor = type === 'INTERNAL' ? colors.textSecondary : type === 'NETWORK' ? colors.blue : type === 'BROKER' ? colors.orange : colors.textSecondary
              return (
                <tr key={pt.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.blue, fontWeight: 600 }}>{pt.id}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: colors.textSecondary }}>{pt.label}</td>
                  <td style={{ padding: '12px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textPrimary }}>{pt.time}</td>
                  <td style={{ padding: '12px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textPrimary }}>{pt.latency}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: typeColor, padding: '3px 10px', background: `${typeColor}15`, borderRadius: 6, fontWeight: 500 }}>{type}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Latency Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {[
          { label: 'Internal Compute', value: latencySummary.internalCompute, color: colors.textSecondary, icon: Zap },
          { label: 'Network', value: latencySummary.network, color: colors.blue, icon: Wifi },
          { label: 'Vendor', value: latencySummary.vendor, color: colors.orange, icon: Server },
          { label: 'Broker', value: latencySummary.broker, color: colors.orange, icon: Server },
          { label: 'Exchange', value: latencySummary.exchange, color: colors.textSecondary, icon: Activity },
          { label: 'End-to-End', value: latencySummary.endToEnd, color: colors.textPrimary, icon: Clock },
        ].map((item) => {
          const Icon = item.icon
          return (
            <div key={item.label} style={{ background: colors.bgPanel, border: `1px solid ${colors.border}`, borderRadius: layout.cardRadius, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Icon size={16} color={item.color} />
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase' }}>{item.label}</span>
              </div>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 22, fontWeight: 600, color: item.color, margin: 0, letterSpacing: '-0.02em' }}>{item.value}</p>
            </div>
          )
        })}
      </div>

      {/* Invariant */}
      <div style={{ padding: 20, background: `${colors.blue}08`, borderRadius: layout.cardRadius, border: `1px solid ${colors.blue}18` }}>
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.textPrimary, margin: '0 0 8px 0', fontWeight: 600 }}>IMPORTANT INVARIANT</p>
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 16, color: colors.blue, margin: 0, fontWeight: 600 }}>INTERNAL_LATENCY != END_TO_END_LATENCY</p>
        <p style={{ fontSize: 13, color: colors.textMuted, margin: '10px 0 0 0', lineHeight: 1.6 }}>
          The internal decision-path target is &le;100 &micro;s &mdash; not an end-to-end execution claim.
          Network, broker, and exchange latencies are external and uncontrolled.
        </p>
      </div>
    </div>
  )
}
