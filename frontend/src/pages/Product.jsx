import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { cartApi } from '../lib/api/customClient';

export default function Product(){
  const {slug}=useParams(); const nav=useNavigate(); const [p,setP]=useState(null); const [variantId,setVariantId]=useState(null); const [qty,setQty]=useState(1); const [msg,setMsg]=useState(''); const [err,setErr]=useState('');
  useEffect(()=>{
    fetch(`/api/products/${slug}`).then(r=>{ if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).then(d=> setP(d)).catch(e=>{ setErr(e.message); setP({ error:true }); });
  }, [slug]);
  async function addToCart(){
    if(!p || p.error) return;
    setErr(''); setMsg('');
    if(p.stockMode==='tracked' && stock!==999 && qty>stock){ setErr(`Only ${stock} in stock`); return; }
    try{
      const cartId = localStorage.getItem('cartId') || null;
      const res = await cartApi.add({ productId: p.id, variantId, quantity: qty, cartId });
      if(res.cartId) localStorage.setItem('cartId', res.cartId);
      window.dispatchEvent(new CustomEvent('cart:updated'));
      setMsg(`Added ${qty} × ${p.title} to cart — ${res.cart?.items?.length||''} items`);
      setTimeout(()=> nav('/cart'), 600);
    }catch(e){ setErr(e.message || 'Failed to add'); }
  }
  if(!p) return <div className="p-8 text-center"><div className="animate-pulse bg-bloom-50 h-64 rounded-2xl"/><p className="mt-4 text-gray-500">Loading bloom…</p></div>;
  if(p.error) return <div className="p-8 text-center"><div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-6">Failed to load product: {err || 'Not found'}</div></div>;
  const variantsArr = Array.isArray(p.variants) ? p.variants : [];
  const imagesArr = Array.isArray(p.images) ? p.images : [];
  const activePrice = Number(variantId? variantsArr.find(v=>v.id===variantId)?.price : p.price);
  const stock = variantsArr.find(v=>v.id===variantId)?.inventoryQuantity ?? (p.stockMode==='tracked' ? 0 : 999);
  const lowStock = p.stockMode==='tracked' && stock!==999 && stock < 5;
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 grid md:grid-cols-2 gap-8">
      <div className="space-y-3">
        <img loading="eager" decoding="async" src={imagesArr[0]?.url || `/placeholder-bloom.jpg`} alt={p.title} width="800" height="800" className="rounded-2xl w-full shadow-sm" onError={(e)=>{ e.currentTarget.src='/placeholder-bloom.jpg'; }} />
        {imagesArr.length>1 && <div className="flex gap-2 overflow-auto">{imagesArr.slice(1,5).map(im=><img key={im.id} src={im.url} alt="" loading="lazy" onError={(e)=>{ e.currentTarget.src='/placeholder-bloom.jpg'; }} className="w-20 h-20 rounded-xl object-cover border"/> )}</div>}
        <div className="hidden md:flex gap-2 text-xs">
          <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`} target="_blank" className="border rounded-full px-3 py-1.5 hover:bg-bloom-50">Share FB</a>
          <a href={`https://www.instagram.com/`} target="_blank" className="border rounded-full px-3 py-1.5 hover:bg-bloom-50">IG Story</a>
          <button onClick={()=>{navigator.clipboard.writeText(window.location.href); setMsg('Link copied');}} className="border rounded-full px-3 py-1.5 hover:bg-bloom-50">Copy link</button>
        </div>
      </div>
      <div>
        <h1 className="text-3xl font-black text-bloom-700">{p.title}</h1>
        <div className="text-2xl font-bold text-bloom-500 mt-2">${Number(p.price).toFixed(2)} AUD</div>
        <p className="mt-4 text-gray-700">{p.description}</p>
        {p.cricutCompatible && <div className="mt-3 text-sm bg-bloom-50 border border-bloom-100 rounded-xl p-3">✓ Cricut-compatible — {p.paperStock || 'cardstock'} • SVG available</div>}
        {p.madeToOrderDays && <div className="mt-2 text-sm text-gray-600">Made to order — {p.madeToOrderDays} days • Perth studio</div>}
        {variantsArr.length>0 && <div className="mt-4"><label className="text-sm font-bold">Variant {stock!==999 && <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${lowStock?'bg-amber-100 text-amber-700':'bg-green-100 text-green-700'}`}>{stock} left</span>}</label><select value={variantId||''} onChange={e=>setVariantId(e.target.value||null)} className="mt-1 w-full border rounded-xl px-3 py-2"><option value="">Default — ${Number(p.price).toFixed(2)}</option>{variantsArr.map(v=> <option key={v.id} value={v.id}>{v.title} — ${Number(v.price).toFixed(2)} {v.inventoryQuantity!==undefined?`(${v.inventoryQuantity} left)`:''}</option>)}</select></div>}
        <div className="mt-4 flex items-center gap-3"><button onClick={()=>setQty(Math.max(1,qty-1))} className="w-10 h-10 rounded-full border bg-white hover:bg-bloom-50">−</button><span className="font-bold w-8 text-center">{qty}</span><button onClick={()=>setQty(Math.min(99,qty+1))} className="w-10 h-10 rounded-full bg-bloom-500 text-white hover:bg-bloom-700">+</button><span className={`text-sm ${lowStock?'text-amber-600':'text-gray-600'}`}>{lowStock?'Low stock • Perth': stock===0?'Made to order • Perth':'in stock • Perth'} {lowStock && '— order soon'}</span></div>
        <button onClick={addToCart} disabled={p.stockMode==='tracked' && stock===0} className="mt-6 w-full bg-bloom-500 text-white py-3 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-bloom-700 transition">Add to Cart — ${ (activePrice*qty).toFixed(2)}</button>
        {err && <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{err}</div>}
        {msg && <div className="mt-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">{msg}</div>}
        <div className="mt-3 flex gap-2 text-xs">
          <span className="bg-bloom-50 border border-bloom-100 rounded-full px-3 py-1.5">GST inclusive</span>
          <span className="bg-bloom-50 border border-bloom-100 rounded-full px-3 py-1.5">ABN on invoice</span>
          <span className="bg-bloom-50 border border-bloom-100 rounded-full px-3 py-1.5">Click & collect 6000</span>
        </div>
        <div className="mt-4 text-xs text-gray-500 border-t pt-3">Earn 1 Bloom pt per $1 • Blossom at 100 pts • Free Perth delivery over $150</div>
      </div>
    </div>
  );
}
