import { useEffect, useMemo, useState } from 'react'
import { TrendingUp, Search, Filter } from 'lucide-react'
import { colors, layout } from './design'
import { trpc } from '@/providers/trpc'

type BrokerFilter = 'ALL' | 'IBKR' | 'PAPER'

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: colors.bgPanel, border: `1px solid ${colors.border}`, borderRadius: layout.cardRadius, overflow: 'hidden' }}>
      {children}
    </div>
  )
}

function money(n: number, digits = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** Live mark for one symbol via gateway (IBKR → Yahoo). */
function useLiveMark(symbol: string, enabled: boolean) {
  const { data } = trpc.marketData.gatewaySnapshot.useQuery(
    { symbol },
    { enabled, refetchInterval: 20_000, retry: 1 },
  )
  if (!data || !('market_data_available' in data) || !data.market_data_available) return null
  return Number(data.price) || null
}

function PositionCard({
  symbol,
  strategy,
  broker,
  quantity,
  avgEntry,
  openedAt,
  stopPrice,
  sourceLabel,
}: {
  symbol: string
  strategy?: string | null
  broker: string
  quantity: number
  avgEntry: number
  openedAt?: Date | string | null
  stopPrice?: number | null
  sourceLabel?: string
}) {
  const mark = useLiveMark(symbol, quantity > 0)
  const hasMark = mark != null && mark > 0
  const pnl = hasMark ? (mark! - avgEntry) * quantity : null
  const pnlPct = hasMark && avgEntry > 0 ? ((mark! - avgEntry) / avgEntry) * 100 : null
  const exposure = quantity * avgEntry

  return (
    <Card>
      <div style={{ padding: 20, borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: 20, fontWeight: 600, color: colors.textPrimary, margin: 0, letterSpacing: '-0.02em' }}>
              {symbol}
            </h3>
            {strategy && (
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                color: colors.textMuted,
                padding: '3px 10px',
                background: colors.bgElevated,
                borderRadius: 6,
              }}>
                {strategy}
              </span>
            )}
            {sourceLabel && (
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted }}>
                {sourceLabel}
              </span>
            )}
          </div>
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            color: colors.blue,
            padding: '3px 10px',
            background: `${colors.blue}10`,
            borderRadius: 6,
          }}>
            {broker === 'IBKR' ? 'IBKR Paper' : broker}
          </span>
        </div>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{
            flex: 1,
            padding: 14,
            background: pnl == null ? colors.bgSecondary : pnl >= 0 ? `${colors.green}08` : `${colors.red}08`,
            borderRadius: layout.cardRadiusSmall,
            border: `1px solid ${pnl == null ? colors.border : pnl >= 0 ? `${colors.green}18` : `${colors.red}18`}`,
          }}>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', margin: '0 0 6px 0' }}>
              Unrealized P&L
            </p>
            <p style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 24,
              fontWeight: 600,
              color: pnl == null ? colors.textMuted : pnl >= 0 ? colors.green : colors.red,
              margin: 0,
            }}>
              {pnl == null ? '—' : `${pnl >= 0 ? '+' : ''}$${money(pnl)}`}
            </p>
            <p style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12,
              color: pnlPct == null ? colors.textMuted : pnlPct >= 0 ? colors.green : colors.red,
              margin: '4px 0 0 0',
            }}>
              {pnlPct == null ? 'awaiting live mark' : `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`}
            </p>
          </div>
          <div style={{ flex: 1, padding: 14, background: colors.bgSecondary, borderRadius: layout.cardRadiusSmall }}>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', margin: '0 0 6px 0' }}>
              Qty · Avg entry
            </p>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>
              {quantity} @ ${avgEntry.toFixed(2)}
            </p>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textMuted, margin: '6px 0 0' }}>
              Mark {hasMark ? `$${money(mark!)}` : '—'} · Exp ${money(exposure, 0)}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>Stop</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textSecondary }}>
            {stopPrice != null && stopPrice > 0 ? `$${stopPrice.toFixed(2)}` : '—'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>Opened</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textSecondary }}>
            {openedAt ? new Date(openedAt).toLocaleString() : '—'}
          </span>
        </div>
      </div>
    </Card>
  )
}

const FILTER_LABELS: Record<BrokerFilter, string> = {
  ALL: 'ALL',
  IBKR: 'IBKR Paper',
  PAPER: 'Sim only',
}

export default function PositionsTab() {
  const [searchQuery, setSearchQuery] = useState(() => {
    try { return sessionStorage.getItem('autonomous.globalSearch') ?? '' } catch { return '' }
  })
  // Client goal = IBKR Paper — default there, not internal sim.
  const [brokerFilter, setBrokerFilter] = useState<BrokerFilter>('IBKR')

  // Consume one-shot global search from shell.
  useEffect(() => {
    try {
      const q = sessionStorage.getItem('autonomous.globalSearch')
      if (q) {
        setSearchQuery(q)
        sessionStorage.removeItem('autonomous.globalSearch')
      }
    } catch { /* ignore */ }
  }, [])

  const { data: positions = [], isLoading } = trpc.autonomous.positions.useQuery(undefined, { refetchInterval: 4000 })
  const { data: orders = [] } = trpc.autonomous.orders.useQuery(undefined, { refetchInterval: 4000 })
  const { data: brokerPos, isFetching: brokerFetching } = trpc.execution.positions.useQuery(
    { broker: 'IBKR' },
    { refetchInterval: 10_000, retry: 1 },
  )

  const stagedCount = orders.filter((o) => o.state === 'READY_FOR_CONFIRMATION').length
  const workingCount = orders.filter((o) => o.state === 'WORKING' || o.state === 'SUBMITTING').length
  const filledOrWorkingAfter = useMemo(() => {
    const ok = orders.filter((o) => o.state === 'WORKING' || o.state === 'FILLED' || o.state === 'SUBMITTING')
    if (ok.length === 0) return 0
    return Math.max(...ok.map((o) => new Date(o.createdAt ?? 0).getTime()))
  }, [orders])

  // Only surface failures newer than the last successful submit, and within 20 minutes.
  const recentFails = useMemo(() => {
    const cutoff = Date.now() - 20 * 60_000
    return orders
      .filter((o) => o.state === 'FAILED' || o.state === 'REJECTED')
      .filter((o) => {
        const t = new Date(o.createdAt ?? 0).getTime()
        if (t < cutoff) return false
        if (filledOrWorkingAfter > 0 && t < filledOrWorkingAfter) return false
        return true
      })
      .slice(0, 3)
  }, [orders, filledOrWorkingAfter])

  const gatewayCount = (brokerPos?.positions ?? []).filter((r) => Number(r.quantity) !== 0).length

  const dbRows = useMemo(() => {
    return positions
      .filter((p) => {
        if (brokerFilter === 'IBKR' && p.broker !== 'IBKR') return false
        if (brokerFilter === 'PAPER' && p.broker !== 'PAPER') return false
        if (searchQuery && !p.symbol.toLowerCase().includes(searchQuery.toLowerCase())) return false
        return true
      })
      .map((p) => ({
        key: `db-${p.id}`,
        symbol: p.symbol,
        strategy: p.strategy,
        broker: p.broker,
        quantity: p.quantity,
        avgEntry: parseFloat(p.avgEntry),
        openedAt: p.openedAt,
        stopPrice: p.stopPrice != null ? parseFloat(p.stopPrice) : null,
        sourceLabel: 'platform ledger',
      }))
  }, [positions, brokerFilter, searchQuery])

  // IBKR Paper live holdings from Client Portal — primary source for client paper trading.
  const gatewayRows = useMemo(() => {
    if (brokerFilter === 'PAPER') return []
    const localSyms = new Set(
      positions.filter((p) => p.broker === 'IBKR').map((p) => p.symbol.toUpperCase()),
    )
    const rows = brokerPos?.positions ?? []
    return rows
      .filter((r) => Number(r.quantity) !== 0)
      .filter((r) => r.symbol && !localSyms.has(String(r.symbol).toUpperCase()))
      .filter((r) => !searchQuery || String(r.symbol).toLowerCase().includes(searchQuery.toLowerCase()))
      .map((r, i) => ({
        key: `gw-${r.symbol}-${i}`,
        symbol: String(r.symbol),
        strategy: 'IBKR Paper account',
        broker: 'IBKR',
        quantity: Number(r.quantity),
        avgEntry: Number(r.averageCost) || 0,
        openedAt: null as Date | null,
        stopPrice: null as number | null,
        sourceLabel: 'broker gateway',
      }))
  }, [brokerPos, brokerFilter, searchQuery, positions])

  const openCount = dbRows.length + gatewayRows.length
  const allEmpty = !isLoading && openCount === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <TrendingUp size={16} color={colors.blue} strokeWidth={2} />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>Open Positions</h2>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>
          live · IBKR Paper gateway + autonomous ledger
        </span>
        <span style={{
          marginLeft: 'auto',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
          color: colors.textMuted,
          padding: '4px 10px',
          background: colors.bgElevated,
          borderRadius: layout.pillRadius,
          border: `1px solid ${colors.border}`,
        }}>
          {openCount} open{brokerFetching && brokerFilter !== 'PAPER' ? ' · refreshing' : ''}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Filter size={14} color={colors.textMuted} />
        {(['ALL', 'IBKR', 'PAPER'] as const).map((f) => (
          <button
            key={f}
            type='button'
            onClick={() => setBrokerFilter(f)}
            style={{
              padding: '5px 12px',
              background: brokerFilter === f ? `${colors.blue}15` : colors.bgSecondary,
              border: `1px solid ${brokerFilter === f ? `${colors.blue}40` : colors.border}`,
              borderRadius: layout.cardRadiusSmall,
              color: brokerFilter === f ? colors.blue : colors.textSecondary,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
        <div style={{
          marginLeft: 'auto',
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', background: colors.bgElevated,
          borderRadius: layout.cardRadiusControl, border: `1px solid ${colors.border}`,
        }}>
          <Search size={14} color={colors.textMuted} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder='Filter ticker…'
            style={{ background: 'transparent', border: 'none', color: colors.textSecondary, fontSize: 12, outline: 'none', width: 120, fontFamily: 'inherit' }}
          />
        </div>
      </div>

      {isLoading && (
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.textMuted }}>Loading positions…</p>
      )}

      {allEmpty && (
        <div style={{
          padding: 24,
          background: colors.bgPanel,
          border: `1px solid ${colors.border}`,
          borderRadius: layout.cardRadius,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 12,
          color: colors.textMuted,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          {brokerFilter === 'PAPER' ? (
            <>
              <span>No internal sim (PAPER) positions.</span>
              <span>
                Your Interactive Brokers Paper holdings are under <strong style={{ color: colors.blue, fontWeight: 600 }}>IBKR Paper</strong>
                {gatewayCount > 0 ? ` (${gatewayCount} open on the gateway)` : ''}. Switch that filter to view them.
              </span>
            </>
          ) : (
            <>
              <span>No open positions yet.</span>
              <span>
                {workingCount > 0
                  ? `${workingCount} order(s) working at IBKR — fills land here once executed (check Orders).`
                  : stagedCount > 0
                    ? `${stagedCount} ticket(s) waiting — open Orders → Confirm to send to IBKR Paper. Fills appear here.`
                    : 'Start the engine, wait for a staged ticket, then Confirm on Orders.'}
              </span>
            </>
          )}
          {recentFails.length > 0 && brokerFilter !== 'PAPER' && (
            <div style={{ marginTop: 8, paddingTop: 12, borderTop: `1px solid ${colors.border}` }}>
              <p style={{ margin: '0 0 8px', color: colors.orange, fontWeight: 600 }}>Recent confirm failures</p>
              {recentFails.map((t) => (
                <p key={t.id} style={{ margin: '0 0 6px', color: colors.textSecondary }}>
                  {t.ticketId} · {t.symbol}: {t.lastMessage || t.state}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
        {dbRows.map((pos) => (
          <PositionCard key={pos.key} {...pos} />
        ))}
        {gatewayRows.map((pos) => (
          <PositionCard key={pos.key} {...pos} />
        ))}
      </div>
    </div>
  )
}
