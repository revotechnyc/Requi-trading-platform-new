import { Shield, Lock, AlertTriangle } from 'lucide-react'
import { colors, layout } from './design'
import { riskConfig, positionAuthority } from './autonomous.config'

function Card({ title, icon: Icon, children, accent }: { title: string; icon: React.ElementType; children: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      background: colors.bgPanel,
      border: `1px solid ${accent ? accent + '30' : colors.border}`,
      borderRadius: layout.cardRadius,
      overflow: 'hidden',
    }}>
      <div style={{ padding: 20, borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon size={16} color={accent || colors.blue} strokeWidth={2} />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>{title}</h2>
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

function RiskRow({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${colors.border}` }}>
      <span style={{ fontSize: 13, color: warning ? colors.orange : colors.textSecondary }}>{label}</span>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: warning ? colors.orange : colors.textPrimary, fontWeight: warning ? 600 : 400 }}>{value}</span>
    </div>
  )
}

export default function RiskTab() {
  const dailyUsed = riskConfig.maxDailyLoss - riskConfig.remainingDailyRisk
  const dailyPct = (dailyUsed / riskConfig.maxDailyLoss) * 100

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Shield size={16} color={colors.blue} strokeWidth={2} />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>Risk Management</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
        {/* Live Risk Controls */}
        <Card title='Live Risk Controls' icon={Shield}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <RiskRow label='Current Equity' value={`$${riskConfig.currentEquity.toLocaleString()}`} />
            <RiskRow label='Max Daily Loss' value={`$${riskConfig.maxDailyLoss.toLocaleString()}`} />
            <RiskRow label='Remaining Daily Risk' value={`$${riskConfig.remainingDailyRisk.toLocaleString()}`} warning={dailyPct > 50} />
            <RiskRow label='Max Event Risk' value={`$${riskConfig.maxEventRisk.toLocaleString()}`} />
            <RiskRow label='Current Event Exposure' value={`$${riskConfig.currentEventExposure.toLocaleString()}`} warning={riskConfig.currentEventExposure > riskConfig.maxEventRisk * 0.8} />
            <RiskRow label='Single-Name Exposure' value={`$${riskConfig.singleNameExposure.toLocaleString()}`} />
            <RiskRow label='Sector Exposure' value={`$${riskConfig.sectorExposure.toLocaleString()}`} />
            <RiskRow label='Correlated Exposure' value={`$${riskConfig.correlatedExposure.toLocaleString()}`} />
            <RiskRow label='Gross Exposure' value={`$${riskConfig.grossExposure.toLocaleString()}`} />
            <RiskRow label='Net Exposure' value={`$${riskConfig.netExposure.toLocaleString()}`} />
            <RiskRow label='Open Orders Exposure' value={`$${riskConfig.openOrdersExposure.toLocaleString()}`} />
            <RiskRow label='Gap Exposure' value={`$${riskConfig.gapExposure.toLocaleString()}`} warning />
            <RiskRow label='Authorized Qty' value={riskConfig.authorizedQty.toString()} />
            <RiskRow label='Current Qty' value={riskConfig.currentQty.toString()} />
            <RiskRow label='Remaining Authority' value={riskConfig.remainingAuthority.toString()} warning={riskConfig.remainingAuthority === 0} />
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, textTransform: 'uppercase' }}>Daily Risk Consumed</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: dailyPct > 75 ? colors.red : dailyPct > 50 ? colors.orange : colors.green, fontWeight: 600 }}>{dailyPct.toFixed(1)}%</span>
            </div>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${dailyPct}%`, height: '100%', background: dailyPct > 75 ? colors.red : dailyPct > 50 ? colors.orange : colors.green, borderRadius: 4, transition: 'width 300ms ease' }} />
            </div>
          </div>
        </Card>

        {/* Position Authority */}
        <Card title='Position Authority Panel' icon={Lock} accent={colors.orange}>
          <p style={{ fontSize: 12, color: colors.textMuted, margin: '0 0 16px 0', lineHeight: 1.6 }}>
            Pre-computed allocation ceiling for each event. Signal strength cannot increase quantity beyond AUTHORIZED_QUANTITY.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Account Equity', value: `$${positionAuthority.accountEquity.toLocaleString()}` },
              { label: 'Default Allocation Ceiling', value: `${(positionAuthority.defaultAllocationCeiling * 100).toFixed(1)}%` },
              { label: 'Strategy Allocation Ceiling', value: `${(positionAuthority.strategyAllocationCeiling * 100).toFixed(1)}%` },
              { label: 'Volatility Adjustment', value: `${(positionAuthority.volatilityAdjustment * 100).toFixed(1)}%` },
              { label: 'Liquidity Adjustment', value: `${(positionAuthority.liquidityAdjustment * 100).toFixed(1)}%` },
              { label: 'Spread Adjustment', value: `${(positionAuthority.spreadAdjustment * 100).toFixed(1)}%` },
              { label: 'Gap Risk Adjustment', value: `${(positionAuthority.gapRiskAdjustment * 100).toFixed(1)}%` },
              { label: 'Whole-Share Adjustment', value: `${(positionAuthority.wholeShareAdjustment * 100).toFixed(1)}%` },
              { label: 'Authorized Quantity', value: positionAuthority.authorizedQty.toString(), highlight: true },
              { label: 'Maximum Capital', value: `$${positionAuthority.maxCapital.toFixed(2)}` },
              { label: 'Maximum Loss', value: `$${positionAuthority.maxLoss.toFixed(2)}` },
            ].map((item) => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: item.highlight ? `${colors.blue}08` : colors.bgSecondary, borderRadius: layout.cardRadiusSmall, border: item.highlight ? `1px solid ${colors.blue}20` : 'none' }}>
                <span style={{ fontSize: 12, color: colors.textSecondary }}>{item.label}</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: item.highlight ? colors.blue : colors.textPrimary, fontWeight: item.highlight ? 600 : 400 }}>{item.value}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, padding: 12, background: `${colors.red}08`, borderRadius: layout.cardRadiusSmall, border: `1px solid ${colors.red}15`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} color={colors.red} />
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.red, fontWeight: 600 }}>HARD INVARIANT: Signal strength cannot increase quantity beyond AUTHORIZED_QUANTITY.</span>
          </div>
        </Card>
      </div>
    </div>
  )
}
