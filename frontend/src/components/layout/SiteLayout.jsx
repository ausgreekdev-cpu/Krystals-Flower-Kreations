import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import { usePublicSettings } from '../../lib/publicSettings';
import { currentStaffRole } from '../../lib/session';

const FALLBACK_EMAIL = 'krystal@krystalsflowerkreations.com.au';
const FALLBACK_BUSINESS = "Krystal's Flower Kreations";

export default function SiteLayout() {
  const location = useLocation();
  const s = usePublicSettings();

  // SPA route changes keep scroll position — reset to top on every navigation.
  useEffect(() => {
    window.scrollTo(0, 0);
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
      <SiteHeader />
      <main className="flex-1"><Outlet /></main>
      <SiteFooter />
    </div>
  );
}
