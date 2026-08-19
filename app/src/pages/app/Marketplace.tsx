import { useMemo, useState } from 'react';
import { Search, ShieldAlert, Lock, CheckCircle2, BookOpen, ArrowLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';

/**
 * RTI STRATEGY MARKETPLACE — Master Build.
 * Catalog source of truth: the RTI strategy documents (150 scan / research /
 * execution prompts + the Institutional Strategy Playbook). Seller is always
 * RTI; every listing is $29. No dummy, sample, or fabricated inventory — the
 * pre-revision mock catalog (third-party sellers, ratings, sales counts,
 * 90-day returns) was purged. Full paid strategy content is served only
 * through the Library for entitled users (server-enforced). Purchases are
 * gated server-side pending legal review (LB-2) and payment integration —
 * the CTA explains this honestly instead of simulating a checkout.
 */

type Preview = {
  slug: string;
  name: string;
  author: string;
  kind: 'Strategy' | 'AI Prompt';
  asset: string;
  price: number;
  category: string;
  description: string;
  outcome: string;
  tags: string[];
};

export default function Marketplace() {
  const [category, setCategory] = useState<string>('All');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { data, isLoading } = trpc.marketplace.list.useQuery();
  const detail = trpc.marketplace.detail.useQuery(
    { slug: selected ?? '' },
    { enabled: !!selected },
  );
  const purchase = trpc.marketplace.purchase.useMutation({
    onError: (e) => setNotice(e.message),
  });

  const items = (data ?? []) as Preview[];
  const categories = useMemo(
    () => ['All', ...Array.from(new Set(items.map((i) => i.category))).sort()],
    [items],
  );

  const list = items.filter(
    (m) =>
      (category === 'All' || m.category === category) &&
      (m.name + m.description + m.asset + m.tags.join(' '))
        .toLowerCase()
        .includes(query.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm text-slate-500">RTI Strategy Marketplace</p>
          <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">
            Strategies &amp; Intelligence
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {items.length} strategies · every listing published by RTI · $29 one-time
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-xs leading-relaxed text-amber-700">
          Educational research only — no strategy is a promise of returns, and performance figures are
          withheld unless they can be tied to a verified, version-scoped track record with disclosed
          methodology. Purchases open after final legal review and payment integration; until then the
          full catalog is browsable and the purchase button tells you exactly why checkout is closed.
        </p>
      </div>

      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-sky-600/25 bg-royal-500/[0.06] px-4 py-3">
          <p className="text-xs leading-relaxed text-sky-700">{notice}</p>
          <button onClick={() => setNotice(null)} aria-label="Dismiss notice">
            <X className="h-4 w-4 text-sky-700" />
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="relative sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search strategies…"
            className="h-10 w-full rounded-xl border border-slate-900/8 bg-slate-900/[0.03] pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-600 outline-none focus:border-royal-500/50"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                category === c
                  ? 'border-royal-500/40 bg-royal-500/15 text-sky-600'
                  : 'border-slate-900/8 text-slate-500 hover:text-sky-700',
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="glass rounded-2xl p-12 text-center text-sm text-slate-500">
          Loading marketplace…
        </div>
      )}
      {!isLoading && list.length === 0 && (
        <div className="glass rounded-2xl p-12 text-center text-sm text-slate-500">
          No strategies match this filter.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((m) => (
          <button
            key={m.slug}
            onClick={() => setSelected(m.slug)}
            className="glass glass-hover flex flex-col rounded-2xl p-5 text-left"
          >
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-sky-600/20 bg-royal-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-600">
                {m.category}
              </span>
              <span className="rounded-md border border-slate-900/8 px-2 py-0.5 text-[11px] text-slate-500">
                {m.asset}
              </span>
            </div>
            <h3 className="font-display mt-3 text-base font-semibold text-slate-900">{m.name}</h3>
            <p className="mt-2 line-clamp-3 flex-1 text-xs leading-relaxed text-slate-500">
              {m.description}
            </p>
            <div className="mt-4 flex items-center justify-between border-t border-slate-900/5 pt-4">
              <div>
                <span className="font-mono-num text-lg font-bold text-slate-900">${m.price}</span>
                <span className="block text-[10px] text-slate-400">one-time · by {m.author}</span>
              </div>
              <span className="text-xs font-medium text-sky-600">View strategy →</span>
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div
            className="glass max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {detail.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
            {detail.data && (
              <>
                <button
                  onClick={() => setSelected(null)}
                  className="mb-4 flex items-center gap-1 text-xs text-slate-500 hover:text-sky-700"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to marketplace
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-sky-600/20 bg-royal-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-600">
                    {detail.data.category}
                  </span>
                  <span className="rounded-md border border-slate-900/8 px-2 py-0.5 text-[11px] text-slate-500">
                    {detail.data.asset}
                  </span>
                  <span className="rounded-md border border-slate-900/8 px-2 py-0.5 text-[11px] text-slate-500">
                    {detail.data.kind}
                  </span>
                </div>
                <h2 className="font-display mt-3 text-xl font-bold text-slate-900">
                  {detail.data.name}
                </h2>
                <p className="text-xs text-slate-500">Published by {detail.data.author}</p>
                <p className="mt-4 text-sm leading-relaxed text-slate-600">{detail.data.description}</p>

                <div className="mt-4 rounded-xl border border-slate-900/8 bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    What it produces
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{detail.data.outcome}</p>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {detail.data.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-md bg-slate-900/[0.04] px-2 py-0.5 text-[11px] text-slate-500"
                    >
                      {t}
                    </span>
                  ))}
                </div>

                <div className="mt-6 rounded-xl border border-slate-900/8 p-4">
                  {detail.data.owned ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" /> In your library — full strategy available under
                      Library.
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <span className="font-mono-num text-2xl font-bold text-slate-900">
                          ${detail.data.price}
                        </span>
                        <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                          <Lock className="h-3 w-3" /> Full strategy, detailed instructions and
                          implementation guidance unlock after purchase.
                        </p>
                      </div>
                      <Button
                        onClick={() => purchase.mutate({ slug: detail.data!.slug })}
                        disabled={purchase.isPending}
                      >
                        <BookOpen className="mr-1.5 h-4 w-4" /> Purchase — ${detail.data.price}
                      </Button>
                    </div>
                  )}
                </div>

                <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
                  Educational research only. Not investment advice; no outcome is guaranteed. See the{' '}
                  <a href="/legal/trading-risk-disclosure" target="_blank" className="text-sky-600 underline">
                    Trading Risk Disclosure
                  </a>{' '}
                  and{' '}
                  <a href="/legal/strategy-performance-disclosure" target="_blank" className="text-sky-600 underline">
                    Performance Disclosure
                  </a>
                  .
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
