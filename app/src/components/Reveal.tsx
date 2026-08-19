import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  once?: boolean;
}

/** Scroll-triggered fade/slide reveal used across the landing page. */
export function Reveal({ children, delay = 0, y = 24, className, once = true }: RevealProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Small SVG sparkline. */
export function Sparkline({
  data,
  positive = true,
  className,
  height = 36,
}: {
  data: number[];
  positive?: boolean;
  className?: string;
  height?: number;
}) {
  const w = 120;
  const h = height;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 3 - ((v - min) / range) * (h - 8)}`);
  const line = `M${pts.join(' L')}`;
  const area = `${line} L${w},${h} L0,${h} Z`;
  const stroke = positive ? '#34d399' : '#f87171';
  const id = `sp-${positive ? 'up' : 'dn'}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Pnl({ value, suffix = '%' }: { value: number; suffix?: string }) {
  const pos = value >= 0;
  return (
    <span className={pos ? 'text-teal-600' : 'text-red-600'}>
      {pos ? '+' : ''}
      {value.toFixed(1)}
      {suffix}
    </span>
  );
}
