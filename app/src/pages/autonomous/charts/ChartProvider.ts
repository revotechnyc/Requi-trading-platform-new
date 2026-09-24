// ChartProvider Interface — Abstraction layer for charting libraries
// Supports TradingView Lightweight Charts (default) with upgrade path to Advanced Charts

export interface ChartBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  vwap?: number;
  tradeCount?: number;
  session?: string;
}

export interface ChartMarker {
  time: number;
  position: 'aboveBar' | 'belowBar' | 'inBar';
  color: string;
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  text?: string;
  size?: number;
}

export interface ChartLine {
  id: string;
  data: { time: number; value: number }[];
  color: string;
  lineWidth: number;
  title?: string;
}

export interface ChartEventOverlay {
  time: number;
  type: string;
  price: number;
  label: string;
  color: string;
}

export type Timeframe = '1s' | '5s' | '15s' | '30s' | '1m' | '2m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';

export interface ChartTheme {
  background: string;
  surface: string;
  grid: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  upColor: string;
  downColor: string;
  wickUp: string;
  wickDown: string;
  border: string;
  crosshair: string;
}

export const REQUI_CHART_THEME: ChartTheme = {
  background: '#FFFFFF',
  surface: '#F8FAFC',
  grid: 'rgba(15, 23, 42, 0.06)',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  accent: '#446EE6',
  upColor: '#0D9488',
  downColor: '#DC2626',
  wickUp: '#0D9488',
  wickDown: '#DC2626',
  border: 'rgba(15, 23, 42, 0.08)',
  crosshair: '#446EE6',
};

export interface ChartProvider {
  initialize(container: HTMLElement): Promise<void>;
  setSymbol(symbol: string): void;
  setTimeframe(tf: Timeframe): void;
  loadHistoricalBars(bars: ChartBar[]): void;
  subscribeRealtime(callback: (bar: ChartBar) => void): () => void;
  setIndicators(indicators: { ema9?: boolean; ema20?: boolean; ema50?: boolean; vwap?: boolean; volume?: boolean }): void;
  addMarker(marker: ChartMarker): string;
  removeMarker(id: string): void;
  addLine(line: ChartLine): string;
  updateLine(id: string, data: { time: number; value: number }[]): void;
  removeLine(id: string): void;
  setPositionOverlay(entry: number, current: number, stop: number, trail?: number): void;
  setProtectionOverlay(protectionFloor: number, trailDistance: number): void;
  setEventOverlay(events: ChartEventOverlay[]): void;
  resize(width: number, height: number): void;
  destroy(): void;
}
