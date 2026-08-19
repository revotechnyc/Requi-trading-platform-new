import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Menu, X, ArrowRight } from 'lucide-react';
import { Logo } from '@/components/Brand';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const links = [
  { label: 'Platform', href: '#platform' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Marketplace', href: '#marketplace' },
  { label: 'Features', href: '#features' },
  { label: 'Connections', href: '#connections' },
];

const routeLinks = [{ label: 'Pricing', to: '/pricing' }];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    fn();
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled ? 'border-b border-slate-900/5 bg-white/85 backdrop-blur-xl' : 'bg-transparent',
      )}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
        <Link to="/" aria-label="Requi Trading home">
          <Logo />
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-900/5 hover:text-slate-900"
            >
              {l.label}
            </a>
          ))}
          {routeLinks.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-900/5 hover:text-slate-900"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <Button asChild variant="ghost" className="text-slate-600 hover:text-slate-900">
            <Link to="/login">Log in</Link>
          </Button>
          <Button asChild className="btn-glow bg-royal-500 font-semibold text-white hover:bg-sky-600">
            <Link to="/login">
              Get Started <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <button
          className="grid h-10 w-10 place-items-center rounded-lg text-slate-700 hover:bg-slate-900/5 lg:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-slate-900/5 bg-white/95 px-5 pb-6 pt-3 backdrop-blur-xl lg:hidden">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-900/5 hover:text-slate-900"
            >
              {l.label}
            </a>
          ))}
          {routeLinks.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-900/5 hover:text-slate-900"
            >
              {l.label}
            </Link>
          ))}
          <div className="mt-4 flex gap-3">
            <Button asChild variant="outline" className="flex-1 border-slate-900/10 bg-transparent">
              <Link to="/login">Log in</Link>
            </Button>
            <Button asChild className="btn-glow flex-1 bg-royal-500 text-white hover:bg-sky-600">
              <Link to="/login">Get Started</Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
