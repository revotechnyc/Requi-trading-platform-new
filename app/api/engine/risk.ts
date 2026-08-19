/**
 * RISK ENGINE — position sizing (module 6 core, shared by live + backtest).
 *
 * Rules (constitutional):
 *   - Share size comes FROM (entry − stop), never the other way around:
 *       qty = (equity × risk%) / (entry − stop)
 *   - Per-trade risk ≤ max_risk_pct of account (0.5% ceiling via governance)
 *   - Single position ≤ max_position_pct of account (25%)
 *   - The most restrictive constraint wins — never conviction.
 */

export interface SizeResult {
  qty: number;
  perShareRisk: number;
  dollarRisk: number;
  positionValue: number;
  cappedBy: "risk" | "position_cap" | "zero";
}

export function sizePosition(input: {
  accountEquity: number;
  entry: number;
  stop: number;
  maxRiskPct: number;
  maxPositionPct: number;
}): SizeResult {
  const { accountEquity, entry, stop, maxRiskPct, maxPositionPct } = input;
  const perShareRisk = entry - stop;
  if (perShareRisk <= 0 || accountEquity <= 0) {
    return { qty: 0, perShareRisk: Math.max(perShareRisk, 0), dollarRisk: 0, positionValue: 0, cappedBy: "zero" };
  }
  const riskDollars = accountEquity * (maxRiskPct / 100);
  const qtyByRisk = riskDollars / perShareRisk;
  const capDollars = accountEquity * (maxPositionPct / 100);
  const qtyByCap = capDollars / entry;

  const cappedBy = qtyByRisk <= qtyByCap ? "risk" : "position_cap";
  const qty = Math.floor(Math.min(qtyByRisk, qtyByCap));
  return {
    qty,
    perShareRisk: +perShareRisk.toFixed(4),
    dollarRisk: +(qty * perShareRisk).toFixed(2),
    positionValue: +(qty * entry).toFixed(2),
    cappedBy: qty === 0 ? "zero" : cappedBy,
  };
}

/** Daily loss-limit check: halt new proposals at −3% (constitutional). */
export function dailyLossHalt(realizedPnlToday: number, accountEquity: number, limitPct = 3): boolean {
  if (accountEquity <= 0) return true;
  return realizedPnlToday <= -(accountEquity * (limitPct / 100));
}

/** Chase-cancel: if price ran more than `chaseLimitPct` past trigger before fill, cancel. */
export function chaseExceeded(triggerPrice: number, currentPrice: number, chaseLimitPct = 3): boolean {
  return ((currentPrice - triggerPrice) / triggerPrice) * 100 > chaseLimitPct;
}

/* ---------- Strategy Specification v1.0 §4 global risk limits ---------- */

export const GLOBAL_RISK = {
  /** default per-position risk, percent of equity */
  defaultPositionRiskPct: 0.5,
  /** absolute per-position risk cap — never exceeded, even by config */
  hardPositionRiskCapPct: 1.0,
  /** total open risk across all positions (portfolio heat), percent of equity */
  portfolioHeatMaxPct: 10,
  /** max allowed pairwise correlation between a candidate and open positions */
  maxPairwiseCorrelation: 0.7,
  /** minimum liquidity score to trade */
  liquidityScoreMin: 0.5,
  /** maximum VPIN (flow toxicity) to trade */
  vpinMax: 0.7,
  /** drawdown brake: reduce/halve size beyond this account drawdown, percent */
  drawdownBrakePct: 10,
} as const;

/**
 * PORTFOLIO HEAT (§3 gate 10): total open risk dollars as a percent of
 * equity. Open risk = Σ qty × (mark − stop) floored at 0 for each protected
 * position, plus Σ qty × (entry − stop) for positions still at full risk.
 * Callers pass pre-computed per-position open-risk dollars.
 */
export function portfolioHeatPct(openRiskDollars: number[], accountEquity: number): number {
  if (accountEquity <= 0) return 100;
  const total = openRiskDollars.reduce((a, x) => a + Math.max(x, 0), 0);
  return +((total / accountEquity) * 100).toFixed(2);
}

/**
 * Pairwise return correlation between two bar series (aligned by their last
 * N closes). Deterministic; returns null when either series is too short —
 * callers treat null as "cannot verify → reject" per §5 data-failure rules.
 */
export function returnCorrelation(aCloses: number[], bCloses: number[], window = 30): number | null {
  const n = Math.min(aCloses.length, bCloses.length, window + 1);
  if (n < window / 2) return null;
  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < n; i++) {
    const pa = aCloses[aCloses.length - n + i - 1], ca = aCloses[aCloses.length - n + i];
    const pb = bCloses[bCloses.length - n + i - 1], cb = bCloses[bCloses.length - n + i];
    if (pa > 0 && pb > 0) { ra.push(ca / pa - 1); rb.push(cb / pb - 1); }
  }
  if (ra.length < 5) return null;
  const ma = ra.reduce((s, x) => s + x, 0) / ra.length;
  const mb = rb.reduce((s, x) => s + x, 0) / rb.length;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < ra.length; i++) {
    cov += (ra[i] - ma) * (rb[i] - mb);
    va += (ra[i] - ma) ** 2;
    vb += (rb[i] - mb) ** 2;
  }
  if (va === 0 || vb === 0) return 0; // a series that never moves cannot co-move
  return +(cov / Math.sqrt(va * vb)).toFixed(4);
}
