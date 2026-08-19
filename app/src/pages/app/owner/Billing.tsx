import { DollarSign, CreditCard, AlertTriangle } from 'lucide-react';
import { PageHeader } from './shared';

/**
 * Billing (Legal Revision §2 honest-state rule): there is NO billing system
 * connected to Requi today — no Stripe account, no subscriptions, no invoices.
 * The previous mock MRR/invoice dataset was fabricated and has been removed.
 * When payments launch (marketplace §5 architecture), this page reads the
 * marketplace ledger — never a mock.
 */
export default function OwnerBilling() {
  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Owner · Billing"
        title="Billing"
        description="Subscription revenue, plan mix, and invoices."
      />
      <div className="glass rounded-2xl p-10 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-900/[0.04]">
          <CreditCard className="h-5 w-5 text-slate-400" />
        </div>
        <h2 className="font-display mt-4 text-lg font-bold text-slate-900">Billing is not enabled</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          No payment processor is connected and no subscription plans exist. There is no MRR,
          no plan mix, and no invoice history to report — this module will never display assumed values.
        </p>
        <div className="mx-auto mt-6 flex max-w-lg items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-50 p-4 text-left text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Marketplace payments are gated behind regulatory classification review (see Owner → Compliance).
          When activated, revenue reporting will derive from the marketplace ledger.
        </div>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400">
          <DollarSign className="h-3.5 w-3.5" /> $0.00 is shown only when a real zero-balance ledger exists — it does not, so nothing is shown.
        </div>
      </div>
    </div>
  );
}
