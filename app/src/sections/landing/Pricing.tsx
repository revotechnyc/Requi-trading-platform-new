import { Link } from 'react-router';
import { Check, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/Reveal';
import { cn } from '@/lib/utils';

/**
 * Pricing — single source of truth for plan presentation (landing section +
 * /pricing page render from the same data). No profit promises, no guaranteed
 * performance language (Legal Revision). Billing/trial enforcement is
 * server-side; these cards are presentation only.
 */

export interface Plan {
  id: 'TRIAL' | 'BASIC' | 'AUTONOMOUS' | 'ENTERPRISE';
  name: string;
  price: string;
  period?: string;
  tagline: string;
  features: string[];
  cta: string;
  ctaTo: string;
  featured?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: 'TRIAL',
    name: '14-Day Free Trial',
    price: '$0',
    tagline: 'No credit card required',
    features: [
      'Explore Requi Trading Intelligence',
      'Research live markets',
      'Experience quantitative research workflows',
      'Explore platform functionality',
      'Evaluate Requi before subscribing',
    ],
    cta: 'Start Free Trial',
    ctaTo: '/login',
  },
  {
    id: 'BASIC',
    name: 'Basic',
    price: '$59',
    period: '/month',
    tagline: 'Intelligence, research & user-directed trading',
    features: [
      'Requi Trading Intelligence',
      'AI-powered market reasoning',
      'Quantitative market research & opportunity analysis',
      'Live market-data integration',
      'Marketplace access',
      'Save strategies & research',
      'Quick Start AI research prompts',
      'Finance & Reporting',
      'Backtesting & risk analysis',
      'Paper trading',
      'Connect supported brokerage accounts',
      'Submit eligible user-directed trades',
      'Trading history where supported',
    ],
    cta: 'Choose Basic',
    ctaTo: '/login',
  },
  {
    id: 'AUTONOMOUS',
    name: 'Autonomous Pro',
    price: '$299',
    period: '/month',
    tagline: 'Everything in Basic, plus full automation',
    features: [
      'Autonomous Trading',
      '100+ included trading strategies',
      'Continuous market monitoring',
      'Automated strategy selection & condition matching',
      'Autonomous opportunity detection',
      'Automated risk validation & position monitoring',
      'Human Confirmation or No Human Confirmation mode',
      'Paper autonomous trading',
      'Eligible live autonomous trading via supported brokers',
      'Autonomous Live Run Stream & P&L',
      'Stop-loss & trailing-stop management',
      'Capital allocation controls',
      'Emergency Stop / Kill Switch',
    ],
    cta: 'Go Autonomous',
    ctaTo: '/login',
    featured: true,
  },
  {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    price: 'Contact Us',
    tagline: 'For teams and organizations',
    features: [
      'Everything in Autonomous Pro',
      'Multiple teams & team hierarchy',
      'Centralized administration & role-based access',
      'Multiple connected accounts where supported',
      'Enterprise reporting & usage analytics',
      'Organization-level risk controls',
      'Team-level capital permissions',
      'Audit logs',
      'Priority support & custom onboarding',
      'Custom integrations & deployment support',
    ],
    cta: 'Contact Sales',
    ctaTo: '/login',
  },
];

export function PlanCard({ plan, compact = false }: { plan: Plan; compact?: boolean }) {
  return (
    <div
      className={cn(
        'glass glass-hover relative flex flex-col rounded-2xl p-7',
        plan.featured && 'border-royal-500/40 shadow-xl shadow-royal-500/10',
      )}
    >
      {plan.featured && (
        <span className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-gradient-to-r from-royal-500 to-sky-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
          <Sparkles className="h-3 w-3" /> Most popular
        </span>
      )}
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-600">{plan.name}</p>
      <p className="font-display mt-3 text-4xl font-bold tabular-nums text-slate-900">
        {plan.price}
        {plan.period && <span className="text-base font-medium text-slate-400">{plan.period}</span>}
      </p>
      <p className="mt-1.5 text-sm text-slate-500">{plan.tagline}</p>
      <ul className={cn('mt-6 flex-1 space-y-2.5', compact && 'text-[13px]')}>
        {(compact ? plan.features.slice(0, 6) : plan.features).map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm text-slate-600">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
            <span>{f}</span>
          </li>
        ))}
        {compact && plan.features.length > 6 && (
          <li className="pl-[26px] text-xs text-slate-400">
            + {plan.features.length - 6} more — see <Link to="/pricing" className="text-sky-600 hover:underline">full comparison</Link>
          </li>
        )}
      </ul>
      <Button
        asChild
        className={cn(
          'mt-7 w-full font-semibold',
          plan.featured
            ? 'btn-glow bg-royal-500 text-white hover:bg-sky-600'
            : 'border border-slate-900/10 bg-white text-slate-900 hover:bg-slate-50',
        )}
      >
        <Link to={plan.ctaTo}>
          {plan.cta} <ArrowRight className="ml-1.5 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

/* ─── Landing section ─────────────────────────────────────────────────────── */

export function PricingSection() {
  return (
    <section id="pricing" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">Pricing</p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Start free. <span className="text-gradient">Scale when ready.</span>
          </h2>
          <p className="mt-5 leading-relaxed text-slate-500">
            Every account begins with a 14-day free trial — no credit card required. Upgrade only when
            Requi has earned it.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p, i) => (
            <Reveal key={p.id} delay={i * 0.08}>
              <PlanCard plan={p} compact />
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-8 text-center">
          <p className="text-xs leading-relaxed text-slate-400">
            Trading involves risk of loss. Simulated or historical performance does not guarantee future
            results. See the <Link to="/pricing" className="text-sky-600 hover:underline">full pricing details and disclosures</Link>.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
