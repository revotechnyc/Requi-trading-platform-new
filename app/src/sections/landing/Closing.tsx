import { Link } from 'react-router';
import {
  BrainCircuit, CandlestickChart, FlaskConical, TestTube2, Webhook, BellRing, Landmark,
  Layers3, Users, Smartphone, Code2, ArrowRight, Quote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/Reveal';
import { LogoMark } from '@/components/Brand';
import { LegalFooter } from '@/components/LegalFooter';

/* ─── Features ──────────────────────────────────────────────────────────── */

const features = [
  { icon: BrainCircuit, title: 'All-in-One AI Trading Platform', body: 'Connect strategies, brokers, and accounts in one place.' },
  { icon: CandlestickChart, title: 'TradingView & TrendSpider', body: 'Send signals from your charting tools into the deterministic execution pipeline.' },
  { icon: FlaskConical, title: 'Advanced Backtesting', body: 'Validate strategies against years of data before going live.' },
  { icon: TestTube2, title: 'Paper Trading', body: 'Practice every workflow in simulation — no real money at risk while you learn.' },
  { icon: Webhook, title: 'Webhooks', body: 'Send signals from anywhere with a single HTTP POST.' },
  { icon: BellRing, title: 'Event Notifications', body: 'Stay informed on fills, alerts, and account events as they are recorded.' },
  { icon: Landmark, title: 'Account Types', body: 'Works with the account types your brokerage supports, under your brokerage agreement.' },
  { icon: Layers3, title: 'Equities Execution', body: 'U.S. equities from one deterministic engine — paper first, live when connected.' },
  { icon: Users, title: 'Multi-Account Management', body: 'Run the same strategy across many accounts from one dashboard.' },
  { icon: Smartphone, title: 'Mobile-Friendly Interface', body: 'Trade and monitor on the go, from any device.' },
  { icon: Code2, title: 'Unified Broker API', body: 'Build custom tools and bots on top of Requi.' },
];

export function Features() {
  return (
    <section id="features" className="relative py-24 sm:py-32">
      <div className="absolute inset-0 bg-grid mask-fade-b opacity-50" />
      <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">Features</p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Take control with automated trading bots <span className="text-gradient">built your way</span>
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={(i % 4) * 0.06}>
              <div className="glass glass-hover group h-full rounded-2xl p-5">
                <div className="mb-4 grid h-10 w-10 place-items-center rounded-lg border border-sky-600/20 bg-royal-500/10 text-sky-600 transition-colors group-hover:bg-royal-500/20">
                  <f.icon className="h-4.5 w-4.5" />
                </div>
                <h3 className="text-[15px] font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Testimonials ────────────────────────────────────────────────────────
   REMOVED (Legal Revision §16): the previous quotes were illustrative and not
   from verified customers — fabricated testimonials violate FTC endorsement
   rules. This section returns only with real, permissioned, substantiated quotes. */

export function Testimonials() {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">Why traders choose Requi</p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Built for <span className="text-gradient">discipline, not hype</span>
          </h2>
          <p className="mt-5 text-slate-500">
            Deterministic execution, honest empty states, versioned audit trails, and paper-first
            deployment. We publish what the software does — not invented results.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ─── Connections ───────────────────────────────────────────────────────── */

export function Connections() {
  return (
    <section id="connections" className="relative py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">Connections</p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Broker connectivity — what's real today
          </h2>
          <p className="mt-4 text-sm text-slate-500">
            Interactive Brokers integration and a built-in paper engine are available now.
            Signal ingestion via TradingView/TrendSpider-style webhooks. Additional broker
            integrations are in development and will be listed here only when live.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="glass mx-auto mt-12 max-w-4xl rounded-2xl p-8">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="rounded-full border border-teal-600/30 bg-teal-600/10 px-5 py-2.5 text-sm font-semibold text-teal-700">
                Interactive Brokers — live integration
              </span>
              <span className="rounded-full border border-teal-600/30 bg-teal-600/10 px-5 py-2.5 text-sm font-semibold text-teal-700">
                Paper engine — built in
              </span>
              <span className="rounded-full border border-sky-600/30 bg-sky-600/10 px-5 py-2.5 text-sm font-semibold text-sky-700">
                Webhook signal ingestion
              </span>
            </div>
            <p className="mt-5 text-center text-[11px] text-slate-400">
              Broker names are trademarks of their respective owners; integration does not imply endorsement or partnership.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─── CTA + Footer ──────────────────────────────────────────────────────── */

export function CtaFooter() {
  return (
    <>
      <section className="relative overflow-hidden py-24 sm:py-32">
        <div className="glow-orb left-1/2 top-1/2 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 bg-royal-600/20" />
        <div className="absolute inset-0 bg-circuit opacity-40" />
        <Reveal className="relative mx-auto max-w-3xl px-5 text-center">
          <h2 className="font-display text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">
            Ready to trade <span className="text-gradient">smarter?</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-slate-500">
            Set up your first paper strategy in minutes — automation with confirmations,
            stop discipline, and a full audit trail.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="btn-glow h-12 bg-royal-500 px-8 text-base font-semibold text-white hover:bg-sky-600">
              <Link to="/login">
                Get Started Free <ArrowRight className="ml-1.5 h-4.5 w-4.5" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 border-slate-900/10 bg-slate-900/[0.03] px-8 text-base font-semibold text-slate-700 hover:bg-slate-900/[0.07] hover:text-slate-900">
              <Link to="/login">Book a Demo</Link>
            </Button>
          </div>
        </Reveal>
      </section>

      <LegalFooter />
    </>
  );
}
