import { useState } from 'react';
import {
  ShieldCheck, FileLock2, Package, PlayCircle, CheckCircle2, XCircle, AlertTriangle,
  Lock, GitBranch, RefreshCw, KeyRound,
} from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { Badge, PageHeader, StatCard, TableShell, th, thCls, trCls } from './shared';
import { cn } from '@/lib/utils';

interface StageResult { stage: string; status: 'PASS' | 'FAIL' | 'PASS_WITH_FLAGS'; detail: string }
interface CompileReport {
  stages: StageResult[];
  rulesCompiled: number;
  rulesUnresolved: number;
  unresolved: Array<{ key: string; status: string; trace: { docKey: string; section: string } }>;
  conflictResolutions: Array<{ conflict: string; resolution: string }>;
  sourceDocuments: Array<{ docKey: string; version: string; sha256: string }>;
  blocked: boolean;
  blockReason?: string;
}

const PIPELINE_STAGES = [
  'DOCUMENT_UPDATE', 'AUTHENTICATION', 'PARSING', 'RULE_EXTRACTION', 'TYPE_VALIDATION',
  'CONFLICT_RESOLUTION', 'CODE_GENERATION', 'TEST_GENERATION', 'STATIC_ANALYSIS', 'UNIT_TESTING',
  'REGRESSION_TESTING', 'HISTORICAL_REPLAY', 'PAPER_VALIDATION', 'SECURITY_REVIEW', 'RISK_APPROVAL',
  'PACKAGE_SIGNING', 'STAGED_DEPLOYMENT', 'PRODUCTION_ACTIVATION',
];

function stageTone(s: StageResult['status']) {
  return s === 'PASS' ? 'text-teal-600' : s === 'FAIL' ? 'text-red-600' : 'text-amber-600';
}
function StageIcon({ status }: { status: StageResult['status'] }) {
  if (status === 'PASS') return <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" />;
  if (status === 'FAIL') return <XCircle className="h-3.5 w-3.5 text-red-600" />;
  return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
}

export default function Governance() {
  const utils = trpc.useUtils();
  const { data: docs } = trpc.governance.documents.useQuery(undefined, { retry: false });
  const { data: packages } = trpc.governance.packages.useQuery(undefined, { retry: false });
  const [reportId, setReportId] = useState<string | null>(null);
  const { data: report } = trpc.governance.report.useQuery(
    { packageId: reportId! },
    { enabled: reportId !== null },
  ) as { data: CompileReport | undefined };

  const compileMut = trpc.governance.compile.useMutation({
    onSuccess: (r) => {
      utils.governance.packages.invalidate();
      utils.governance.status.invalidate();
      const id = (r as { packageId?: string }).packageId;
      if (id) setReportId(id);
    },
  });
  const activateMut = trpc.governance.activate.useMutation({
    onSuccess: () => {
      utils.governance.packages.invalidate();
      utils.governance.status.invalidate();
    },
  });

  const active = packages?.find((p) => p.status === 'ACTIVE');
  const compileError = compileMut.error?.message;
  const blockedReport = (compileMut.data as { ok?: boolean; report?: CompileReport } | undefined)?.ok === false
    ? (compileMut.data as { report?: CompileReport }).report
    : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Owner · Private Governance Compiler"
        title="Governance & Signed Policy Packages"
        description="Confidential governing documents are compiled into deterministic, versioned, signed runtime packages. Documents and compiled logic never leave the server — the platform discloses only minimum-necessary outputs."
        actions={
          <button
            onClick={() => compileMut.mutate()}
            disabled={compileMut.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {compileMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            {compileMut.isPending ? 'Compiling…' : 'Run compilation'}
          </button>
        }
      />

      {/* security boundary banner */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-teal-600/20 bg-teal-600/[0.05] px-5 py-3.5">
        <Lock className="h-4 w-4 text-teal-700" />
        <p className="text-xs font-semibold text-slate-800">
          Confidentiality is architectural: sources are AES-256-GCM encrypted at rest, packages are HMAC-signed, and no endpoint returns document content, rules, thresholds, or traces.
        </p>
      </div>

      {/* stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Package} label="Active package" value={active?.version ?? '—'} sub={active ? 'signature verified' : undefined} />
        <StatCard icon={GitBranch} label="Package versions" value={String(packages?.length ?? 0)} />
        <StatCard icon={FileLock2} label="Authenticated sources" value={String(docs?.length ?? 0)} sub="encrypted at rest" />
        <StatCard icon={KeyRound} label="Active hash" value={active ? `${active.hashShort}…` : '—'} sub="sha256" />
      </div>

      {/* pipeline */}
      <TableShell title="Compilation & deployment pipeline" aside={<Badge tone="slate">a failed stage blocks deployment</Badge>}>
        <div className="flex flex-wrap gap-1.5 px-6 py-5">
          {PIPELINE_STAGES.map((s, i) => {
            const result = report?.stages.find((r) => r.stage === s);
            return (
              <span
                key={s}
                className={cn(
                  'rounded-md px-2.5 py-1 font-mono text-[10.5px] font-semibold ring-1',
                  result
                    ? result.status === 'PASS'
                      ? 'bg-teal-600/[0.08] text-teal-700 ring-teal-600/20'
                      : result.status === 'FAIL'
                        ? 'bg-red-600/[0.08] text-red-600 ring-red-600/20'
                        : 'bg-amber-500/10 text-amber-600 ring-amber-500/25'
                    : 'bg-slate-900/[0.04] text-slate-500 ring-slate-900/5',
                )}
                title={result?.detail}
              >
                {i + 1}. {s}
              </span>
            );
          })}
        </div>
      </TableShell>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* source documents */}
        <TableShell title="Private source documents" aside={<Badge tone="teal">AES-256-GCM</Badge>}>
          <table className="w-full text-sm">
            <thead><tr className={thCls}><th className={th}>Document</th><th className={th}>Version</th><th className={th}>Integrity</th><th className={th}>Status</th></tr></thead>
            <tbody>
              {(docs ?? []).map((d) => (
                <tr key={d.docKey} className={trCls}>
                  <td className="px-6 py-3 font-medium text-slate-900">{d.title}</td>
                  <td className="px-6 py-3 font-mono text-xs text-slate-500">{d.version}</td>
                  <td className="px-6 py-3 font-mono text-xs text-slate-500">sha256 {d.sha256Short}…</td>
                  <td className="px-6 py-3"><Badge tone={d.status === 'AUTHENTICATED' ? 'teal' : 'slate'}>{d.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>

        {/* packages */}
        <TableShell title="Compiled policy packages" aside={<Badge tone="royal">immutable · signed</Badge>}>
          <table className="w-full text-sm">
            <thead><tr className={thCls}><th className={th}>Version</th><th className={th}>Hash</th><th className={th}>Status</th><th className={th}></th></tr></thead>
            <tbody>
              {(packages ?? []).map((p) => (
                <tr key={p.id} className={trCls}>
                  <td className="px-6 py-3 font-mono text-xs font-semibold text-slate-900">{p.version}</td>
                  <td className="px-6 py-3 font-mono text-xs text-slate-500">{p.hashShort}…</td>
                  <td className="px-6 py-3">
                    <Badge tone={p.status === 'ACTIVE' ? 'teal' : p.status === 'STAGED' ? 'amber' : 'slate'}>{p.status}</Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setReportId(p.id)}
                        className={cn('text-xs font-semibold', reportId === p.id ? 'text-royal-600' : 'text-slate-500 hover:text-slate-800')}
                      >
                        Report
                      </button>
                      {p.status === 'STAGED' && (
                        <button
                          onClick={() => activateMut.mutate({ packageId: p.id })}
                          disabled={activateMut.isPending}
                          className="text-xs font-semibold text-teal-700 hover:text-teal-800 disabled:opacity-50"
                        >
                          Activate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      </div>

      {/* compilation report */}
      {(report || blockedReport) && (
        <ReportView report={(report ?? blockedReport)!} blocked={!!blockedReport} />
      )}
      {compileError && (
        <div className="rounded-xl border border-red-600/20 bg-red-600/[0.05] px-5 py-4 text-sm text-red-700">{compileError}</div>
      )}

      {/* RBAC + disclosure summary */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass rounded-2xl p-6">
          <div className="mb-4 flex items-center gap-3">
            <ShieldCheck className="h-4.5 w-4.5 text-royal-600" />
            <h2 className="text-base font-bold text-slate-900">Role-based access</h2>
          </div>
          <ul className="space-y-2 text-xs leading-relaxed text-slate-600">
            <li><span className="font-mono font-semibold text-slate-900">USER</span> — strategies, signals, opportunities, orders, positions, stops, performance, alerts, approved explanations.</li>
            <li><span className="font-mono font-semibold text-slate-900">OPERATOR</span> — system health, strategy & package versions, deployment status, failure codes, reconciliation status.</li>
            <li><span className="font-mono font-semibold text-slate-900">RISK_COMPLIANCE</span> — full gate results, risk calculations, policy references, exceptions, vetoes, oversight audit records.</li>
            <li><span className="font-mono font-semibold text-slate-900">GOVERNANCE_ADMIN</span> — document registration, compilation, review, approval, deployment. <span className="text-teal-700">(your role)</span></li>
            <li><span className="font-mono font-semibold text-slate-900">DEVELOPER</span> — authorized environments only; no production trading credentials by default.</li>
          </ul>
        </section>
        <section className="glass rounded-2xl p-6">
          <div className="mb-4 flex items-center gap-3">
            <Lock className="h-4.5 w-4.5 text-teal-600" />
            <h2 className="text-base font-bold text-slate-900">What the frontend can never receive</h2>
          </div>
          <ul className="space-y-2 text-xs leading-relaxed text-slate-600">
            {[
              'Raw governing text or source-document quotations',
              'Full proprietary formulas or hidden scoring weights',
              'Internal thresholds not approved for display',
              'Rule dependency graphs or detailed policy-engine traces',
              'Private system prompts or internal compiler output',
              'Secrets, credentials, or signing keys',
            ].map((x) => (
              <li key={x} className="flex items-start gap-2">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" /> {x}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function ReportView({ report, blocked }: { report: CompileReport; blocked: boolean }) {
  return (
    <TableShell
      title="Compilation report"
      aside={
        blocked
          ? <Badge tone="red">BLOCKED — {report.blockReason}</Badge>
          : <Badge tone={report.rulesUnresolved > 0 ? 'amber' : 'teal'}>{report.rulesCompiled} rules compiled · {report.rulesUnresolved} unresolved</Badge>
      }
    >
      <div className="grid gap-6 px-6 py-5 lg:grid-cols-2">
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Stage results</p>
          <ul className="space-y-1.5">
            {report.stages.map((s) => (
              <li key={s.stage} className="flex items-start gap-2 text-xs">
                <StageIcon status={s.status} />
                <span>
                  <span className={cn('font-mono font-semibold', stageTone(s.status))}>{s.stage}</span>
                  <span className="text-slate-500"> — {s.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Source trace</p>
            <ul className="space-y-1">
              {report.sourceDocuments.map((d) => (
                <li key={d.docKey} className="font-mono text-[11px] text-slate-500">
                  {d.docKey} <span className="text-slate-400">v{d.version}</span> · sha256 {d.sha256.slice(0, 12)}…
                </li>
              ))}
            </ul>
          </div>
          {report.conflictResolutions.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Conflict resolution (authority hierarchy)</p>
              <ul className="space-y-1.5">
                {report.conflictResolutions.map((c, i) => (
                  <li key={i} className="text-[11px] leading-relaxed text-slate-600">
                    <span className="font-semibold text-slate-800">{c.conflict}</span> → {c.resolution}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.unresolved.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-red-600">Unresolved rules — block affected actions</p>
              <ul className="space-y-1">
                {report.unresolved.map((u) => (
                  <li key={u.key} className="font-mono text-[11px] text-red-600">
                    {u.key} <Badge tone="red">{u.status}</Badge> <span className="text-slate-400">({u.trace.docKey} · {u.trace.section})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </TableShell>
  );
}
