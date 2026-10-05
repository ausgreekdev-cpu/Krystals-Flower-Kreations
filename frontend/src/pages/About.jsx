import { Link } from 'react-router-dom';
import { usePublicSettings } from '../lib/publicSettings';
import Breadcrumbs from '../components/layout/Breadcrumbs';

const FALLBACK_STORY = 'Krystals Flower Creations is a small paper-flower studio in Perth, Western Australia. Every bloom is handcrafted from quality cardstock — everlasting bouquets, sculptural armature art and origami pieces that never wilt. Designed and made to order in our Perth studio, with local pickup and delivery available across WA.';

export default function About() {
  const s = usePublicSettings();
  const name = s.business_name || 'Krystals Flower Creations';
  const socials = [
    { label: 'Instagram', url: s.instagram_url },
    { label: 'Facebook', url: s.facebook_url },
    { label: 'TikTok', url: s.tiktok_url },
    { label: 'Etsy', url: s.etsy_url },
    { label: 'WhatsApp', url: s.whatsapp_url },
  ].filter((x) => x.url);
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Breadcrumbs items={[{ label: 'About' }]} />
      <h1 className="text-2xl md:text-3xl font-black text-ink">About {name}</h1>
      {s.logo_url && <img src={s.logo_url} alt={name} className="mt-4 h-24 w-24 rounded-2xl object-cover border" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
      <p className="mt-5 text-ink leading-relaxed whitespace-pre-line">{s.about_story || FALLBACK_STORY}</p>
      <div className="mt-6 grid sm:grid-cols-2 gap-4">
        <div className="bg-surface2 border rounded-2xl p-4">
          <div className="font-bold text-ink text-sm">Studio</div>
          <p className="text-sm text-muted mt-2">
            {s.business_address || 'Perth, Western Australia'}
            {s.abn ? <><br />ABN {s.abn}</> : null}
            {s.opening_hours ? <><br />{s.opening_hours}</> : null}
          </p>
        </div>
        <div className="bg-surface2 border rounded-2xl p-4">
          <div className="font-bold text-ink text-sm">Contact</div>
          <p className="text-sm text-muted mt-2">
            {s.contact_email && <a href={`mailto:${s.contact_email}`} className="underline hover:text-highlight block">{s.contact_email}</a>}
            {s.contact_phone && <a href={`tel:${s.contact_phone}`} className="underline hover:text-highlight block">{s.contact_phone}</a>}
          </p>
          {socials.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-2 text-sm">
              {socials.map((x) => <a key={x.label} href={x.url} target="_blank" rel="noreferrer" className="text-muted hover:text-highlight underline">{x.label}</a>)}
            </div>
          )}
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/shop" className="bg-bloom-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-bloom-700">Shop the blooms</Link>
        <Link to="/configurator" className="border px-6 py-3 rounded-xl font-bold hover:bg-surface3">Design a custom bouquet</Link>
      </div>
    </div>
  );
}
