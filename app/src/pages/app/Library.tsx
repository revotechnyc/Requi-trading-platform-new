import { BookOpen, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { trpc } from '@/providers/trpc';

/**
 * LIBRARY — purchased RTI strategies. This is the only surface that displays
 * full paid strategy content (server enforces entitlements). Empty state is
 * honest: no filler, no demo content.
 */
export default function Library() {
  const { data, isLoading } = trpc.marketplace.myLibrary.useQuery();
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (slug: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(slug);
    setTimeout(() => setCopied(null), 1600);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">Purchased intelligence</p>
        <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">Library</h1>
      </div>

      {isLoading && (
        <div className="glass rounded-2xl p-12 text-center text-sm text-slate-500">Loading your library…</div>
      )}

      {!isLoading && (data ?? []).length === 0 && (
        <div className="glass rounded-2xl p-12 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">No purchased strategies yet.</p>
          <p className="mt-1 text-xs text-slate-500">
            Strategies you purchase from the marketplace will appear here with their full content.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {(data ?? []).map((s) => (
          <div key={s.slug} className="glass rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-sky-600/20 bg-royal-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-600">
                    {s.category}
                  </span>
                  <span className="text-[11px] text-slate-400">by {s.author}</span>
                </div>
                <h3 className="font-display mt-2 text-base font-semibold text-slate-900">{s.name}</h3>
              </div>
              <button
                onClick={() => copy(s.slug, s.prompt)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-900/8 px-3 py-1.5 text-xs text-slate-500 hover:text-sky-700"
              >
                {copied === s.slug ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied === s.slug ? 'Copied' : 'Copy full strategy'}
              </button>
            </div>
            <pre className="font-mono-num mt-4 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-100 p-4 text-[11px] leading-relaxed text-slate-600">
              {s.prompt}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
