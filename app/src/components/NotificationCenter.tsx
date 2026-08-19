import { useEffect, useRef, useState } from 'react';
import {
  Bell, Zap, ClipboardCheck, CheckCircle2, ShieldAlert, TrendingUp,
  AlertTriangle, Radar, Settings2, CheckCheck, X,
} from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';

const TYPE_ICON = {
  OPPORTUNITY: Zap,
  CONFIRMATION_REQUEST: ClipboardCheck,
  EXECUTION: CheckCircle2,
  PROTECTION: ShieldAlert,
  POSITION_UPDATE: TrendingUp,
  RISK: AlertTriangle,
  NO_TRADE_STATUS: Radar,
  SYSTEM_STATE: Settings2,
} as const;

const PRIORITY_STYLE = {
  CRITICAL: { ring: 'border-red-500/30 bg-red-500/[0.04]', icon: 'bg-red-600/10 text-red-600', badge: 'bg-red-600 text-white' },
  HIGH: { ring: 'border-royal-500/25 bg-royal-500/[0.03]', icon: 'bg-royal-500/10 text-royal-600', badge: 'bg-royal-500 text-white' },
  MEDIUM: { ring: 'border-sky-500/20 bg-sky-500/[0.03]', icon: 'bg-sky-500/10 text-sky-600', badge: 'bg-sky-600 text-white' },
  LOW: { ring: 'border-slate-900/8 bg-slate-900/[0.02]', icon: 'bg-slate-900/[0.06] text-slate-500', badge: 'bg-slate-400 text-white' },
} as const;

function timeAgo(d: Date | string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const { data: alerts } = trpc.alerts.list.useQuery(undefined, { refetchInterval: 15000 });
  const markRead = trpc.alerts.markRead.useMutation({ onSuccess: () => utils.alerts.invalidate() });
  const markAllRead = trpc.alerts.markAllRead.useMutation({ onSuccess: () => utils.alerts.invalidate() });
  const respond = trpc.alerts.respond.useMutation({ onSuccess: () => utils.alerts.invalidate() });

  const unread = (alerts ?? []).filter((a) => !a.read).length;

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-10 w-10 place-items-center rounded-xl text-slate-600 transition-colors hover:bg-slate-900/5"
        aria-label="Notifications"
      >
        <Bell className="h-4.5 w-4.5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(92vw,400px)] overflow-hidden rounded-2xl border border-slate-900/10 bg-white shadow-xl shadow-slate-900/10">
          <div className="flex items-center justify-between border-b border-slate-900/5 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-slate-900">Alerts</p>
              <p className="text-[10.5px] text-slate-500">Logged to Decision Monitor &amp; Audit Ledger</p>
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-royal-600 hover:bg-royal-500/[0.06]"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-900/5">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-h-[60vh] space-y-2 overflow-y-auto p-3">
            {(alerts ?? []).length === 0 && (
              <p className="py-10 text-center text-sm text-slate-500">No alerts yet — the system is watching.</p>
            )}
            {(alerts ?? []).map((a) => {
              const Icon = (TYPE_ICON as Record<string, typeof Bell>)[a.type] ?? Bell;
              const style = (PRIORITY_STYLE as Record<string, { ring: string; icon: string; badge: string }>)[a.priority] ?? PRIORITY_STYLE.LOW;
              const awaiting = a.type === 'CONFIRMATION_REQUEST' && a.state === 'AWAITING_CONFIRMATION';
              return (
                <div
                  key={a.id}
                  onClick={() => !a.read && markRead.mutate({ id: a.id })}
                  className={cn('cursor-pointer rounded-xl border p-3 transition-colors', style.ring, !a.read && 'shadow-sm')}
                >
                  <div className="flex items-start gap-3">
                    <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', style.icon)}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={cn('truncate text-[13px] font-bold', a.read ? 'text-slate-600' : 'text-slate-900')}>{a.title}</p>
                        {!a.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-royal-500" />}
                      </div>
                      {a.body && <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-slate-500">{a.body}</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold', style.badge)}>{a.priority}</span>
                        {a.symbol && <span className="rounded bg-slate-900/[0.06] px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-slate-700">{a.symbol}</span>}
                        {a.state && <span className="font-mono text-[9.5px] text-slate-400">{a.state}</span>}
                        <span className="ml-auto text-[10px] text-slate-400">{timeAgo(a.createdAt)}</span>
                      </div>
                      {awaiting && (
                        <div className="mt-2.5 flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => respond.mutate({ id: a.id, accept: true })}
                            disabled={respond.isPending}
                            className="rounded-lg bg-teal-600 px-3 py-1.5 font-mono text-[10.5px] font-bold text-white hover:bg-teal-700"
                          >
                            CONFIRM ORDER
                          </button>
                          <button
                            onClick={() => respond.mutate({ id: a.id, accept: false })}
                            disabled={respond.isPending}
                            className="rounded-lg bg-red-600/10 px-3 py-1.5 font-mono text-[10.5px] font-bold text-red-600 hover:bg-red-600/20"
                          >
                            REJECT ORDER
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-slate-900/5 bg-slate-900/[0.02] px-4 py-2.5">
            <p className="text-center text-[10px] text-slate-400">Silence is not allowed — every decision, trade, and risk event is logged, visible, and traceable.</p>
          </div>
        </div>
      )}
    </div>
  );
}
