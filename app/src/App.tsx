import { Routes, Route, Navigate } from 'react-router';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import Home from './pages/Home';
import Pricing from './pages/Pricing';
import Login from './pages/Login';
import { LegalCenter, LegalDoc } from './pages/Legal';
import AppLayout from './pages/app/AppLayout';
import Privacy from './pages/app/Privacy';
import Intelligence from './pages/app/Intelligence';
import Strategies from './pages/app/Strategies';
import Autonomous from './pages/app/Autonomous';
import Financials from './pages/app/Financials';
import Signals from './pages/app/Signals';
import Accounts from './pages/app/Accounts';
import Marketplace from './pages/app/Marketplace';
import Library from './pages/app/Library';
import Settings from './pages/app/Settings';
import RobinhoodCallback from './pages/RobinhoodCallback';
import OwnerOverview from './pages/app/owner/OwnerOverview';
import OwnerUsers from './pages/app/owner/Users';
import OwnerBilling from './pages/app/owner/Billing';
import OwnerConnectors from './pages/app/owner/Connectors';
import OwnerSupport from './pages/app/owner/Support';
import OwnerGovernance from './pages/app/owner/Governance';
import OwnerSystemCheck from './pages/app/owner/SystemCheck';
import OwnerCompliance from './pages/app/owner/Compliance';
import { useAuth } from '@/hooks/useAuth';
import { LogoMark } from '@/components/Brand';
import { ConsentGate } from '@/components/ConsentGate';
import { CookieConsent } from '@/components/CookieConsent';
import { getSupabase } from '@/lib/supabase';
import { trpc } from '@/providers/trpc';
import { intelligenceOnlyMode } from '@/lib/app-access';

function SupabaseSessionBridge() {
  const config = trpc.auth.config.useQuery(undefined, { staleTime: 60_000 });
  useEffect(() => {
    if (config.data?.supabaseUrl && config.data.supabaseAnonKey) {
      getSupabase(config.data.supabaseUrl, config.data.supabaseAnonKey);
    }
  }, [config.data?.supabaseUrl, config.data?.supabaseAnonKey]);
  return null;
}

function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <LogoMark className="h-12 w-12 animate-pulse" />
        <p className="text-sm text-slate-500">Loading your workspace…</p>
      </div>
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth({ redirectOnUnauthenticated: true });
  if (isLoading) return <LoadingScreen />;
  if (!isAuthenticated) return null;
  // Legal Revision §7/§8: versioned clickwrap acceptance gates app access.
  return <ConsentGate>{children}</ConsentGate>;
}

/** Test-user preview: block direct URL access to locked sections. */
function IntelligenceOnly({ children }: { children: ReactNode }) {
  if (intelligenceOnlyMode) return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  return (
    <>
    <SupabaseSessionBridge />
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/robinhood/callback" element={<RobinhoodCallback />} />
      <Route path="/legal" element={<LegalCenter />} />
      <Route path="/legal/:slug" element={<LegalDoc />} />
      <Route
        path="/app"
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route index element={<Intelligence />} />
        <Route path="strategies" element={<IntelligenceOnly><Strategies /></IntelligenceOnly>} />
        <Route path="autonomous" element={<IntelligenceOnly><Autonomous /></IntelligenceOnly>} />
        <Route path="financials" element={<IntelligenceOnly><Financials /></IntelligenceOnly>} />
        <Route path="signals" element={<IntelligenceOnly><Signals /></IntelligenceOnly>} />
        <Route path="accounts" element={<IntelligenceOnly><Accounts /></IntelligenceOnly>} />
        <Route path="marketplace" element={<IntelligenceOnly><Marketplace /></IntelligenceOnly>} />
        <Route path="library" element={<IntelligenceOnly><Library /></IntelligenceOnly>} />
        <Route path="settings" element={<IntelligenceOnly><Settings /></IntelligenceOnly>} />
        <Route path="privacy" element={<IntelligenceOnly><Privacy /></IntelligenceOnly>} />
        <Route path="owner" element={<IntelligenceOnly><OwnerOverview /></IntelligenceOnly>} />
        <Route path="owner/users" element={<IntelligenceOnly><OwnerUsers /></IntelligenceOnly>} />
        <Route path="owner/billing" element={<IntelligenceOnly><OwnerBilling /></IntelligenceOnly>} />
        <Route path="owner/connectors" element={<IntelligenceOnly><OwnerConnectors /></IntelligenceOnly>} />
        <Route path="owner/governance" element={<IntelligenceOnly><OwnerGovernance /></IntelligenceOnly>} />
        <Route path="owner/system-check" element={<IntelligenceOnly><OwnerSystemCheck /></IntelligenceOnly>} />
        <Route path="owner/compliance" element={<IntelligenceOnly><OwnerCompliance /></IntelligenceOnly>} />
        <Route path="owner/support" element={<IntelligenceOnly><OwnerSupport /></IntelligenceOnly>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    <CookieConsent />
    </>
  );
}
