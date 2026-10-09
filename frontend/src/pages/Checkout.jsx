import { useState, useEffect, useRef } from 'react';
import { ordersApi } from '../lib/api/customClient';
import { fetchCart, cartItems, getCartId, clearCart, clearCartId, dispatchCartChanged } from '../lib/cartClient';
import { usePublicSettings } from '../lib/publicSettings';
import { loadPayPalScript } from '../lib/paypalLoader';
import Breadcrumbs from '../components/layout/Breadcrumbs';

const PAY_LABELS = {
  paypal: 'PayPal — pay now',
  pickup: 'Pickup Perth Studio — pay on collection',
  bank_transfer: 'Bank transfer (invoice emailed)',
  cash: 'Cash (in-person)',
  manual: 'Manual / invoice later',
};

export default function Checkout(){
  const [form,setForm]=useState({ email:'', shippingName:'', shippingAddress:'', shippingSuburb:'', shippingState:'WA', shippingPostcode:'', discountCode:'', customerNote:'', paymentMethod:'paypal', acceptTerms:false });
  const [result,setResult]=useState(null); const [loading,setLoading]=useState(false); const [err,setErr]=useState('');
  const [pp,setPp]=useState({ paypalOrderId: null }); const [ppBusy,setPpBusy]=useState(false);
  const ppIdemKey=useRef(null);
  const [discountMsg,setDiscountMsg]=useState(''); const [loyalty,setLoyalty]=useState(null);
  const [redeemPts,setRedeemPts]=useState(0);
  const s = usePublicSettings();
  // Payment methods the store actually offers (settings: checkout_payment_methods)
  const enabledMethods = String(s.checkout_payment_methods || '').split(',').map(m => m.trim()).filter(Boolean);
  const methods = (enabledMethods.length ? enabledMethods : ['pickup', 'bank_transfer']).map(v => ({ value: v, label: PAY_LABELS[v] || v }));
  const methodsKey = methods.map(m => m.value).join(',');
  useEffect(() => {
    if (methods.length && !methods.some(m => m.value === form.paymentMethod)) {
      setForm(f => ({ ...f, paymentMethod: methods[0].value }));
    }
  }, [methodsKey]);
  const termsRequired = s.terms_required === '1' && Boolean(s.terms_url);
  const minOrder = Number(s.min_order_amount) || 0;
  const notesEnabled = s.enable_order_notes !== '0';
  const minRedeem = Number(s.loyalty_min_redeem_points) || 100;
  const redeemRate = Number(s.loyalty_redeem_rate) || 5; // $ per 100 pts
  const redeemValue = (pts) => (pts / 100) * redeemRate;
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
      const cartId=getCartId();
      if(cartId) fetchCart().then(d=>{
        const subtotal=cartItems(d).reduce((a,it)=>a+Number(it.priceSnapshot||0)*it.quantity,0);
        return fetch(`/api/discounts/validate?code=${encodeURIComponent(code)}&subtotal=${subtotal}`).then(r=>r.json());
      }).then(j=> setDiscountMsg(j.valid?`✓ ${j.discount.code}: ${j.discount.description} — ${j.discount.type==='percent'?j.discount.value+'%':`$${j.discount.value}`} off` : `✗ ${j.error}`)).catch(()=> setDiscountMsg(''));
      else fetch(`/api/discounts/validate?code=${encodeURIComponent(code)}`).then(r=>r.json()).then(j=> setDiscountMsg(j.valid?`✓ ${j.discount.code} valid`:`✗ ${j.error}`)).catch(()=>{});
    }, 500);
    return ()=>clearTimeout(id);
  }, [form.discountCode]);
  async function finishPayPal(order){
    await clearCart({ bestEffort: true });
    setResult({
      order,
      gst: { gst: Number(order.taxTotal) },
      shipping: { price: Number(order.shippingCost) },
      paymentInstructions: 'Paid via PayPal — a receipt is on its way to your inbox.',
      captured: true,
    });
  }
  async function submit(e){
    e.preventDefault(); setLoading(true); setErr('');
    const cartId = getCartId();
    if(!cartId){ setErr('No cart — add items first'); setLoading(false); return; }
    try{
      if (form.paymentMethod === 'paypal') {
        // Stable key per checkout session: retries return the same reserved
        // order instead of reserving stock twice.
        if (!ppIdemKey.current) ppIdemKey.current = globalThis.crypto?.randomUUID?.() || `pp-${Date.now()}`;
        const res = await ordersApi.paypalCreate({ cartId, ...form }, ppIdemKey.current);
        if (res.paid) await finishPayPal(res.order);
        else setPp({ paypalOrderId: res.paypalOrderId });
      } else {
        const res = await ordersApi.checkout({ cartId, ...form });
        setResult(res);
        setErr(`Order ${res.order.orderNumber} created — ${res.paymentInstructions} Total $${Number(res.order.total).toFixed(2)} (GST $${Number(res.gst.gst).toFixed(2)} incl.)`);
        // Server already emptied the cart items in the checkout transaction —
        // only the local id (and the header badge) needs resetting.
        clearCartId();
        dispatchCartChanged();
      }
    }catch(e2){ setErr(e2.message); }
    setLoading(false);
  }
  // Render the PayPal Buttons once a session exists (re-runs when the Client
  // ID setting arrives late or the reserved order changes).
  useEffect(() => {
    if (!pp.paypalOrderId || result || form.paymentMethod !== 'paypal') return;
    let cancelled = false;
    let buttons;
    (async () => {
      try {
        const clientId = String(s.paypal_client_id || '').trim();
        if (!clientId) throw new Error('PayPal is not configured — the store owner needs to add the Client ID in Admin → Settings → Payments');
        const paypal = await loadPayPalScript(clientId, 'AUD');
        if (cancelled) return;
        buttons = paypal.Buttons({
          style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' },
          createOrder: () => pp.paypalOrderId,
          onApprove: async (data) => {
            setPpBusy(true); setErr('');
            try {
              const res = await ordersApi.paypalCapture(data.orderID);
              await finishPayPal(res.order);
            } catch (e2) { setErr(e2.message || 'PayPal payment failed — your order is reserved, use the button to retry'); }
            setPpBusy(false);
          },
          onError: () => setErr('PayPal hit an error — please try again'),
          onCancel: () => setErr('PayPal window closed — your reserved order is still here, use the PayPal button to continue'),
        });
        if (cancelled) return;
        if (!buttons.isEligible()) throw new Error('PayPal buttons are not available in this browser');
        await buttons.render('#paypal-buttons');
      } catch (e) { if (!cancelled) setErr(e.message); }
    })();
    return () => { cancelled = true; try { buttons?.close?.(); } catch { /* already closed */ } };
  }, [pp.paypalOrderId, result, form.paymentMethod, s.paypal_client_id]);
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Breadcrumbs items={[{label:'Cart', to:'/cart'}, {label:'Checkout'}]} />
      <h1 className="text-2xl font-black text-ink">Checkout — Perth WA</h1>
      <p className="text-sm text-muted mt-2">{s.shipping_note || 'GST inclusive • Perth metro (12) / WA regional (18) / national (22) • free over $150 • PayPal at checkout • Click & collect Perth'}</p>
      {minOrder > 0 && <p className="text-xs text-muted mt-1">Minimum order ${minOrder.toFixed(2)}</p>}
      <form className="mt-6 grid gap-4 bg-surface2 p-6 rounded-2xl border" onSubmit={submit}>
        <input required placeholder="Email*" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="border rounded-xl px-3 py-2" />
        <input required placeholder="Full name*" value={form.shippingName} onChange={e=>setForm({...form,shippingName:e.target.value})} className="border rounded-xl px-3 py-2" />
        <input required placeholder="Address*" value={form.shippingAddress} onChange={e=>setForm({...form,shippingAddress:e.target.value})} className="border rounded-xl px-3 py-2" />
        <div className="grid grid-cols-3 gap-4"><input required placeholder="Suburb*" value={form.shippingSuburb} onChange={e=>setForm({...form,shippingSuburb:e.target.value})} className="border rounded-xl px-3 py-2" /><input placeholder="State" value={form.shippingState} onChange={e=>setForm({...form,shippingState:e.target.value})} className="border rounded-xl px-3 py-2" /><input required placeholder="Postcode*" value={form.shippingPostcode} onChange={e=>setForm({...form,shippingPostcode:e.target.value})} className="border rounded-xl px-3 py-2" /></div>
        {methods.length > 1 && <select value={form.paymentMethod} onChange={e=>setForm({...form,paymentMethod:e.target.value})} className="border rounded-xl px-3 py-2 bg-surface2">{methods.map(m=> <option key={m.value} value={m.value}>{m.label}</option>)}</select>}
        <input placeholder="Discount code (BLOOM10, PERTHFREE)" value={form.discountCode} onChange={e=>setForm({...form,discountCode:e.target.value})} className="border rounded-xl px-3 py-2" />
        {discountMsg && <div className={`text-xs rounded-xl px-3 py-2 ${discountMsg.startsWith('✓')?'bg-green-50 border border-green-200 text-green-700':'bg-red-50 border border-red-200 text-red-700'}`}>{discountMsg}</div>}
        {loyalty && <div className="bg-surface border border-bloom-100 rounded-xl p-3 flex justify-between items-center">
          <span className="text-sm font-bold text-ink">Bloom Points: {loyalty.points} ({loyalty.tier})</span>
          <div className="flex gap-2 items-center">
            <input type="number" min={minRedeem} max={Math.floor(loyalty.points/minRedeem)*minRedeem} step={minRedeem} value={redeemPts} onChange={e=>setRedeemPts(Math.min(parseInt(e.target.value)||0, loyalty.points))} className="w-20 border rounded-lg px-2 py-1 text-sm" placeholder={String(minRedeem)} />
            <button type="button" onClick={async()=>{
              if(redeemPts<minRedeem) return setErr(`Min ${minRedeem} pts = $${redeemValue(minRedeem).toFixed(2)} off`);
              const token=localStorage.getItem('token'); if(!token) return setErr('Login to redeem');
              const res=await fetch('/api/loyalty/redeem', { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`}, body: JSON.stringify({ points: redeemPts, reason:'checkout redeem' }) });
              const j=await res.json().catch(()=>({}));
              if(!res.ok) return setErr(j.error||'Redeem failed');
              setLoyalty(j); setErr(`Redeemed ${redeemPts} pts — $ ${redeemValue(redeemPts).toFixed(2)} off on next order (ask at till)`);
            }} className="bg-surface2 border rounded-full px-3 py-1 text-xs font-bold hover:bg-surface3">Redeem {minRedeem} = ${redeemValue(minRedeem).toFixed(2)}</button>
          </div>
        </div>}
        {notesEnabled && <textarea placeholder={s.order_notes_placeholder || 'Note (delivery instructions)'} value={form.customerNote} onChange={e=>setForm({...form,customerNote:e.target.value})} className="border rounded-xl px-3 py-2" rows={2} />}
        {termsRequired && (
          <label className="flex items-start gap-2 text-xs text-muted">
            <input type="checkbox" className="mt-0.5" checked={Boolean(form.acceptTerms)} onChange={e=>setForm({...form,acceptTerms:e.target.checked})} required />
            <span>I have read and accept the <a href={s.terms_url} target="_blank" rel="noreferrer" className="underline text-highlight">terms & conditions</a>.</span>
          </label>
        )}
        <button disabled={loading || ppBusy} className="bg-bloom-500 text-white py-3 rounded-xl font-bold disabled:opacity-50">{loading? 'Processing…' : form.paymentMethod === 'paypal' ? 'Continue — reserve & pay with PayPal' : 'Place Order — Pay Later (manual)'}</button>
        {form.paymentMethod === 'paypal' && pp.paypalOrderId && !result && (
          <div className="border border-line rounded-xl p-3 bg-surface space-y-2">
            <div className="text-xs text-muted">Order reserved — approve the payment in the PayPal window to confirm it.</div>
            <div id="paypal-buttons" />
            {ppBusy && <div className="text-xs text-muted">Confirming payment…</div>}
          </div>
        )}
        {err && <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">{err}</div>}
        {result && <div className="text-sm bg-green-50 border border-green-200 rounded-xl p-3"><div className="font-bold">Order {result.order.orderNumber}</div><div>Subtotal ${Number(result.order.subtotal).toFixed(2)} • Shipping ${Number(result.order.shippingCost).toFixed(2)} • Discount ${Number(result.order.discountTotal).toFixed(2)} • GST ${Number(result.gst.gst).toFixed(2)} • Total ${Number(result.order.total).toFixed(2)}</div><div className="mt-1 text-xs">{result.paymentInstructions}</div></div>}
        <p className="text-xs text-muted">ABN on invoice. PayPal, bank transfer and pay-on-pickup are configured in Admin → Settings → Payments.</p>
      </form>
    </div>
  );
}
