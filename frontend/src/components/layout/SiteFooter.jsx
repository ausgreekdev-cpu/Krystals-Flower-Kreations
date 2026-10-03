import { Link } from 'react-router-dom';
import { usePublicSettings } from '../../lib/publicSettings';

const FALLBACK_EMAIL = 'krystal@krystalsflowerkreations.com.au';
const FALLBACK_BUSINESS = "Krystal's Flower Kreations";

export default function SiteFooter() {
  const s = usePublicSettings();
  const email = s.contact_email || FALLBACK_EMAIL;
  const businessName = s.business_name || FALLBACK_BUSINESS;
  const socials = [
    { label: 'Instagram', url: s.instagram_url },
    { label: 'Facebook', url: s.facebook_url },
    { label: 'TikTok', url: s.tiktok_url },
    { label: 'Etsy', url: s.etsy_url },
    { label: 'WhatsApp', url: s.whatsapp_url },
  ].filter(x => x.url);
  return (
    <footer className="mt-auto border-t bg-surface2">
      <div className="max-w-7xl mx-auto px-4 py-8 grid md:grid-cols-3 gap-8 text-sm">
        <div>
          <Link to="/" className="font-black text-ink hover:text-highlight">{businessName}</Link>
          <div className="text-muted mt-2">{s.business_address ? `${s.business_address} • ` : ''}Handmade • GST inclusive</div>
          {s.opening_hours && <div className="text-muted mt-1">{s.opening_hours}</div>}
          {socials.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-2">
              {socials.map(x => <a key={x.label} href={x.url} target="_blank" rel="noreferrer" className="text-muted hover:text-highlight">{x.label}</a>)}
            </div>
          )}
        </div>
        <div>
          <div className="font-bold">Shop</div>
          <div className="mt-2 space-y-1 text-muted">
            <Link to="/" className="hover:text-highlight block">Home</Link>
            <Link to="/shop" className="hover:text-highlight block">All bouquets</Link>
            <Link to="/configurator" className="hover:text-highlight block">Custom configurator</Link>
            <Link to="/workshops" className="hover:text-highlight block">Workshops</Link>
            <Link to="/cart" className="hover:text-highlight block">Cart</Link>
          </div>
        </div>
        <div>
          <div className="font-bold">More</div>
          <div className="mt-2 space-y-1 text-muted">
            <Link to="/loyalty" className="hover:text-highlight block">Bloom Points</Link>
            <Link to="/blog" className="hover:text-highlight block">Journal</Link>
            <Link to="/notebook" className="hover:text-highlight block">Notebook</Link>
            <Link to="/stocks/KFK" className="hover:text-highlight block">Market watch</Link>
            <Link to="/login" className="hover:text-highlight block">Sign in / Account</Link>
            <Link to="/privacy" className="hover:text-highlight block">Privacy</Link>
            <a href={`mailto:${email}`} className="hover:text-highlight block">{email}</a>
          </div>
        </div>
      </div>
      <div className="border-t py-4 text-center text-xs text-muted">© {new Date().getFullYear()} {businessName} — Perth WA • ABN {s.abn || import.meta.env.VITE_ABN || 'XX XXX XXX XXX'} on invoices</div>
    </footer>
  );
}
