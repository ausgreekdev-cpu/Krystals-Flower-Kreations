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
  async function updateQty(itemId, qty){
    if(qty<=0){ await fetch(`http://localhost:3001/api/cart/update`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({itemId, quantity:0})}); } else { await cartApi.get(); await fetch(`http://localhost:3001/api/cart/update`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({itemId, quantity:qty})}); }
    load();
  }
  if(loading) return <div className="p-8 text-center">Loading cart…</div>;
  const items = cart?.items || [];
  const subtotal = items.reduce((a,it)=> a + Number(it.priceSnapshot||it.unitPrice||0)*it.quantity, 0);
  if(items.length===0) return <div className="max-w-3xl mx-auto px-4 py-8 text-center"><h1 className="text-2xl font-black text-bloom-700">Your cart is empty</h1><p className="text-gray-600 mt-2">Browse paper bouquets or design a custom bloom.</p><div className="mt-4 flex gap-3 justify-center"><Link to="/shop" className="bg-bloom-500 text-white px-6 py-2 rounded-full">Shop</Link><Link to="/configurator" className="border px-6 py-2 rounded-full">Configurator</Link></div></div>;
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-black text-bloom-700">Cart — {items.length} item(s)</h1>
      <div className="mt-6 space-y-3">
        {items.map(it=> (
          <div key={it.id} className="bg-white p-4 rounded-2xl border flex gap-4">
            <img src={it.product?.images?.[0]?.url || `https://picsum.photos/seed/${it.productId}/200/200`} alt={it.product?.title} className="w-20 h-20 rounded-xl object-cover" />
            <div className="flex-1">
              <div className="font-bold text-bloom-700">{it.product?.title || it.title} {it.variant? `— ${it.variant.title}`:''}</div>
              <div className="text-sm text-gray-600">${Number(it.priceSnapshot).toFixed(2)} × {it.quantity} = ${ (Number(it.priceSnapshot)*it.quantity).toFixed(2) }</div>
              <div className="mt-2 flex gap-2"><button onClick={()=>updateQty(it.id, it.quantity-1)} className="px-3 py-1 border rounded-full">−</button><span className="px-2 py-1">{it.quantity}</span><button onClick={()=>updateQty(it.id, it.quantity+1)} className="px-3 py-1 bg-bloom-500 text-white rounded-full">+</button></div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 bg-bloom-700 text-white rounded-2xl p-5">
        <div className="flex justify-between"><span>Subtotal (GST incl.)</span><span className="font-bold">${subtotal.toFixed(2)} AUD</span></div>
        <div className="text-xs opacity-70 mt-1">Shipping calculated at checkout — Perth metro $12 (free over $150). Afterpay available.</div>
        <button onClick={()=>nav('/checkout')} className="w-full mt-4 bg-white text-bloom-700 py-3 rounded-xl font-bold">Checkout — Perth WA</button>
      </div>
    </div>
  );
}
