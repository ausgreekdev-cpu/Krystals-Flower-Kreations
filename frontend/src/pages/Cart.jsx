import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchCart, cartItems, updateCartItem, clearCart, computeCartTotals, setCartId } from '../lib/cartClient';
import { cartApi } from '../lib/api/customClient';
import { usePublicSettings } from '../lib/publicSettings';
import { Page, PageHeader, Breadcrumbs } from '../components/ui/Page';
import ResponsiveImage from '../components/ResponsiveImage';
import Btn from '../components/ui/Btn';
import Alert from '../components/ui/Alert';
import { Input } from '../components/ui/Field';
import { EmptyState, Skeleton } from '../components/ui/State';
import BloomMark from '../components/ui/BloomMark';

export default function Cart(){
  const nav=useNavigate();
  const s = usePublicSettings();
  const [searchParams] = useSearchParams();
  const [cart,setCart]=useState(null); const [loading,setLoading]=useState(true); const [err,setErr]=useState('');
  const [remindEmail,setRemindEmail]=useState(''); const [remindSaved,setRemindSaved]=useState(false); const [remindBusy,setRemindBusy]=useState(false);
  async function load(){
    setErr('');
    try{ setCart(await fetchCart()); }
    catch(e){ setErr(e.message||'Failed to load cart'); setCart(null); }
    setLoading(false);
  }
  useEffect(()=>{
    // Restore link from an abandoned-cart email: /cart?restore=<cartId>.
    // The cartId is the guest capability (same model as the x-cart-id header).
    // An expired/deleted cart falls through to the normal empty state.
    const restore = searchParams.get('restore');
    if (restore && /^[A-Za-z0-9]{8,100}$/.test(restore)) setCartId(restore);
    load();
  }, []);
  async function updateQty(itemId, qty){
    setErr('');
    try{ await updateCartItem(itemId, qty); }
    catch(e){ setErr(e.message||'Update failed'); }
    load();
  }
  async function clearAll(){
    setErr('');
    try{ await clearCart(); }
    catch(e){ setErr(e.message||'Clear failed'); }
    load();
  }
  async function saveReminder(e){
    e.preventDefault();
    const cartId = cart?.id;
    const email = remindEmail.trim();
    if(!cartId || !email) return;
    setRemindBusy(true);
    try{
      await cartApi.saveEmail(cartId, email);
      setRemindSaved(true);
    }catch{ /* reminder capture is best-effort — never blocks shopping */ }
    setRemindBusy(false);
  }
  if(loading) return <Page><PageHeader crumbs={<Breadcrumbs items={[{label:'Cart'}]} />} title="Cart" /><Skeleton className="mt-6 h-40" /></Page>;
  const items = cartItems(cart);
  const { subtotal, gst, youEarn, loyaltyEnabled, freeOver } = computeCartTotals(items, s);
  if(items.length===0) return (
    <Page>
      <PageHeader crumbs={<Breadcrumbs items={[{label:'Cart'}]} />} title="Your cart is empty" lede="Browse paper bouquets or design a custom bloom." />
      <EmptyState className="mt-6" title="Nothing in the cart yet" body="Made-to-order blooms from the Perth studio, or design your own in the configurator."
        action={<div className="flex gap-3"><Btn to="/shop" size="md">Shop blooms</Btn><Btn to="/configurator" variant="outline" size="md">Configurator</Btn></div>} />
    </Page>
  );
  return (
    <Page>
      <PageHeader crumbs={<Breadcrumbs items={[{label:'Cart'}]} />} title={`Cart — ${items.length} item(s)`} className="flex justify-between items-center gap-3" action={<Btn variant="dangerOutline" size="sm" onClick={clearAll}>Clear</Btn>} />
      {err && <Alert tone="danger" className="mt-3">{err} {err.includes('stock') && <span>— try lowering qty</span>}</Alert>}
      <div className="mt-6 space-y-3">
        {items.map(it=> (
          <div key={it.id} className="bg-surface2 p-4 rounded-2xl border flex gap-4 hover:shadow">
            <ResponsiveImage image={it.product?.images?.[0]} alt={it.product?.title || ''} width="80" height="80" sizes="80px" className="w-20 h-20 rounded-xl object-cover" />
            <div className="flex-1">
              <div className="font-bold text-ink text-sm">{it.product?.title || it.title} {it.variant? `— ${it.variant.title}`:''}</div>
              <div className="text-sm text-muted">${Number(it.priceSnapshot).toFixed(2)} × {it.quantity} = <span className="font-bold">${ (Number(it.priceSnapshot)*it.quantity).toFixed(2) }</span></div>
              <div className="mt-2 flex gap-2 items-center"><Btn variant="outline" size="icon" onClick={()=>updateQty(it.id, it.quantity-1)} disabled={it.quantity<=1} aria-label="Decrease quantity">−</Btn><span className="px-2 py-1 text-sm font-bold">{it.quantity}</span><Btn size="icon" onClick={()=>updateQty(it.id, Math.min(99,it.quantity+1))} disabled={it.quantity>=99} aria-label="Increase quantity">+</Btn><Btn variant="danger" size="bare" className="ml-auto text-xs" onClick={()=>updateQty(it.id,0)}>Remove</Btn></div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 bg-surface2 border rounded-2xl p-5">
        <div className="flex justify-between text-sm"><span className="text-muted">Subtotal</span><span className="font-bold">${subtotal.toFixed(2)}</span></div>
        <div className="flex justify-between text-xs text-muted mt-1"><span>GST incl.</span><span>${gst.toFixed(2)}</span></div>
        {loyaltyEnabled && <div className="flex justify-between text-xs text-ink mt-2 font-bold"><span>You’ll earn</span><span>{youEarn} Bloom pts</span></div>}
        <div className="text-xs text-muted mt-3">Shipping at checkout — Perth metro $12 (free over ${freeOver}). Pickup 6000 free.</div>
        <Btn size="lg" className="w-full mt-4" onClick={()=>nav('/checkout')}>Checkout — Perth WA</Btn>
        <Link to="/shop" className="block text-center text-xs text-muted mt-3 hover:text-highlight">← Continue shopping</Link>
      </div>
      <div className="mt-4 bg-surface2 border rounded-2xl p-4">
        {remindSaved ? (
          <p className="text-sm text-muted">✓ Saved — if you don't finish checking out, we'll email you a reminder with your cart.</p>
        ) : (
          <form onSubmit={saveReminder} className="flex flex-wrap items-end gap-2">
            <Input label="Email me a reminder" placeholder="you@example.com" type="email" labelVisible value={remindEmail} onChange={e=>setRemindEmail(e.target.value)} className="flex-1 min-w-48" size="sm" />
            <Btn variant="outline" size="md" disabled={remindBusy || !remindEmail.trim()}>{remindBusy ? 'Saving…' : 'Save cart'}</Btn>
            <p className="w-full text-xs text-muted mt-1">One gentle nudge if you leave items behind — no spam, unsubscribe any time by just ignoring it.</p>
          </form>
        )}
      </div>
      {loyaltyEnabled && <div className="mt-6 bg-bloom-700 text-white rounded-2xl p-4 text-xs flex gap-3">
        <BloomMark className="w-4 h-4 shrink-0 mt-0.5" /><span>Blossom at {s.loyalty_blossom_threshold || 100} pts, Garden at {s.loyalty_garden_threshold || 500} — redeem {s.loyalty_min_redeem_points || 100} pts = ${(Number(s.loyalty_min_redeem_points || 100)/100*Number(s.loyalty_redeem_rate || 5)).toFixed(2)} off at checkout (ask at till).</span>
      </div>}
    </Page>
  );
}
