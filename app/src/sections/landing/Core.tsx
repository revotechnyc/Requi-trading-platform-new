import { Link } from 'react-router';
import {
  PenLine, Link2, Send, ArrowRight, Store, Star, User, LineChart, MousePointerClick, Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal, Pnl } from '@/components/Reveal';
// Real RTI catalog previews (Master Build): three actual listings from the
// marketplace — names and descriptions match the published products.
const rtiPreviews = [
  {
    name: 'Opening Range Breakout',
    category: 'Momentum',
    blurb:
      'A live-scan strategy that ranks liquid opening-range breakout candidates by price action, volume, spread, catalyst, and setup quality — with entry trigger, invalidation, targets, and a NO TRADE rule.',
  },
  {
    name: 'Market Regime Scanner',
    category: 'Market Research',
    blurb:
      'Classifies the current market regime from trend, breadth, and volatility inputs, with sourced, timestamped facts and an explicit verdict before any setup is considered.',
  },
  {
    name: 'Position-Size Calculator',
    category: 'Execution & Risk',
    blurb:
      'Turns a chosen setup into a sized plan — fixed-dollar or percentage risk, stop distance, and maximum planned loss defined before any order.',
  },
];

/* ─── About ─────────────────────────────────────────────────────────────── */

/* FTC sweep (Legal Revision §16): no unsubstantiated metrics — capability facts only. */
const stats = [
  { value: 'Deterministic', label: 'Rules-based execution engine — AI never fires orders' },
  { value: 'Holiday-aware', label: 'NYSE session calendar with early closes and DST' },
  { value: 'Idempotent', label: 'Retry-safe order pipeline with audit trail' },
  { value: 'Paper-first', label: 'Simulated fills before any live connection' },
];

export function About() {
  return (
    <section id="platform" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <Reveal>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">About Requi Trading</p>
            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              One unified infrastructure for <span className="text-gradient">automated trading</span>
            </h2>
            <p className="mt-6 leading-relaxed text-slate-500">
              Whether you're building strategies in TradingView or TrendSpider, sending custom signals,
              or scaling across multiple brokers and accounts — Requi handles the heavy lifting with
              precision and reliability.
            </p>
            <p className="mt-4 leading-relaxed text-slate-500">
              No more manual order entry. No more missed opportunities. Just intelligent, 24/7 execution
              powered by next-level AI.
            </p>
            <Button asChild variant="outline" className="mt-8 border-sky-600/30 bg-royal-500/10 text-sky-600 hover:bg-royal-500/20 hover:text-sky-800">
              <Link to="/login">
                Explore the platform <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </Reveal>

          <Reveal delay={0.12}>
            <div className="grid grid-cols-2 gap-4">
              {stats.map((s, i) => (
                <div
                  key={s.label}
                  className={`glass glass-hover rounded-2xl p-6 ${i % 2 === 1 ? 'sm:translate-y-6' : ''}`}
                >
                  <p className="font-display text-3xl font-bold text-slate-900 sm:text-4xl">{s.value}</p>
                  <p className="mt-1.5 text-sm text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ─── How It Works ──────────────────────────────────────────────────────── */

const steps = [
  {
    icon: PenLine,
    num: '01',
    title: 'Create',
    body: 'Define clear entry and exit rules, set stop-loss, take-profit, and position sizing. Connect directly to TradingView alerts, TrendSpider, or use clean JSON templates.',
  },
  {
    icon: Link2,
    num: '02',
    title: 'Connect',
    body: 'Link your broker accounts in seconds. Subscribe any broker to your strategies and route signals to multiple accounts simultaneously.',
  },
  {
    icon: Send,
    num: '03',
    title: 'Send',
    body: 'Fire a webhook from any signal source. Requi executes orders instantly across all connected brokers while you track fills, P&L, and positions in real-time.',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-24 sm:py-32">
      <div className="absolute inset-0 bg-grid mask-fade-b opacity-70" />
      <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">How It Works</p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Simple. Powerful. <span className="text-gradient">Scalable.</span>
          </h2>
          <p className="mt-5 text-slate-500">From idea to live execution in three steps — no code required.</p>
        </Reveal>

        <div className="relative mt-16 grid gap-6 md:grid-cols-3">
          <div className="absolute left-[16%] right-[16%] top-14 hidden h-px bg-gradient-to-r from-transparent via-royal-500/40 to-transparent md:block" />
          {steps.map((s, i) => (
            <Reveal key={s.num} delay={i * 0.12}>
              <div className="glass glass-hover relative h-full rounded-2xl p-7">
                <div className="mb-6 flex items-center justify-between">
                  <div className="grid h-12 w-12 place-items-center rounded-xl border border-sky-600/25 bg-royal-500/10 text-sky-600">
                    <s.icon className="h-5.5 w-5.5" />
                  </div>
                  <span className="font-display text-5xl font-bold text-slate-900/[0.06]">{s.num}</span>
                </div>
                <h3 className="font-display text-xl font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-500">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Marketplace preview ───────────────────────────────────────────────── */

export function MarketplaceSection() {
  return (
    <section id="marketplace" className="relative py-24 sm:py-32">
      <div className="glow-orb right-[-200px] top-24 h-[420px] w-[420px] bg-royal-600/12" />
      <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
        <Reveal className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-xl">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">
              <Store className="h-4 w-4" /> Marketplace
            </p>
            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              The RTI Strategy Marketplace, <span className="text-gradient">151 real strategies</span>
            </h2>
            <p className="mt-5 text-slate-500">
              Browse 150 live-scan, research, and execution workflows plus the institutional strategy
              playbook — every listing published by RTI at $29. Purchases open after final legal
              review and payment integration; the full catalog is browsable today.
            </p>
          </div>
          <Button asChild variant="outline" className="shrink-0 border-slate-900/10 bg-slate-900/[0.03] text-slate-700 hover:bg-slate-900/[0.07]">
            <Link to="/login">
              Browse marketplace <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </Reveal>

        <div className="mt-10 rounded-2xl border border-amber-500/25 bg-amber-50/60 p-5 text-sm text-amber-900">
          Marketplace checkout is disabled while payment integration and final legal review complete —
          browsing the full catalog is open. Educational research only: no listing is a promise of
          returns, and any performance figure shown in the future will be labeled LIVE, PAPER/SIMULATED,
          BACKTESTED, or HYPOTHETICAL and computed from verifiable platform records.
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rtiPreviews.map((m, i) => (
            <Reveal key={m.name} delay={i * 0.1}>
              <div className="glass glass-hover group h-full rounded-2xl p-6">
                <span className="rounded-md border border-sky-600/20 bg-royal-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-600">
                  {m.category}
                </span>
                <h3 className="font-display mt-3 text-lg font-semibold text-slate-900">{m.name}</h3>
                <p className="mt-3 line-clamp-4 text-xs leading-relaxed text-slate-500">{m.blurb}</p>
                <p className="mt-4 text-[11px] text-slate-400">Published by RTI · $29 · full strategy unlocks after purchase</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Audiences ─────────────────────────────────────────────────────────── */

const audiences = [
  {
    icon: User,
    title: 'Retail Traders',
    body: 'Automate your edge and trade like a pro across multiple accounts.',
  },
  {
    icon: LineChart,
    title: 'Systematic Traders',
    body: 'Build, backtest, and deploy any strategy — trend-following, mean-reversion, or custom logic — with bulletproof order routing and risk management.',
  },
  {
    icon: MousePointerClick,
    title: 'Discretionary Traders',
    body: 'Trade directly from TradingView charts, price lines, or alerts and execute instantly across all your linked accounts.',
  },
  {
    icon: Building2,
    title: 'Prop Firm Traders',
    body: 'Synchronize evaluations and funded accounts (Topstep, Apex, and others) with ease. One signal. Multiple accounts. Single dashboard.',
  },
];

export function Audiences() {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-sky-600">Who It's For</p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Built for every kind of <span className="text-gradient">trader</span>
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {audiences.map((a, i) => (
            <Reveal key={a.title} delay={i * 0.08}>
              <div className="glass glass-hover h-full rounded-2xl p-6">
                <div className="mb-5 grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-royal-500/20 to-sky-500/10 text-sky-600 ring-1 ring-sky-600/20">
                  <a.icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-lg font-semibold text-slate-900">{a.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-500">{a.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
