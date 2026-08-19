import { Navbar } from '@/sections/landing/Navbar';
import { Hero } from '@/sections/landing/Hero';
import { About, HowItWorks, MarketplaceSection, Audiences } from '@/sections/landing/Core';
import { Features, Testimonials, Connections, CtaFooter } from '@/sections/landing/Closing';
import { PricingSection } from '@/sections/landing/Pricing';

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <Hero />
        <About />
        <HowItWorks />
        <MarketplaceSection />
        <Audiences />
        <Features />
        <PricingSection />
        <Testimonials />
        <Connections />
        <CtaFooter />
      </main>
    </div>
  );
}
