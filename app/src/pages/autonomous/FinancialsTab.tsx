import { useMemo } from 'react'
import { DollarSign, TrendingUp, BarChart3, Target } from 'lucide-react'
import { colors, layout } from './design'
import { trpc } from '@/providers/trpc'

function Card({ title, icon: Icon, children }: { title?: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div style={{ background: colors.bgPanel, border: `1px solid ${colors.border}`, borderRadius: layout.cardRadius, overflow: 'hidden', marginBottom: 16 }}>
      {title && Icon && (
        <div style={{ padding: 20, borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon size={16} color={colors.blue} strokeWidth={2} />
          <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>{title}</h2>
        </div>
      )}
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: colors.bgSecondary, borderRadius: layout.cardRadiusSmall, padding: '14px 16px' }}>
      <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 6px 0' }}>{label}</p>
      <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 500, color: color || colors.textPrimary, margin: 0, letterSpacing: '-0.01em' }}>{value}</p>
    </div>
  )
}

function money(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export default function FinancialsTab() {
  const { data: state } = trpc.autonomous.state.useQuery(undefined, { refetchInterval: 5000 })
  const { data: ibkr } = trpc.trading.ibkrStatus.useQuery(undefined, { refetchInterval: 10_000 })
  const { data: positions = [] } = trpc.autonomous.positions.useQuery(undefined, { refetchInterval: 5000 })
  const { data: brokerPos } = trpc.execution.positions.useQuery({ broker: 'IBKR' }, { refetchInterval: 15_000, retry: 1 })
  const { data: orders = [] } = trpc.autonomous.orders.useQuery(undefined, { refetchInterval: 5000 })
  const { data: trades = [] } = trpc.autonomous.trades.useQuery(undefined, { refetchInterval: 8000 })

  const equity = Number(ibkr?.equity || state?.account?.equity || 0)
  const cash = Number(ibkr?.cash || 0)
  const buyingPower = Number(ibkr?.buyingPower || 0)
  const allocated = Number(state?.metrics?.allocated || 0)
  const realized = Number(state?.metrics?.realizedPnl || 0)
  const todayPnl = Number(state?.metrics?.todayPnl || 0)

  const gatewayExposure = useMemo(() => {
    return (brokerPos?.positions ?? []).reduce((s, p) => s + Math.abs(Number(p.marketValue) || Number(p.averageCost) * Number(p.quantity) || 0), 0)
  }, [brokerPos])

  const ledgerExposure = useMemo(() => {
    return positions.reduce((s, p) => s + p.quantity * parseFloat(p.avgEntry), 0)
  }, [positions])

  const exposure = gatewayExposure > 0 ? gatewayExposure : ledgerExposure
  const unrealGw = useMemo(() => {
    return (brokerPos?.positions ?? []).reduce((s, p) => s + (Number(p.unrealizedPnl) || 0), 0)
  }, [brokerPos])

  const bySymbol = useMemo(() => {
    const map = new Map<string, { qty: number; notional: number; pnl: number }>()
    for (const p of brokerPos?.positions ?? []) {
      if (!p.symbol || Number(p.quantity) === 0) continue
      map.set(String(p.symbol), {
        qty: Number(p.quantity),
        notional: Math.abs(Number(p.marketValue) || Number(p.averageCost) * Number(p.quantity)),
        pnl: Number(p.unrealizedPnl) || 0,
      })
    }
    for (const p of positions) {
      if (map.has(p.symbol)) continue
      map.set(p.symbol, {
        qty: p.quantity,
        notional: p.quantity * parseFloat(p.avgEntry),
        pnl: 0,
      })
    }
    return [...map.entries()].map(([symbol, v]) => ({ symbol, ...v }))
  }, [brokerPos, positions])

  const byStrategy = useMemo(() => {
    const map = new Map<string, { tickets: number; filled: number; working: number }>()
    for (const o of orders) {
      const k = o.strategy || 'UNKNOWN'
      const cur = map.get(k) ?? { tickets: 0, filled: 0, working: 0 }
      cur.tickets += 1
      if (o.state === 'FILLED') cur.filled += 1
      if (o.state === 'WORKING' || o.state === 'SUBMITTING') cur.working += 1
      map.set(k, cur)
    }
    return [...map.entries()].map(([strategy, v]) => ({ strategy, ...v }))
  }, [orders])

  const closedRows = trades.slice(0, 25)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <DollarSign size={16} color={colors.blue} strokeWidth={2} />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>Financials</h2>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>
          live · IBKR Paper + autonomous ledger
        </span>
      </div>

      <Card title='Account Summary' icon={DollarSign}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          <StatBox label='IBKR Equity' value={equity > 0 ? `$${money(equity)}` : '—'} />
          <StatBox label='Cash' value={cash > 0 ? `$${money(cash)}` : '—'} />
          <StatBox label='Buying Power' value={buyingPower > 0 ? `$${money(buyingPower)}` : '—'} color={colors.blue} />
          <StatBox label='Allocated (engine)' value={`$${money(allocated, 0)}`} />
          <StatBox label='Gross Exposure' value={`$${money(exposure, 0)}`} />
          <StatBox label='Open Positions' value={String(bySymbol.length)} />
          <StatBox label='Realized P&L' value={`$${money(realized)}`} color={realized >= 0 ? colors.green : colors.red} />
          <StatBox label='Unrealized (IBKR)' value={unrealGw !== 0 ? `$${money(unrealGw)}` : '—'} color={unrealGw >= 0 ? colors.green : colors.red} />
          <StatBox label='Today P&L' value={`$${money(todayPnl)}`} color={todayPnl >= 0 ? colors.green : colors.red} />
        </div>
      </Card>

      <Card title='Holdings by Symbol' icon={TrendingUp}>
        {bySymbol.length === 0 ? (
          <p style={{ margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.textMuted }}>
            No open holdings yet. Confirm IBKR Paper tickets under Orders — fills appear here.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: colors.bgSecondary }}>
                  {['Symbol', 'Qty', 'Notional', 'Unrealized'].map((h) => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', borderBottom: `1px solid ${colors.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bySymbol.map((r) => (
                  <tr key={r.symbol} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textPrimary }}>{r.symbol}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textSecondary }}>{r.qty}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textSecondary }}>${money(r.notional, 0)}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: r.pnl >= 0 ? colors.green : colors.red }}>
                      {r.pnl !== 0 ? `${r.pnl >= 0 ? '+' : ''}$${money(r.pnl)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title='Strategy Activity' icon={BarChart3}>
        {byStrategy.length === 0 ? (
          <p style={{ margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.textMuted }}>No autonomous tickets this session yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: colors.bgSecondary }}>
                  {['Strategy', 'Tickets', 'Filled', 'Working'].map((h) => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', borderBottom: `1px solid ${colors.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byStrategy.map((r) => (
                  <tr key={r.strategy} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textPrimary }}>{r.strategy}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textSecondary }}>{r.tickets}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.green }}>{r.filled}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.orange }}>{r.working}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title='Closed Trades' icon={Target}>
        {closedRows.length === 0 ? (
          <p style={{ margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.textMuted }}>
            No closed autonomous trades yet. Open positions and exits will list here.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: colors.bgSecondary }}>
                  {['Symbol', 'Qty', 'Entry', 'Exit', 'P&L', 'Closed'].map((h) => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', borderBottom: `1px solid ${colors.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {closedRows.map((t) => {
                  const pnl = t.realizedPnl != null ? parseFloat(String(t.realizedPnl)) : 0
                  return (
                    <tr key={t.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textPrimary }}>{t.symbol}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textSecondary }}>{t.quantity}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textSecondary }}>${money(parseFloat(String(t.avgEntry)))}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textSecondary }}>
                        {t.exitPrice != null ? `$${money(parseFloat(String(t.exitPrice)))}` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: pnl >= 0 ? colors.green : colors.red }}>
                        {t.realizedPnl != null ? `${pnl >= 0 ? '+' : ''}$${money(pnl)}` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textMuted }}>
                        {t.closedAt ? new Date(t.closedAt).toLocaleString() : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
