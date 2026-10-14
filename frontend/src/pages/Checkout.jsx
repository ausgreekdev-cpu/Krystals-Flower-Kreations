import { useState, useEffect, useRef } from 'react';
import { ordersApi } from '../lib/api/customClient';
import { fetchCart, cartItems, getCartId, clearCart, clearCartId, dispatchCartChanged } from '../lib/cartClient';
import { usePublicSettings } from '../lib/publicSettings';
import { loadPayPalScript } from '../lib/paypalLoader';
import { Page, PageHeader, Breadcrumbs } from '../components/ui/Page';
import Btn from '../components/ui/Btn';
import Alert from '../components/ui/Alert';
import { Input, Select, TextArea } from '../components/ui/Field';

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
  // Every line digital → the summary shows "Digital delivery — email" instead of Shipping
  const digitalOnly = Boolean(result?.order?.lines?.length) && result.order.lines.every(l => l.isDigital);
  return (
    <Page>
      <PageHeader crumbs={<Breadcrumbs items={[{label:'Cart', to:'/cart'}, {label:'Checkout'}]} />} title="Checkout — Perth WA" lede={s.shipping_note || 'GST inclusive • Perth metro (12) / WA regional (18) / national (22) • free over $150 • PayPal at checkout • Click & collect Perth'} />
      {minOrder > 0 && <p className="text-xs text-muted mt-1">Minimum order ${minOrder.toFixed(2)}</p>}
      <form className="mt-6 grid gap-4 bg-surface2 p-6 rounded-2xl border" onSubmit={submit}>
        <Input required label="Email" placeholder="you@example.com" type="email" autoComplete="email" labelVisible value={form.email} onChange={e=>setForm({...form,email:e.target.value})} />
        <Input required label="Full name" placeholder="Full name" autoComplete="name" labelVisible value={form.shippingName} onChange={e=>setForm({...form,shippingName:e.target.value})} />
        <Input required label="Address" placeholder="Street address" autoComplete="street-address" labelVisible value={form.shippingAddress} onChange={e=>setForm({...form,shippingAddress:e.target.value})} />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4"><Input required label="Suburb" placeholder="Suburb" autoComplete="address-level2" labelVisible value={form.shippingSuburb} onChange={e=>setForm({...form,shippingSuburb:e.target.value})} /><Input label="State" placeholder="State" autoComplete="address-level1" labelVisible value={form.shippingState} onChange={e=>setForm({...form,shippingState:e.target.value})} /><Input required label="Postcode" placeholder="Postcode" inputMode="numeric" autoComplete="postal-code" labelVisible value={form.shippingPostcode} onChange={e=>setForm({...form,shippingPostcode:e.target.value})} /></div>
        {methods.length > 1 && <Select label="Payment method" value={form.paymentMethod} onChange={e=>setForm({...form,paymentMethod:e.target.value})} className="bg-surface2" labelVisible>{methods.map(m=> <option key={m.value} value={m.value}>{m.label}</option>)}</Select>}
        <Input label="Discount code" placeholder="BLOOM10, PERTHFREE" labelVisible value={form.discountCode} onChange={e=>setForm({...form,discountCode:e.target.value})} />
        {discountMsg && <Alert tone={discountMsg.startsWith('✓') ? 'ok' : 'danger'}>{discountMsg}</Alert>}
        {loyalty && <div className="bg-surface border border-bloom-100 rounded-xl p-3 flex justify-between items-center">
          <span className="text-sm font-bold text-ink">Bloom Points: {loyalty.points} ({loyalty.tier})</span>
          <div className="flex gap-2 items-center">
            <input type="number" min={minRedeem} max={Math.floor(loyalty.points/minRedeem)*minRedeem} step={minRedeem} value={redeemPts} onChange={e=>setRedeemPts(Math.min(parseInt(e.target.value)||0, loyalty.points))} className="w-20 border rounded-lg px-2 py-1 text-sm" placeholder={String(minRedeem)} />
            <Btn type="button" variant="soft" size="pill" className="text-xs font-bold" onClick={async()=>{
              if(redeemPts<minRedeem) return setErr(`Min ${minRedeem} pts = $${redeemValue(minRedeem).toFixed(2)} off`);
              const token=localStorage.getItem('token'); if(!token) return setErr('Login to redeem');
              const res=await fetch('/api/loyalty/redeem', { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`}, body: JSON.stringify({ points: redeemPts, reason:'checkout redeem' }) });
              const j=await res.json().catch(()=>({}));
              if(!res.ok) return setErr(j.error||'Redeem failed');
            }}>Redeem {minRedeem} = ${redeemValue(minRedeem).toFixed(2)}</Btn>
          </div>
        </div>}
        {notesEnabled && <TextArea label={s.order_notes_placeholder || 'Note (delivery instructions)'} placeholder={s.order_notes_placeholder || 'Note (delivery instructions)'} value={form.customerNote} onChange={e=>setForm({...form,customerNote:e.target.value})} rows={2} />}
        {termsRequired && (
          <label className="flex items-start gap-2 text-xs text-muted">
            <input type="checkbox" className="mt-0.5" checked={Boolean(form.acceptTerms)} onChange={e=>setForm({...form,acceptTerms:e.target.checked})} required />
            <span>I have read and accept the <a href={s.terms_url} target="_blank" rel="noreferrer" className="underline text-highlight">terms & conditions</a>.</span>
          </label>
        )}
        <Btn size="lg" disabled={loading || ppBusy}>{loading? 'Processing…' : form.paymentMethod === 'paypal' ? 'Continue — reserve & pay with PayPal' : 'Place Order — Pay Later (manual)'}</Btn>
        {form.paymentMethod === 'paypal' && pp.paypalOrderId && !result && (
          <div className="border border-line rounded-xl p-3 bg-surface space-y-2">
            <div className="text-xs text-muted">Order reserved — approve the payment in the PayPal window to confirm it.</div>
            <div id="paypal-buttons" />
            {ppBusy && <div className="text-xs text-muted">Confirming payment…</div>}
          </div>
        )}
        {err && <Alert tone="danger">{err}</Alert>}
        {result && (
          <Alert tone="ok">
            <div className="font-bold">Order {result.order.orderNumber} created</div>
            <div className="mt-1 grid gap-0.5 text-xs">
              <div className="flex justify-between"><span>Subtotal</span><span>${Number(result.order.subtotal).toFixed(2)}</span></div>
              <div className="flex justify-between"><span>{digitalOnly ? 'Digital delivery — email' : 'Shipping'}</span><span>{digitalOnly ? 'free' : `$${Number(result.order.shippingCost).toFixed(2)}`}</span></div>
              <div className="flex justify-between"><span>Discount</span><span>−${Number(result.order.discountTotal).toFixed(2)}</span></div>
              <div className="flex justify-between"><span>GST incl.</span><span>${Number(result.gst.gst).toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-sm mt-1"><span>Total</span><span>${Number(result.order.total).toFixed(2)}</span></div>
            </div>
            <div className="mt-1.5 text-xs">{result.paymentInstructions}</div>
          </Alert>
        )}
        <p className="text-xs text-muted">ABN on invoice. PayPal, bank transfer and pay-on-pickup are configured in Admin → Settings → Payments.</p>
      </form>
    </Page>
  );
}
