import { Link } from 'react-router-dom';
import { usePublicSettings } from './lib/publicSettings';
import { currentStaffRole } from './lib/session';

const FALLBACK_SHIPPING_NOTE = 'Metro $12, WA regional $18, national $22 — free over $150. Click & collect 6000.';

export default function App(){
  const s = usePublicSettings();
  const isStaff = Boolean(currentStaffRole());
  return (
    <>
      <section className="bg-gradient-to-br from-bloom-500 to-bloom-700 text-white">
        <div className="max-w-7xl mx-auto px-4 py-14 md:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-white/15 rounded-full px-3 py-1 text-xs">{s.hero_badge_text || 'Perth WA • GST-inclusive • Click & collect'}</div>
            <h1 className="text-4xl md:text-5xl font-black leading-tight mt-4 max-w-2xl">Paper florist & armature art — Cricut + origami blooms that last forever</h1>
            <p className="mt-4 max-w-2xl text-white/90 text-base md:text-lg">Perth, Western Australia. Everlasting bouquets, sculptural armatures, Cricut SVG templates & hands-on workshops. Perth delivery & click & collect.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/shop" className="bg-surface2 text-ink px-6 py-3 rounded-xl font-bold shadow hover:shadow-lg">Shop Bouquets</Link>
              <Link to="/configurator" className="bg-surface text-ink px-6 py-3 rounded-xl font-bold hover:bg-surface2">Design Custom Bouquet</Link>
              <Link to="/notebook" className="bg-white/15 border border-white text-white px-6 py-3 rounded-xl font-bold hover:bg-white/25">Notebook Research</Link>
              <Link to="/workshops" className="bg-transparent border border-white text-white px-6 py-3 rounded-xl font-bold hover:bg-white/10">Book Workshop</Link>
            </div>
            <p className="mt-6 text-xs md:text-sm text-white/80">Meta Catalog → Facebook & Instagram Shopping • POS studio & markets • Blog Cricut settings • Inventory + kits</p>
          </div>
          <div className="hidden lg:block">
            <div className="bg-surface2 rounded-3xl p-6 shadow-2xl">
              <div className="text-ink font-black text-lg">Featured — Perth studio</div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="bg-surface rounded-2xl p-4 text-center"><div className="text-2xl">🌹</div><div className="text-xs font-bold text-ink mt-2">Paper Roses</div><div className="text-[11px] text-muted">Blush 12-stem</div></div>
                <div className="bg-surface rounded-2xl p-4 text-center"><div className="text-2xl">🪷</div><div className="text-xs font-bold text-ink mt-2">Banksia</div><div className="text-[11px] text-muted">Armature 45cm</div></div>
                <div className="bg-surface rounded-2xl p-4 text-center"><div className="text-2xl">✂️</div><div className="text-xs font-bold text-ink mt-2">Cricut SVG</div><div className="text-[11px] text-muted">Wattle sprig</div></div>
              </div>
              <div className="mt-4 text-xs text-muted">Tip: Use the Configurator for real-time price + craft ETA before ordering.</div>
            </div>
          </div>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 py-10 grid sm:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card title="Shop" desc="Paper bouquets, armatures, origami, Cricut SVGs + custom commissions. Made-to-order from Perth studio." to="/shop" />
        <Card title="Configurator" desc="Design your bloom — colour/texture/stems/armature + Cricut template with live AUD price + ETA." to="/configurator" />
        <Card title="Workshops" desc="Small groups, all materials included. Take home your bloom. Perth studio + online kits." to="/workshops" />
        <Card title="Notebook" desc="Perth studio research + NotebookLM sources — Cricut settings, armature guides, BOM." to="/notebook" />
        {isStaff && <Card title="Kanban" desc="Custom order pipeline — Drafting → Cricut → Folding → QC → Dispatched. Studio admin." to="/kanban" />}
      </section>
      <section className="max-w-7xl mx-auto px-4 pb-10">
        <div className="bg-surface2 border rounded-3xl p-6 md:p-8 grid md:grid-cols-3 gap-6">
          <div><div className="font-bold text-ink">Why everlasting?</div><p className="text-sm text-muted mt-2">No wilting, no water, hypoallergenic. Perfect for Perth heat and FIFO homes.</p></div>
          <div><div className="font-bold text-ink">Perth delivery</div><p className="text-sm text-muted mt-2">{s.shipping_note || FALLBACK_SHIPPING_NOTE}</p></div>
          <div><div className="font-bold text-ink">Workshops</div><p className="text-sm text-muted mt-2">Max 12, kits included, QR ticket. Beginner Cricut to advanced origami.</p></div>
        </div>
      </section>
    </>
  );
}
function Card({title, desc, to}){
  return <Link to={to} className="bg-surface2 rounded-2xl p-6 border hover:shadow-md hover:border-bloom-100 transition"><h3 className="font-bold text-ink">{title}</h3><p className="mt-2 text-sm text-muted">{desc}</p><span className="mt-4 inline-block text-xs font-bold text-highlight">Explore →</span></Link>;
}
