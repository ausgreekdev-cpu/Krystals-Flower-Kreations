import { useEffect, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import { usePublicSettings } from '../../lib/publicSettings';
import { currentStaffRole, renewSession } from '../../lib/session';
import { updateSeo, restoreSeo } from '../../lib/seo';
import { initAnalytics, trackPageView } from '../../lib/analytics';
import BloomMark from '../ui/BloomMark';

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
  '/terms': `Terms of Service — ${BRAND}`,
  '/login': `Sign in — ${BRAND}`,
  '/account': `Your account — ${BRAND}`,
  '/forgot-password': `Reset your password — ${BRAND}`,
  '/reset-password': `Choose a new password — ${BRAND}`,
};
// Per-route meta description (Googlebot renders JS so these land in SERP
// snippets). Dynamic routes (/product, /blog/:slug, /occasions) set their
// own in their page effects — omitted keys are never overwritten.
const ROUTE_DESCRIPTIONS = {
  '/': 'Everlasting paper bouquets that never wilt. Custom origami blooms, Perth studio. Shop, configurator & workshops — GST inclusive, free Perth delivery over $150.',
  '/shop': 'Shop handmade paper flowers — everlasting bouquets, SVG templates & sculptural art from our Perth studio. GST inclusive, free Perth delivery over $150.',
  '/configurator': 'Design a custom paper bouquet — colour, texture, weight, stems, height & add-ons with live AUD pricing and a Perth craft-time estimate.',
  '/workshops': 'Paper flower workshops in Perth — Blooms 101, Origami Bouquet & Sculptural Art. Kits included, max 12 per class.',
  '/blog': 'Journal — paper florist tutorials, cutting settings for Perth humidity, origami folds and studio behind-the-scenes.',
  '/loyalty': 'Bloom Points — earn 1 point per $1 at Krystals Flower Creations and redeem on paper blooms.',
  '/notebook': 'Studio Notebook — paper florist knowledge base: glue tests, cutting settings, origami instructions & studio notes.',
  '/about': 'About Krystals Flower Creations — Perth paper florist studio making everlasting bouquets, sculptural art and workshop kits.',
  '/privacy': 'Privacy policy — Krystals Flower Creations, Perth WA.',
  '/terms': 'Terms of service — handmade made-to-order paper florals, delivery, returns, workshops & ACL rights. Krystals Flower Creations, Perth WA.',
  '/account': 'Your Krystals Flower Creations account — order history, tracking and every digital template you have bought, ready to re-download.',
  '/forgot-password': 'Request a one-time password reset link for your Krystals Flower Creations account.',
  '/reset-password': 'Choose a new password for your Krystals Flower Creations account.',
};
// Utility pages shouldn't appear in search results.
const NOINDEX = new Set([
  '/cart', '/checkout', '/login',
  // Customer-private: order history, reset links (a token in the query string
  // must never end up in an index).
  '/account', '/forgot-password', '/reset-password',
]);

export default function SiteLayout() {
  const location = useLocation();
  const s = usePublicSettings();
  const mainRef = useRef(null);
  const firstRender = useRef(true);

  // Sliding session: renew the stored JWT once per load while it's valid.
  useEffect(() => { renewSession(); }, []);

  // SPA route changes: reset scroll and restore keyboard focus to the main
  // landmark. Skipped on the initial load.
  useEffect(() => {
    window.scrollTo(0, 0);
    if (firstRender.current) { firstRender.current = false; return; }
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  // Head meta: title/description/canonical/robots on every route — including
  // hard loads of a static route (index.html ships the home values, so a
  // refreshed /shop previously kept the home title forever). Dynamic routes
  // set their own title/description in page effects; undefined keys are
  // skipped so those are never clobbered.
  useEffect(() => {
    const isStatic = ROUTE_TITLES[location.pathname] !== undefined;
    const isDynamic = /^\/(product|blog|occasions)\//.test(location.pathname);
    updateSeo({
      title: isStatic ? ROUTE_TITLES[location.pathname]
        : (isDynamic ? undefined : `Page not found — ${BRAND}`),
      description: isStatic ? ROUTE_DESCRIPTIONS[location.pathname]
        : (isDynamic ? undefined : 'This page could not be found — browse paper blooms, workshops and the custom bouquet configurator.'),
      canonical: isStatic || isDynamic ? location.pathname : null,
      robots: NOINDEX.has(location.pathname) || (!isStatic && !isDynamic) ? 'noindex, nofollow' : null,
    });
  }, [location.pathname]);

  // GA4: load gtag once the setting arrives (no-op without an id) and send
  // SPA page views on navigation.
  useEffect(() => {
    initAnalytics(s.ga_measurement_id);
    if (s.ga_measurement_id) trackPageView(location.pathname, document.title);
  }, [location.pathname, s.ga_measurement_id]);

  // Leaving the public site (→ /admin, /pos): reset head values to the
  // index.html defaults; those routes apply their own noindex.
  useEffect(() => () => restoreSeo(), []);

  const businessName = s.business_name || FALLBACK_BUSINESS;
  const email = s.contact_email || FALLBACK_EMAIL;
  const inMaintenance = s.maintenance_mode === '1' && !currentStaffRole();

  if (inMaintenance) {
    return (
      <div className="min-h-screen grid place-items-center bg-surface px-6">
        <div className="max-w-md w-full bg-surface2 border rounded-3xl p-8 text-center">
          <div className="text-bloom-500 flex justify-center"><BloomMark className="w-12 h-12" /></div>
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
