import { useState } from 'react';
import { CalendarClock, Play, Trash2, ChevronDown, ChevronUp, CircleCheck, CircleX, Clock } from 'lucide-react';
import { trpc } from '@/providers/trpc';

const SCHEDULE_TYPES = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKDAYS', label: 'Weekdays' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MARKET_OPEN', label: 'Market open' },
  { value: 'INTERVAL', label: 'Every N minutes' },
] as const;

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'UTC',
];

function describe(t: {
  scheduleType: string; timeOfDay: string | null; timezone: string | null;
  daysOfWeek: unknown; intervalMinutes: number | null;
}): string {
  const time = t.timeOfDay ?? '09:30';
  const tz = (t.timezone ?? 'America/New_York').split('/').pop()?.replace('_', ' ');
  switch (t.scheduleType) {
    case 'DAILY': return `Daily at ${time} ${tz}`;
    case 'WEEKDAYS': return `Weekdays at ${time} ${tz}`;
    case 'MARKET_OPEN': return `At market open (${time} ${tz}, Mon–Fri)`;
    case 'INTERVAL': return `Every ${t.intervalMinutes ?? 60} minutes`;
    case 'WEEKLY': {
      const days = Array.isArray(t.daysOfWeek) && (t.daysOfWeek as number[]).length > 0
        ? (t.daysOfWeek as number[]).map((d) => DAY_LABELS[d]).join(', ')
        : 'Mon';
      return `${days} at ${time} ${tz}`;
    }
    default: return t.scheduleType;
  }
}

/** Scheduled Tasks — run an Intelligence prompt automatically on a schedule. */
export default function ScheduledTasksPanel() {
  const utils = trpc.useUtils();
  const { data: tasks, isLoading } = trpc.scheduledTasks.list.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [expandedRuns, setExpandedRuns] = useState<string | null>(null);

  // form state
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [scheduleType, setScheduleType] = useState<string>('DAILY');
  const [timeOfDay, setTimeOfDay] = useState('09:30');
  const [timezone, setTimezone] = useState('America/New_York');
  const [days, setDays] = useState<number[]>([1]);
  const [intervalMinutes, setIntervalMinutes] = useState(60);

  const refresh = () => utils.scheduledTasks.list.invalidate();

  const create = trpc.scheduledTasks.create.useMutation({
    onSuccess: () => {
      setShowForm(false); setName(''); setPrompt('');
      refresh();
    },
  });
  const toggle = trpc.scheduledTasks.toggle.useMutation({ onSuccess: refresh });
  const remove = trpc.scheduledTasks.remove.useMutation({ onSuccess: refresh });
  const runNow = trpc.scheduledTasks.runNow.useMutation({ onSuccess: () => { refresh(); utils.scheduledTasks.runs.invalidate(); } });

  const submit = () => {
    if (!name.trim() || !prompt.trim()) return;
    create.mutate({
      name: name.trim(),
      prompt: prompt.trim(),
      scheduleType: scheduleType as 'DAILY' | 'WEEKDAYS' | 'WEEKLY' | 'INTERVAL' | 'MARKET_OPEN',
      timeOfDay,
      timezone,
      ...(scheduleType === 'WEEKLY' ? { daysOfWeek: days } : {}),
      ...(scheduleType === 'INTERVAL' ? { intervalMinutes } : {}),
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-slate-900/5 px-5 py-3.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Scheduled Tasks</p>
            <p className="text-[11px] text-slate-500">Run Intelligence prompts automatically</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-royal-500/90 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-royal-600"
          >
            <CalendarClock className="h-3.5 w-3.5" /> {showForm ? 'Close' : 'New task'}
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {showForm && (
          <div className="space-y-3 rounded-xl border border-sky-600/25 bg-sky-600/[0.04] p-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Task name — e.g. Morning portfolio brief"
              className="w-full rounded-lg border border-slate-900/10 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-sky-600/50"
            />
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="Prompt to run — e.g. Portfolio status and any risk alerts"
              className="font-mono-num w-full resize-none rounded-lg border border-slate-900/10 bg-white px-3 py-2 text-xs leading-relaxed text-slate-700 outline-none focus:border-sky-600/50"
            />
            <div className="grid grid-cols-2 gap-2">
              <select value={scheduleType} onChange={(e) => setScheduleType(e.target.value)}
                className="rounded-lg border border-slate-900/10 bg-white px-2 py-2 text-xs text-slate-700 outline-none">
                {SCHEDULE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              {scheduleType === 'INTERVAL' ? (
                <input type="number" min={5} max={10080} value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Math.max(5, Number(e.target.value) || 60))}
                  className="rounded-lg border border-slate-900/10 bg-white px-3 py-2 text-xs text-slate-700 outline-none" placeholder="Minutes" />
              ) : (
                <input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)}
                  className="rounded-lg border border-slate-900/10 bg-white px-3 py-2 text-xs text-slate-700 outline-none" />
              )}
            </div>
            {scheduleType === 'WEEKLY' && (
              <div className="flex flex-wrap gap-1.5">
                {DAY_LABELS.map((d, i) => (
                  <button key={d}
                    onClick={() => setDays((cur) => cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort())}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                      days.includes(i) ? 'bg-royal-500 text-white' : 'border border-slate-900/10 bg-white text-slate-500'
                    }`}>
                    {d}
                  </button>
                ))}
              </div>
            )}
            {scheduleType !== 'INTERVAL' && (
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-lg border border-slate-900/10 bg-white px-2 py-2 text-xs text-slate-700 outline-none">
                {TIMEZONES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            )}
            {create.error && <p className="text-[11px] font-medium text-red-500">{create.error.message}</p>}
            <button onClick={submit} disabled={!name.trim() || !prompt.trim() || create.isPending}
              className="w-full rounded-lg bg-royal-500 py-2 text-xs font-semibold text-white transition-colors hover:bg-royal-600 disabled:opacity-40">
              {create.isPending ? 'Creating…' : 'Create scheduled task'}
            </button>
          </div>
        )}

        {isLoading && <p className="py-8 text-center text-xs text-slate-400">Loading…</p>}
        {!isLoading && (tasks ?? []).length === 0 && !showForm && (
          <p className="py-8 text-center text-xs leading-relaxed text-slate-400">
            No scheduled tasks. Create one and the Intelligence engine will run it for you —
            results appear as conversations you can review anytime.
          </p>
        )}

        {(tasks ?? []).map((t) => (
          <div key={t.id} className="rounded-xl border border-slate-900/8 bg-slate-900/[0.02] p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{t.name}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                  <Clock className="h-3 w-3" /> {describe(t)}
                </p>
              </div>
              <button
                onClick={() => toggle.mutate({ id: t.id, enabled: !t.enabled })}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${t.enabled ? 'bg-teal-500' : 'bg-slate-300'}`}
                aria-label={t.enabled ? 'Disable' : 'Enable'}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${t.enabled ? 'left-4.5' : 'left-0.5'}`} />
              </button>
            </div>
            <pre className="font-mono-num mt-2 line-clamp-2 whitespace-pre-wrap rounded-lg bg-slate-100 p-2.5 text-[10.5px] leading-relaxed text-slate-500">
              {t.prompt}
            </pre>
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <p className="text-[10px] text-slate-400">
                {t.lastRunAt
                  ? `Last run ${new Date(t.lastRunAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} — ${t.lastRunStatus ?? ''}`
                  : t.nextRunAt
                    ? `Next run ${new Date(t.nextRunAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                    : 'Paused'}
              </p>
              <div className="flex items-center gap-1.5">
                <button onClick={() => runNow.mutate({ id: t.id })} disabled={runNow.isPending}
                  className="flex items-center gap-1 rounded-md bg-royal-500/90 px-2 py-1 text-[10px] font-semibold text-white hover:bg-royal-600 disabled:opacity-40">
                  <Play className="h-3 w-3" /> Run now
                </button>
                <button onClick={() => setExpandedRuns(expandedRuns === t.id ? null : t.id)}
                  className="flex items-center gap-1 rounded-md border border-slate-900/10 px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-900/[0.04]">
                  History {expandedRuns === t.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                <button onClick={() => remove.mutate({ id: t.id })} aria-label="Delete task"
                  className="rounded-md border border-slate-900/10 p-1 text-slate-400 hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {expandedRuns === t.id && <RunHistory taskId={t.id} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function RunHistory({ taskId }: { taskId: string }) {
  const { data: runs, isLoading } = trpc.scheduledTasks.runs.useQuery({ taskId });
  if (isLoading) return <p className="mt-2 text-[10px] text-slate-400">Loading runs…</p>;
  if (!runs || runs.length === 0) return <p className="mt-2 text-[10px] text-slate-400">No runs yet.</p>;
  return (
    <div className="mt-2 space-y-1.5 border-t border-slate-900/5 pt-2">
      {runs.map((r) => (
        <div key={r.id} className="flex items-start gap-2 text-[10.5px]">
          {r.status === 'SUCCESS'
            ? <CircleCheck className="mt-0.5 h-3 w-3 shrink-0 text-teal-600" />
            : r.status === 'ERROR'
              ? <CircleX className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />
              : <Clock className="mt-0.5 h-3 w-3 shrink-0 animate-pulse text-amber-500" />}
          <div className="min-w-0">
            <p className="text-slate-500">
              {new Date(r.startedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
            {r.replyExcerpt && <p className="line-clamp-2 text-slate-400">{r.replyExcerpt}</p>}
            {r.error && <p className="line-clamp-2 text-red-400">{r.error}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
