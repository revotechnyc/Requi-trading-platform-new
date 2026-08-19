import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Soft badge used across owner pages. */
export function Badge({ tone = 'slate', children }: { tone?: 'teal' | 'amber' | 'red' | 'sky' | 'royal' | 'slate' | 'violet'; children: ReactNode }) {
  const tones: Record<string, string> = {
    teal: 'border-teal-600/20 bg-teal-600/[0.08] text-teal-700',
    amber: 'border-amber-500/25 bg-amber-500/10 text-amber-600',
    red: 'border-red-600/20 bg-red-600/[0.08] text-red-600',
    sky: 'border-sky-600/20 bg-sky-600/[0.08] text-sky-600',
    royal: 'border-royal-500/25 bg-royal-500/10 text-royal-600',
    violet: 'border-violet-500/25 bg-violet-500/10 text-violet-600',
    slate: 'border-slate-900/10 bg-slate-900/[0.05] text-slate-600',
  };
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', tones[tone])}>
      {children}
    </span>
  );
}

export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <p className="text-sm text-slate-500">{kicker}</p>
        <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2.5">{actions}</div>}
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string }) {
  return (
    <div className="glass glass-hover rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="grid h-9 w-9 place-items-center rounded-lg border border-sky-600/20 bg-sky-600/[0.08] text-sky-600">
          <Icon className="h-4 w-4" />
        </div>
        {sub && <span className="text-xs font-semibold text-teal-600">{sub}</span>}
      </div>
      <p className="font-mono-num mt-4 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}

/** Shared light table wrapper. */
export function TableShell({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-slate-900/5 px-6 py-4">
        <h2 className="font-display text-base font-semibold text-slate-900">{title}</h2>
        {aside}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export const th = 'px-6 py-3 font-medium';
export const thCls = 'border-b border-slate-900/5 text-left text-[11px] uppercase tracking-wide text-slate-500';
export const trCls = 'border-b border-slate-900/[0.04] transition-colors last:border-0 hover:bg-slate-900/[0.02]';

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-royal-500 to-teal-500 text-[11px] font-bold text-white', className)}>
      {initials}
    </div>
  );
}
