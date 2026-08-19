import { Plug2, CheckCircle2, XCircle, HeartPulse } from 'lucide-react';
import { Link } from 'react-router';
import { Badge, PageHeader } from './shared';

/**
 * Connectors (Legal Revision §2 honest-state rule): the previous MCP connector
 * cards were fabricated (invented request volumes, latencies, versions). This
 * page now shows the real integration inventory only; live health checks live
 * in System Check.
 */
const INVENTORY: { name: string; purpose: string; connected: boolean; note?: string }[] = [
  { name: 'Kimi OAuth', purpose: 'User authentication and identity', connected: true },
  { name: 'OpenAI API', purpose: 'AI chat, strategy parsing, research narration', connected: true },
  { name: 'TiDB (managed MySQL)', purpose: 'Primary data store', connected: true },
  { name: 'Interactive Brokers', purpose: 'Brokerage execution and market data (per user connection)', connected: true },
  { name: 'Stripe', purpose: 'Marketplace payments and seller payouts', connected: false, note: 'Not connected — gated on regulatory review (Owner → Compliance)' },
  { name: 'Email delivery', purpose: 'Transactional/marketing email', connected: false, note: 'No provider configured — notifications are in-app only' },
  { name: 'SMS delivery', purpose: 'Text notifications', connected: false, note: 'Not used — TCPA analysis required before any SMS' },
];

export default function OwnerConnectors() {
  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Owner · Connectors"
        title="Integration inventory"
        description="Every external provider the platform actually integrates with. Live health probes run in System Check."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {INVENTORY.map((c) => (
          <div key={c.name} className="glass rounded-2xl p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl border border-sky-600/20 bg-sky-600/[0.08] text-sky-600">
                  <Plug2 className="h-5 w-5" />
                </div>
                <p className="font-display text-base font-semibold text-slate-900">{c.name}</p>
              </div>
              <Badge tone={c.connected ? 'teal' : 'slate'}>
                {c.connected ? (
                  <><CheckCircle2 className="h-3 w-3" /> Configured</>
                ) : (
                  <><XCircle className="h-3 w-3" /> Not connected</>
                )}
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">{c.purpose}</p>
            {c.note && <p className="mt-2 text-xs text-amber-700">{c.note}</p>}
          </div>
        ))}
      </div>
      <Link to="/app/owner/system-check" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:underline">
        <HeartPulse className="h-4 w-4" /> Run live probes in System Check
      </Link>
    </div>
  );
}
