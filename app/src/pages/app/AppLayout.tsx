import { useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router';
import {
  Sparkles, Layers, Radio, Wallet, Store, Settings2, Search, LogOut, Bot,
  ChevronDown, Menu, X, Zap, LayoutDashboard, Users, CreditCard, Plug2, LifeBuoy, ShieldCheck, HeartPulse, Landmark, Scale, BookOpen,
} from 'lucide-react';
import { LogoMark } from '@/components/Brand';
import NotificationCenter from '@/components/NotificationCenter';
import { useAuth } from '@/hooks/useAuth';
import { trpc } from '@/providers/trpc';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const nav = [
  { to: '/app', label: 'Intelligence', icon: Sparkles, end: true },
  { to: '/app/strategies', label: 'Strategies', icon: Layers },
  { to: '/app/autonomous', label: 'Autonomous', icon: Bot },
  { to: '/app/financials', label: 'Financials', icon: Landmark },
  { to: '/app/signals', label: 'Signals', icon: Radio },
  { to: '/app/accounts', label: 'Accounts', icon: Wallet },
  { to: '/app/marketplace', label: 'Marketplace', icon: Store },
  { to: '/app/library', label: 'Library', icon: BookOpen },
  { to: '/app/settings', label: 'Settings', icon: Settings2 },
  { to: '/app/privacy', label: 'Privacy Center', icon: ShieldCheck },
];

const ownerNav = [
  { to: '/app/owner', label: 'Owner Overview', icon: LayoutDashboard, end: true },
  { to: '/app/owner/users', label: 'Users', icon: Users },
  { to: '/app/owner/billing', label: 'Billing', icon: CreditCard },
  { to: '/app/owner/connectors', label: 'MCP Connectors', icon: Plug2 },
  { to: '/app/owner/governance', label: 'Governance', icon: ShieldCheck },
  { to: '/app/owner/compliance', label: 'Compliance', icon: Scale },
  { to: '/app/owner/system-check', label: 'System Check', icon: HeartPulse },
  { to: '/app/owner/support', label: 'Support', icon: LifeBuoy },
];

/** Session chip — one canonical label for the whole app chrome. */
function sessionChip(state?: string): { label: string; live: boolean } {
  switch (state) {
    case 'OPEN': return { label: 'Market Open', live: true };
    case 'EARLY_CLOSE_SESSION': return { label: 'Early Close', live: true };
    case 'PRE_MARKET': return { label: 'Pre-Market', live: false };
    case 'AFTER_HOURS': return { label: 'After Hours', live: false };
    case 'CLOSED': return { label: 'Market Closed', live: false };
    default: return { label: 'Syncing', live: false };
  }
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const { data: stats } = trpc.engine.strategyStats.useQuery(undefined, { refetchInterval: 60000 });
  const { data: accounts } = trpc.trading.accounts.useQuery(undefined, { refetchInterval: 60000 });
  const { data: signalsToday } = trpc.signals.todayCount.useQuery(undefined, { refetchInterval: 30000 });

  return (
    <div className="flex h-full flex-col">
      <Link to="/" className="flex items-center gap-2.5 px-5 py-5" onClick={onNavigate}>
        <LogoMark className="h-8 w-8" />
        <span className="font-display text-base font-bold text-slate-900">
          Requi <span className="font-medium text-sky-600">Trading</span>
        </span>
      </Link>

      <div className="px-5 pb-4">
        <div className="flex items-center gap-2 rounded-xl border border-teal-600/20 bg-teal-600/[0.07] px-3 py-2.5">
          <span className="live-dot h-2 w-2 rounded-full bg-teal-600" />
          <div className="leading-tight">
            <p className="text-[11px] font-semibold text-teal-700">Engine Registry</p>
            <p className="text-[10px] text-teal-500/80">
              {stats ? `${stats.total} registered · ${stats.eligible} eligible` : 'Syncing'} · {accounts ? `${accounts.length} account${accounts.length === 1 ? '' : 's'}` : '…'}
            </p>
          </div>
          <Zap className="ml-auto h-3.5 w-3.5 text-teal-600" />
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-royal-500/15 text-sky-600 shadow-[inset_0_0_0_1px_hsl(225_73%_57%/0.25)]'
                  : 'text-slate-500 hover:bg-slate-900/[0.04] hover:text-slate-700',
              )
            }
          >
            <item.icon className="h-4.5 w-4.5" />
            {item.label}
            {item.label === 'Signals' && (signalsToday?.count ?? 0) > 0 && (
              <span className="ml-auto rounded-full bg-royal-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-600">
                {signalsToday!.count}
              </span>
            )}
          </NavLink>
        ))}

        <p className="px-3.5 pb-1 pt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          SaaS Owner
        </p>
        {ownerNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-royal-500/15 text-sky-600 shadow-[inset_0_0_0_1px_hsl(225_73%_57%/0.25)]'
                  : 'text-slate-500 hover:bg-slate-900/[0.04] hover:text-slate-700',
              )
            }
          >
            <item.icon className="h-4.5 w-4.5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-900/5 p-4">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-slate-900/[0.04]">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-royal-500 to-teal-500 text-xs font-bold text-white">
              {(user?.name ?? 'D T').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold text-slate-900">{user?.name ?? 'Demo Trader'}</p>
              <p className="truncate text-[11px] text-slate-500">{user?.email ?? 'demo@requi.trading'}</p>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-500" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 border-slate-900/10 bg-white text-slate-700">
            <DropdownMenuItem className="focus:bg-slate-900/5 focus:text-slate-900">Profile</DropdownMenuItem>
            <DropdownMenuItem className="focus:bg-slate-900/5 focus:text-slate-900">Billing</DropdownMenuItem>
            <DropdownMenuSeparator className="bg-slate-900/10" />
            <DropdownMenuItem
              className="text-red-600 focus:bg-red-500/10 focus:text-red-500"
              onClick={() => logout()}
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session } = trpc.marketData.session.useQuery(undefined, { refetchInterval: 30000 });
  const chip = sessionChip(session?.state);

  return (
    <div className="flex min-h-screen bg-background">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-900/5 bg-white/90 backdrop-blur-xl lg:block">
        <SidebarContent />
      </aside>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-slate-900/10 bg-white">
            <button
              className="absolute right-3 top-4 grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-900/5"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        {/* topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-slate-900/5 bg-white/85 px-5 backdrop-blur-xl lg:px-8">
          <button
            className="grid h-10 w-10 place-items-center rounded-lg text-slate-600 hover:bg-slate-900/5 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="relative hidden max-w-md flex-1 sm:block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              placeholder="Search strategies, symbols, accounts…"
              className="h-10 w-full rounded-xl border border-slate-900/8 bg-slate-900/[0.03] pl-10 pr-16 text-sm text-slate-700 placeholder:text-slate-600 outline-none transition-colors focus:border-royal-500/50"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-900/10 bg-slate-900/5 px-1.5 py-0.5 text-[10px] text-slate-500">
              ⌘K
            </kbd>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span
              className={cn(
                'hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium md:flex',
                chip.live
                  ? 'border-teal-600/20 bg-teal-600/10 text-teal-700'
                  : 'border-slate-900/8 bg-slate-900/[0.03] text-slate-500',
              )}
              title={session?.holidayName ?? undefined}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', chip.live ? 'bg-teal-600' : 'bg-slate-400')} />
              {chip.label}
            </span>
            <NotificationCenter />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-5 py-6 lg:px-8 lg:py-8">
          <Outlet />
          {/* Global legal strip (Legal Revision §10) — dynamic year */}
          <footer className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-900/5 pt-4 text-[11px] text-slate-400">
            <span>© {new Date().getFullYear()} Requi LLC. All rights reserved.</span>
            <Link to="/legal/terms-of-service" className="hover:text-slate-600">Terms</Link>
            <Link to="/legal/privacy-policy" className="hover:text-slate-600">Privacy</Link>
            <Link to="/legal/trading-risk-disclosure" className="hover:text-slate-600">Risk Disclosures</Link>
            <Link to="/legal" className="hover:text-slate-600">Legal Center</Link>
            <span className="ml-auto">Trading involves substantial risk of loss.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
