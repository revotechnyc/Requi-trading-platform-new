import { useRef, useEffect } from 'react';
import { createChart, AreaSeries } from 'lightweight-charts';

interface Props {
  data: { time: number; value: number }[];
  height?: number;
  color?: string;
}

export default function MiniPriceChart({ data, height = 60, color = '#30D158' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { color: 'transparent' }, textColor: '#8E8E93', fontSize: 9 },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
      rightPriceScale: { visible: false },
      timeScale: { visible: false },
      handleScroll: false,
      handleScale: false,
      width: containerRef.current.clientWidth,
      height,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: color,
      topColor: color + '18',
      bottomColor: color + '02',
      lineWidth: 2,
      lastValueVisible: false,
    });

    series.setData(data.map(d => ({ time: d.time as any, value: d.value })));
    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [data, height, color]);

  return <div ref={containerRef} style={{ width: '100%', height }} />;
}
