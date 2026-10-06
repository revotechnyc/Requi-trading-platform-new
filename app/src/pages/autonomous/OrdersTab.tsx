import { Layers, Filter } from 'lucide-react'
import { colors, layout } from './design'
import { useState } from 'react'
import { trpc } from '@/providers/trpc'

const filters = ['ALL', 'READY_FOR_CONFIRMATION', 'WORKING', 'SUBMITTING', 'FILLED', 'FAILED', 'REJECTED', 'CANCELLED', 'EXPIRED']

export default function OrdersTab() {
  const [activeFilter, setActiveFilter] = useState('ALL')
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const utils = trpc.useUtils()
  const { data: orders = [], isLoading } = trpc.autonomous.orders.useQuery(undefined, { refetchInterval: 4000 })

  const confirmMut = trpc.execution.confirm.useMutation({
    onSuccess: async (res) => {
      setActionMsg(res.ok ? `✓ ${res.message}` : `Confirm failed: ${res.message}`)
      // Confirmed tickets leave READY — show ALL so the order stays visible as WORKING/FILLED.
      if (res.ok) setActiveFilter('ALL')
      await Promise.all([
        utils.autonomous.orders.invalidate(),
        utils.autonomous.positions.invalidate(),
        utils.execution.positions.invalidate(),
        utils.autonomous.state.invalidate(),
        utils.autonomous.stream.invalidate(),
        utils.trading.ibkrStatus.invalidate(),
      ])
    },
    onError: (err) => setActionMsg(`Confirm failed: ${err.message}`),
  })
  const rejectMut = trpc.execution.reject.useMutation({
    onSuccess: async (res) => {
      setActionMsg(res.ok ? res.message : `Reject failed: ${res.message}`)
      await utils.autonomous.orders.invalidate()
    },
    onError: (err) => setActionMsg(`Reject failed: ${err.message}`),
  })

  const filtered = activeFilter === 'ALL'
    ? orders
    : orders.filter((o) => o.state === activeFilter)

  const busy = confirmMut.isPending || rejectMut.isPending
  const actionIsError = !!actionMsg && /fail|error|reject/i.test(actionMsg)
  const workingHiddenByFilter =
    activeFilter === 'READY_FOR_CONFIRMATION' &&
    orders.some((o) => o.state === 'WORKING' || o.state === 'FILLED' || o.state === 'SUBMITTING')

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'FILLED': return colors.green
      case 'WORKING':
      case 'SUBMITTING': return colors.orange
      case 'READY_FOR_CONFIRMATION': return colors.blue
      case 'REJECTED':
      case 'FAILED': return colors.red
      case 'CANCELLED':
      case 'EXPIRED': return colors.textMuted
      default: return colors.textSecondary
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Layers size={16} color={colors.blue} strokeWidth={2} />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>Orders</h2>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>
          live · autonomous tickets · confirm sends to IBKR Paper
        </span>
      </div>

      {actionMsg && (
        <div style={{
          padding: '10px 14px',
          background: actionIsError ? `${colors.red}12` : `${colors.green}12`,
          border: `1px solid ${actionIsError ? `${colors.red}40` : `${colors.green}40`}`,
          borderRadius: layout.cardRadiusSmall,
          color: colors.textPrimary,
          fontSize: 12,
          fontFamily: 'JetBrains Mono, monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {actionMsg}
        </div>
      )}

      {workingHiddenByFilter && (
        <div style={{
          padding: '10px 14px',
          background: `${colors.orange}12`,
          border: `1px solid ${colors.orange}40`,
          borderRadius: layout.cardRadiusSmall,
          color: colors.textPrimary,
          fontSize: 12,
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          Confirmed orders leave READY — switch to <button type='button' onClick={() => setActiveFilter('ALL')} style={{ background: 'none', border: 'none', color: colors.blue, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', padding: 0, textDecoration: 'underline' }}>ALL</button> or <button type='button' onClick={() => setActiveFilter('WORKING')} style={{ background: 'none', border: 'none', color: colors.blue, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', padding: 0, textDecoration: 'underline' }}>WORKING</button> to see them.
        </div>
      )}

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
            {f.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      <div style={{
        background: colors.bgPanel,
        border: `1px solid ${colors.border}`,
        borderRadius: layout.cardRadius,
        overflow: 'auto',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
              {['Ticket', 'Symbol', 'Side', 'Qty', 'Type', 'Broker', 'State', 'Created', 'Action'].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 10,
                    color: colors.textMuted,
                    fontWeight: 500,
                    textTransform: 'uppercase',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} style={{ padding: 24, color: colors.textMuted, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
                  Loading orders…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: 24, color: colors.textMuted, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
                  No autonomous orders yet. With ENGINE RUNNING, wait for a staged ticket, then Confirm to send it to IBKR Paper.
                </td>
              </tr>
            )}
            {filtered.map((order) => {
              const canConfirm = order.state === 'READY_FOR_CONFIRMATION'
              const failHint = (order.state === 'FAILED' || order.state === 'REJECTED') && order.lastMessage
                ? String(order.lastMessage)
                : null
              return (
                <tr key={order.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textPrimary }}>
                    {order.ticketId}
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textPrimary }}>
                    {order.symbol}
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: order.side === 'BUY' ? colors.green : colors.red }}>
                    {order.side}
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textSecondary }}>
                    {order.quantity}
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textSecondary }}>
                    {order.orderType}
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textSecondary }}>
                    {order.effectiveBroker ?? order.broker}
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: getStatusColor(order.state), maxWidth: 280 }}>
                    <div>{order.state}</div>
                    {failHint && (
                      <div style={{ marginTop: 4, fontSize: 9, color: colors.red, lineHeight: 1.35, whiteSpace: 'normal', wordBreak: 'break-word' }} title={failHint}>
                        {failHint.length > 140 ? `${failHint.slice(0, 140)}…` : failHint}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textMuted, whiteSpace: 'nowrap' }}>
                    {order.createdAt ? new Date(order.createdAt).toLocaleString() : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    {canConfirm ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type='button'
                          disabled={busy}
                          onClick={() => {
                            setActionMsg(null)
                            confirmMut.mutate({
                              ticketId: order.ticketId,
                              confirmation: `CONFIRM ORDER ${order.ticketId}`,
                            })
                          }}
                          style={{
                            padding: '4px 10px',
                            background: colors.green,
                            border: 'none',
                            borderRadius: layout.cardRadiusSmall,
                            color: '#fff',
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: 10,
                            fontWeight: 600,
                            cursor: busy ? 'wait' : 'pointer',
                            opacity: busy ? 0.6 : 1,
                          }}
                        >
                          Confirm
                        </button>
                        <button
                          type='button'
                          disabled={busy}
                          onClick={() => {
                            setActionMsg(null)
                            rejectMut.mutate({ ticketId: order.ticketId })
                          }}
                          style={{
                            padding: '4px 10px',
                            background: 'transparent',
                            border: `1px solid ${colors.red}`,
                            borderRadius: layout.cardRadiusSmall,
                            color: colors.red,
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: 10,
                            fontWeight: 600,
                            cursor: busy ? 'wait' : 'pointer',
                            opacity: busy ? 0.6 : 1,
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
