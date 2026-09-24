import { useRef, useEffect, useCallback } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, CrosshairMode } from 'lightweight-charts';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { REQUI_CHART_THEME as t } from './ChartProvider';

interface ChartBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  vwap?: number;
}

interface ChartMarker {
  time: number;
  position: 'aboveBar' | 'belowBar' | 'inBar';
  color: string;
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  text?: string;
}

interface Props {
  data: ChartBar[];
  height?: number;
  markers?: ChartMarker[];
  showVolume?: boolean;
  showVwap?: boolean;
}

const theme = {
  bg: t.background,
  text: t.textPrimary,
  textSec: t.textSecondary,
  grid: t.grid,
  up: t.upColor,
  down: t.downColor,
  accent: t.accent,
  border: t.border,
};

export default function TradingChart({ data, height = 320, markers = [], showVolume = true, showVwap = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const vwapRef = useRef<ISeriesApi<'Line'> | null>(null);

  const initChart = useCallback(() => {
    if (!containerRef.current || chartRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: theme.bg }, textColor: theme.text, fontSize: 11, fontFamily: 'Inter, -apple-system, sans-serif' },
      grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: theme.accent }, horzLine: { color: theme.accent } },
      rightPriceScale: { borderColor: theme.border, scaleMargins: { top: 0.1, bottom: showVolume ? 0.25 : 0.1 } },
      timeScale: { borderColor: theme.border, timeVisible: true },
      handleScroll: { vertTouchDrag: false },
      width: containerRef.current.clientWidth,
      height,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: theme.up, downColor: theme.down,
      wickUpColor: theme.up, wickDownColor: theme.down,
      borderUpColor: theme.up, borderDownColor: theme.down,
    });

    chartRef.current = chart;
    candleRef.current = candleSeries;

    if (showVolume) {
      const volSeries = chart.addSeries(HistogramSeries, {
        color: theme.accent, priceFormat: { type: 'volume' }, priceScaleId: '',
      });
      volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
      volRef.current = volSeries;
    }

    if (showVwap) {
      const vwapSeries = chart.addSeries(LineSeries, { color: '#9B59B6', lineWidth: 2, title: 'VWAP' });
      vwapRef.current = vwapSeries;
    }
  }, [height, showVolume, showVwap]);

  useEffect(() => {
    initChart();
    return () => {
      chartRef.current?.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
      vwapRef.current = null;
    };
  }, [initChart]);

  useEffect(() => {
    if (!candleRef.current || data.length === 0) return;
    const candleData = data.map(d => ({ time: d.time as any, open: d.open, high: d.high, low: d.low, close: d.close }));
    candleRef.current.setData(candleData);

    if (volRef.current) {
      const volData = data.filter(d => d.volume !== undefined).map(d => ({ time: d.time as any, value: d.volume! }));
      volRef.current.setData(volData);
    }

    if (vwapRef.current) {
      const vwapData = data.filter(d => d.vwap !== undefined).map(d => ({ time: d.time as any, value: d.vwap! }));
      vwapRef.current.setData(vwapData);
    }

    if (markers.length > 0) {
      const s = candleRef.current as any;
      s.setMarkers?.(markers.map(m => ({
        time: m.time as any,
        position: m.position,
        color: m.color,
        shape: m.shape,
        text: m.text,
      })));
    }

    chartRef.current?.timeScale().fitContent();
  }, [data, markers]);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return <div ref={containerRef} style={{ width: '100%', height }} />;
}
