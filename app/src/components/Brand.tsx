import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-royal-500 via-royal-600 to-teal-500 shadow-[0_0_24px_-4px_hsl(225_73%_57%/0.7)]',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17l4.5-6 4 4L19 6" />
        <path d="M15 6h4v4" />
      </svg>
    </div>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className={compact ? 'h-8 w-8' : undefined} />
      <div className="leading-none">
        <span className="font-display text-lg font-700 font-bold tracking-tight text-slate-900">Requi</span>
        <span className="font-display ml-1.5 text-lg font-medium tracking-tight text-sky-600">Trading</span>
      </div>
    </div>
  );
}
