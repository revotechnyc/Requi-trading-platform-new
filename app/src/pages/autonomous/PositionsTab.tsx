import { TrendingUp } from 'lucide-react'
import { colors, layout } from './design'
import { positions } from './autonomous.config'
import { protectionStates } from './apma.config'

function getProtectionColor(state: string) {
  const ps = protectionStates.find((p) => p.label === state)
  return ps ? ps.color : '#8E8E93'
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: colors.bgPanel, border: `1px solid ${colors.border}`, borderRadius: layout.cardRadius, overflow: 'hidden' }}>
      {children}
    </div>
  )
}

export default function PositionsTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <TrendingUp size={16} color={colors.blue} strokeWidth={2} />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>Open Positions</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16 }}>
        {positions.map((pos) => {
          const protectionColor = getProtectionColor(pos.protectionState)
          return (
            <Card key={pos.ticker}>
              <div style={{ padding: 20, borderBottom: `1px solid ${colors.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h3 style={{ fontSize: 20, fontWeight: 600, color: colors.textPrimary, margin: 0, letterSpacing: '-0.02em' }}>{pos.ticker}</h3>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, padding: '3px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>{pos.strategy}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: protectionColor, padding: '3px 10px', background: `${protectionColor}15`, borderRadius: 6, border: `1px solid ${protectionColor}30` }}>
                      {pos.protectionState.replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.blue, padding: '3px 10px', background: `${colors.blue}10`, borderRadius: 6 }}>
                      APMA: {pos.apmaState}
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ padding: 20 }}>
                {/* P&L Row */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <div style={{ flex: 1, padding: 14, background: pos.unrealizedPnl >= 0 ? `${colors.green}08` : `${colors.red}08`, borderRadius: layout.cardRadiusSmall, border: `1px solid ${pos.unrealizedPnl >= 0 ? `${colors.green}18` : `${colors.red}18`}` }}>
                    <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', margin: '0 0 6px 0' }}>Unrealized P&L</p>
                    <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 28, fontWeight: 600, color: pos.unrealizedPnl >= 0 ? colors.green : colors.red, margin: 0, letterSpacing: '-0.02em' }}>
                      {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                    </p>
                    <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: pos.unrealizedPct >= 0 ? colors.green : colors.red, margin: '4px 0 0 0' }}>
                      {pos.unrealizedPct >= 0 ? '+' : ''}{pos.unrealizedPct.toFixed(2)}%
                    </p>
                  </div>
                  <div style={{ flex: 1, padding: 14, background: colors.bgSecondary, borderRadius: layout.cardRadiusSmall }}>
                    <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', margin: '0 0 6px 0' }}>Market Value</p>
                    <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 28, fontWeight: 600, color: colors.textPrimary, margin: 0, letterSpacing: '-0.02em' }}>${pos.marketValue.toLocaleString()}</p>
                  </div>
                </div>
                {/* Detail Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                  {[
                    { label: 'Entry Time', value: pos.entryTime },
                    { label: 'Quantity', value: pos.qty },
                    { label: 'Avg Fill', value: `$${pos.avgFill}` },
                    { label: 'Current', value: `$${pos.currentPrice}` },
                    { label: 'High-Water', value: `$${pos.highWaterPrice}` },
                    { label: 'Max Profit', value: `$${pos.maxProfit.toFixed(2)}` },
                    { label: 'Max Drawdown', value: `$${pos.maxDrawdown.toFixed(2)}` },
                    { label: 'Realized P&L', value: `$${pos.realizedPnl.toFixed(2)}` },
                    { label: 'Authorized Qty', value: pos.authorizedQty },
                    { label: 'Remaining Qty', value: pos.remainingQty },
                  ].map((item) => (
                    <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${colors.border}` }}>
                      <span style={{ fontSize: 12, color: colors.textMuted }}>{item.label}</span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.textSecondary }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
