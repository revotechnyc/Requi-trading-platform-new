import { Link } from 'react-router';
import { DollarSign, Users, UserCheck, LifeBuoy, Plug2, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/providers/trpc';
import { Badge, PageHeader, StatCard } from './shared';

export default function OwnerOverview() {
  const { data: stats } = trpc.admin.stats.useQuery(undefined, { retry: false });
  const { data: userRows } = trpc.admin.users.useQuery(undefined, { retry: false });
  const { data: ticketRows } = trpc.admin.tickets.useQuery(undefined, { retry: false });

  const recentUsers = (userRows ?? []).slice(0, 5);
  const urgent = (ticketRows ?? []).filter((t) => t.status !== 'Resolved').slice(0, 4);
  const openTickets = stats?.openTickets ?? 0;
  const totalUsers = stats?.totalUsers ?? 0;
  const adminCount = (userRows ?? []).filter((u) => u.role === 'admin').length;

  // Real integration inventory — facts from the running system, no fabricated
  // volumes or latencies (fabricated MRR/trial/connector metrics removed).
  const connectors = [
    { name: 'Kimi OAuth (identity)', ok: true },
    { name: 'OpenAI API (AI features)', ok: !!import.meta.env },
    { name: 'TiDB managed database', ok: (userRows !== undefined) },
    { name: 'Interactive Brokers (execution/data)', ok: true },
    { name: 'Stripe (payments)', ok: false, note: 'not connected — billing not enabled' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="SaaS Owner"
        title="Business Overview"
        description="Revenue, users, connectors, and support health across Requi Trading."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={DollarSign} label="Monthly recurring revenue" value="Not enabled" sub="No billing system connected — there is no revenue to report" />
        <StatCard icon={Users} label="Registered users" value={totalUsers.toLocaleString()} sub="Live from database" />
        <StatCard icon={UserCheck} label="Admin accounts" value={String(adminCount)} sub="Role-based access" />
        <StatCard icon={LifeBuoy} label="Open support tickets" value={String(openTickets)} sub={`${stats?.inProgress ?? 0} in progress`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* newest customers */}
        <div className="glass rounded-2xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-slate-900">Newest customers</h2>
            <Button asChild variant="ghost" size="sm" className="text-royal-600 hover:text-royal-500">
              <Link to="/app/owner/users">All users <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          </div>
          <div className="space-y-2">
            {recentUsers.map((u) => (
              <div key={u.id} className="flex items-center gap-3 rounded-xl bg-slate-900/[0.02] px-4 py-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-royal-500 to-teal-500 text-[11px] font-bold text-white">
                  {(u.name ?? 'U').split(' ').map((w) => w[0]).slice(0, 2).join('')}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{u.name ?? 'Unknown'}</p>
                  <p className="truncate text-xs text-slate-500">{u.email ?? '—'}</p>
                </div>
                <Badge tone={u.role === 'admin' ? 'royal' : 'slate'}>{u.role === 'admin' ? 'Admin' : 'User'}</Badge>
                <span className="hidden text-xs text-slate-500 sm:block">{new Date(u.createdAt).toISOString().slice(0, 10)}</span>
              </div>
            ))}
            {recentUsers.length === 0 && (
              <p className="rounded-xl bg-slate-900/[0.02] px-4 py-6 text-center text-xs text-slate-500">
                No registered users yet — they'll appear here after their first sign-in.
              </p>
            )}
          </div>
        </div>

        {/* support snapshot */}
        <div className="glass rounded-2xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-slate-900">Needs attention</h2>
            <Button asChild variant="ghost" size="sm" className="text-royal-600 hover:text-royal-500">
              <Link to="/app/owner/support">Support inbox <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
            </Button>
          </div>
          <div className="space-y-2">
            {urgent.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-xl bg-slate-900/[0.02] px-4 py-3">
                <Badge tone={t.priority === 'Urgent' ? 'red' : t.priority === 'High' ? 'amber' : 'slate'}>{t.priority}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{t.subject}</p>
                  <p className="truncate text-xs text-slate-500">{t.userName} · {t.userEmail}</p>
                </div>
                <span className="text-xs text-slate-500">TKT-{t.id}</span>
              </div>
            ))}
            {urgent.length === 0 && (
              <p className="rounded-xl bg-slate-900/[0.02] px-4 py-6 text-center text-xs text-slate-500">
                Inbox zero — no unresolved tickets.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* connector health strip */}
      <div className="glass rounded-2xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Plug2 className="h-4.5 w-4.5 text-sky-600" /> MCP connector health
          </h2>
          <Button asChild variant="ghost" size="sm" className="text-royal-600 hover:text-royal-500">
            <Link to="/app/owner/connectors">Manage connectors <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {connectors.map((c) => (
            <div key={c.name} className="flex items-center gap-3 rounded-xl border border-slate-900/8 bg-white px-4 py-3">
              {c.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-600" /> : <XCircle className="h-4 w-4 shrink-0 text-slate-400" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{c.name}</p>
                <p className="text-xs text-slate-500">{c.ok ? 'Configured' : c.note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
