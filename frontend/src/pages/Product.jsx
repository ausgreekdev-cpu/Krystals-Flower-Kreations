import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { cartApi } from '../lib/api/customClient';

export default function Product(){
  const {slug}=useParams(); const nav=useNavigate(); const [p,setP]=useState(null); const [variantId,setVariantId]=useState(null); const [qty,setQty]=useState(1); const [msg,setMsg]=useState('');
  useEffect(()=>{ fetch(`/api/products/${slug}`).then(r=>r.json()).then(setP).catch(()=>{}); }, [slug]);
  async function addToCart(){
    if(!p) return;
    try{
      const cartId = localStorage.getItem('cartId') || null;
      const res = await cartApi.add({ productId: p.id, variantId, quantity: qty, cartId });
      if(res.cartId) localStorage.setItem('cartId', res.cartId);
      setMsg(`Added ${qty} × ${p.title} to cart`);
      setTimeout(()=> nav('/cart'), 600);
    }catch(e){ setMsg(e.message); }
  }
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
        {p.variants?.length>0 && <div className="mt-4"><label className="text-sm font-bold">Variant</label><select value={variantId||''} onChange={e=>setVariantId(e.target.value||null)} className="mt-1 w-full border rounded-xl px-3 py-2"><option value="">Default — ${Number(p.price).toFixed(2)}</option>{p.variants.map(v=> <option key={v.id} value={v.id}>{v.title} — ${Number(v.price).toFixed(2)}</option>)}</select></div>}
        <div className="mt-4 flex items-center gap-3"><button onClick={()=>setQty(Math.max(1,qty-1))} className="w-10 h-10 rounded-full border bg-white">−</button><span className="font-bold">{qty}</span><button onClick={()=>setQty(qty+1)} className="w-10 h-10 rounded-full bg-bloom-500 text-white">+</button><span className="text-sm text-gray-600">in stock • Perth</span></div>
        <button onClick={addToCart} className="mt-6 w-full bg-bloom-500 text-white py-3 rounded-xl font-bold">Add to Cart — ${(Number(variantId? p.variants.find(v=>v.id===variantId)?.price : p.price)*qty).toFixed(2)}</button>
        {msg && <div className="mt-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">{msg}</div>}
        <div className="mt-4 text-xs text-gray-500">GST inclusive • ABN on invoice • Share to Instagram Story • Afterpay available at checkout</div>
      </div>
    </div>
  );
}
