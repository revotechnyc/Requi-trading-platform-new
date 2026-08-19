import { Link } from 'react-router';
import { LogoMark } from '@/components/Brand';

/**
 * Global legal footer (Legal Revision §10) — consistent across public and
 * authenticated surfaces. Dynamic year. Organized, not cluttered: the full
 * library lives in the /legal center.
 */
const cols: { h: string; items: { label: string; to: string }[] }[] = [
  {
    h: 'Legal',
    items: [
      { label: 'Terms of Service', to: '/legal/terms-of-service' },
      { label: 'Privacy Policy', to: '/legal/privacy-policy' },
      { label: 'Cookie Policy', to: '/legal/cookie-policy' },
      { label: 'Acceptable Use', to: '/legal/acceptable-use-policy' },
    ],
  },
  {
    h: 'Disclosures',
    items: [
      { label: 'Trading Risk Disclosure', to: '/legal/trading-risk-disclosure' },
      { label: 'Autonomous Trading', to: '/legal/autonomous-trading-disclosure' },
      { label: 'AI Disclosure', to: '/legal/ai-algorithmic-disclosure' },
      { label: 'Market Data', to: '/legal/market-data-disclosure' },
    ],
  },
  {
    h: 'Privacy & Security',
    items: [
      { label: 'California Privacy Notice', to: '/legal/california-privacy-notice' },
      { label: 'Privacy Center', to: '/app/privacy' },
      { label: 'Security', to: '/legal/security-statement' },
      { label: 'Responsible Disclosure', to: '/legal/responsible-disclosure-policy' },
    ],
  },
  {
    h: 'Marketplace',
    items: [
      { label: 'Marketplace Terms', to: '/legal/marketplace-terms' },
      { label: 'Seller Agreement', to: '/legal/strategy-seller-agreement' },
      { label: 'Buyer Terms', to: '/legal/strategy-buyer-terms' },
      { label: 'Legal Center', to: '/legal' },
    ],
  },
];

export function LegalFooter({ compact = false }: { compact?: boolean }) {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-slate-900/5 py-12">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        {!compact && (
          <div className="flex flex-col items-start justify-between gap-10 md:flex-row">
            <div className="max-w-xs">
              <div className="flex items-center gap-2.5">
                <LogoMark />
                <span className="font-display text-lg font-bold text-slate-900">
                  Requi <span className="font-medium text-sky-600">Trading</span>
                </span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-slate-500">
                Trading-strategy tooling, analytics, and broker connectivity by Requi LLC.
                Requi LLC is not a broker-dealer or registered investment adviser and does
                not hold customer assets.
              </p>
            </div>
            {cols.map((col) => (
              <div key={col.h}>
                <p className="text-sm font-semibold text-slate-900">{col.h}</p>
                <ul className="mt-4 space-y-2.5">
                  {col.items.map((it) => (
                    <li key={it.label}>
                      <Link to={it.to} className="text-sm text-slate-500 transition-colors hover:text-slate-900">
                        {it.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-900/5 pt-8 text-xs text-slate-600 sm:flex-row">
          <p>© {year} Requi LLC. All rights reserved.</p>
          <p>Trading involves substantial risk of loss. Past performance does not guarantee future results.</p>
        </div>
      </div>
    </footer>
  );
}
