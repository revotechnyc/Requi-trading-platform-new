import {
  Activity, CheckCircle2, XCircle, AlertTriangle, PlayCircle, RefreshCw,
  HeartPulse, BrainCircuit, Clock,
} from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { Badge, PageHeader, StatCard, TableShell, th, thCls, trCls } from './shared';

interface CheckResult {
  id: string;
  name: string;
  status: 'OK' | 'WARN' | 'FAIL';
  detail: string;
  remediation?: string;
}
interface StoredReport {
  id: string;
  triggerType: string;
  overall: string;
  okCount: number;
  warnCount: number;
  failCount: number;
  checks: CheckResult[];
  aiDiagnosis: string | null;
  createdAt: string | Date;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'OK') return <CheckCircle2 className="h-4 w-4 text-teal-600" />;
  if (status === 'FAIL') return <XCircle className="h-4 w-4 text-red-600" />;
  return <AlertTriangle className="h-4 w-4 text-amber-500" />;
}
function statusTone(s: string): 'teal' | 'amber' | 'red' {
  return s === 'OK' ? 'teal' : s === 'FAIL' ? 'red' : 'amber';
}
function triggerLabel(t: string) {
  return t === 'PRE_OPEN' ? 'Pre-open' : t === 'POST_CLOSE' ? 'Post-close' : 'Manual';
}

export default function SystemCheck() {
  const utils = trpc.useUtils();
  const { data, refetch, isFetching } = trpc.systemCheck.latest.useQuery(undefined, { refetchInterval: 30000, retry: false });
  const { data: history } = trpc.systemCheck.history.useQuery(undefined, { retry: false });
  const runNow = trpc.systemCheck.runNow.useMutation({
    onSuccess: () => {
      utils.systemCheck.latest.invalidate();
      utils.systemCheck.history.invalidate();
    },
  });

  const report = data?.report as StoredReport | null | undefined;
  const loop = data?.loop as { running: boolean; ranToday: string[] } | undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="SaaS Owner · Reliability"
        title="System Check"
        description="Automated health probes across every major component — data feed, engine, signals, autonomous monitors, ticket gate, intelligence, memory, and the learning loop. Runs automatically before market open (09:00 ET) and after close (16:15 ET), Mon–Fri. Failures are diagnosed by AI and pushed to your notifications."
        actions={
          <button
            onClick={() => runNow.mutate()}
            disabled={runNow.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-royal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-royal-500 disabled:opacity-50"
          >
            {runNow.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            {runNow.isPending ? 'Running 11 checks…' : 'Run now'}
          </button>
        }
      />

      {/* scheduler + overall */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={HeartPulse}
          label="Latest overall"
          value={report ? report.overall : '—'}
          sub={report ? `${triggerLabel(report.triggerType)} run · ${new Date(report.createdAt).toLocaleString()}` : 'No runs yet — click Run now'}
        />
        <StatCard
          icon={Activity}
          label="Components"
          value={report ? `${report.okCount} / ${report.okCount + report.warnCount + report.failCount} OK` : '—'}
          sub={report ? `${report.warnCount} warning(s) · ${report.failCount} failure(s)` : undefined}
        />
        <StatCard
          icon={Clock}
          label="Scheduler"
          value={loop?.running ? 'Active' : 'Off'}
          sub={loop?.ranToday?.length ? `Today: ${loop.ranToday.map((s) => s.split(':')[1]).join(', ')}` : 'Pre-open 09:00 ET · Post-close 16:15 ET'}
        />
      </div>

      {/* component table */}
      <TableShell
        title="Component checks"
        aside={
          <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
        }
      >
        {!report && <p className="px-6 py-10 text-center text-sm text-slate-500">No system check has run yet. Use “Run now” for the first report — scheduled runs happen automatically around market hours.</p>}
        {report && (
          <table className="w-full text-sm">
            <thead>
              <tr className={thCls}>
                <th className={th}>Component</th>
                <th className={th}>Status</th>
                <th className={th}>Detail</th>
                <th className={th}>Remediation</th>
              </tr>
            </thead>
            <tbody>
              {report.checks.map((c) => (
                <tr key={c.id} className={trCls}>
                  <td className="px-6 py-3 font-medium text-slate-800">
                    <span className="inline-flex items-center gap-2"><StatusIcon status={c.status} />{c.name}</span>
                  </td>
                  <td className="px-6 py-3"><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                  <td className="max-w-md px-6 py-3 text-slate-600">{c.detail}</td>
                  <td className="max-w-xs px-6 py-3 text-xs text-slate-500">{c.remediation ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableShell>

      {/* AI diagnosis */}
      {report?.aiDiagnosis && (
        <div className="glass rounded-2xl p-6">
          <div className="mb-3 flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-violet-600" />
            <h3 className="font-display text-base font-bold text-slate-900">AI diagnosis & improvement plan</h3>
          </div>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">{report.aiDiagnosis}</pre>
        </div>
      )}

      {/* history */}
      <TableShell title="Run history">
        {!history || history.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">No history yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className={thCls}>
                <th className={th}>When</th>
                <th className={th}>Trigger</th>
                <th className={th}>Overall</th>
                <th className={th}>OK / Warn / Fail</th>
                <th className={th}>AI diagnosis</th>
              </tr>
            </thead>
            <tbody>
              {(history as StoredReport[]).map((r) => (
                <tr key={r.id} className={trCls}>
                  <td className="px-6 py-3 text-slate-600">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="px-6 py-3 text-slate-600">{triggerLabel(r.triggerType)}</td>
                  <td className="px-6 py-3"><Badge tone={statusTone(r.overall)}>{r.overall}</Badge></td>
                  <td className="px-6 py-3 text-slate-600">{r.okCount} / {r.warnCount} / {r.failCount}</td>
                  <td className="px-6 py-3 text-slate-500">{r.aiDiagnosis ? 'Yes' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableShell>
    </div>
  );
}
