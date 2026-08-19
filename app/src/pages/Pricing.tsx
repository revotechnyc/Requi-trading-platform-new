import { Link } from 'react-router';
import { ArrowRight, ShieldAlert } from 'lucide-react';
import { Navbar } from '@/sections/landing/Navbar';
import { CtaFooter } from '@/sections/landing/Closing';
import { PLANS, PlanCard } from '@/sections/landing/Pricing';
import { Reveal } from '@/components/Reveal';

/**
 * /pricing — full pricing page: header → plans → feature comparison → FAQ →
 * trading/risk disclosure → CTA (Final Pass spec §8).
 */

const COMPARISON: { label: string; values: [boolean, boolean, boolean, boolean] }[] = [
  { label: 'Requi Trading Intelligence', values: [true, true, true, true] },
  { label: 'AI-powered market reasoning & research', values: [true, true, true, true] },
  { label: 'Live market-data integration', values: [true, true, true, true] },
  { label: 'Marketplace access', values: [true, true, true, true] },
  { label: 'Backtesting & risk analysis', values: [true, true, true, true] },
  { label: 'Paper trading', values: [true, true, true, true] },
  { label: 'Save strategies & research', values: [true, true, true, true] },
  { label: 'Connect supported brokerage accounts', values: [false, true, true, true] },
  { label: 'User-directed trade submission', values: [false, true, true, true] },
  { label: 'Autonomous Trading', values: [false, false, true, true] },
  { label: '100+ included trading strategies', values: [false, false, true, true] },
  { label: 'Human / No-Human Confirmation modes', values: [false, false, true, true] },
  { label: 'Emergency Stop / Kill Switch', values: [false, false, true, true] },
  { label: 'Teams, hierarchy & role-based access', values: [false, false, false, true] },
  { label: 'Organization-level risk controls', values: [false, false, false, true] },
  { label: 'Enterprise reporting & audit logs', values: [false, false, false, true] },
  { label: 'Custom onboarding & integrations', values: [false, false, false, true] },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Do I need a credit card for the free trial?',
    a: 'No. The 14-day free trial requires no payment information. You will never be charged unless you affirmatively choose a paid subscription.',
  },
  {
    q: 'What happens when my trial ends?',
    a: 'Your workspace remains accessible in a limited state and you can choose Basic or Autonomous Pro to continue. Nothing is billed automatically at trial expiry.',
  },
  {
    q: 'Can I cancel my subscription?',
    a: 'Yes. You can cancel from your billing settings; access continues until the end of the current paid period. Cancellation terms are stated in the Subscription & Billing Terms presented before you authorize paid billing.',
  },
  {
    q: 'Does Autonomous Pro place trades without me?',
    a: 'Only if you select No Human Confirmation mode and complete the required authorizations. Human Confirmation mode is available, paper autonomous trading is included, and the Emergency Stop is always one click away. Live autonomous trading additionally requires a supported, connected brokerage account.',
  },
  {
    q: 'Is past or simulated performance a promise of results?',
    a: 'No. Backtests and paper trading are hypothetical and simulated; they can differ materially from live execution and never guarantee future results.',
  },
];

const Mark = ({ v }: { v: boolean }) =>
  v ? <span className="font-semibold text-teal-600">✓</span> : <span className="text-slate-300">—</span>;

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-16">
        {/* header */}
        <section className="relative py-20 sm:py-24">
          <div className="mx-auto max-w-3xl px-5 text-center lg:px-8">
            <Reveal>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">Pricing</p>
              <h1 className="font-display text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">
                One platform. <span className="text-gradient">Every stage of your trading.</span>
              </h1>
              <p className="mt-6 leading-relaxed text-slate-500">
                Start with 14 days free — no credit card required. Choose a plan only when you're ready.
              </p>
            </Reveal>
          </div>
        </section>

        {/* plans */}
        <section className="pb-8">
          <div className="mx-auto grid max-w-7xl gap-6 px-5 sm:grid-cols-2 lg:px-8 xl:grid-cols-4">
            {PLANS.map((p, i) => (
              <Reveal key={p.id} delay={i * 0.08}>
                <PlanCard plan={p} />
              </Reveal>
            ))}
          </div>
        </section>

        {/* feature comparison */}
        <section className="py-20">
          <div className="mx-auto max-w-6xl px-5 lg:px-8">
            <Reveal className="mb-10 text-center">
              <h2 className="font-display text-2xl font-bold text-slate-900 sm:text-4xl">Compare plans</h2>
            </Reveal>
            <Reveal>
              <div className="glass overflow-x-auto rounded-2xl">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-900/5 text-left">
                      <th className="px-6 py-4 font-semibold text-slate-900">Capability</th>
                      {PLANS.map((p) => (
                        <th key={p.id} className="px-4 py-4 text-center font-semibold text-slate-900">{p.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARISON.map((row) => (
                      <tr key={row.label} className="border-b border-slate-900/5 last:border-0 hover:bg-slate-900/[0.015]">
                        <td className="px-6 py-3 text-slate-600">{row.label}</td>
                        {row.values.map((v, i) => (
                          <td key={i} className="px-4 py-3 text-center"><Mark v={v} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20">
          <div className="mx-auto max-w-3xl px-5 lg:px-8">
            <Reveal className="mb-10 text-center">
              <h2 className="font-display text-2xl font-bold text-slate-900 sm:text-4xl">Questions</h2>
            </Reveal>
            <div className="space-y-4">
              {FAQ.map((f, i) => (
                <Reveal key={f.q} delay={i * 0.05}>
                  <div className="glass rounded-2xl p-6">
                    <p className="font-semibold text-slate-900">{f.q}</p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">{f.a}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* trading / risk disclosure */}
        <section className="pb-20">
          <div className="mx-auto max-w-4xl px-5 lg:px-8">
            <Reveal>
              <div className="rounded-2xl border border-amber-500/20 bg-amber-50/60 p-6 sm:p-8">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div>
                    <p className="font-semibold text-slate-900">Trading & Risk Disclosure</p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      Trading involves substantial risk of loss, and you can lose some or all of the capital you
                      allocate. Automated strategies can react quickly and may produce losses quickly. Backtested,
                      hypothetical, and paper-trading results do not represent actual trading and do not guarantee
                      future performance. Market data may be delayed or sourced from third-party providers, and live
                      execution is always subject to your brokerage agreements and broker-confirmed execution. No
                      plan, strategy, or feature of Requi Trading promises profits or successful trades. Review the
                      full documents in the <Link to="/legal" className="font-medium text-sky-600 hover:underline">Legal Center</Link> before
                      enabling any trading functionality.
                    </p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* CTA */}
        <section className="pb-24 text-center">
          <Reveal>
            <p className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">Ready when you are.</p>
            <Link
              to="/login"
              className="btn-glow mt-6 inline-flex items-center gap-2 rounded-xl bg-royal-500 px-8 py-3.5 text-sm font-semibold text-white hover:bg-sky-600"
            >
              Start your 14-day free trial <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-3 text-xs text-slate-400">No credit card required.</p>
          </Reveal>
        </section>

        <CtaFooter />
      </main>
    </div>
  );
}
