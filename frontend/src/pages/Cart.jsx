import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cartApi } from '../lib/api/customClient';

export default function Cart(){
  const nav=useNavigate();
  const [cart,setCart]=useState(null); const [loading,setLoading]=useState(true);
  async function load(){
    const cartId = localStorage.getItem('cartId');
    if(!cartId){ setCart(null); setLoading(false); return; }
    try{ const data = await cartApi.get(cartId); setCart(data.cart || data); }catch{ setCart(null); }
    setLoading(false);
  }
  useEffect(()=>{ load(); }, []);
  const [err,setErr]=useState('');
  async function updateQty(itemId, qty){
    setErr('');
    try{
      if(qty<=0){ await fetch(`/api/cart/update`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({itemId, quantity:0})}); }
      else { await fetch(`/api/cart/update`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({itemId, quantity:qty})}); }
      window.dispatchEvent(new CustomEvent('cart:updated'));
    }catch(e){ setErr(e.message); }
    load();
  }
  async function clearCart(){
    const cartId = localStorage.getItem('cartId');
    if(!cartId) return;
    await fetch(`/api/cart/${cartId}`, {method:'DELETE'}).catch(()=>{});
    localStorage.removeItem('cartId');
    window.dispatchEvent(new CustomEvent('cart:updated'));
    load();
  }
  if(loading) return <div className="p-8 text-center"><div className="animate-pulse bg-white border rounded-2xl p-6">Loading cart…</div></div>;
  const items = Array.isArray(cart?.items) ? cart.items : [];
  const subtotal = items.reduce((a,it)=> a + Number(it.priceSnapshot||it.unitPrice||0)*it.quantity, 0);
  if(items.length===0) return <div className="max-w-3xl mx-auto px-4 py-8 text-center"><h1 className="text-2xl font-black text-bloom-700">Your cart is empty</h1><p className="text-gray-600 mt-2">Browse paper bouquets or design a custom bloom.</p><div className="mt-4 flex gap-3 justify-center"><Link to="/shop" className="bg-bloom-500 text-white px-6 py-2 rounded-full">Shop</Link><Link to="/configurator" className="border px-6 py-2 rounded-full">Configurator</Link></div></div>;
  const gst = subtotal * 0.10 / 1.10;
  const youEarn = Math.floor(subtotal);
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center"><h1 className="text-2xl font-black text-bloom-700">Cart — {items.length} item(s)</h1><button onClick={clearCart} className="text-xs border rounded-full px-3 py-1 hover:bg-red-50 hover:text-red-600">Clear</button></div>
      {err && <div className="mt-3 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs">{err} {err.includes('stock') && <span>— try lowering qty</span>}</div>}
      <div className="mt-6 space-y-3">
        {items.map(it=> (
          <div key={it.id} className="bg-white p-4 rounded-2xl border flex gap-4 hover:shadow-sm">
            <img loading="lazy" src={it.product?.images?.[0]?.url || `/placeholder-bloom.jpg`} alt={it.product?.title} width="80" height="80" className="w-20 h-20 rounded-xl object-cover" onError={(e)=>{ e.currentTarget.src='/placeholder-bloom.jpg'; }} />
            <div className="flex-1">
              <div className="font-bold text-bloom-700 text-sm">{it.product?.title || it.title} {it.variant? `— ${it.variant.title}`:''}</div>
              <div className="text-sm text-gray-600">${Number(it.priceSnapshot).toFixed(2)} × {it.quantity} = <span className="font-bold">${ (Number(it.priceSnapshot)*it.quantity).toFixed(2) }</span></div>
              <div className="mt-2 flex gap-2 items-center"><button onClick={()=>updateQty(it.id, it.quantity-1)} className="px-3 py-1 border rounded-full hover:bg-bloom-50">−</button><span className="px-2 py-1 text-sm font-bold">{it.quantity}</span><button onClick={()=>updateQty(it.id, Math.min(99,it.quantity+1))} className="px-3 py-1 bg-bloom-500 text-white rounded-full hover:bg-bloom-700">+</button><button onClick={()=>updateQty(it.id,0)} className="ml-auto text-xs text-red-600 hover:underline">Remove</button></div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 bg-white border rounded-2xl p-5">
        <div className="flex justify-between text-sm"><span className="text-gray-600">Subtotal</span><span className="font-bold">${subtotal.toFixed(2)}</span></div>
        <div className="flex justify-between text-xs text-gray-500 mt-1"><span>GST incl.</span><span>${gst.toFixed(2)}</span></div>
        <div className="flex justify-between text-xs text-bloom-700 mt-2 font-bold"><span>You’ll earn</span><span>{youEarn} Bloom pts</span></div>
        <div className="text-xs text-gray-500 mt-3">Shipping at checkout — Perth metro $12 (free over $150). Pickup 6000 free.</div>
        <button onClick={()=>nav('/checkout')} className="w-full mt-4 bg-bloom-500 text-white py-3 rounded-xl font-bold hover:bg-bloom-700">Checkout — Perth WA</button>
        <Link to="/shop" className="block text-center text-xs text-gray-500 mt-3 hover:text-bloom-500">← Continue shopping</Link>
      </div>
      <div className="mt-6 bg-bloom-700 text-white rounded-2xl p-4 text-xs flex gap-3">
        <span>✿</span><span>Blossom at 100 pts, Garden at 500 — redeem 100 pts = $5 off at checkout (ask at till).</span>
      </div>
    </div>
  );
}
