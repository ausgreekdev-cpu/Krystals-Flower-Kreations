import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import { usePublicSettings } from '../../lib/publicSettings';
import { currentStaffRole } from '../../lib/session';

const FALLBACK_EMAIL = 'krystal@krystalsflowerkreations.com.au';
const FALLBACK_BUSINESS = "Krystals Flower Creations";

const BRAND = 'Krystals Flower Creations';
// Route → document.title (SPA navigations announce the new page for SR users
// and keep browser tab/history labels meaningful).
const ROUTE_TITLES = {
  '/': `${BRAND} — Paper Florist Perth WA`,
  '/shop': `Shop paper blooms — ${BRAND}`,
  '/cart': `Cart — ${BRAND}`,
  '/checkout': `Checkout — ${BRAND}`,
  '/blog': `Journal — ${BRAND}`,
  '/workshops': `Workshops — ${BRAND}`,
  '/configurator': `Custom Bouquet Configurator — ${BRAND}`,
  '/loyalty': `Bloom Points — ${BRAND}`,
  '/notebook': `Studio Notebook — ${BRAND}`,
  '/about': `About — ${BRAND}`,
  '/privacy': `Privacy Policy — ${BRAND}`,
  '/login': `Sign in — ${BRAND}`,
};

export default function SiteLayout() {
  const location = useLocation();
  const s = usePublicSettings();
  const mainRef = useRef(null);
  const firstRender = useRef(true);

  // SPA route changes: reset scroll, restore keyboard focus to the main
  // landmark, and announce the new page title. Skipped on the initial load.
  // Dynamic routes (/product/:slug, /blog/:slug, /occasions/:slug) set their
  // own titles in their page effects — those run first, so never clobber.
  useEffect(() => {
    window.scrollTo(0, 0);
    if (firstRender.current) { firstRender.current = false; return; }
    mainRef.current?.focus({ preventScroll: true });
    const t = ROUTE_TITLES[location.pathname];
    if (t) document.title = t;
    else if (!/^\/(product|blog|occasions)\//.test(location.pathname)) document.title = `Page not found — ${BRAND}`;
  }, [location.pathname]);

  const businessName = s.business_name || FALLBACK_BUSINESS;
  const email = s.contact_email || FALLBACK_EMAIL;
  const inMaintenance = s.maintenance_mode === '1' && !currentStaffRole();

  if (inMaintenance) {
    return (
      <div className="min-h-screen grid place-items-center bg-surface px-6">
        <div className="max-w-md w-full bg-surface2 border rounded-3xl p-8 text-center">
          <div className="text-5xl">✿</div>
          <h1 className="text-2xl font-black text-ink mt-4">{businessName}</h1>
          <p className="text-muted mt-3 text-sm">{s.maintenance_message || "We're giving the studio a quick refresh — back shortly."}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/login" className="bg-bloom-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm">Staff sign-in</Link>
            <a href={`mailto:${email}`} className="border px-5 py-2.5 rounded-xl font-bold text-sm">Contact us</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-bloom-500 focus:text-white focus:px-4 focus:py-2 focus:rounded-xl focus:font-bold focus:shadow">Skip to content</a>
      <SiteHeader />
      <main id="main" ref={mainRef} tabIndex={-1} className="flex-1 focus:outline-none"><Outlet /></main>
      <SiteFooter />
    </div>
  );
}
