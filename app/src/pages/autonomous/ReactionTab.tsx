import { Zap, BarChart3, Eye, Activity } from 'lucide-react'
import { colors, layout } from './design'
import { preEventMetrics, fisBreakdown, reactionMetrics } from './autonomous.config'

function Card({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      background: colors.bgPanel,
      border: `1px solid ${accent ? accent + '40' : colors.border}`,
      borderRadius: layout.cardRadius,
      overflow: 'hidden',
    }}>
      {children}
    </div>
  )
}

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 0 }}>
      <Icon size={16} color={colors.blue} strokeWidth={2} />
      <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>{title}</h2>
    </div>
  )
}

function MetricRow({ label, value, unit, highlight }: { label: string; value: string | number; unit?: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${colors.border}` }}>
      <span style={{ fontSize: 13, color: colors.textSecondary }}>{label}</span>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: highlight ? colors.green : colors.textPrimary, fontWeight: highlight ? 600 : 400 }}>
        {value}{unit ? ` ${unit}` : ''}
      </span>
    </div>
  )
}

function ReactionMetric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: colors.bgSecondary, borderRadius: layout.cardRadiusSmall, padding: '12px 14px' }}>
      <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em', margin: '0 0 4px 0' }}>{label}</p>
      <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 15, fontWeight: 500, color: color || colors.textPrimary, margin: 0, letterSpacing: '-0.01em' }}>{value}</p>
    </div>
  )
}

export default function ReactionTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        {/* PRE-EVENT RESEARCH */}
        <Card>
          <div style={{ padding: 20, borderBottom: `1px solid ${colors.border}` }}>
            <SectionHeader icon={Eye} title='Pre-Event Research' />
          </div>
          <div style={{ padding: 20 }}>
            <MetricRow label='Beat Probability' value={preEventMetrics.beatProbability} unit='%' highlight />
            <MetricRow label='RPERS' value={preEventMetrics.rpers} highlight />
            <MetricRow label='Expectation Burden' value={preEventMetrics.expectationBurden} />
            <MetricRow label='Historical +Gap Rate' value={preEventMetrics.historicalPositiveGapRate} unit='%' />
            <MetricRow label='Beat-But-Sell Rate' value={preEventMetrics.beatButSellRate} unit='%' />
            <MetricRow label='Implied Move' value={preEventMetrics.impliedMove} unit='%' highlight />
            <MetricRow label='Pre-5D Return' value={preEventMetrics.pre5d} unit='%' />
            <MetricRow label='Pre-10D Return' value={preEventMetrics.pre10d} unit='%' />
            <MetricRow label='Pre-20D Return' value={preEventMetrics.pre20d} unit='%' />
            <MetricRow label='Valuation State' value={preEventMetrics.valuationState} />
            <MetricRow label='Peer Regime' value={preEventMetrics.peerRegime} />
            <MetricRow label='Sector Regime' value={preEventMetrics.sectorRegime} />
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, margin: '12px 0 0 0', fontStyle: 'italic' }}>RESEARCH / STRATEGY-CONTRACT PARAMETERS</p>
          </div>
        </Card>

        {/* FIS */}
        <Card accent={colors.blue}>
          <div style={{ padding: 20, borderBottom: `1px solid ${colors.border}` }}>
            <SectionHeader icon={BarChart3} title='Fundamental Information Surplus' />
          </div>
          <div style={{ padding: 20 }}>
            <MetricRow label='EPS Surprise' value={`+${fisBreakdown.epsSurprise}`} unit='%' highlight />
            <MetricRow label='Revenue Surprise' value={`+${fisBreakdown.revenueSurprise}`} unit='%' highlight />
            <MetricRow label='Guidance Surprise' value={`+${fisBreakdown.guidanceSurprise}`} unit='%' highlight />
            <MetricRow label='KPI Surprise' value={`+${fisBreakdown.kpiSurprise}`} unit='%' />
            <MetricRow label='Surprise Acceleration' value={`+${fisBreakdown.surpriseAcceleration}`} unit='x' />
            <MetricRow label='Expectation Burden' value={fisBreakdown.expectationBurden} />
            <div style={{ marginTop: 16, padding: 16, background: `${colors.blue}12`, borderRadius: layout.cardRadiusSmall, border: `1px solid ${colors.blue}25` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: colors.textSecondary }}>FIS TOTAL</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 32, fontWeight: 600, color: colors.blue }}>{fisBreakdown.fis}</span>
              </div>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: colors.textMuted, margin: '4px 0 0 0' }}>
                Threshold: 2.0 | Status: <span style={{ color: colors.green, fontWeight: 600 }}>QUALIFIED</span>
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* REAL-TIME REACTION */}
      <Card accent={colors.green}>
        <div style={{ padding: 20, borderBottom: `1px solid ${colors.border}` }}>
          <SectionHeader icon={Activity} title='Real-Time Reaction Confirmation' />
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <ReactionMetric label='Price Change' value={`${reactionMetrics.priceChange}%`} color={colors.green} />
            <ReactionMetric label='Price Velocity' value={`${reactionMetrics.priceVelocity}%/s`} color={colors.green} />
            <ReactionMetric label='Price Acceleration' value={`${reactionMetrics.priceAcceleration}%/s²`} color={colors.orange} />
            <ReactionMetric label='Volume/sec' value={reactionMetrics.volumePerSec.toLocaleString()} color={colors.green} />
            <ReactionMetric label='$ Volume/sec' value={`$${(reactionMetrics.dollarVolumePerSec / 1e6).toFixed(2)}M`} color={colors.green} />
            <ReactionMetric label='Rel. Vol Velocity' value={`${reactionMetrics.relativeVolumeVelocity}x`} color={colors.green} />
            <ReactionMetric label='Trades/sec' value={reactionMetrics.tradeCountPerSec.toString()} color={colors.green} />
            <ReactionMetric label='Buy/Sell Imbalance' value={`${reactionMetrics.buySellImbalance}%`} color={colors.green} />
            <ReactionMetric label='Bid/Ask Imbalance' value={`${reactionMetrics.bidAskImbalance}%`} color={colors.green} />
            <ReactionMetric label='Spread' value={reactionMetrics.spread.toString()} color={colors.green} />
            <ReactionMetric label='Spread Expansion' value={`+${reactionMetrics.spreadExpansion}`} color={colors.orange} />
            <ReactionMetric label='Event VWAP' value={`$${reactionMetrics.eventVwap}`} color={colors.textSecondary} />
            <ReactionMetric label='Dist from VWAP' value={`${reactionMetrics.distanceFromVwap}%`} color={colors.green} />
            <ReactionMetric label='High-Water Mark' value={`$${reactionMetrics.highWaterMark}`} color={colors.green} />
            <ReactionMetric label='Drawdown from HWM' value={`${reactionMetrics.drawdownFromHwm}%`} color={colors.orange} />
            <ReactionMetric label='Large Print Freq' value={`${reactionMetrics.largePrintFrequency}/min`} color={colors.orange} />
            <ReactionMetric label='Depth Imbalance' value={`${reactionMetrics.depthImbalance}%`} color={colors.green} />
          </div>
          <div style={{ marginTop: 20, padding: 20, background: `${colors.green}08`, borderRadius: layout.cardRadius, border: `1px solid ${colors.green}20`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, margin: '0 0 6px 0', textTransform: 'uppercase' }}>Reaction Confirmation Score</p>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 36, fontWeight: 600, color: colors.green, margin: 0, letterSpacing: '-0.02em' }}>{reactionMetrics.rcs.toFixed(2)}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, margin: '0 0 6px 0', textTransform: 'uppercase' }}>Status</p>
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 16, fontWeight: 600, color: colors.green, margin: 0 }}>{reactionMetrics.status}</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
