import { useRef, useEffect, useCallback } from 'react';
import { createChart, LineSeries, AreaSeries, HistogramSeries, CrosshairMode } from 'lightweight-charts';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { REQUI_CHART_THEME as t } from './ChartProvider';

interface EquityPoint {
  time: number;
  equity: number;
  pnl?: number;
  drawdown?: number;
  trades?: number;
}

interface Props {
  data: EquityPoint[];
  height?: number;
  showDrawdown?: boolean;
  showTrades?: boolean;
}

const theme = {
  bg: t.background,
  text: t.textPrimary,
  grid: t.grid,
  accent: t.accent,
  green: t.upColor,
  red: t.downColor,
  orange: '#FF9F0A',
  border: t.border,
};

export default function EquityCurveChart({ data, height = 240, showDrawdown = true, showTrades = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const equityRef = useRef<ISeriesApi<'Area'> | null>(null);
  const drawdownRef = useRef<ISeriesApi<'Line'> | null>(null);
  const tradesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const initChart = useCallback(() => {
    if (!containerRef.current || chartRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: theme.bg }, textColor: theme.text, fontSize: 11, fontFamily: 'Inter, -apple-system, sans-serif' },
      grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: theme.accent }, horzLine: { color: theme.accent } },
      rightPriceScale: { borderColor: theme.border },
      timeScale: { borderColor: theme.border, timeVisible: true },
      handleScroll: { vertTouchDrag: false },
      width: containerRef.current.clientWidth,
      height,
    });

    const equitySeries = chart.addSeries(AreaSeries, {
      lineColor: theme.green,
      topColor: 'rgba(48,209,88,0.15)',
      bottomColor: 'rgba(48,209,88,0.01)',
      lineWidth: 2 as any,
      lastValueVisible: true,
      title: 'Equity',
    });

    chartRef.current = chart;
    equityRef.current = equitySeries;

    if (showDrawdown) {
      const ddSeries = chart.addSeries(LineSeries, {
        color: theme.red, lineWidth: 1, title: 'Drawdown', visible: false,
      });
      drawdownRef.current = ddSeries;
    }

    if (showTrades) {
      const tSeries = chart.addSeries(HistogramSeries, {
        color: theme.accent, priceFormat: { type: 'volume' }, priceScaleId: '',
      });
      tSeries.priceScale().applyOptions({ scaleMargins: { top: 0.9, bottom: 0 } });
      tradesRef.current = tSeries;
    }
  }, [height, showDrawdown, showTrades]);

  useEffect(() => {
    initChart();
    return () => { chartRef.current?.remove(); chartRef.current = null; equityRef.current = null; drawdownRef.current = null; tradesRef.current = null; };
  }, [initChart]);

  useEffect(() => {
    if (!equityRef.current || data.length === 0) return;
    equityRef.current.setData(data.map(d => ({ time: d.time as any, value: d.equity })));
    if (drawdownRef.current) drawdownRef.current.setData(data.filter(d => d.drawdown !== undefined).map(d => ({ time: d.time as any, value: d.drawdown! })));
    if (tradesRef.current) tradesRef.current.setData(data.filter(d => d.trades !== undefined).map(d => ({ time: d.time as any, value: d.trades! })));
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  useEffect(() => {
    const handleResize = () => { if (containerRef.current && chartRef.current) chartRef.current.applyOptions({ width: containerRef.current.clientWidth }); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height }} />;
}
