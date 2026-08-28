import { Link } from 'react-router-dom';

export default function App(){
  return (
    <div className="min-h-screen">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="font-black text-bloom-700 text-xl">Krystal's Flower Kreations</Link>
          <nav className="flex gap-4 text-sm">
            <Link to="/shop" className="hover:text-bloom-500">Shop</Link>
            <Link to="/configurator" className="hover:text-bloom-500">Configurator</Link>
            <Link to="/workshops" className="hover:text-bloom-500">Workshops</Link>
            <Link to="/blog" className="hover:text-bloom-500">Journal</Link>
            <Link to="/kanban" className="hover:text-bloom-500">Kanban</Link>
            <Link to="/cart" className="hover:text-bloom-500">Cart</Link>
            <Link to="/admin" className="hover:text-bloom-500">Admin</Link>
          </nav>
        </div>
      </header>
      <section className="bg-bloom-500 text-white">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <h1 className="text-4xl font-black max-w-2xl">Paper florist & armature art — Cricut + origami blooms that last forever</h1>
          <p className="mt-4 max-w-2xl text-white/90">Perth, Western Australia. Everlasting bouquets, sculptural armatures, Cricut SVG templates & hands-on workshops. GST-inclusive • Afterpay • Perth delivery & click & collect.</p>
          <div className="mt-6 flex gap-3">
            <Link to="/shop" className="bg-white text-bloom-500 px-6 py-3 rounded-xl font-bold">Shop Bouquets</Link>
            <Link to="/configurator" className="bg-bloom-50 text-bloom-700 px-6 py-3 rounded-xl font-bold">Design Custom Bouquet</Link>
            <Link to="/workshops" className="bg-bloom-700 text-white px-6 py-3 rounded-xl font-bold">Book a Workshop</Link>
          </div>
          <p className="mt-6 text-sm text-white/80">Cutting-edge: Meta Catalog sync → Facebook & Instagram Shopping • POS for studio & markets • Blog with Cricut cut settings • Inventory + kits</p>
        </div>
      </section>
      <section className="max-w-6xl mx-auto px-4 py-10 grid md:grid-cols-4 gap-6">
        <Card title="Shop" desc="Paper bouquets, armatures, origami, Cricut SVGs + custom commissions. Made-to-order from Perth studio." to="/shop" />
        <Card title="Configurator" desc="Design your bloom — colour/texture/stems/armature + Cricut template with live AUD price + ETA." to="/configurator" />
        <Card title="Workshops" desc="Small groups, all materials included. Take home your bloom. Perth studio + online kits." to="/workshops" />
        <Card title="Kanban" desc="Custom order pipeline — Drafting → Cricut → Folding → QC → Dispatched. Studio admin." to="/kanban" />
      </section>
      <footer className="border-t bg-white py-8 text-center text-sm text-gray-500">© {new Date().getFullYear()} Krystal's Flower Kreations — Perth WA • ABN on invoices • GST inclusive • Follow @krystalsflowerkreations</footer>
    </div>
  );
}
function Card({title, desc, to}){
  return <Link to={to} className="bg-white rounded-2xl p-6 border hover:shadow-md"><h3 className="font-bold text-bloom-700">{title}</h3><p className="mt-2 text-sm text-gray-600">{desc}</p></Link>;
}
