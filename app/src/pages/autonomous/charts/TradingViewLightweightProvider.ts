import type { ChartProvider, ChartBar, ChartMarker, ChartLine, ChartEventOverlay, ChartTheme } from './ChartProvider';
import { REQUI_CHART_THEME } from './ChartProvider';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
  type CandlestickSeriesOptions,
  CrosshairMode,
} from 'lightweight-charts';

export class TradingViewLightweightProvider implements ChartProvider {
  private chart: IChartApi | null = null;
  private candleSeries: ISeriesApi<'Candlestick'> | null = null;
  private volumeSeries: ISeriesApi<'Histogram'> | null = null;
  private vwapSeries: ISeriesApi<'Line'> | null = null;
  private ema9Series: ISeriesApi<'Line'> | null = null;
  private ema20Series: ISeriesApi<'Line'> | null = null;
  private ema50Series: ISeriesApi<'Line'> | null = null;
  private lines = new Map<string, ISeriesApi<'Line'>>();
  private markers: Map<string, number> = new Map();
  private realtimeUnsub?: () => void;
  private theme: ChartTheme;

  constructor(theme: ChartTheme = REQUI_CHART_THEME) {
    this.theme = theme;
  }

  async initialize(container: HTMLElement): Promise<void> {
    this.chart = createChart(container, {
      layout: {
        background: { color: this.theme.background },
        textColor: this.theme.textPrimary,
        fontSize: 11,
        fontFamily: 'Inter, -apple-system, sans-serif',
      },
      grid: {
        vertLines: { color: this.theme.grid, style: 2 },
        horzLines: { color: this.theme.grid, style: 2 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: this.theme.crosshair, labelBackgroundColor: this.theme.accent },
        horzLine: { color: this.theme.crosshair, labelBackgroundColor: this.theme.accent },
      },
      rightPriceScale: {
        borderColor: this.theme.border,
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: this.theme.border,
        timeVisible: true,
        secondsVisible: true,
      },
      handleScroll: { vertTouchDrag: false },
    });

    this.candleSeries = this.chart.addSeries(CandlestickSeries, {
      upColor: this.theme.upColor,
      downColor: this.theme.downColor,
      wickUpColor: this.theme.wickUp,
      wickDownColor: this.theme.wickDown,
      borderUpColor: this.theme.upColor,
      borderDownColor: this.theme.downColor,
    });
  }

  setSymbol(symbol: string): void {
    // Symbol label can be shown in overlay if needed
  }

  setTimeframe(tf: string): void {
    // Timeframe is handled by data loading
  }

  loadHistoricalBars(bars: ChartBar[]): void {
    if (!this.candleSeries) return;
    const data: CandlestickData[] = bars.map(b => ({
      time: (b.timestamp / 1000) as Time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
    this.candleSeries.setData(data);
    if (this.chart) this.chart.timeScale().fitContent();
  }

  subscribeRealtime(callback: (bar: ChartBar) => void): () => void {
    // In production: connect to WebSocket/Massive
    this.realtimeUnsub = () => {};
    return this.realtimeUnsub;
  }

  setIndicators(indicators: { ema9?: boolean; ema20?: boolean; ema50?: boolean; vwap?: boolean; volume?: boolean }): void {
    if (!this.chart) return;

    if (indicators.volume && !this.volumeSeries) {
      this.volumeSeries = this.chart.addSeries(HistogramSeries, {
        color: this.theme.accent,
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      });
      this.volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    }

    if (indicators.vwap && !this.vwapSeries) {
      this.vwapSeries = this.chart.addSeries(LineSeries, {
        color: '#9B59B6',
        lineWidth: 2 as any,
        title: 'VWAP',
      });
    }

    if (indicators.ema9 && !this.ema9Series) {
      this.ema9Series = this.chart.addSeries(LineSeries, {
        color: '#FF9F0A',
        lineWidth: 1 as any,
        title: 'EMA9',
      });
    }

    if (indicators.ema20 && !this.ema20Series) {
      this.ema20Series = this.chart.addSeries(LineSeries, {
        color: '#315CFF',
        lineWidth: 1 as any,
        title: 'EMA20',
      });
    }

    if (indicators.ema50 && !this.ema50Series) {
      this.ema50Series = this.chart.addSeries(LineSeries, {
        color: '#5B3CFF',
        lineWidth: 1 as any,
        title: 'EMA50',
      });
    }
  }

  addMarker(marker: ChartMarker): string {
    if (!this.candleSeries) return '';
    const id = `marker-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const s = this.candleSeries as any;
    if (s.setMarkers) {
      s.setMarkers([
        ...(s.markers?.() || []),
        {
          time: (marker.time / 1000) as Time,
          position: marker.position,
          color: marker.color,
          shape: marker.shape,
          text: marker.text,
          size: marker.size || 1,
        },
      ]);
    }
    this.markers.set(id, 0);
    return id;
  }

  removeMarker(id: string): void {
    if (!this.candleSeries) return;
    this.markers.delete(id);
  }

  addLine(line: ChartLine): string {
    if (!this.chart) return '';
    const series = this.chart.addSeries(LineSeries, {
      color: line.color,
      lineWidth: line.lineWidth as any,
      title: line.title,
    });
    const data: LineData[] = line.data.map(d => ({
      time: (d.time / 1000) as Time,
      value: d.value,
    }));
    series.setData(data);
    this.lines.set(line.id, series);
    return line.id;
  }

  updateLine(id: string, data: { time: number; value: number }[]): void {
    const series = this.lines.get(id);
    if (!series) return;
    const lineData: LineData[] = data.map(d => ({
      time: (d.time / 1000) as Time,
      value: d.value,
    }));
    series.setData(lineData);
  }

  removeLine(id: string): void {
    const series = this.lines.get(id);
    if (series && this.chart) {
      this.chart.removeSeries(series);
      this.lines.delete(id);
    }
  }

  setPositionOverlay(entry: number, current: number, stop: number, trail?: number): void {
    // Add horizontal lines for entry, stop, and trail
    const now = Date.now();
    const base = [{ time: now - 86400000, value: entry }, { time: now, value: entry }];
    this.addLine({ id: 'entry-line', data: base, color: '#315CFF', lineWidth: 1 as any, title: 'Entry' });
    this.addLine({ id: 'stop-line', data: [{ time: now - 86400000, value: stop }, { time: now, value: stop }], color: '#FF453A', lineWidth: 2 as any, title: 'Stop' });
    if (trail !== undefined) {
      this.addLine({ id: 'trail-line', data: [{ time: now - 86400000, value: trail }, { time: now, value: trail }], color: '#FF9F0A', lineWidth: 2 as any, title: 'Trail' });
    }
  }

  setProtectionOverlay(protectionFloor: number, trailDistance: number): void {
    const now = Date.now();
    this.addLine({
      id: 'protection-floor',
      data: [{ time: now - 86400000, value: protectionFloor }, { time: now, value: protectionFloor }],
      color: '#FF453A',
      lineWidth: 2 as any,
      title: `Protection ${trailDistance}`,
    });
  }

  setEventOverlay(events: ChartEventOverlay[]): void {
    for (const evt of events) {
      this.addMarker({
        time: evt.time,
        position: evt.type === 'ENTRY' ? 'belowBar' : evt.type === 'EXIT' ? 'aboveBar' : 'inBar',
        color: evt.color,
        shape: evt.type === 'ENTRY' ? 'arrowUp' : evt.type === 'EXIT' ? 'arrowDown' : 'circle',
        text: evt.label,
      });
    }
  }

  resize(width: number, height: number): void {
    if (this.chart) this.chart.applyOptions({ width, height });
  }

  destroy(): void {
    this.realtimeUnsub?.();
    this.lines.clear();
    this.markers.clear();
    if (this.chart) {
      this.chart.remove();
      this.chart = null;
    }
  }
}
