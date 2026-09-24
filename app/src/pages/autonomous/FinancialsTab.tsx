import { DollarSign, TrendingUp, BarChart3, Target } from 'lucide-react'
import { colors, layout } from './design'
import {
  engineConfig, winsPerOrder, strategyPerformance, tickerPerformance,
  sectorPerformance, regimePerformance, rpersPerformance, earningsBreakdown,
  orderFinancials
} from './autonomous.config'
import EquityCurveChart from './charts/EquityCurveChart'
import PnLChart from './charts/PnLChart'
import DrawdownChart from './charts/DrawdownChart'
import { generateEquityCurveData, generatePnLData, generateDrawdownData } from './charts/chartData'

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

function DataTable({ headers, rows, keyFn }: { headers: string[]; rows: (string | number | null)[][]; keyFn: (row: (string | number | null)[], i: number) => string }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: colors.bgSecondary }}>
            {headers.map((h) => (
              <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: `1px solid ${colors.border}`, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={keyFn(row, i)} style={{ borderBottom: `1px solid ${colors.border}` }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', color: typeof cell === 'number' && cell < 0 ? colors.red : typeof cell === 'number' && cell > 0 ? colors.green : colors.textSecondary, whiteSpace: 'nowrap' }}>{cell ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function FinancialsTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <DollarSign size={16} color={colors.blue} strokeWidth={2} />
        <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.textPrimary, margin: 0 }}>Financials</h2>
      </div>

      {/* Account Summary */}
      <Card title='Account Summary' icon={DollarSign}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          <StatBox label='Starting Equity' value={`$${engineConfig.startingEquity.toLocaleString()}`} />
          <StatBox label='Current Equity' value={`$${engineConfig.equity.toLocaleString()}`} />
          <StatBox label='Cash' value={`$${(engineConfig.equity - 19770.50).toLocaleString()}`} />
          <StatBox label='Buying Power' value={`$${engineConfig.buyingPower.toLocaleString()}`} color={colors.blue} />
          <StatBox label='Gross Exposure' value='$19,770.50' />
          <StatBox label='Net Exposure' value='$19,770.50' />
          <StatBox label='Realized P&L' value='$8,240.50' color={colors.green} />
          <StatBox label='Unrealized P&L' value='$675.30' color={colors.green} />
          <StatBox label='Total P&L' value='$8,915.80' color={colors.green} />
          <StatBox label='Daily Return' value={`+${engineConfig.dailyReturnPct}%`} color={colors.green} />
          <StatBox label='Weekly Return' value='+1.85%' color={colors.green} />
          <StatBox label='Monthly Return' value='+3.42%' color={colors.green} />
          <StatBox label='YTD Return' value='+13.90%' color={colors.green} />
        </div>
      </Card>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card title='Equity Curve' icon={TrendingUp}>
          <EquityCurveChart data={generateEquityCurveData()} height={220} />
        </Card>
        <Card title='Daily P&L' icon={BarChart3}>
          <PnLChart data={generatePnLData()} height={220} />
        </Card>
      </div>

      <Card title='Drawdown' icon={Target}>
        <DrawdownChart data={generateDrawdownData()} height={160} />
      </Card>

      {/* Order-Level Financials */}
      <Card title='Order-Level Financials' icon={BarChart3}>
        <DataTable
          headers={['Order', 'Ticker', 'Strategy', 'Event', 'Entry', 'Exit', 'Entry $', 'Exit $', 'Qty', 'Gross', 'Fees', 'Slip', 'Net', 'Ret%', 'MFE', 'MAE', 'Hold', 'Out']}
          rows={orderFinancials.map((o) => [
            o.orderId, o.ticker, o.strategy, o.event, o.entryTime, o.exitTime,
            o.entryPrice, o.exitPrice, o.qty, `$${o.grossPnl.toFixed(2)}`, `$${o.fees.toFixed(2)}`,
            `$${o.slippage.toFixed(2)}`, `$${o.netPnl.toFixed(2)}`, `${o.returnPct > 0 ? '+' : ''}${o.returnPct}%`,
            o.mfe, o.mae, o.holdPeriod, o.outcome,
          ])}
          keyFn={(row) => row[0] as string}
        />
      </Card>

      {/* Wins Per Order */}
      <Card title='Wins Per Order' icon={Target}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          <StatBox label='Total Orders' value={winsPerOrder.totalOrders.toString()} />
          <StatBox label='Winning Orders' value={winsPerOrder.winningOrders.toString()} color={colors.green} />
          <StatBox label='Losing Orders' value={winsPerOrder.losingOrders.toString()} color={colors.red} />
          <StatBox label='Win Rate' value={`${winsPerOrder.winRate}%`} color={colors.green} />
          <StatBox label='Avg Win' value={`$${winsPerOrder.averageWin.toFixed(2)}`} color={colors.green} />
          <StatBox label='Avg Loss' value={`-$${Math.abs(winsPerOrder.averageLoss).toFixed(2)}`} color={colors.red} />
          <StatBox label='Largest Win' value={`$${winsPerOrder.largestWin.toFixed(2)}`} color={colors.green} />
          <StatBox label='Largest Loss' value={`-$${Math.abs(winsPerOrder.largestLoss).toFixed(2)}`} color={colors.red} />
          <StatBox label='Median Win' value={`$${winsPerOrder.medianWin.toFixed(2)}`} color={colors.green} />
          <StatBox label='Median Loss' value={`-$${Math.abs(winsPerOrder.medianLoss).toFixed(2)}`} color={colors.red} />
          <StatBox label='W/L Ratio' value={winsPerOrder.winLossRatio.toFixed(2)} color={colors.green} />
          <StatBox label='Profit Factor' value={winsPerOrder.profitFactor.toFixed(2)} color={colors.green} />
          <StatBox label='Expectancy' value={`$${winsPerOrder.expectancyPerOrder.toFixed(2)}`} color={colors.green} />
        </div>
      </Card>

      {/* Earnings Breakdown */}
      <Card title='Earnings Strategy Performance' icon={TrendingUp}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
          <StatBox label='Total Trades' value={earningsBreakdown.totalTrades.toString()} />
          <StatBox label='+Reaction' value={earningsBreakdown.positiveReaction.toString()} color={colors.green} />
          <StatBox label='-Reaction' value={earningsBreakdown.negativeReaction.toString()} color={colors.red} />
          <StatBox label='Correct Pred' value={earningsBreakdown.correctPredictions.toString()} color={colors.green} />
          <StatBox label='Incorrect Pred' value={earningsBreakdown.incorrectPredictions.toString()} color={colors.red} />
          <StatBox label='Reaction Acc' value={`${earningsBreakdown.reactionAccuracy}%`} color={colors.orange} />
          <StatBox label='Gap Acc' value={`${earningsBreakdown.gapAccuracy}%`} color={colors.orange} />
          <StatBox label='Avg Gap' value={`${earningsBreakdown.avgGapCaptured}%`} />
          <StatBox label='Avg Profit/Event' value={`$${earningsBreakdown.avgProfitPerEvent.toFixed(2)}`} color={colors.green} />
          <StatBox label='Avg Loss/Event' value={`-$${Math.abs(earningsBreakdown.avgLossPerEvent).toFixed(2)}`} color={colors.red} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ padding: 14, background: `${colors.green}08`, borderRadius: layout.cardRadiusSmall, border: `1px solid ${colors.green}12` }}>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, margin: '0 0 4px 0' }}>BEAT + POSITIVE REACTION</p>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 20, fontWeight: 600, color: colors.green, margin: 0 }}>{earningsBreakdown.beatPositive}</p>
          </div>
          <div style={{ padding: 14, background: `${colors.red}08`, borderRadius: layout.cardRadiusSmall, border: `1px solid ${colors.red}12` }}>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, margin: '0 0 4px 0' }}>BEAT + NEGATIVE REACTION</p>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 20, fontWeight: 600, color: colors.red, margin: 0 }}>{earningsBreakdown.beatNegative}</p>
          </div>
          <div style={{ padding: 14, background: `${colors.orange}08`, borderRadius: layout.cardRadiusSmall, border: `1px solid ${colors.orange}12` }}>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, margin: '0 0 4px 0' }}>MISS + POSITIVE REACTION</p>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 20, fontWeight: 600, color: colors.orange, margin: 0 }}>{earningsBreakdown.missPositive}</p>
          </div>
          <div style={{ padding: 14, background: 'rgba(142,142,147,0.06)', borderRadius: layout.cardRadiusSmall, border: '1px solid rgba(142,142,147,0.12)' }}>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: colors.textMuted, margin: '0 0 4px 0' }}>MISS + NEGATIVE REACTION</p>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 20, fontWeight: 600, color: colors.textSecondary, margin: 0 }}>{earningsBreakdown.missNegative}</p>
          </div>
        </div>
      </Card>

      {/* Performance by Strategy */}
      <Card title='Performance by Strategy' icon={TrendingUp}>
        <DataTable
          headers={['Strategy', 'Trades', 'Win%', 'Avg Ret%', 'Net P&L', 'P.Fact', 'MDD%', 'Sharpe', 'Avg Hold']}
          rows={strategyPerformance.map((s) => [
            s.strategy, s.trades, `${s.winRate}%`, `${s.avgReturn}%`, `$${s.netPnl.toFixed(2)}`,
            s.profitFactor.toFixed(2), `${s.mdd}%`, s.sharpe.toFixed(2), s.avgHold,
          ])}
          keyFn={(row) => row[0] as string}
        />
      </Card>

      {/* Performance by Ticker */}
      <Card title='Performance by Ticker' icon={BarChart3}>
        <DataTable
          headers={['Ticker', 'Trades', 'Wins', 'Losses', 'Win%', 'Gross P&L', 'Net P&L', 'Avg Trade', 'Best', 'Worst']}
          rows={tickerPerformance.map((t) => [
            t.ticker, t.trades, t.wins, t.losses, `${t.winRate}%`, `$${t.grossPnl.toFixed(2)}`,
            `$${t.netPnl.toFixed(2)}`, `$${t.avgTrade.toFixed(2)}`, `$${t.bestTrade.toFixed(2)}`, `$${t.worstTrade.toFixed(2)}`,
          ])}
          keyFn={(row) => row[0] as string}
        />
      </Card>

      {/* Performance by Sector */}
      <Card title='Performance by Sector' icon={BarChart3}>
        <DataTable
          headers={['Sector', 'Trades', 'Win%', 'Net P&L', 'Avg Gap%', 'Avg MFE', 'Avg MAE']}
          rows={sectorPerformance.map((s) => [
            s.sector, s.trades, `${s.winRate}%`, `$${s.pnl.toFixed(2)}`, `${s.avgGap}%`, s.avgMfe, s.avgMae,
          ])}
          keyFn={(row) => row[0] as string}
        />
      </Card>

      {/* Performance by Regime */}
      <Card title='Performance by Market Regime' icon={Target}>
        <DataTable
          headers={['Regime', 'Trades', 'Win%', 'Avg P&L', 'Avg Gap%', 'False Pos%']}
          rows={regimePerformance.map((r) => [
            r.regime, r.trades, `${r.winRate}%`, `$${r.avgPnl.toFixed(2)}`, `${r.avgGap}%`, `${r.falsePositiveRate}%`,
          ])}
          keyFn={(row) => row[0] as string}
        />
      </Card>

      {/* Performance by RPERS */}
      <Card title='Performance by RPERS Bucket' icon={Target}>
        <DataTable
          headers={['Bucket', 'Pred%', 'Realized%', 'Trades', 'Avg P&L', 'Avg Gap%', 'MFE', 'MAE', 'Cal Error']}
          rows={rpersPerformance.map((r) => [
            r.bucket, `${r.predictedProb}%`, `${r.realizedRate}%`, r.trades, `$${r.avgPnl.toFixed(2)}`,
            `${r.avgGap}%`, r.mfe, r.mae, `${r.calibrationError}%`,
          ])}
          keyFn={(row) => row[0] as string}
        />
      </Card>
    </div>
  )
}
