import { useState, useEffect } from 'react';
import { ordersApi } from '../lib/api/customClient';

export default function Checkout(){
  const [form,setForm]=useState({ email:'', shippingName:'', shippingAddress:'', shippingSuburb:'', shippingState:'WA', shippingPostcode:'', discountCode:'', customerNote:'', paymentMethod:'pickup' });
  const [result,setResult]=useState(null); const [loading,setLoading]=useState(false); const [err,setErr]=useState('');
  const [discountMsg,setDiscountMsg]=useState(''); const [loyalty,setLoyalty]=useState(null);
  const [redeemPts,setRedeemPts]=useState(0);
  useEffect(()=>{
    const token=localStorage.getItem('token');
    if(token) fetch('/api/loyalty/me', { headers:{ Authorization:`Bearer ${token}` } }).then(r=> r.ok?r.json():null).then(setLoyalty).catch(()=>{});
  }, []);
  // Live validate discount code with debounce
  useEffect(()=>{
    if(!form.discountCode) return setDiscountMsg('');
    const id=setTimeout(()=>{
      const code=form.discountCode.trim().toUpperCase();
      if(!code) return setDiscountMsg('');
      // Estimate subtotal for minSpend check via cart
      const cartId=localStorage.getItem('cartId');
      if(cartId) fetch(`/api/cart`, { headers:{ 'x-cart-id': cartId } }).then(r=>r.json()).then(d=>{
        const items=d?.cart?.items||d?.items||[];
        const subtotal=items.reduce((a,it)=>a+Number(it.priceSnapshot||0)*it.quantity,0);
        return fetch(`/api/discounts/validate?code=${encodeURIComponent(code)}&subtotal=${subtotal}`).then(r=>r.json());
      }).then(j=> setDiscountMsg(j.valid?`✓ ${j.discount.code}: ${j.discount.description} — ${j.discount.type==='percent'?j.discount.value+'%':`$${j.discount.value}`} off` : `✗ ${j.error}`)).catch(()=> setDiscountMsg(''));
      else fetch(`/api/discounts/validate?code=${encodeURIComponent(code)}`).then(r=>r.json()).then(j=> setDiscountMsg(j.valid?`✓ ${j.discount.code} valid`:`✗ ${j.error}`)).catch(()=>{});
    }, 500);
    return ()=>clearTimeout(id);
  }, [form.discountCode]);
  async function submit(e){
    e.preventDefault(); setLoading(true); setErr('');
    const cartId = localStorage.getItem('cartId');
    if(!cartId){ setErr('No cart — add items first'); setLoading(false); return; }
    try{
      const res = await ordersApi.checkout({ cartId, ...form });
      setResult(res);
      setErr(`Order ${res.order.orderNumber} created — ${res.paymentInstructions} Total $${Number(res.order.total).toFixed(2)} (GST $${Number(res.gst.gst).toFixed(2)} incl.)`);
      localStorage.removeItem('cartId');
    }catch(e2){ setErr(e2.message); }
    setLoading(false);
  }
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-black text-bloom-700">Checkout — Perth WA</h1>
      <p className="text-sm text-gray-600 mt-2">GST inclusive • Perth metro (12) / WA regional (18) / national (22) • free over $150 • Manual payments (Stripe paused) • Click & collect Perth</p>
      <form className="mt-6 grid gap-4 bg-white p-6 rounded-2xl border" onSubmit={submit}>
        <input required placeholder="Email*" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="border rounded-xl px-3 py-2" />
        <input required placeholder="Full name*" value={form.shippingName} onChange={e=>setForm({...form,shippingName:e.target.value})} className="border rounded-xl px-3 py-2" />
        <input required placeholder="Address*" value={form.shippingAddress} onChange={e=>setForm({...form,shippingAddress:e.target.value})} className="border rounded-xl px-3 py-2" />
        <div className="grid grid-cols-3 gap-4"><input required placeholder="Suburb*" value={form.shippingSuburb} onChange={e=>setForm({...form,shippingSuburb:e.target.value})} className="border rounded-xl px-3 py-2" /><input placeholder="State" value={form.shippingState} onChange={e=>setForm({...form,shippingState:e.target.value})} className="border rounded-xl px-3 py-2" /><input required placeholder="Postcode*" value={form.shippingPostcode} onChange={e=>setForm({...form,shippingPostcode:e.target.value})} className="border rounded-xl px-3 py-2" /></div>
        <select value={form.paymentMethod} onChange={e=>setForm({...form,paymentMethod:e.target.value})} className="border rounded-xl px-3 py-2 bg-white"><option value="pickup">Pickup Perth Studio — pay on collection</option><option value="bank_transfer">Bank transfer (invoice emailed)</option><option value="cash">Cash (in-person)</option><option value="manual">Manual / invoice later</option></select>
        <input placeholder="Discount code (BLOOM10, PERTHFREE)" value={form.discountCode} onChange={e=>setForm({...form,discountCode:e.target.value})} className="border rounded-xl px-3 py-2" />
        {discountMsg && <div className={`text-xs rounded-xl px-3 py-2 ${discountMsg.startsWith('✓')?'bg-green-50 border border-green-200 text-green-700':'bg-red-50 border border-red-200 text-red-700'}`}>{discountMsg}</div>}
        {loyalty && <div className="bg-bloom-50 border border-bloom-100 rounded-xl p-3 flex justify-between items-center">
          <span className="text-sm font-bold text-bloom-700">Bloom Points: {loyalty.points} ({loyalty.tier})</span>
          <div className="flex gap-2 items-center">
            <input type="number" min={0} max={Math.floor(loyalty.points/100)*100} step={100} value={redeemPts} onChange={e=>setRedeemPts(Math.min(parseInt(e.target.value)||0, loyalty.points))} className="w-20 border rounded-lg px-2 py-1 text-sm" placeholder="100" />
            <button type="button" onClick={async()=>{
              if(redeemPts<100) return setErr('Min 100 pts = $5 off');
              const token=localStorage.getItem('token'); if(!token) return setErr('Login to redeem');
              const res=await fetch('/api/loyalty/redeem', { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`}, body: JSON.stringify({ points: redeemPts, reason:'checkout redeem' }) });
              const j=await res.json().catch(()=>({}));
              if(!res.ok) return setErr(j.error||'Redeem failed');
              setLoyalty(j); setErr(`Redeemed ${redeemPts} pts — $ ${(redeemPts/100*5).toFixed(2)} off on next order (ask at till)`);
            }} className="bg-white border rounded-full px-3 py-1 text-xs font-bold hover:bg-bloom-50">Redeem 100= $5</button>
          </div>
        </div>}
        <textarea placeholder="Note (delivery instructions)" value={form.customerNote} onChange={e=>setForm({...form,customerNote:e.target.value})} className="border rounded-xl px-3 py-2" rows={2} />
        <button disabled={loading} className="bg-bloom-500 text-white py-3 rounded-xl font-bold disabled:opacity-50">{loading? 'Processing…':'Place Order — Pay Later (manual)'}</button>
        {err && <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">{err}</div>}
        {result && <div className="text-sm bg-green-50 border border-green-200 rounded-xl p-3"><div className="font-bold">Order {result.order.orderNumber}</div><div>Subtotal ${Number(result.order.subtotal).toFixed(2)} • Shipping ${Number(result.order.shippingCost).toFixed(2)} • Discount ${Number(result.order.discountTotal).toFixed(2)} • GST ${Number(result.gst.gst).toFixed(2)} • Total ${Number(result.order.total).toFixed(2)}</div><div className="mt-1 text-xs">{result.paymentInstructions}</div></div>}
        <p className="text-xs text-gray-500">ABN on invoice. Stripe disabled — cash/bank/pickup only for now. To re-enable: set STRIPE_ENABLED=true + STRIPE_SECRET_KEY.</p>
      </form>
    </div>
  );
}
