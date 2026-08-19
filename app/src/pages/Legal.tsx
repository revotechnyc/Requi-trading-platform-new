import { Link, useParams } from 'react-router';
import { ArrowLeft, FileText, ShieldAlert, History } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import { LegalFooter } from '@/components/LegalFooter';
import { Logo } from '@/components/Brand';

const CATEGORY_LABELS: Record<string, string> = {
  GENERAL: 'General',
  TRADING_DISCLOSURES: 'Trading & Financial Disclosures',
  MARKETPLACE: 'Marketplace',
  PRIVACY_SECURITY: 'Privacy & Security',
  BUSINESS: 'Business',
};

/** Minimal, safe markdown-ish renderer for legal text (headings, lists, quotes, tables, paragraphs). */
function renderContent(content: string) {
  const lines = content.split('\n');
  const out: JSX.Element[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('|')) {
      const tbl: string[] = [];
      while (i < lines.length && lines[i].startsWith('|')) { tbl.push(lines[i]); i++; }
      const rows = tbl.filter((r) => !/^\|[\s\-|]+\|$/.test(r)).map((r) => r.split('|').slice(1, -1).map((c) => c.trim()));
      out.push(
        <div key={key++} className="my-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            {rows.map((r, ri) => (
              <tr key={ri} className={ri === 0 ? 'bg-slate-100 font-semibold' : ri % 2 ? 'bg-slate-50' : ''}>
                {r.map((c, ci) => <td key={ci} className="border border-slate-200 px-3 py-2 align-top">{c}</td>)}
              </tr>
            ))}
          </table>
        </div>,
      );
      continue;
    }
    if (line.startsWith('> ')) {
      out.push(<div key={key++} className="my-4 rounded-lg border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900" dangerouslySetInnerHTML={{ __html: inline(line.slice(2)) }} />);
    } else if (line.startsWith('# ')) {
      out.push(<h1 key={key++} className="font-display mt-2 text-3xl font-bold text-slate-900">{line.slice(2)}</h1>);
    } else if (line.startsWith('## ')) {
      out.push(<h2 key={key++} className="mt-7 text-lg font-bold text-slate-900">{line.slice(3)}</h2>);
    } else if (/^[-*] /.test(line)) {
      out.push(<li key={key++} className="ml-5 list-disc text-[15px] leading-relaxed text-slate-700" dangerouslySetInnerHTML={{ __html: inline(line.slice(2)) }} />);
    } else if (/^\d+\. /.test(line)) {
      out.push(<li key={key++} className="ml-5 list-decimal text-[15px] leading-relaxed text-slate-700" dangerouslySetInnerHTML={{ __html: inline(line.replace(/^\d+\. /, '')) }} />);
    } else if (line.trim()) {
      out.push(<p key={key++} className="mt-3 text-[15px] leading-relaxed text-slate-700" dangerouslySetInnerHTML={{ __html: inline(line) }} />);
    }
    i++;
  }
  return out;
}

function inline(t: string): string {
  return t
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="text-sky-700 underline" href="$2">$1</a>');
}

export function LegalCenter() {
  const docs = trpc.legal.list.useQuery();
  const grouped = new Map<string, NonNullable<typeof docs.data>>();
  for (const d of docs.data ?? []) {
    const arr = grouped.get(d.category) ?? [];
    arr.push(d);
    grouped.set(d.category, arr);
  }
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-slate-900/5">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link to="/" aria-label="Requi home"><Logo /></Link>
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Back to site
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-14 lg:px-8">
        <h1 className="font-display text-4xl font-bold text-slate-900">Legal & Disclosures Center</h1>
        <p className="mt-3 max-w-3xl text-slate-500">
          Every agreement and disclosure for the Requi platform, versioned. Documents marked
          <span className="font-semibold text-amber-700"> counsel-review draft </span>
          are published for transparency and are pending final attorney approval — they describe
          what the software does today and are not represented as final compliance.
        </p>
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-50 p-4 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Regulatory classification of several features is under review by qualified U.S. counsel.
          Marketplace purchases and live-broker automation remain gated until that review completes.
        </div>
        {docs.isLoading && <p className="mt-10 text-sm text-slate-400">Loading documents…</p>}
        {[...grouped.entries()].map(([cat, list]) => (
          <section key={cat} className="mt-12">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">{CATEGORY_LABELS[cat] ?? cat}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {list.map((d) => (
                <Link
                  key={d.slug}
                  to={`/legal/${d.slug}`}
                  className="glass glass-hover group flex items-start gap-3 rounded-xl p-4"
                >
                  <FileText className="mt-0.5 h-4.5 w-4.5 shrink-0 text-sky-600" />
                  <div>
                    <p className="font-semibold text-slate-900 group-hover:text-sky-700">{d.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      v{d.version}
                      {d.status !== 'ACTIVE' && <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">COUNSEL-REVIEW DRAFT</span>}
                      {d.effectiveDate && <span className="ml-2">Effective {d.effectiveDate}</span>}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </main>
      <LegalFooter compact />
    </div>
  );
}

export function LegalDoc() {
  const { slug } = useParams();
  const doc = trpc.legal.doc.useQuery({ slug: slug ?? '' }, { enabled: !!slug });
  const hist = trpc.legal.history.useQuery({ slug: slug ?? '' }, { enabled: !!slug });
  const d = doc.data;
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-slate-900/5">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link to="/" aria-label="Requi home"><Logo /></Link>
          <Link to="/legal" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Legal Center
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-12 lg:px-8">
        {doc.isLoading && <p className="text-sm text-slate-400">Loading…</p>}
        {d && (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">Version {d.version}</span>
              {d.status !== 'ACTIVE' ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 font-bold text-amber-700">COUNSEL-REVIEW DRAFT — pending final attorney approval</span>
              ) : (
                <span className="rounded-full bg-teal-100 px-2.5 py-1 font-bold text-teal-700">ACTIVE{d.effectiveDate ? ` — effective ${d.effectiveDate}` : ''}</span>
              )}
              {(hist.data?.length ?? 0) > 1 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                  <History className="h-3 w-3" /> {hist.data!.length} versions preserved
                </span>
              )}
            </div>
            <article>{renderContent(d.content)}</article>
          </>
        )}
        {doc.error && <p className="text-sm text-slate-500">Document not found. <Link className="text-sky-700 underline" to="/legal">Back to the Legal Center</Link>.</p>}
      </main>
      <LegalFooter compact />
    </div>
  );
}
