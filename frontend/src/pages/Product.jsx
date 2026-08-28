import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';

export default function Product(){
  const {slug}=useParams(); const [p,setP]=useState(null);
  useEffect(()=>{ fetch(`/api/products/${slug}`).then(r=>r.json()).then(setP).catch(()=>{}); }, [slug]);
  if(!p) return <div className="p-8 text-center">Loading bloom...</div>;
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 grid md:grid-cols-2 gap-8">
      <img src={p.images?.[0]?.url || `https://picsum.photos/seed/${p.slug}/800/800`} alt={p.title} className="rounded-2xl w-full" />
      <div>
        <h1 className="text-3xl font-black text-bloom-700">{p.title}</h1>
        <div className="text-2xl font-bold text-bloom-500 mt-2">${Number(p.price).toFixed(2)} AUD</div>
        <p className="mt-4 text-gray-700">{p.description}</p>
        {p.cricutCompatible && <div className="mt-3 text-sm bg-bloom-50 border border-bloom-100 rounded-xl p-3">✓ Cricut-compatible — {p.paperStock || 'cardstock'} • SVG available</div>}
        {p.madeToOrderDays && <div className="mt-2 text-sm text-gray-600">Made to order — {p.madeToOrderDays} days • Perth studio</div>}
        <button className="mt-6 w-full bg-bloom-500 text-white py-3 rounded-xl font-bold">Add to Cart</button>
        <div className="mt-4 text-xs text-gray-500">GST inclusive • ABN on invoice • Share to Instagram Story • Afterpay available at checkout</div>
      </div>
    </div>
  );
}
