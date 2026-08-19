import { Link } from 'react-router';
import { motion } from 'framer-motion';
import { Play, ArrowRight, Zap, Sparkles, SendHorizonal, Route, ShieldCheck, CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LogoMark } from '@/components/Brand';
import { tickerTape, strategies } from '@/lib/data';

const ease = [0.22, 1, 0.36, 1] as const;

/** Miniature intelligence-console mock shown inside the hero. */
function IntelligenceMock() {
  return (
    <div className="glass relative mx-auto w-full max-w-4xl overflow-hidden rounded-2xl shadow-[0_40px_120px_-30px_hsl(225_73%_50%/0.35)]">
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-slate-900/5 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-teal-600/70" />
        <div className="ml-4 hidden items-center gap-2 rounded-md border border-slate-900/5 bg-slate-900/[0.03] px-3 py-1 text-[11px] text-slate-500 sm:flex">
          app.requi.trading/intelligence
        </div>
        <div className="ml-auto flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
          ILLUSTRATIVE DEMO
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-[1.5fr_1fr] sm:p-5">
        {/* console side */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <LogoMark className="h-6 w-6 rounded-md" />
            <span className="text-xs font-semibold text-slate-900">Trading Console</span>
          </div>

          {/* user pasted strategy */}
          <div className="flex justify-end">
            <pre className="font-mono-num max-w-[90%] whitespace-pre-wrap rounded-xl rounded-br-sm border border-royal-500/30 bg-royal-500/15 px-3 py-2.5 text-[10px] leading-relaxed text-sky-800">
{`Trade large-cap momentum breakouts.
ENTRY: Close above 20-day high, RVOL > 1.5.
EXIT: +8% target or -3% stop.
SIZING: Risk 1.5% per position.`}
            </pre>
          </div>

          {/* ai parsed reply */}
          <div className="flex gap-2">
            <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-gradient-to-br from-royal-500 via-sky-500 to-teal-500">
              <Sparkles className="h-3 w-3 text-white" />
            </div>
            <div className="max-w-[90%] rounded-xl rounded-tl-sm border border-slate-900/8 bg-slate-900/[0.03] p-3">
              <p className="text-[11px] font-semibold text-slate-900">
                Strategy parsed — Momentum Breakout
                <span className="ml-2 rounded-full bg-teal-600/10 px-1.5 py-0.5 text-[9px] font-bold text-teal-700">RISK CHECK PASSED</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {['ENTRY', 'EXIT', 'SIZING'].map((l) => (
                  <span key={l} className="font-mono-num rounded border border-sky-600/25 bg-sky-600/10 px-1.5 py-0.5 text-[9px] font-bold text-sky-600">
                    {l} ✓
                  </span>
                ))}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-slate-900/5 pt-2.5">
                <span className="flex items-center gap-1 rounded bg-teal-500/10 px-1.5 py-1 text-[9px] font-semibold text-teal-700">
                  <Route className="h-2.5 w-2.5" /> Routes to connected accounts
                </span>
                <span className="flex items-center gap-1 rounded bg-slate-900/[0.04] px-1.5 py-1 text-[9px] text-slate-600">
                  <ShieldCheck className="h-2.5 w-2.5 text-sky-600" /> Stop required on every ticket
                </span>
                <span className="flex items-center gap-1 rounded bg-slate-900/[0.04] px-1.5 py-1 text-[9px] text-slate-600">
                  <CircleCheck className="h-2.5 w-2.5 text-sky-600" /> Confirmation before any live order
                </span>
              </div>
            </div>
          </div>

          {/* input bar */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-900/10 bg-slate-900/[0.03] px-3 py-2.5">
            <span className="font-mono-num flex-1 truncate text-[10.5px] text-slate-500">
              Paste a text strategy here (ENTRY / EXIT / SIZING…)…
            </span>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-royal-500">
              <SendHorizonal className="h-3.5 w-3.5 text-white" />
            </span>
          </div>
        </div>

        {/* library side */}
        <div className="hidden space-y-2.5 sm:block">
          <p className="text-xs font-semibold text-slate-900">Strategy Library</p>
          {strategies.slice(0, 3).map((s) => (
            <div key={s.id} className="rounded-lg border border-slate-900/8 bg-slate-900/[0.02] p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-700">{s.name}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold ${s.status === 'Live' ? 'bg-teal-600/10 text-teal-700' : 'bg-amber-500/10 text-amber-600'}`}>
                  {s.status}
                </span>
              </div>
              <p className="font-mono-num mt-1 line-clamp-2 text-[9px] leading-relaxed text-slate-500">{s.prompt}</p>
            </div>
          ))}
          <p className="pt-1 text-center text-[9px] text-slate-600">Text-based · copy & paste to trade</p>
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-16 pt-32 sm:pt-40">
      {/* backdrop */}
      <div className="absolute inset-0 bg-circuit opacity-60" />
      <div className="glow-orb left-1/2 top-[-260px] h-[560px] w-[900px] -translate-x-1/2 bg-royal-600/25" />
      <div className="glow-orb right-[-160px] top-[300px] h-[420px] w-[420px] bg-sky-500/15" />
      <div className="glow-orb left-[-180px] top-[480px] h-[380px] w-[380px] bg-teal-500/10" />

      <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-sky-600/25 bg-sky-600/10 px-4 py-1.5 text-xs font-medium text-sky-600"
          >
            <Zap className="h-3.5 w-3.5" />
            Requi AI Engine 2.0 is live
            <span className="h-1 w-1 rounded-full bg-sky-600" />
            <span className="text-slate-500">Multi-account execution</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.08, ease }}
            className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl lg:text-7xl"
          >
            Next-Level <span className="text-gradient">Intelligence</span> for Automated Trading
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.16, ease }}
            className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-500 sm:text-lg"
          >
            Requi turns your strategies into consistent, multi-account execution for U.S. equities.
            Paste any text strategy into Intelligence — the deterministic engine validates it,
            stages it, and waits for your confirmation before any order.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.24, ease }}
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Button asChild size="lg" className="btn-glow h-12 bg-royal-500 px-7 text-base font-semibold text-white hover:bg-royal-600">
              <Link to="/login">
                Get Started <ArrowRight className="ml-1.5 h-4.5 w-4.5" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 border-slate-900/10 bg-slate-900/[0.03] px-7 text-base font-semibold text-slate-700 backdrop-blur hover:bg-slate-900/[0.07] hover:text-slate-900"
            >
              <a href="#how-it-works">
                <Play className="mr-1.5 h-4 w-4 fill-current" /> Watch Demo
              </a>
            </Button>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-5 text-xs text-slate-500"
          >
            Paper trading included · No credit card required · Automation always confirmable and stoppable
          </motion.p>
        </div>

        {/* intelligence console preview */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.35, ease }}
          className="relative mt-16 sm:mt-20"
        >
          <div className="absolute inset-x-8 -top-6 h-24 rounded-full bg-royal-500/20 blur-3xl" />
          <IntelligenceMock />
        </motion.div>
      </div>

      {/* trust bar */}
      <div className="relative mt-16 border-y border-slate-900/5 bg-slate-900/[0.015] py-6">
        <p className="mb-4 text-center text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
          Illustrative market tape — simulated symbols, not live quotes
        </p>
        <div className="mask-fade-edges-x overflow-hidden">
          <div className="marquee-track flex w-max items-center gap-12 px-6">
            {[...tickerTape, ...tickerTape].map((t, i) => (
              <div key={i} className="flex items-center gap-2.5 whitespace-nowrap">
                <span className="font-mono-num text-sm font-semibold text-slate-600">{t.symbol}</span>
                <span className="font-mono-num text-sm text-slate-500">{t.price}</span>
                <span className={`font-mono-num text-sm font-medium ${t.chg.startsWith('+') ? 'text-teal-600' : 'text-red-600'}`}>
                  {t.chg}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 px-6 text-sm font-semibold text-slate-500">
          {['Robinhood', 'Binance', 'Coinbase', 'NinjaTrader', 'E*TRADE'].map((b) => (
            <span key={b} className="transition-colors hover:text-slate-600">{b}</span>
          ))}
          <span className="text-slate-600">+ many more</span>
        </div>
      </div>
    </section>
  );
}
