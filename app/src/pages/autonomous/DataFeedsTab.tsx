import { useMemo } from 'react'
import { Database, Wifi, Zap, Activity } from 'lucide-react'
import { colors, layout } from './design'
import { trpc } from '@/providers/trpc'

type FeedRow = {
  name: string
  category: 'research' | 'hotpath' | 'execution'
  status: 'CONNECTED' | 'DEGRADED' | 'DOWN'
  latency: string
  lastMessage: string
  errorRate: string
}

function Card({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div style={{ background: colors.bgPanel, border: `1px solid ${colors.border}`, borderRadius: layout.cardRadius, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: 20, borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon size={16} color={colors.blue} strokeWidth={2} />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>{title}</h2>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

function FeedTable({ feeds }: { feeds: FeedRow[] }) {
  if (feeds.length === 0) {
    return (
      <p style={{ margin: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.textMuted }}>
        No feeds in this category yet.
      </p>
    )
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: colors.bgSecondary }}>
            {['Source', 'Category', 'Status', 'Detail', 'Last Check', 'Notes'].map((h) => (
              <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: `1px solid ${colors.border}`, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {feeds.map((feed) => (
            <tr key={feed.name} style={{ borderBottom: `1px solid ${colors.border}` }}>
              <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textPrimary, fontWeight: 500, whiteSpace: 'nowrap' }}>{feed.name}</td>
              <td style={{ padding: '10px 12px', color: colors.textSecondary, whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{feed.category}</td>
              <td style={{ padding: '10px 12px' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: feed.status === 'CONNECTED' ? colors.green : feed.status === 'DEGRADED' ? colors.orange : colors.red, padding: '3px 10px', background: `${feed.status === 'CONNECTED' ? colors.green : feed.status === 'DEGRADED' ? colors.orange : colors.red}15`, borderRadius: 6, fontWeight: 500 }}>
                  {feed.status}
                </span>
              </td>
              <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textSecondary, whiteSpace: 'nowrap' }}>{feed.latency}</td>
              <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textMuted, whiteSpace: 'nowrap' }}>{feed.lastMessage}</td>
              <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textMuted, whiteSpace: 'nowrap' }}>{feed.errorRate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function DataFeedsTab() {
  const { data: ibkr } = trpc.trading.ibkrStatus.useQuery(undefined, { refetchInterval: 10_000 })
  const { data: brokers } = trpc.execution.brokers.useQuery(undefined, { refetchInterval: 15_000 })
  const { data: state } = trpc.autonomous.state.useQuery(undefined, { refetchInterval: 5000 })
  const now = new Date().toLocaleTimeString()

  const feeds: FeedRow[] = useMemo(() => {
    const list = Array.isArray(brokers) ? brokers : []
    const rows: FeedRow[] = []

    rows.push({
      name: 'IBKR Client Portal Gateway',
      category: 'hotpath',
      status: ibkr?.gatewayOk ? 'CONNECTED' : 'DOWN',
      latency: ibkr?.gatewayOk ? 'reachable' : 'unreachable',
      lastMessage: now,
      errorRate: ibkr?.detail?.slice(0, 48) || (ibkr?.gatewayOk ? 'authenticated session' : 'login required'),
    })

    rows.push({
      name: 'IBKR Paper Account',
      category: 'execution',
      status: ibkr?.connectedForUser ? 'CONNECTED' : ibkr?.gatewayOk ? 'DEGRADED' : 'DOWN',
      latency: ibkr?.accountId ?? '—',
      lastMessage: now,
      errorRate: ibkr?.equity != null ? `equity $${Number(ibkr.equity).toLocaleString()}` : 'no equity',
    })

    for (const b of list) {
      const code = String((b as { code?: string }).code ?? '')
      const ok = Boolean((b as { ok?: boolean }).ok)
      const degraded = Boolean((b as { degraded?: boolean }).degraded)
      const detail = String((b as { detail?: string; note?: string }).detail ?? (b as { note?: string }).note ?? '')
      rows.push({
        name: String((b as { displayName?: string }).displayName ?? code),
        category: code === 'IBKR' || code === 'PAPER' ? 'execution' : 'research',
        status: ok ? (degraded ? 'DEGRADED' : 'CONNECTED') : 'DOWN',
        latency: ok ? 'adapter ok' : 'adapter fail',
        lastMessage: now,
        errorRate: detail.slice(0, 64) || '—',
      })
    }

    rows.push({
      name: 'Market Data Gateway',
      category: 'hotpath',
      status: ibkr?.gatewayOk ? 'CONNECTED' : 'DEGRADED',
      latency: 'IBKR → Yahoo fallback',
      lastMessage: now,
      errorRate: 'quotes via marketData.gatewaySnapshot',
    })

    rows.push({
      name: 'Autonomous Event Stream',
      category: 'research',
      status: state?.session?.status === 'RUNNING' ? 'CONNECTED' : 'DEGRADED',
      latency: String(state?.session?.status ?? 'IDLE'),
      lastMessage: now,
      errorRate: `mode ${state?.config?.mode ?? '—'}`,
    })

    return rows
  }, [ibkr, brokers, state, now])

  const researchFeeds = feeds.filter((f) => f.category === 'research')
  const hotPathFeeds = feeds.filter((f) => f.category === 'hotpath')
  const executionFeeds = feeds.filter((f) => f.category === 'execution')

  const counts = [
    { category: 'Research', active: researchFeeds.filter((f) => f.status === 'CONNECTED').length, total: researchFeeds.length },
    { category: 'Hot-Path', active: hotPathFeeds.filter((f) => f.status === 'CONNECTED').length, total: hotPathFeeds.length },
    { category: 'Execution', active: executionFeeds.filter((f) => f.status === 'CONNECTED').length, total: executionFeeds.length },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <Database size={16} color={colors.blue} strokeWidth={2} />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>Data Feeds</h2>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted }}>
          live · IBKR gateway + broker adapters
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {counts.map((cat) => (
          <div key={cat.category} style={{ background: colors.bgPanel, border: `1px solid ${colors.border}`, borderRadius: layout.cardRadius, padding: 18 }}>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px 0' }}>{cat.category}</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 24, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>{cat.active}</p>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.textMuted, margin: 0 }}>/{cat.total}</p>
            </div>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: cat.active === cat.total ? colors.green : colors.orange, margin: '4px 0 0 0' }}>
              {cat.active === cat.total ? 'All Healthy' : `${cat.total - cat.active} Issue(s)`}
            </p>
          </div>
        ))}
      </div>

      <Card title='Research Feeds' icon={Wifi}>
        <FeedTable feeds={researchFeeds} />
      </Card>
      <Card title='Hot-Path Feeds' icon={Zap}>
        <FeedTable feeds={hotPathFeeds} />
      </Card>
      <Card title='Execution Feeds' icon={Activity}>
        <FeedTable feeds={executionFeeds} />
      </Card>
    </div>
  )
}
