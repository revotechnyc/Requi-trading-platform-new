import { useMemo, useState } from 'react';
import { Search, UserPlus, Download, Mail, Ban, Pencil, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/providers/trpc';
import { Badge, PageHeader, TableShell, th, thCls, trCls, Avatar } from './shared';
import { cn } from '@/lib/utils';

const filters = ['All', 'Admins', 'Users'] as const;

const fmtDate = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const fmtDateTime = (d: Date | string) => new Date(d).toISOString().slice(0, 16).replace('T', ' ');

export default function Users() {
  const [filter, setFilter] = useState<(typeof filters)[number]>('All');
  const [query, setQuery] = useState('');
  const { data, isLoading } = trpc.admin.users.useQuery(undefined, { retry: false });

  const users = useMemo(() => data ?? [], [data]);

  const list = useMemo(
    () =>
      users.filter(
        (u) =>
          (filter === 'All' || (filter === 'Admins' ? u.role === 'admin' : u.role === 'user')) &&
          ((u.name ?? '') + (u.email ?? '')).toLowerCase().includes(query.toLowerCase()),
      ),
    [users, filter, query],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="SaaS Owner"
        title="Users"
        description={`${users.length} registered · ${users.filter((u) => u.role === 'admin').length} admin${users.filter((u) => u.role === 'admin').length === 1 ? '' : 's'}`}
        actions={
          <>
            <Button variant="outline" className="border-slate-900/10 bg-white text-slate-700 hover:bg-slate-900/[0.03]">
              <Download className="mr-1.5 h-4 w-4" /> Export CSV
            </Button>
            <Button className="btn-glow bg-royal-500 font-semibold text-white hover:bg-royal-600">
              <UserPlus className="mr-1.5 h-4 w-4" /> Invite user
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex w-fit flex-wrap gap-1 rounded-xl border border-slate-900/8 bg-slate-900/[0.03] p-1">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
                filter === f ? 'bg-white text-royal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            className="h-10 w-full rounded-xl border border-slate-900/8 bg-slate-900/[0.03] pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-500 outline-none focus:border-royal-500/50"
          />
        </div>
      </div>

      <TableShell title="Customers" aside={<span className="text-xs text-slate-500">{list.length} results</span>}>
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className={thCls}>
              <th className={th}>User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">User ID</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium">Last sign-in</th>
              <th className="px-6 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className={trCls}>
                <td className="px-6 py-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar name={u.name ?? 'Unknown'} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{u.name ?? 'Unknown'}</p>
                      <p className="truncate text-xs text-slate-500">{u.email ?? '—'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  {u.role === 'admin' ? (
                    <Badge tone="royal">
                      <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Admin</span>
                    </Badge>
                  ) : (
                    <Badge tone="slate">User</Badge>
                  )}
                </td>
                <td className="font-mono-num px-4 py-3.5 text-slate-700">USR-{u.id}</td>
                <td className="px-4 py-3.5 text-slate-500">{fmtDate(u.createdAt)}</td>
                <td className="px-4 py-3.5 text-slate-500">{fmtDateTime(u.lastSignInAt)}</td>
                <td className="px-6 py-3.5">
                  <div className="flex gap-1">
                    <button className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-900/5 hover:text-slate-700" title="Email user"><Mail className="h-4 w-4" /></button>
                    <button className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-900/5 hover:text-slate-700" title="Edit"><Pencil className="h-4 w-4" /></button>
                    <button className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-red-600/10 hover:text-red-600" title="Suspend"><Ban className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                  {isLoading ? 'Loading users…' : 'No users match your filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
