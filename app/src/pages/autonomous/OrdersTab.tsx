import { Layers, Filter } from 'lucide-react'
import { colors, layout } from './design'
import { orders } from './autonomous.config'
import { useState } from 'react'

const filters = ['ALL', 'OPEN', 'SUBMITTED', 'PARTIAL', 'FILLED', 'CANCELED', 'REJECTED']

export default function OrdersTab() {
  const [activeFilter, setActiveFilter] = useState('ALL')

  const filtered = activeFilter === 'ALL'
    ? orders
    : orders.filter((o) => o.status === activeFilter)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'FILLED': return colors.green
      case 'PARTIAL': return colors.orange
      case 'REJECTED': return colors.red
      case 'SUBMITTED': return colors.blue
      default: return colors.textSecondary
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Layers size={16} color={colors.blue} strokeWidth={2} />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>Orders</h2>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Filter size={14} color={colors.textMuted} />
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            style={{
              padding: '5px 12px',
              background: activeFilter === f ? `${colors.blue}15` : colors.bgSecondary,
              border: `1px solid ${activeFilter === f ? `${colors.blue}40` : colors.border}`,
              borderRadius: layout.cardRadiusSmall,
              color: activeFilter === f ? colors.blue : colors.textSecondary,
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
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, marginLeft: 8 }}>{filtered.length} orders</span>
      </div>

      {/* Order Blotter */}
      <div style={{ background: colors.bgPanel, border: `1px solid ${colors.border}`, borderRadius: layout.cardRadius, overflow: 'hidden', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: colors.bgSecondary }}>
              {['Time', 'Order ID', 'Ticker', 'Side', 'Type', 'Qty', 'Limit', 'Submit $', 'Filled', 'Avg Fill', 'Rem', 'Status', 'Broker', 'Strategy', 'Event', 'Ack', 'Fill', 'Slip', 'Reject'].map((h) => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: `1px solid ${colors.border}`, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((order) => (
              <tr key={order.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textSecondary, whiteSpace: 'nowrap' }}>{order.timestamp}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textMuted, whiteSpace: 'nowrap' }}>{order.id}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textPrimary, fontWeight: 600, whiteSpace: 'nowrap' }}>{order.ticker}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: order.side === 'BUY' ? colors.green : colors.red, whiteSpace: 'nowrap', fontWeight: 500 }}>{order.side}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textSecondary, whiteSpace: 'nowrap' }}>{order.type}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textPrimary, whiteSpace: 'nowrap' }}>{order.qty}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textSecondary, whiteSpace: 'nowrap' }}>{order.limit ?? '—'}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textSecondary, whiteSpace: 'nowrap' }}>{order.submittedPrice ?? '—'}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.green, whiteSpace: 'nowrap' }}>{order.filledQty}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textSecondary, whiteSpace: 'nowrap' }}>{order.avgFill ?? '—'}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: order.remaining > 0 ? colors.orange : colors.textMuted, whiteSpace: 'nowrap' }}>{order.remaining}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: getStatusColor(order.status), fontWeight: 600, whiteSpace: 'nowrap' }}>{order.status}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textSecondary, whiteSpace: 'nowrap' }}>{order.broker}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textSecondary, whiteSpace: 'nowrap' }}>{order.strategy}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textMuted, whiteSpace: 'nowrap' }}>{order.eventId}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textSecondary, whiteSpace: 'nowrap' }}>{order.latencyAck}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textSecondary, whiteSpace: 'nowrap' }}>{order.latencyFill}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: order.slippage ? colors.orange : colors.textMuted, whiteSpace: 'nowrap' }}>{order.slippage ?? '—'}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.red, whiteSpace: 'nowrap', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.rejectReason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
