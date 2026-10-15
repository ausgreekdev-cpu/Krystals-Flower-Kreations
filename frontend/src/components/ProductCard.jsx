import { Link } from 'react-router-dom';
import ResponsiveImage from './ResponsiveImage';

// Catalog card (Shop grid). Stock badge reflects fulfilment type; price and
// Cricut hint are display-only — the product page owns the buy flow.
export default function ProductCard({ p, showCricut = false }) {
  return (
    <Link to={`/product/${p.slug}`} className="bg-surface2 rounded-2xl overflow-hidden border hover:shadow-lg hover:border-bloom-100 transition group">
      <div className="relative overflow-hidden">
        <ResponsiveImage image={p.images?.[0]} alt={p.title} width="400" height="400"
          sizes="(min-width:1280px) 20vw, (min-width:1024px) 25vw, (min-width:640px) 33vw, 50vw"
          className="h-44 md:h-52 w-full object-cover group-hover:scale-105 transition duration-300" />
        <span className="absolute top-2 left-2 bg-surface2/90 backdrop-blur text-[10px] font-bold px-2 py-1 rounded-full">{p.stockMode === 'made_to_order' ? 'Made to order' : p.type === 'digital_template' ? 'SVG • Instant' : 'In stock'}</span>
      </div>
      <div className="p-3">
        <div className="font-bold text-ink line-clamp-2 text-sm md:text-[15px] leading-tight">{p.title}</div>
        <div className="text-highlight font-bold mt-1.5">${Number(p.price).toFixed(2)} <span className="text-xs font-normal text-muted">AUD</span></div>
        <div className="text-xs text-muted mt-1">{p.paperStock || 'Canson 65lb'} {showCricut && p.cricutCompatible && '• Cricut'}</div>
        {(p.flowerType || p.colourFamily) && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {p.flowerType && <span className="text-[10px] font-semibold capitalize bg-bloom-50 text-bloom-700 border border-bloom-100 px-1.5 py-0.5 rounded-full">{p.flowerType}</span>}
            {p.colourFamily && <span className="text-[10px] font-semibold capitalize bg-surface text-muted border px-1.5 py-0.5 rounded-full">{p.colourFamily.replace(/-/g,' ')}</span>}
          </div>
        )}
      </div>
    </Link>
  );
}
