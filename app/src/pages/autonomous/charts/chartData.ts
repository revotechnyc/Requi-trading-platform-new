// Generate chart data from operational config for demo display
import { engineConfig } from '../autonomous.config';

export function generateEquityCurveData(): { time: number; equity: number; pnl?: number; drawdown?: number }[] {
  const points: { time: number; equity: number; drawdown?: number }[] = [];
  let equity = engineConfig.equity;
  const base = Date.now() - 90 * 86400000;
  for (let i = 0; i <= 90; i++) {
    const time = Math.floor((base + i * 86400000) / 1000);
    equity *= 1 + (Math.random() - 0.42) * 0.008;
    const hwm = points.reduce((m, p) => Math.max(m, p.equity), engineConfig.equity);
    const drawdown = ((equity - hwm) / hwm) * 100;
    points.push({ time, equity: Math.round(equity * 100) / 100, drawdown: Math.round(drawdown * 100) / 100 });
  }
  return points;
}

export function generatePnLData(): { time: number; grossPnl: number; netPnl: number; cumulative: number }[] {
  const points: { time: number; grossPnl: number; netPnl: number; cumulative: number }[] = [];
  let cumulative = 0;
  const base = Date.now() - 90 * 86400000;
  for (let i = 0; i < 90; i++) {
    const time = Math.floor((base + i * 86400000) / 1000);
    const gross = (Math.random() - 0.4) * 250;
    const net = gross - Math.abs(gross) * 0.05;
    cumulative += net;
    points.push({ time, grossPnl: Math.round(gross * 100) / 100, netPnl: Math.round(net * 100) / 100, cumulative: Math.round(cumulative * 100) / 100 });
  }
  return points;
}

export function generateDrawdownData(): { time: number; value: number }[] {
  const equity = generateEquityCurveData();
  const hwm = equity.reduce((m, p) => Math.max(m, p.equity), equity[0]?.equity ?? 100000);
  return equity.map(p => ({ time: p.time, value: Math.max(0, ((hwm - p.equity) / hwm) * 100) }));
}

export function generateCandleData(count = 200): { time: number; open: number; high: number; low: number; close: number; volume: number; vwap: number }[] {
  const bars: { time: number; open: number; high: number; low: number; close: number; volume: number; vwap: number }[] = [];
  let price = 150;
  const base = Date.now() - count * 60000;
  for (let i = 0; i < count; i++) {
    const time = Math.floor((base + i * 60000) / 1000);
    const change = (Math.random() - 0.5) * 2;
    const open = price;
    price += change;
    const high = Math.max(open, price) + Math.random() * 0.5;
    const low = Math.min(open, price) - Math.random() * 0.5;
    const close = price;
    const volume = Math.floor(50000 + Math.random() * 200000);
    const vwap = (high + low + close) / 3;
    bars.push({ time, open: Math.round(open * 100) / 100, high: Math.round(high * 100) / 100, low: Math.round(low * 100) / 100, close: Math.round(close * 100) / 100, volume, vwap: Math.round(vwap * 100) / 100 });
  }
  return bars;
}

export function generateMiniChartData(count = 40): { time: number; value: number }[] {
  const points: { time: number; value: number }[] = [];
  let value = 100;
  const base = Date.now() - count * 86400000;
  for (let i = 0; i < count; i++) {
    value *= 1 + (Math.random() - 0.45) * 0.02;
    points.push({ time: Math.floor((base + i * 86400000) / 1000), value: Math.round(value * 100) / 100 });
  }
  return points;
}
