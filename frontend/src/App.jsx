import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

export default function App(){
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [q, setQ] = useState('');
  const nav = useNavigate();
  useEffect(()=>{
    function refresh(){
      const id = localStorage.getItem('cartId');
      if(!id){ setCartCount(0); return; }
      fetch(`/api/cart`, { headers: { 'x-cart-id': id } }).then(r=>r.json()).then(d=> setCartCount(d?.cart?.items?.length || d?.items?.length || 0)).catch(()=>{});
    }
    refresh();
    window.addEventListener('cart:updated', refresh);
    window.addEventListener('storage', refresh);
    return ()=>{ window.removeEventListener('cart:updated', refresh); window.removeEventListener('storage', refresh); };
  }, []);
  function onSearch(e){
    e.preventDefault();
    if(q.trim()) nav(`/shop?q=${encodeURIComponent(q.trim())}`);
    else nav('/shop');
  }
  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar for desktop */}
      <div className="hidden md:block bg-bloom-700 text-white text-xs">
        <div className="max-w-7xl mx-auto px-4 py-1.5 flex justify-between">
          <span>Perth WA studio • Made-to-order 3-7 days • Free Perth delivery over $150</span>
          <span className="flex gap-4"><a href="tel:+61800000000" className="hover:underline">+61 8 XXXX XXXX</a><a href="mailto:krystal@krystalsflowerkreations.com.au" className="hover:underline">krystal@krystalsflowerkreations.com.au</a></span>
        </div>
      </div>
      <header className="bg-white/95 backdrop-blur border-b sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link to="/" className="font-black text-bloom-700 text-xl tracking-tight flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-bloom-500 text-white grid place-items-center text-sm">✿</span>
            <span className="hidden sm:inline">Krystal's Flower Kreations</span><span className="sm:hidden">Krystal's</span>
          </Link>
          {/* Desktop search */}
          <form onSubmit={onSearch} className="hidden lg:flex flex-1 max-w-md mx-6">
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search — rose, banksia, Cricut…" className="w-full border rounded-l-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bloom-500/20" />
            <button type="submit" className="bg-bloom-500 text-white px-4 rounded-r-xl text-sm font-bold hover:bg-bloom-700">Search</button>
          </form>
          <nav className="hidden md:flex gap-5 text-sm font-medium ml-auto items-center">
            <Link to="/shop" className="hover:text-bloom-500 py-2">Shop</Link>
            <Link to="/configurator" className="hover:text-bloom-500 py-2 hidden xl:inline">Configurator</Link>
            <Link to="/workshops" className="hover:text-bloom-500 py-2">Workshops</Link>
            <Link to="/blog" className="hover:text-bloom-500 py-2 hidden lg:inline">Journal</Link>
            <Link to="/loyalty" className="hover:text-bloom-500 py-2 hidden lg:inline">Bloom Points</Link>
            <Link to="/pos" className="hover:text-bloom-500 py-2 hidden xl:inline">POS</Link>
            <Link to="/cart" className="relative hover:text-bloom-500 py-2 flex items-center gap-1">
              Cart {cartCount>0 && <span className="bg-bloom-500 text-white text-[10px] leading-none px-1.5 py-0.5 rounded-full">{cartCount}</span>}
            </Link>
            <Link to="/admin" className="text-gray-400 hover:text-bloom-500 py-2 hidden lg:inline">Admin</Link>
          </nav>
          {/* Mobile hamburger */}
          <button onClick={()=>setMobileOpen(!mobileOpen)} className="md:hidden ml-auto p-2 rounded-lg border hover:bg-bloom-50" aria-label="Menu">
            <span className="block w-5 h-0.5 bg-bloom-700 mb-1"></span><span className="block w-5 h-0.5 bg-bloom-700 mb-1"></span><span className="block w-5 h-0.5 bg-bloom-700"></span>
          </button>
        </div>
        {/* Mobile dropdown */}
        {mobileOpen && (
          <div className="md:hidden border-t bg-white px-4 py-3 space-y-2">
            <form onSubmit={onSearch} className="flex"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search…" className="flex-1 border rounded-l-xl px-3 py-2 text-sm" /><button type="submit" className="bg-bloom-500 text-white px-3 rounded-r-xl text-sm">Go</button></form>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Link onClick={()=>setMobileOpen(false)} to="/shop" className="bg-bloom-50 rounded-xl p-3 font-bold text-bloom-700">Shop</Link>
              <Link onClick={()=>setMobileOpen(false)} to="/configurator" className="bg-white border rounded-xl p-3">Configurator</Link>
              <Link onClick={()=>setMobileOpen(false)} to="/workshops" className="bg-white border rounded-xl p-3">Workshops</Link>
              <Link onClick={()=>setMobileOpen(false)} to="/blog" className="bg-white border rounded-xl p-3">Journal</Link>
              <Link onClick={()=>setMobileOpen(false)} to="/loyalty" className="bg-white border rounded-xl p-3">Bloom Points</Link>
              <Link onClick={()=>setMobileOpen(false)} to="/pos" className="bg-white border rounded-xl p-3">POS</Link>
              <Link onClick={()=>setMobileOpen(false)} to="/cart" className="bg-white border rounded-xl p-3 relative">Cart {cartCount>0 && <span className="absolute top-2 right-2 bg-bloom-500 text-white text-[10px] px-1.5 rounded-full">{cartCount}</span>}</Link>
              <Link onClick={()=>setMobileOpen(false)} to="/kanban" className="bg-white border rounded-xl p-3">Kanban</Link>
            </div>
          </div>
        )}
      </header>
      <section className="bg-gradient-to-br from-bloom-500 to-bloom-700 text-white">
        <div className="max-w-7xl mx-auto px-4 py-14 md:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-white/15 rounded-full px-3 py-1 text-xs">Perth WA • GST-inclusive • Click & collect</div>
            <h1 className="text-4xl md:text-5xl font-black leading-tight mt-4 max-w-2xl">Paper florist & armature art — Cricut + origami blooms that last forever</h1>
            <p className="mt-4 max-w-2xl text-white/90 text-base md:text-lg">Perth, Western Australia. Everlasting bouquets, sculptural armatures, Cricut SVG templates & hands-on workshops. Perth delivery & click & collect.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/shop" className="bg-white text-bloom-700 px-6 py-3 rounded-xl font-bold shadow hover:shadow-lg">Shop Bouquets</Link>
              <Link to="/configurator" className="bg-bloom-50 text-bloom-700 px-6 py-3 rounded-xl font-bold hover:bg-white">Design Custom Bouquet</Link>
              <Link to="/workshops" className="bg-transparent border border-white text-white px-6 py-3 rounded-xl font-bold hover:bg-white/10">Book Workshop</Link>
            </div>
            <p className="mt-6 text-xs md:text-sm text-white/80">Meta Catalog → Facebook & Instagram Shopping • POS studio & markets • Blog Cricut settings • Inventory + kits</p>
          </div>
          <div className="hidden lg:block">
            <div className="bg-white rounded-3xl p-6 shadow-2xl">
              <div className="text-bloom-700 font-black text-lg">Featured — Perth studio</div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="bg-bloom-50 rounded-2xl p-4 text-center"><div className="text-2xl">🌹</div><div className="text-xs font-bold text-bloom-700 mt-2">Paper Roses</div><div className="text-[11px] text-gray-500">Blush 12-stem</div></div>
                <div className="bg-bloom-50 rounded-2xl p-4 text-center"><div className="text-2xl">🪷</div><div className="text-xs font-bold text-bloom-700 mt-2">Banksia</div><div className="text-[11px] text-gray-500">Armature 45cm</div></div>
                <div className="bg-bloom-50 rounded-2xl p-4 text-center"><div className="text-2xl">✂️</div><div className="text-xs font-bold text-bloom-700 mt-2">Cricut SVG</div><div className="text-[11px] text-gray-500">Wattle sprig</div></div>
              </div>
              <div className="mt-4 text-xs text-gray-500">Tip: Use the Configurator for real-time price + craft ETA before ordering.</div>
            </div>
          </div>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 py-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card title="Shop" desc="Paper bouquets, armatures, origami, Cricut SVGs + custom commissions. Made-to-order from Perth studio." to="/shop" />
        <Card title="Configurator" desc="Design your bloom — colour/texture/stems/armature + Cricut template with live AUD price + ETA." to="/configurator" />
        <Card title="Workshops" desc="Small groups, all materials included. Take home your bloom. Perth studio + online kits." to="/workshops" />
        <Card title="Kanban" desc="Custom order pipeline — Drafting → Cricut → Folding → QC → Dispatched. Studio admin." to="/kanban" />
      </section>
      <section className="max-w-7xl mx-auto px-4 pb-10">
        <div className="bg-white border rounded-3xl p-6 md:p-8 grid md:grid-cols-3 gap-6">
          <div><div className="font-bold text-bloom-700">Why everlasting?</div><p className="text-sm text-gray-600 mt-2">No wilting, no water, hypoallergenic. Perfect for Perth heat and FIFO homes.</p></div>
          <div><div className="font-bold text-bloom-700">Perth delivery</div><p className="text-sm text-gray-600 mt-2">Metro $12, WA regional $18, national $22 — free over $150. Click & collect 6000.</p></div>
          <div><div className="font-bold text-bloom-700">Workshops</div><p className="text-sm text-gray-600 mt-2">Max 12, kits included, QR ticket. Beginner Cricut to advanced origami.</p></div>
        </div>
      </section>
      <footer className="mt-auto border-t bg-white">
        <div className="max-w-7xl mx-auto px-4 py-8 grid md:grid-cols-3 gap-8 text-sm">
          <div><div className="font-black text-bloom-700">Krystal's Flower Kreations</div><div className="text-gray-600 mt-2">Perth WA • Handmade • GST inclusive</div><div className="text-gray-500 mt-1">Follow @krystalsflowerkreations</div></div>
          <div><div className="font-bold">Shop</div><div className="mt-2 space-y-1 text-gray-600"><Link to="/shop" className="hover:text-bloom-500 block">All bouquets</Link><Link to="/configurator" className="hover:text-bloom-500 block">Custom</Link><Link to="/workshops" className="hover:text-bloom-500 block">Workshops</Link></div></div>
          <div><div className="font-bold">Help</div><div className="mt-2 space-y-1 text-gray-600"><Link to="/blog" className="hover:text-bloom-500 block">Journal</Link><a href="/privacy" className="hover:text-bloom-500 block">Privacy</a><span className="block">krystal@krystalsflowerkreations.com.au</span></div></div>
        </div>
        <div className="border-t py-4 text-center text-xs text-gray-500">© {new Date().getFullYear()} Krystal's Flower Kreations — Perth WA • ABN on invoices</div>
      </footer>
    </div>
  );
}
function Card({title, desc, to}){
  return <Link to={to} className="bg-white rounded-2xl p-6 border hover:shadow-md hover:border-bloom-100 transition"><h3 className="font-bold text-bloom-700">{title}</h3><p className="mt-2 text-sm text-gray-600">{desc}</p><span className="mt-4 inline-block text-xs font-bold text-bloom-500">Explore →</span></Link>;
}
