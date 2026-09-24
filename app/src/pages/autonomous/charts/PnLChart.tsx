import { useRef, useEffect, useCallback } from 'react';
import { createChart, HistogramSeries, LineSeries, CrosshairMode } from 'lightweight-charts';
import { REQUI_CHART_THEME as t } from './ChartProvider';

interface PnlPoint {
  time: number;
  grossPnl: number;
  netPnl: number;
  cumulative: number;
}

interface Props {
  data: PnlPoint[];
  height?: number;
}

const theme = {
  bg: t.background,
  text: t.textPrimary,
  grid: t.grid,
  accent: t.accent,
  green: t.upColor,
  red: t.downColor,
  border: t.border,
};

export default function PnlChart({ data, height = 200 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const grossRef = useRef<any>(null);
  const netRef = useRef<any>(null);

  const initChart = useCallback(() => {
    if (!containerRef.current || chartRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { color: theme.bg }, textColor: theme.text, fontSize: 11, fontFamily: 'Inter, -apple-system, sans-serif' },
      grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: theme.accent }, horzLine: { color: theme.accent } },
      rightPriceScale: { borderColor: theme.border },
      timeScale: { borderColor: theme.border, timeVisible: true },
      handleScroll: { vertTouchDrag: false },
      width: containerRef.current.clientWidth, height,
    });
    const gross = chart.addSeries(HistogramSeries, { color: theme.accent, priceFormat: { type: 'volume' }, priceScaleId: '' });
    gross.priceScale().applyOptions({ scaleMargins: { top: 0.7, bottom: 0 } });
    const net = chart.addSeries(LineSeries, { color: theme.green, lineWidth: 2, title: 'Cumulative' });
    chartRef.current = chart; grossRef.current = gross; netRef.current = net;
  }, [height]);

  useEffect(() => { initChart(); return () => { chartRef.current?.remove(); chartRef.current = null; grossRef.current = null; netRef.current = null; }; }, [initChart]);

  useEffect(() => {
    if (!grossRef.current || data.length === 0) return;
    grossRef.current.setData(data.map(d => ({ time: d.time as any, value: d.grossPnl, color: d.grossPnl >= 0 ? theme.green : theme.red })));
    netRef.current?.setData(data.map(d => ({ time: d.time as any, value: d.cumulative })));
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  useEffect(() => {
    const handleResize = () => { if (containerRef.current && chartRef.current) chartRef.current.applyOptions({ width: containerRef.current.clientWidth }); };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height }} />;
}
