import { useState } from 'react';
import { Scale, FileText, Inbox, Flag, CheckCircle2 } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { Badge, PageHeader, TableShell, th, thCls, trCls } from './shared';

/**
 * Admin compliance dashboard (Legal Revision §39) — RBAC: admin role only
 * (backend adminQuery enforces; this page is additionally hidden from non-admins
 * by the owner nav). Document state machine transitions require a human approver
 * identity — AI agents can never publish legal terms (§42).
 */
type DocStatus = 'DRAFT' | 'LEGAL_REVIEW' | 'APPROVED' | 'SCHEDULED' | 'ACTIVE' | 'SUPERSEDED';
const tone = (s: DocStatus) =>
  s === 'ACTIVE' ? 'teal' : s === 'APPROVED' || s === 'SCHEDULED' ? 'sky' : s === 'SUPERSEDED' ? 'slate' : 'amber';

export default function OwnerCompliance() {
  const utils = trpc.useUtils();
  const docs = trpc.legal.adminDocs.useQuery();
  const reqs = trpc.legal.adminPrivacyRequests.useQuery();
  const flags = trpc.legal.flags.useQuery();
  const [approver, setApprover] = useState('');
  const transition = trpc.legal.transitionDoc.useMutation({ onSuccess: () => utils.legal.adminDocs.invalidate() });
  const updateReq = trpc.legal.updatePrivacyRequest.useMutation({ onSuccess: () => utils.legal.adminPrivacyRequests.invalidate() });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Owner · Compliance"
        title="Legal & Compliance Console"
        description="Document versions and state machine, privacy request queue, consent records, and regulatory launch-blocker flags."
        actions={<Badge tone="royal"><Scale className="h-3 w-3" /> human approval required for publication</Badge>}
      />

      {/* Launch blockers */}
      <section className="glass rounded-2xl p-6">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Flag className="h-4 w-4 text-red-500" /> Regulatory launch gates (server-side env flags)</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(flags.data ?? []).map((f) => (
            <div key={f.flag} className="rounded-xl border border-slate-900/10 p-4">
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs font-bold text-slate-800">{f.flag}</p>
                <Badge tone={f.enabled ? 'teal' : 'red'}>{f.enabled ? 'ENABLED' : 'BLOCKED'}</Badge>
              </div>
              <p className="mt-2 text-xs text-slate-500">{f.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Document state machine */}
      <section className="glass rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><FileText className="h-4 w-4 text-sky-600" /> Legal document versions</h3>
          <input
            value={approver}
            onChange={(e) => setApprover(e.target.value)}
            placeholder="Approver identity (required to approve/activate)"
            className="w-72 rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
          />
        </div>
        <TableShell title="Legal documents">
          <table className="w-full text-sm">
            <thead><tr className={thCls}><th className={th}>Document</th><th className={th}>Version</th><th className={th}>Status</th><th className={th}>Re-consent</th><th className={th}>Transitions</th></tr></thead>
            <tbody>
              {(docs.data ?? []).map((d) => (
                <tr key={`${d.slug}@${d.version}`} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-800">{d.title}<span className="ml-2 text-xs text-slate-400">{d.slug}</span></td>
                  <td className="px-3 py-2 font-mono text-xs">{d.version}</td>
                  <td className="px-3 py-2"><Badge tone={tone(d.status as DocStatus)}>{d.status}</Badge></td>
                  <td className="px-3 py-2 text-xs">{d.requiresReconsent ? 'yes' : 'no'}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {(['LEGAL_REVIEW', 'APPROVED', 'ACTIVE'] as const).map((to) => (
                        <button
                          key={to}
                          disabled={transition.isPending || (to !== 'LEGAL_REVIEW' && !approver)}
                          onClick={() => transition.mutate({ slug: d.slug, version: d.version, to, approver: approver || undefined })}
                          className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                          title={to !== 'LEGAL_REVIEW' && !approver ? 'Enter approver identity first' : `Transition to ${to}`}
                        >
                          → {to}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
        <p className="mt-3 text-[11px] text-slate-400">
          Only APPROVED documents may be activated. Activation supersedes the prior ACTIVE version; historical versions are preserved.
        </p>
      </section>

      {/* Privacy queue */}
      <section className="glass rounded-2xl p-6">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Inbox className="h-4 w-4 text-teal-600" /> Privacy request queue</h3>
        {(reqs.data?.length ?? 0) === 0 ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-slate-400"><CheckCircle2 className="h-4 w-4" /> Queue empty.</p>
        ) : (
          <TableShell title="Privacy requests">
            <table className="w-full text-sm">
              <thead><tr className={thCls}><th className={th}>Request</th><th className={th}>User</th><th className={th}>Type</th><th className={th}>Status</th><th className={th}>Filed</th><th className={th}>Action</th></tr></thead>
              <tbody>
                {reqs.data!.map((r) => (
                  <tr key={r.requestId} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-mono text-xs">{r.requestId}</td>
                    <td className="px-3 py-2 text-xs">{r.userId}</td>
                    <td className="px-3 py-2">{r.type}</td>
                    <td className="px-3 py-2"><Badge tone={r.status === 'COMPLETED' ? 'teal' : 'amber'}>{r.status}</Badge></td>
                    <td className="px-3 py-2 text-xs text-slate-500">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1.5">
                        {(['IN_PROGRESS', 'COMPLETED', 'DENIED'] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => updateReq.mutate({ requestId: r.requestId, status: s })}
                            className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        )}
      </section>
    </div>
  );
}
