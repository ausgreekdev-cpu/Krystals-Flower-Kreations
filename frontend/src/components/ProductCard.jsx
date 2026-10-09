import { Link } from 'react-router-dom';

// Catalog card (Shop grid). Stock badge reflects fulfilment type; price and
// Cricut hint are display-only — the product page owns the buy flow.
export default function ProductCard({ p, showCricut = false }) {
  return (
    <Link to={`/product/${p.slug}`} className="bg-surface2 rounded-2xl overflow-hidden border hover:shadow-lg hover:border-bloom-100 transition group">
      <div className="relative overflow-hidden">
        <img loading="lazy" decoding="async" src={p.images?.[0]?.url || `/placeholder-bloom.jpg`} alt={p.title} width="400" height="400" className="h-44 md:h-52 w-full object-cover group-hover:scale-105 transition duration-300" onError={(e) => { e.currentTarget.src = '/placeholder-bloom.jpg'; }} />
        <span className="absolute top-2 left-2 bg-surface2/90 backdrop-blur text-[10px] font-bold px-2 py-1 rounded-full">{p.stockMode === 'made_to_order' ? 'Made to order' : p.type === 'digital_template' ? 'SVG • Instant' : 'In stock'}</span>
      </div>
      <div className="p-3">
        <div className="font-bold text-ink line-clamp-2 text-sm md:text-[15px] leading-tight">{p.title}</div>
        <div className="text-highlight font-bold mt-1.5">${Number(p.price).toFixed(2)} <span className="text-xs font-normal text-muted">AUD</span></div>
        <div className="text-xs text-muted mt-1">{p.paperStock || 'Canson 65lb'} {showCricut && p.cricutCompatible && '• Cricut'}</div>
      </div>
    </Link>
  );
}
