import { History, Play, Filter } from 'lucide-react'
import { colors, layout } from './design'
import { auditEvents } from './autonomous.config'
import { useState } from 'react'

const typeColors: Record<string, string> = {
  INFO: '#315CFF',
  SUCCESS: '#30D158',
  WARNING: '#F4A261',
  ERROR: '#FF453A',
  CRITICAL: '#FF453A',
  START: '#30D158',
  PAUSE: '#F4A261',
  KILL: '#FF453A',
}

export default function AuditReplayTab() {
  const [filter, setFilter] = useState('ALL')

  const filtered = filter === 'ALL' ? auditEvents : auditEvents.filter((e) => e.level === filter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <History size={16} color={colors.blue} strokeWidth={2} />
          <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>Audit & Replay</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Filter size={14} color={colors.textMuted} />
          {['ALL', 'INFO', 'SUCCESS', 'WARNING', 'ERROR', 'CRITICAL', 'START', 'PAUSE', 'KILL'].map((f) => (
            <button
              key={f}
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
                transition: 'all 200ms ease',
              }}
            >
              {f}
            </button>
          ))}
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, marginLeft: 8 }}>{filtered.length} events</span>
        </div>
      </div>

      <div style={{ background: colors.bgPanel, border: `1px solid ${colors.border}`, borderRadius: layout.cardRadius, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: colors.bgSecondary }}>
              {['Timestamp', 'Level', 'Source', 'Type', 'Message', 'Data'].map((h) => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: `1px solid ${colors.border}`, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((evt) => (
              <tr key={evt.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                <td style={{ padding: '12px 16px', fontFamily: 'JetBrains Mono, monospace', color: colors.textSecondary, whiteSpace: 'nowrap' }}>{evt.timestamp}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: typeColors[evt.level] || colors.textSecondary, padding: '3px 10px', background: `${typeColors[evt.level] || colors.textSecondary}15`, borderRadius: 6, fontWeight: 500 }}>
                    {evt.level}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: colors.textSecondary, whiteSpace: 'nowrap' }}>{evt.source}</td>
                <td style={{ padding: '12px 16px', fontFamily: 'JetBrains Mono, monospace', color: colors.textSecondary, whiteSpace: 'nowrap' }}>{evt.type}</td>
                <td style={{ padding: '12px 16px', color: colors.textPrimary, fontSize: 12, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{evt.message}</td>
                <td style={{ padding: '12px 16px', fontFamily: 'JetBrains Mono, monospace', color: colors.textMuted, whiteSpace: 'nowrap', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {evt.data ? JSON.stringify(evt.data).slice(0, 50) + (JSON.stringify(evt.data).length > 50 ? '...' : '') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
