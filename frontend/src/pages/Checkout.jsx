import { useState } from 'react';
import { ordersApi } from '../lib/api/customClient';

export default function Checkout(){
  const [form,setForm]=useState({ email:'', shippingName:'', shippingAddress:'', shippingSuburb:'', shippingState:'WA', shippingPostcode:'', discountCode:'', customerNote:'' });
  const [result,setResult]=useState(null); const [loading,setLoading]=useState(false); const [err,setErr]=useState('');
  async function submit(e){
    e.preventDefault(); setLoading(true); setErr('');
    const cartId = localStorage.getItem('cartId');
    if(!cartId){ setErr('No cart — add items first'); setLoading(false); return; }
    try{
      const res = await ordersApi.checkout({ cartId, ...form });
      setResult(res);
      if(res.checkoutUrl) window.location.href = res.checkoutUrl;
      else setErr(`Order ${res.order.orderNumber} created — pay on pickup / invoice. Total $${Number(res.order.total).toFixed(2)} (GST $${Number(res.gst.gst).toFixed(2)} incl.)`);
      localStorage.removeItem('cartId');
    }catch(e2){ setErr(e2.message); }
    setLoading(false);
  }
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-black text-bloom-700">Checkout — Perth WA</h1>
      <p className="text-sm text-gray-600 mt-2">GST inclusive • Perth metro (12) / WA regional (18) / national (22) • free over $150 • Stripe + Afterpay • Click & collect</p>
      <form className="mt-6 grid gap-4 bg-white p-6 rounded-2xl border" onSubmit={submit}>
        <input required placeholder="Email*" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="border rounded-xl px-3 py-2" />
        <input required placeholder="Full name*" value={form.shippingName} onChange={e=>setForm({...form,shippingName:e.target.value})} className="border rounded-xl px-3 py-2" />
        <input required placeholder="Address*" value={form.shippingAddress} onChange={e=>setForm({...form,shippingAddress:e.target.value})} className="border rounded-xl px-3 py-2" />
        <div className="grid grid-cols-3 gap-4"><input required placeholder="Suburb*" value={form.shippingSuburb} onChange={e=>setForm({...form,shippingSuburb:e.target.value})} className="border rounded-xl px-3 py-2" /><input placeholder="State" value={form.shippingState} onChange={e=>setForm({...form,shippingState:e.target.value})} className="border rounded-xl px-3 py-2" /><input required placeholder="Postcode*" value={form.shippingPostcode} onChange={e=>setForm({...form,shippingPostcode:e.target.value})} className="border rounded-xl px-3 py-2" /></div>
        <input placeholder="Discount code (BLOOM10, PERTHFREE)" value={form.discountCode} onChange={e=>setForm({...form,discountCode:e.target.value})} className="border rounded-xl px-3 py-2" />
        <textarea placeholder="Note (delivery instructions)" value={form.customerNote} onChange={e=>setForm({...form,customerNote:e.target.value})} className="border rounded-xl px-3 py-2" rows={2} />
        <button disabled={loading} className="bg-bloom-500 text-white py-3 rounded-xl font-bold disabled:opacity-50">{loading? 'Processing…':'Pay with Stripe — AUD'}</button>
        {err && <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">{err}</div>}
        {result && <div className="text-sm bg-green-50 border border-green-200 rounded-xl p-3"><div className="font-bold">Order {result.order.orderNumber}</div><div>Subtotal ${Number(result.order.subtotal).toFixed(2)} • Shipping ${Number(result.order.shippingCost).toFixed(2)} • Discount ${Number(result.order.discountTotal).toFixed(2)} • GST ${Number(result.gst.gst).toFixed(2)} • Total ${Number(result.order.total).toFixed(2)}</div>{result.checkoutUrl? <a href={result.checkoutUrl} className="text-bloom-600 underline">Open Stripe Checkout</a> : <span>Complete via POS or bank transfer.</span>}</div>}
        <p className="text-xs text-gray-500">ABN on invoice. Afterpay available via Stripe if enabled in dashboard. For Tap-to-Pay at market, close via POS.</p>
      </form>
    </div>
  );
}
