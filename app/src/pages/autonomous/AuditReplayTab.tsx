import { History, Filter } from 'lucide-react'
import { colors, layout } from './design'
import { useMemo, useState } from 'react'
import { trpc } from '@/providers/trpc'

const typeColors: Record<string, string> = {
  INFO: '#315CFF',
  SUCCESS: '#30D158',
  WARNING: '#F4A261',
  ERROR: '#FF453A',
  CRITICAL: '#FF453A',
  TRADE: '#30D158',
  RISK: '#F4A261',
}

function levelFromKind(kind?: string | null, phase?: string | null): string {
  const k = (kind || '').toLowerCase()
  if (k === 'success' || k === 'trade') return 'SUCCESS'
  if (k === 'error') return 'ERROR'
  if (k === 'risk' || k === 'warning') return 'WARNING'
  if ((phase || '').includes('ERROR')) return 'ERROR'
  if ((phase || '').includes('RISK')) return 'RISK'
  return 'INFO'
}

export default function AuditReplayTab() {
  const [filter, setFilter] = useState('ALL')
  const { data: events = [], isLoading } = trpc.autonomous.stream.useQuery(undefined, { refetchInterval: 4000 })
  const { data: orders = [] } = trpc.autonomous.orders.useQuery(undefined, { refetchInterval: 5000 })

  const rows = useMemo(() => {
    const fromStream = events.map((ev) => ({
      id: ev.id,
      timestamp: new Date(ev.createdAt).toLocaleString(),
      level: levelFromKind(ev.kind, ev.phase),
      source: 'Autonomous',
      type: ev.phase,
      message: ev.message,
      data: ev.symbol ? { symbol: ev.symbol, ...(ev.payload as object | null) } : ev.payload,
      sort: new Date(ev.createdAt).getTime(),
    }))
    const fromOrders = orders.slice(0, 40).map((o) => ({
      id: `ord-${o.id}`,
      timestamp: o.createdAt ? new Date(o.createdAt).toLocaleString() : '—',
      level: o.state === 'FAILED' || o.state === 'REJECTED' ? 'ERROR' : o.state === 'FILLED' ? 'SUCCESS' : o.state === 'WORKING' ? 'INFO' : 'INFO',
      source: 'Orders',
      type: o.state,
      message: `${o.side} ${o.quantity} ${o.symbol} · ${o.ticketId}${o.lastMessage ? ` · ${o.lastMessage}` : ''}`,
      data: { brokerOrderId: o.brokerOrderId, broker: o.broker },
      sort: o.createdAt ? new Date(o.createdAt).getTime() : 0,
    }))
    return [...fromStream, ...fromOrders].sort((a, b) => b.sort - a.sort)
  }, [events, orders])

  const filtered = filter === 'ALL' ? rows : rows.filter((e) => e.level === filter)
  const filters = ['ALL', 'INFO', 'SUCCESS', 'WARNING', 'ERROR', 'RISK']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <History size={16} color={colors.blue} strokeWidth={2} />
          <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>Audit & Replay</h2>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>
            live · stream + order trail
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Filter size={14} color={colors.textMuted} />
          {filters.map((f) => (
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
            {isLoading && (
              <tr>
                <td colSpan={6} style={{ padding: 24, color: colors.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>Loading audit trail…</td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 24, color: colors.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>
                  No audit events yet. Start the engine and confirm orders — lifecycle + ticket outcomes appear here.
                </td>
              </tr>
            )}
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
                <td style={{ padding: '12px 16px', color: colors.textPrimary, fontSize: 12, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }}>{evt.message}</td>
                <td style={{ padding: '12px 16px', fontFamily: 'JetBrains Mono, monospace', color: colors.textMuted, whiteSpace: 'nowrap', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {evt.data ? JSON.stringify(evt.data).slice(0, 60) + (JSON.stringify(evt.data).length > 60 ? '…' : '') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
