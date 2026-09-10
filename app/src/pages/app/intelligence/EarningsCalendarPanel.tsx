import { useMemo, useState } from 'react';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';

type SessionFilter = 'ALL' | 'BMO' | 'AMC' | 'DMH';

export default function EarningsCalendarPanel({
  onAskResearch,
}: {
  onAskResearch?: (symbol: string) => void;
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [date, setDate] = useState(today);
  const [session, setSession] = useState<SessionFilter>('ALL');

  const q = trpc.intelligenceData.earningsCalendar.useQuery({
    date,
    session: session === 'ALL' ? undefined : session,
  });

  const board = q.data?.boards?.[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-slate-900/5 px-5 py-3.5">
        <p className="text-sm font-semibold text-slate-900">Earnings calendar</p>
        <p className="text-[11px] text-slate-500">Finnhub day board — BMO / AMC filters</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-900/5 p-4">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-slate-200 px-2 py-1.5 text-xs"
        />
        {(['ALL', 'BMO', 'AMC', 'DMH'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSession(s)}
            className={cn(
              'rounded-md px-2 py-1 text-[11px] font-semibold',
              session === s ? 'bg-royal-500 text-white' : 'bg-slate-100 text-slate-600',
            )}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {q.isLoading && <p className="text-xs text-slate-500">Loading calendar…</p>}
        {q.error && <p className="text-xs text-red-600">Calendar unavailable.</p>}
        {board && !board.available && (
          <p className="text-xs text-slate-500">{board.error ?? 'No data for this day.'}</p>
        )}
        {board && board.available && board.totalCount === 0 && (
          <p className="text-xs text-slate-500">No companies on the calendar for this filter.</p>
        )}
        {board && board.rows.length > 0 && (
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="text-slate-400">
                <th className="py-1 font-medium">Symbol</th>
                <th className="py-1 font-medium">Timing</th>
                <th className="py-1 font-medium">EPS est</th>
                <th className="py-1 font-medium" />
              </tr>
            </thead>
            <tbody>
              {board.rows.map((r) => (
                <tr key={r.symbol} className="border-t border-slate-100">
                  <td className="py-1.5 font-semibold text-slate-800">{r.symbol}</td>
                  <td className="py-1.5 text-slate-600">{r.reportTime}</td>
                  <td className="py-1.5 text-slate-600">
                    {r.epsEstimate == null ? '—' : r.epsEstimate.toFixed(2)}
                  </td>
                  <td className="py-1.5 text-right">
                    {onAskResearch && (
                      <button
                        type="button"
                        className="text-royal-600 hover:underline"
                        onClick={() => onAskResearch(r.symbol)}
                      >
                        Research
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
