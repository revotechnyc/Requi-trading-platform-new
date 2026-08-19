import { useState } from 'react';
import { Link } from 'react-router';
import { Download, FileSearch, ShieldCheck, Trash2, Pencil, BellOff, Send, AlertTriangle } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { Button } from '@/components/ui/button';

/**
 * Privacy Center (Legal Revision §14, §33, §38): access/export, deletion and
 * correction requests, marketing & cookie preferences, GPC status, and the
 * deactivate-vs-delete-vs-retain account workflow. Every request is logged.
 */
export default function Privacy() {
  const status = trpc.legal.consentStatus.useQuery();
  const requests = trpc.legal.myPrivacyRequests.useQuery();
  const acceptances = trpc.legal.myAcceptances.useQuery();
  const submit = trpc.legal.submitPrivacyRequest.useMutation({ onSuccess: () => requests.refetch() });
  const setPrefs = trpc.legal.setPreferences.useMutation({ onSuccess: () => status.refetch() });
  const exportQ = trpc.legal.exportMyData.useQuery(undefined, { enabled: false });
  const deactivate = trpc.legal.deactivateAccount.useMutation();
  const [details, setDetails] = useState('');
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const gpc = typeof navigator !== 'undefined' && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;

  const prefs = status.data?.preferences;

  const download = async () => {
    const res = await exportQ.refetch();
    if (!res.data) return;
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `requi-data-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Privacy Center</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your data rights, consent preferences, and account controls — every request is verified and logged.
          See the <Link to="/legal/privacy-policy" className="text-sky-700 hover:underline">Privacy Policy</Link> and{' '}
          <Link to="/legal/california-privacy-notice" className="text-sky-700 hover:underline">California Privacy Notice</Link>.
        </p>
      </div>

      {(gpc || prefs?.gpcHonored) && (
        <div className="flex items-center gap-2 rounded-xl border border-teal-600/30 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-800">
          <ShieldCheck className="h-4 w-4" /> Opt-Out Preference Signal Honored — your browser's Global Privacy Control signal is stored server-side.
        </div>
      )}

      {/* Data rights */}
      <section className="glass rounded-2xl p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">Your data</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Button variant="outline" onClick={download} disabled={exportQ.isFetching} className="justify-start">
            <Download className="mr-2 h-4 w-4" /> {exportQ.isFetching ? 'Preparing…' : 'Download my data (JSON)'}
          </Button>
          <Button variant="outline" onClick={() => submit.mutate({ type: 'ACCESS', details })} className="justify-start">
            <FileSearch className="mr-2 h-4 w-4" /> Request access report
          </Button>
          <Button variant="outline" onClick={() => submit.mutate({ type: 'CORRECT', details })} className="justify-start">
            <Pencil className="mr-2 h-4 w-4" /> Request correction
          </Button>
          <Button variant="outline" onClick={() => submit.mutate({ type: 'DELETE', details })} className="justify-start text-red-600 hover:text-red-700">
            <Trash2 className="mr-2 h-4 w-4" /> Request deletion of eligible data
          </Button>
        </div>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Optional details for your request (what to correct, scope, etc.)"
          className="mt-3 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700"
          rows={2}
        />
        <p className="mt-3 text-xs text-slate-400">
          Deletion deletes eligible personal data. Financial records, audit trails, and consent records are retained
          per legal retention obligations — see the{' '}
          <Link to="/legal/account-deletion-data-rights" className="text-sky-700 hover:underline">Account Deletion & Data Rights Policy</Link>.
        </p>
      </section>

      {/* Preferences */}
      <section className="glass rounded-2xl p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">Preferences</h2>
        <div className="mt-4 space-y-3 text-sm text-slate-700">
          <label className="flex items-center justify-between">
            <span>Marketing email (optional — never bundled with account creation)</span>
            <input
              type="checkbox"
              checked={!!prefs?.marketingEmail}
              onChange={(e) => setPrefs.mutate({ marketingEmail: e.target.checked })}
              className="h-4 w-4 accent-sky-600"
            />
          </label>
          <label className="flex items-center justify-between">
            <span>Analytics cookies (none currently deployed)</span>
            <input
              type="checkbox"
              checked={!!prefs?.analyticsCookies}
              onChange={(e) => setPrefs.mutate({ analyticsCookies: e.target.checked })}
              className="h-4 w-4 accent-sky-600"
            />
          </label>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
          <BellOff className="h-3.5 w-3.5" /> Opting out of marketing never affects transactional/security communications.
        </p>
      </section>

      {/* Request log */}
      <section className="glass rounded-2xl p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">Request log</h2>
        {(requests.data?.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No privacy requests yet.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400">
              <th className="pb-2">Request</th><th className="pb-2">Type</th><th className="pb-2">Status</th><th className="pb-2">Filed</th>
            </tr></thead>
            <tbody>
              {requests.data!.map((r) => (
                <tr key={r.requestId} className="border-t border-slate-100">
                  <td className="py-2 font-mono text-xs">{r.requestId}</td>
                  <td className="py-2">{r.type}</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.status === 'COMPLETED' ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'}`}>{r.status}</span>
                  </td>
                  <td className="py-2 text-slate-500">{new Date(r.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Consent history */}
      <section className="glass rounded-2xl p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">Your acceptance records</h2>
        {(acceptances.data?.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No recorded acceptances.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            {acceptances.data!.map((a) => (
              <li key={a.consentRecordId} className="flex flex-wrap items-center gap-2">
                <Send className="h-3.5 w-3.5 text-sky-600" />
                <span className="font-medium text-slate-800">{a.documentSlug}</span>
                <span className="text-xs text-slate-400">v{a.documentVersion} · {a.method} · {new Date(a.acceptedAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Deactivation */}
      <section className="rounded-2xl border border-red-200 bg-red-50/50 p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-red-600">
          <AlertTriangle className="h-4 w-4" /> Deactivate account
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Deactivation stops sign-in and immediately disables all automation. It does <b>not</b> delete your data —
          use a deletion request above for eligible data; regulated financial records are retained as required.
        </p>
        {!confirmDeactivate ? (
          <Button variant="outline" className="mt-4 border-red-300 text-red-600" onClick={() => setConfirmDeactivate(true)}>
            Deactivate my account
          </Button>
        ) : (
          <div className="mt-4 flex items-center gap-3">
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deactivate.isPending}
              onClick={async () => { await deactivate.mutateAsync(); window.location.href = '/'; }}
            >
              {deactivate.isPending ? 'Deactivating…' : 'Confirm deactivation'}
            </Button>
            <Button variant="outline" onClick={() => setConfirmDeactivate(false)}>Cancel</Button>
          </div>
        )}
      </section>
    </div>
  );
}
