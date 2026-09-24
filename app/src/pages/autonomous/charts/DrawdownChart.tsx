import { useRef, useEffect } from 'react';
import { createChart, AreaSeries } from 'lightweight-charts';
import { REQUI_CHART_THEME as t } from './ChartProvider';

interface Props {
  data: { time: number; value: number }[];
  height?: number;
}

const theme = { bg: t.background, text: t.textPrimary, grid: t.grid, red: t.downColor, border: t.border };

export default function DrawdownChart({ data, height = 160 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { color: theme.bg }, textColor: theme.text, fontSize: 10 },
      grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
      crosshair: { vertLine: { color: theme.red }, horzLine: { color: theme.red } },
      rightPriceScale: { borderColor: theme.border },
      timeScale: { borderColor: theme.border },
      handleScroll: { vertTouchDrag: false },
      width: containerRef.current.clientWidth, height,
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: theme.red, topColor: 'rgba(255,69,58,0.15)', bottomColor: 'rgba(255,69,58,0.01)',
      lineWidth: 2 as any, lastValueVisible: true, title: 'Drawdown',
    });
    series.setData(data.map(d => ({ time: d.time as any, value: d.value })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [data, height]);

  return <div ref={containerRef} style={{ width: '100%', height }} />;
}
