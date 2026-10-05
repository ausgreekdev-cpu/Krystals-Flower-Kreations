import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePublicSettings } from './lib/publicSettings';
import { currentStaffRole } from './lib/session';

const FALLBACK_SHIPPING_NOTE = 'Metro $12, WA regional $18, national $22 — free over $150. Click & collect 6000.';
const PLACEHOLDER_IMG = '/placeholder-bloom.jpg';

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
  };
  if (!orgLd.sameAs?.length) orgLd.sameAs = undefined;

  const heroCopy = ['Everlasting bouquets', 'sculptural armatures'];
  if (showCricut) heroCopy.push('Cricut SVG templates');
  if (showWorkshops) heroCopy.push('hands-on workshops');

  const boxTiles = (featured.length ? featured.map((p) => ({ id: p.id, slug: p.slug, title: p.title, img: p.images?.[0]?.url || PLACEHOLDER_IMG })) : [
    { id: 'f1', title: 'Paper Roses', img: PLACEHOLDER_IMG },
    { id: 'f2', title: 'Banksia', img: PLACEHOLDER_IMG },
    { id: 'f3', title: 'Bloom Studio', img: PLACEHOLDER_IMG },
  ]).slice(0, 3);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(orgLd)}} />
      <section className="bg-gradient-to-br from-bloom-500 to-bloom-700 text-white">
        <div className="max-w-7xl mx-auto px-4 py-14 md:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-black leading-tight max-w-2xl">{showCricut ? 'Paper florist & armature art — Cricut + origami blooms that last forever' : 'Handcrafted paper flowers — Perth, WA'}</h1>
            <p className="mt-4 max-w-2xl text-white/90 text-base md:text-lg">Perth, Western Australia. {heroCopy.join(', ')}. Perth delivery & click & collect.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/shop" className="bg-surface2 text-ink px-6 py-3 rounded-xl font-bold shadow hover:shadow-lg">Shop Bouquets</Link>
              <Link to="/configurator" className="bg-surface text-ink px-6 py-3 rounded-xl font-bold hover:bg-surface2">Design Custom Bouquet</Link>
              <Link to="/notebook" className="bg-white/15 border border-white text-white px-6 py-3 rounded-xl font-bold hover:bg-white/25">Notebook Research</Link>
              {showWorkshops && <Link to="/workshops" className="bg-transparent border border-white text-white px-6 py-3 rounded-xl font-bold hover:bg-white/10">Book Workshop</Link>}
            </div>
            <p className="mt-6 text-xs md:text-sm text-white/80">Meta Catalog → Facebook & Instagram Shopping • POS studio & markets{showCricut ? ' • Blog Cricut settings' : ''} • Inventory + kits</p>
          </div>
          <div className="hidden lg:block">
            <div className="bg-surface2 rounded-3xl p-6 shadow-2xl">
              <div className="text-ink font-black text-lg">Featured — Perth studio</div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {boxTiles.map((t) => (
                  <div key={t.id} className="bg-surface rounded-2xl overflow-hidden">
                    {t.slug ? <Link to={`/product/${t.slug}`}><img src={t.img} alt={t.title} loading="lazy" onError={(e) => { e.currentTarget.src = PLACEHOLDER_IMG; }} className="w-full h-24 object-cover" /></Link>
                      : <img src={t.img} alt={t.title} loading="lazy" onError={(e) => { e.currentTarget.src = PLACEHOLDER_IMG; }} className="w-full h-24 object-cover" />}
                    <div className="p-2 text-center"><div className="text-[11px] font-bold text-ink truncate">{t.title}</div></div>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-xs text-muted">Tip: Use the Configurator for real-time price + craft ETA before ordering.</div>
            </div>
          </div>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 py-10 grid sm:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card title="Shop" desc={showCricut ? 'Paper bouquets, armatures, origami, Cricut SVGs + custom commissions. Made-to-order from Perth studio.' : 'Paper bouquets, armatures, origami + custom commissions. Made-to-order from Perth studio.'} to="/shop" />
        <Card title="Configurator" desc={showCricut ? 'Design your bloom — colour/texture/stems/armature + Cricut template with live AUD price + ETA.' : 'Design your bloom — colour/texture/stems/armature with live AUD price + ETA.'} to="/configurator" />
        {showWorkshops && <Card title="Workshops" desc="Small groups, all materials included. Take home your bloom. Perth studio + online kits." to="/workshops" />}
        <Card title="Notebook" desc={showCricut ? 'Perth studio research + NotebookLM sources — Cricut settings, armature guides, BOM.' : 'Perth studio research + NotebookLM sources — armature guides, paper stocks, BOM.'} to="/notebook" />
        <Card title="About" desc="The studio behind the blooms — who we are, how we make them, and where to find us in Perth." to="/about" />
        {isStaff && showKanban && <Card title="Kanban" desc="Custom order pipeline — Drafting → Cricut → Folding → QC → Dispatched. Studio admin." to="/kanban" />}
      </section>
      <section className="max-w-7xl mx-auto px-4 pb-10">
        <div className={`bg-surface2 border rounded-3xl p-6 md:p-8 grid gap-6 ${showWorkshops ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          <div><div className="font-bold text-ink">Why everlasting?</div><p className="text-sm text-muted mt-2">No wilting, no water, hypoallergenic. Perfect for Perth heat and FIFO homes.</p></div>
          <div><div className="font-bold text-ink">Perth delivery</div><p className="text-sm text-muted mt-2">{s.shipping_note || FALLBACK_SHIPPING_NOTE}</p></div>
          {showWorkshops && <div><div className="font-bold text-ink">Workshops</div><p className="text-sm text-muted mt-2">Max 12, kits included, QR ticket. Beginner Cricut to advanced origami.</p></div>}
        </div>
      </section>
    </>
  );
}
function Card({title, desc, to}){
  return <Link to={to} className="bg-surface2 rounded-2xl p-6 border hover:shadow-md hover:border-bloom-100 transition"><h3 className="font-bold text-ink">{title}</h3><p className="mt-2 text-sm text-muted">{desc}</p><span className="mt-4 inline-block text-xs font-bold text-highlight">Explore →</span></Link>;
}
