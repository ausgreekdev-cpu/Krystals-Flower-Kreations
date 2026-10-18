import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePublicSettings } from './lib/publicSettings';
import { currentStaffRole } from './lib/session';
import Btn from './components/ui/Btn';
import BloomMark from './components/ui/BloomMark';
import ResponsiveImage from './components/ResponsiveImage';
import { PLACEHOLDER_IMG } from './lib/assets';
import { realAbn } from './lib/business';

const FALLBACK_SHIPPING_NOTE = 'Metro $12, WA regional $18, national $22 — free over $150. Click & collect 6000.';

export default function App(){
  const s = usePublicSettings();
  const isStaff = Boolean(currentStaffRole());
  const showWorkshops = s.show_workshops === '1';
  const showCricut = s.show_cricut === '1';
  const showKanban = s.show_kanban === '1';
  const [featured, setFeatured] = useState([]);

  // Featured product photos for the side box (falls back to the placeholder art
  // until real photos are uploaded via Admin → Catalog).
  useEffect(() => {
    let live = true;
    fetch('/api/products?featured=true')
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d) => { if (live) setFeatured(Array.isArray(d.products) ? d.products.slice(0, 3) : []); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const orgLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: s.business_name || "Krystals Flower Creations",
    url: window.location.origin,
    logo: s.logo_url ? (s.logo_url.startsWith('http') ? s.logo_url : `${window.location.origin}${s.logo_url}`) : undefined,
    sameAs: [s.instagram_url, s.facebook_url, s.tiktok_url, s.etsy_url].filter(Boolean) || undefined,
    contactPoint: s.contact_phone ? { '@type': 'ContactPoint', telephone: s.contact_phone, contactType: 'customer service', areaServed: 'AU' } : undefined,
    taxID: realAbn(s.abn) || undefined,
  };
  if (!orgLd.sameAs?.length) orgLd.sameAs = undefined;

  const heroCopy = ['Everlasting bouquets', 'sculptural pieces'];
  if (showCricut) heroCopy.push('Cricut SVG templates');
  if (showWorkshops) heroCopy.push('hands-on workshops');
  const freeOver = Number(s.shipping_free_over) || 150;

  const boxTiles = (featured.length ? featured.map((p) => ({ id: p.id, slug: p.slug, title: p.title, image: p.images?.[0] })) : [
    { id: 'f1', title: 'Paper Roses', img: PLACEHOLDER_IMG },
    { id: 'f2', title: 'Banksia', img: PLACEHOLDER_IMG },
    { id: 'f3', title: 'Bloom Studio', img: PLACEHOLDER_IMG },
  ]).slice(0, 3);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(orgLd)}} />
      <section className="relative overflow-hidden bg-gradient-to-br from-bloom-500 via-bloom-600 to-bloom-900 text-white">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.22),transparent_55%)]" />
        <div className="relative max-w-7xl mx-auto px-4 py-14 md:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-black leading-tight max-w-2xl">{showCricut ? 'Paper florist & sculptural art — Cricut + origami blooms that last forever' : 'Handcrafted paper flowers — Perth, WA'}</h1>
            <p className="mt-4 max-w-2xl text-white/90 text-base md:text-lg">Perth, Western Australia. {heroCopy.join(', ')}. Perth delivery & click & collect.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Btn to="/shop" variant="light">Shop Bouquets</Btn>
              <Btn to="/configurator" variant="onDark">Design Custom Bouquet</Btn>
              <Btn to="/notebook" variant="onDark">Notebook Research</Btn>
              {showWorkshops && <Btn to="/workshops" variant="onDark">Book Workshop</Btn>}
            </div>
            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/80">
              <span>Free Perth delivery over ${freeOver}</span>
              <span>GST inclusive</span>
              <span>Made to order</span>
            </div>
          </div>
          <div>
            <div className="bg-surface2 rounded-3xl p-6 shadow-2xl">
              <div className="text-ink font-black text-lg">Featured — Perth studio</div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {boxTiles.map((t) => (
                  <div key={t.id} className="bg-surface rounded-2xl overflow-hidden group">
                    {t.slug ? <Link to={`/product/${t.slug}`} className="block"><ResponsiveImage image={t.image} alt={t.title} sizes="(min-width:768px) 25vw, 50vw" className="w-full h-28 md:h-32 object-cover group-hover:scale-105 transition duration-300" /></Link>
                      : <img src={t.img} alt={t.title} loading="lazy" onError={(e) => { e.currentTarget.src = PLACEHOLDER_IMG; }} className="w-full h-28 md:h-32 object-cover" />}
                    <div className="p-2 text-center"><div className="text-[11px] font-bold text-ink truncate">{t.title}</div></div>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-xs text-muted">Tip: Use the Configurator for real-time price + craft ETA before ordering.</div>
            </div>
          </div>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 py-10 grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        <Card title="Shop" desc={showCricut ? 'Paper bouquets, sculptures, origami, Cricut SVGs + custom commissions. Made-to-order from Perth studio.' : 'Paper bouquets, sculptures, origami + custom commissions. Made-to-order from Perth studio.'} to="/shop" />
        <Card title="Configurator" desc={showCricut ? 'Design your bloom — colour/texture/stems/height + Cricut template with live AUD price + ETA.' : 'Design your bloom — colour/texture/stems/height with live AUD price + ETA.'} to="/configurator" />
        {showWorkshops && <Card title="Workshops" desc="Small groups, all materials included. Take home your bloom. Perth studio + online kits." to="/workshops" />}
        <Card title="Notebook" desc={showCricut ? 'Perth studio research + NotebookLM sources — Cricut settings, wire guides, BOM.' : 'Perth studio research + NotebookLM sources — wire guides, paper stocks, BOM.'} to="/notebook" />
        <Card title="About" desc="The studio behind the blooms — who we are, how we make them, and where to find us in Perth." to="/about" />
        {isStaff && showKanban && <Card title="Kanban" desc="Custom order pipeline — Drafting → Cricut → Folding → QC → Dispatched. Studio admin." to="/kanban" />}
      </section>
      <section className="max-w-7xl mx-auto px-4 pb-10">
        <div className={`bg-surface2 border rounded-3xl p-6 md:p-8 grid gap-6 ${showWorkshops ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          <div><div className="font-bold text-base text-ink">Why everlasting?</div><p className="text-sm text-muted mt-2">No wilting, no water, hypoallergenic. Perfect for Perth heat and FIFO homes.</p></div>
          <div><div className="font-bold text-base text-ink">Perth delivery</div><p className="text-sm text-muted mt-2">{s.shipping_note || FALLBACK_SHIPPING_NOTE}</p></div>
          {showWorkshops && <div><div className="font-bold text-base text-ink">Workshops</div><p className="text-sm text-muted mt-2">Max 12, kits included, QR ticket. Beginner Cricut to advanced origami.</p></div>}
        </div>
      </section>
    </>
  );
}
function Card({title, desc, to}){
  return <Link to={to} className="block bg-surface2 rounded-2xl p-6 border hover:shadow-lg hover:border-bloom-100 hover:-translate-y-0.5 transition">
    <span className="inline-flex w-9 h-9 rounded-full bg-highlight/10 text-highlight items-center justify-center"><BloomMark className="w-4 h-4" /></span>
    <h2 className="mt-3 font-bold text-base text-ink">{title}</h2>
    <p className="mt-2 text-sm text-muted">{desc}</p>
    <span className="mt-4 inline-block text-xs font-bold text-highlight">Explore →</span>
  </Link>;
}
