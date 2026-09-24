import { Database, Wifi, Zap, Activity, AlertCircle, CheckCircle } from 'lucide-react'
import { colors, layout } from './design'
import { dataFeeds } from './dataFeeds'

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

function FeedTable({ feeds }: { feeds: typeof dataFeeds }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: colors.bgSecondary }}>
            {['Source', 'Category', 'Status', 'Latency', 'Last Message', 'Error Rate'].map((h) => (
              <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: `1px solid ${colors.border}`, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {feeds.map((feed, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${colors.border}` }}>
              <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textPrimary, fontWeight: 500, whiteSpace: 'nowrap' }}>{feed.name}</td>
              <td style={{ padding: '10px 12px', color: colors.textSecondary, whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{feed.category}</td>
              <td style={{ padding: '10px 12px' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: feed.status === 'CONNECTED' ? colors.green : feed.status === 'DEGRADED' ? colors.orange : colors.red, padding: '3px 10px', background: `${feed.status === 'CONNECTED' ? colors.green : feed.status === 'DEGRADED' ? colors.orange : colors.red}15`, borderRadius: 6, fontWeight: 500 }}>
                  {feed.status}
                </span>
              </td>
              <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textSecondary, whiteSpace: 'nowrap' }}>{feed.latency}</td>
              <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: colors.textMuted, whiteSpace: 'nowrap' }}>{feed.lastMessage}</td>
              <td style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: feed.errorRate === '0.00%' ? colors.green : colors.orange, whiteSpace: 'nowrap' }}>{feed.errorRate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function DataFeedsTab() {
  const researchFeeds = dataFeeds.filter((f) => f.category === 'research')
  const hotPathFeeds = dataFeeds.filter((f) => f.category === 'hotpath')
  const executionFeeds = dataFeeds.filter((f) => f.category === 'execution')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Database size={16} color={colors.blue} strokeWidth={2} />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>Data Feeds</h2>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { category: 'Research', active: 4, total: 5 },
          { category: 'Hot-Path', active: 4, total: 4 },
          { category: 'Execution', active: 2, total: 2 },
        ].map((cat) => (
          <div key={cat.category} style={{ background: colors.bgPanel, border: `1px solid ${colors.border}`, borderRadius: layout.cardRadius, padding: 18 }}>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px 0' }}>{cat.category}</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 24, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>{cat.active}</p>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.textMuted, margin: 0 }}>/{cat.total}</p>
            </div>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.green, margin: '4px 0 0 0' }}>{cat.active === cat.total ? 'All Healthy' : `${cat.total - cat.active} Degraded`}</p>
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
