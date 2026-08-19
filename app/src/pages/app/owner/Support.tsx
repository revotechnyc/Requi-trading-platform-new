import { useMemo, useState, type FormEvent } from 'react';
import { LifeBuoy, Plus, X, User, Mail, FileText, Tag, Flag, AlignLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
// Types local — the mock admin-data module is gone; tickets come from trpc.admin.tickets.
type TicketPriority = 'Urgent' | 'High' | 'Normal' | 'Low';
type TicketStatus = 'Open' | 'In progress' | 'Waiting on user' | 'Resolved';
interface SupportTicket {
  id: string;
  userName: string;
  userEmail: string;
  subject: string;
  category: 'Billing' | 'Execution' | 'Connections' | 'Strategies' | 'Account';
  priority: TicketPriority;
  status: TicketStatus;
  opened: string;
}
import { trpc } from '@/providers/trpc';
import { Badge, PageHeader, StatCard } from './shared';
import { cn } from '@/lib/utils';

const priorityTone: Record<TicketPriority, 'red' | 'amber' | 'sky' | 'slate'> = {
  Urgent: 'red',
  High: 'amber',
  Normal: 'sky',
  Low: 'slate',
};

const statusTone: Record<TicketStatus, 'red' | 'amber' | 'sky' | 'teal'> = {
  Open: 'red',
  'In progress': 'amber',
  'Waiting on user': 'sky',
  Resolved: 'teal',
};

const filters = ['All', 'Open', 'In progress', 'Waiting on user', 'Resolved'] as const;
const categories = ['Billing', 'Execution', 'Connections', 'Strategies', 'Account'] as const;
const priorities = ['Urgent', 'High', 'Normal', 'Low'] as const;

const fieldCls =
  'h-11 w-full rounded-xl border border-slate-900/10 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-500 outline-none focus:border-royal-500/50';

function Field({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-slate-700">{label}</Label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        {children}
      </div>
    </div>
  );
}

export default function Support() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.admin.tickets.useQuery(undefined, { retry: false });
  const [filter, setFilter] = useState<(typeof filters)[number]>('All');
  const [formOpen, setFormOpen] = useState(false);

  const tickets = useMemo<SupportTicket[]>(
    () =>
      (data ?? []).map((t) => ({
        id: `TKT-${t.id}`,
        userName: t.userName,
        userEmail: t.userEmail,
        subject: t.subject,
        category: t.category as SupportTicket['category'],
        priority: t.priority as SupportTicket['priority'],
        status: t.status as SupportTicket['status'],
        opened: new Date(t.createdAt).toISOString().slice(0, 16).replace('T', ' '),
      })),
    [data],
  );

  const invalidate = () => utils.admin.tickets.invalidate();
  const createMut = trpc.admin.createTicket.useMutation({ onSuccess: invalidate });
  const statusMut = trpc.admin.setTicketStatus.useMutation({ onSuccess: invalidate });
  const dbId = (viewId: string) => viewId.replace('TKT-', '');

  // form state — user name + email fields, as requested
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportTicket['category']>('Execution');
  const [priority, setPriority] = useState<TicketPriority>('Normal');
  const [description, setDescription] = useState('');

  const list = useMemo(() => tickets.filter((t) => filter === 'All' || t.status === filter), [tickets, filter]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    createMut.mutate({
      userName: name.trim(),
      userEmail: email.trim(),
      subject: subject.trim(),
      description: description.trim() || undefined,
      category,
      priority,
    });
    setName(''); setEmail(''); setSubject(''); setDescription('');
    setCategory('Execution'); setPriority('Normal');
    setFormOpen(false);
    setFilter('All');
  };

  const open = tickets.filter((t) => t.status === 'Open').length;
  const inProgress = tickets.filter((t) => t.status === 'In progress').length;
  const resolvedToday = tickets.filter((t) => t.status === 'Resolved').length;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="SaaS Owner"
        title="Support Problems"
        description="Customer-reported issues with direct contact details for follow-up."
        actions={
          <Button
            onClick={() => setFormOpen(!formOpen)}
            className="btn-glow bg-royal-500 font-semibold text-white hover:bg-royal-600"
          >
            {formOpen ? <X className="mr-1.5 h-4 w-4" /> : <Plus className="mr-1.5 h-4 w-4" />}
            {formOpen ? 'Close form' : 'Log a problem'}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={LifeBuoy} label="Open tickets" value={String(open)} sub={open > 3 ? 'Above target' : undefined} />
        <StatCard icon={Flag} label="In progress" value={String(inProgress)} />
        <StatCard icon={FileText} label="Resolved (all time)" value={String(resolvedToday)} sub="Avg 3.2h" />
      </div>

      {/* log-a-problem form */}
      {formOpen && (
        <form onSubmit={submit} className="glass rounded-2xl p-6">
          <h2 className="font-display text-lg font-semibold text-slate-900">Log a support problem</h2>
          <p className="mt-1 text-xs text-slate-500">Capture the customer's contact details so the team can follow up directly.</p>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field icon={User} label="User name">
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jane Doe" className={fieldCls} />
            </Field>
            <Field icon={Mail} label="User email">
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. alex.rivera@gmail.com" className={fieldCls} />
            </Field>
            <Field icon={FileText} label="Subject">
              <input required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary of the problem" className={fieldCls} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field icon={Tag} label="Category">
                <select value={category} onChange={(e) => setCategory(e.target.value as SupportTicket['category'])} className={fieldCls}>
                  {categories.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field icon={Flag} label="Priority">
                <select value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} className={fieldCls}>
                  {priorities.map((p) => <option key={p}>{p}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <Label className="text-slate-700">Description</Label>
            <div className="relative">
              <AlignLeft className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What happened, which account/strategy is affected, and any error messages…"
                className="w-full resize-none rounded-xl border border-slate-900/10 bg-white py-3 pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-500 outline-none focus:border-royal-500/50"
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2.5">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="border-slate-900/10 bg-white text-slate-700 hover:bg-slate-900/[0.03]">
              Cancel
            </Button>
            <Button type="submit" className="btn-glow bg-royal-500 font-semibold text-white hover:bg-royal-600">
              <Plus className="mr-1.5 h-4 w-4" /> Create ticket
            </Button>
          </div>
        </form>
      )}

      {/* filter tabs */}
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

      {/* ticket list */}
      <div className="space-y-3">
        {list.map((t) => (
          <div key={t.id} className="glass glass-hover rounded-2xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono-num text-xs font-semibold text-slate-500">{t.id}</span>
                  <Badge tone={priorityTone[t.priority]}>{t.priority}</Badge>
                  <Badge tone={statusTone[t.status]}>{t.status}</Badge>
                  <Badge tone="slate">{t.category}</Badge>
                </div>
                <p className="mt-2 font-display text-base font-semibold text-slate-900">{t.subject}</p>
              </div>
              <span className="text-xs text-slate-500">{t.opened}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-slate-900/5 pt-3 text-sm">
              <span className="flex items-center gap-1.5 text-slate-700">
                <User className="h-3.5 w-3.5 text-slate-500" /> <span className="font-medium">{t.userName}</span>
              </span>
              <span className="flex items-center gap-1.5 text-slate-500">
                <Mail className="h-3.5 w-3.5" /> {t.userEmail}
              </span>
              <div className="ml-auto flex gap-2">
                {t.status !== 'Resolved' && (
                  <>
                    <button
                      onClick={() => statusMut.mutate({ id: dbId(t.id), status: 'In progress' })}
                      className="rounded-lg border border-slate-900/10 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-900/[0.03]"
                    >
                      Take it
                    </button>
                    <button
                      onClick={() => statusMut.mutate({ id: dbId(t.id), status: 'Resolved' })}
                      className="rounded-lg bg-teal-600/10 px-3 py-1.5 text-xs font-semibold text-teal-700 transition-colors hover:bg-teal-600/20"
                    >
                      Mark resolved
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <div className="glass rounded-2xl p-12 text-center text-sm text-slate-500">
            {isLoading ? 'Loading tickets…' : 'No tickets in this state.'}
          </div>
        )}
      </div>
    </div>
  );
}
