import { useEffect, useState } from 'react';
import { queueRequest, flushQueue, getQueue, isOnline, onOnline } from '../lib/offlineQueue';
import ScanModal from '../components/scan/ScanModal';
import ScannerIndicator from '../components/scan/ScannerIndicator';
import { useWedgeScanner } from '../components/scan/useWedgeScanner';
import { lookupScan } from '../components/scan/scanApi';
import { chimeSuccess, beepError, registerScan } from '../components/scan/feedback';

export default function POS(){
  const [session,setSession]=useState(null);
  const [products,setProducts]=useState([]);
  const [q,setQ]=useState('');
  const [cart,setCart]=useState([]);
  const [queue,setQueue]=useState([]);
  const [toast,setToast]=useState(''); const [toastErr,setToastErr]=useState(false);
  const [receipt,setReceipt]=useState(null);
  const [scanOpen,setScanOpen]=useState(false);
  const [pickProduct,setPickProduct]=useState(null);
  const [tendered,setTendered]=useState('');
  const [closeMode,setCloseMode]=useState(false);
  const [closingCash,setClosingCash]=useState('');
  const [zReport,setZReport]=useState(null);
  const token = localStorage.getItem('token') || '';
  function showToast(msg, isErr=false){ setToast(msg); setToastErr(isErr); setTimeout(()=>setToast(''), 4000); }

  async function loadProducts(){ fetch('/api/products?limit=50').then(r=>r.json()).then(d=> setProducts(Array.isArray(d)?d: (Array.isArray(d.products)?d.products:[]))).catch(()=>{ setProducts([]); showToast('Failed to load products', true); }); }
  async function loadSession(){ if(!token) return; fetch('/api/pos/session/current', { headers:{ Authorization:`Bearer ${token}` } }).then(r=> r.ok? r.json():null).then(setSession).catch(()=>{ showToast('Failed to load till session', true); }); }
  async function refreshQueue(){ setQueue(await getQueue()); }

  useEffect(()=>{ if(!token){ window.location.replace('/login?next=/pos'); return; } loadProducts(); loadSession(); refreshQueue(); const off=onOnline(()=>{ flushQueue(token).then(refreshQueue); }); return off; }, []);

  async function openSession(){
    // openingCash omitted on purpose — the backend applies the pos_till_float_default setting
    const res = await fetch('/api/pos/session/open', { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`}, body: JSON.stringify({ location:'Perth Studio' }) });
    if(res.ok){ const s = await res.json(); setSession(s); showToast(`Till opened — ${s.location} $${Number(s.openingCash).toFixed(2)} float`); } else if(res.status===401){ localStorage.removeItem('token'); window.location.assign('/login?expired=1&next=/pos'); } else showToast('Your account needs maker/admin access to open the till', true);
  }
  function addToCart(p, variant=null){
    const key = variant ? `${p.id}::${variant.id}` : p.id;
    const title = variant ? `${p.title} — ${variant.title}` : p.title;
    const price = Number(variant?.price ?? p.price);
    setCart(c=>{ const ex=c.find(i=>i.key===key); if(ex) return c.map(i=> i.key===key? {...i, quantity:i.quantity+1}:i); return [...c, { key, productId:p.id, variantId: variant?.id || null, title, price, quantity:1 }]; });
  }

  // USB/Bluetooth scanner — works anywhere on the page, no focus needed.
  async function handleScanCode(code){
    if (!registerScan(code)) return; // 1.5s duplicate window (shared with ScanModal)
    setQ(''); // clear chars the scanner may have typed into a focused input
    try{
      const r = await lookupScan(code, token);
      if (r.found && r.item && r.kind !== 'raw_material'){
        const variant = r.kind === 'variant' ? r.variant : null;
        addToCart(r.item, variant);
        chimeSuccess();
        setScanOpen(false);
        showToast(`Added — ${r.item.title}${variant ? ` — ${variant.title}` : ''}`);
      } else if (r.kind === 'raw_material'){
        beepError(); showToast('Raw material — not sellable at POS', true);
      } else {
        beepError(); showToast(`Not found: ${code} — add it in Admin → Catalog → Products`, true);
      }
    }catch(e){
      beepError(); showToast(e.message || 'Scan lookup failed', true);
    }
  }
  useWedgeScanner(handleScanCode, true);
  async function sale(paymentMethod='cash'){
    if(cart.length===0) return;
    const cashReceived = Number(tendered||0);
    if(paymentMethod==='cash' && cashReceived < subtotal){ beepError(); showToast('Cash received is less than the total', true); return; }
    const body = { sessionId: session?.id, items: cart.map(c=> ({ productId:c.productId, variantId:c.variantId || undefined, quantity:c.quantity })), paymentMethod };
    // One key per checkout attempt — sent online, carried into the offline queue, so a
    // replayed flush (or double-tap) hits the backend's Idempotency-Key dedupe instead
    // of creating a second order.
    const idemKey = crypto.randomUUID();
    const authHeaders = { Authorization: token?`Bearer ${token}`:'', 'Idempotency-Key': idemKey };
    if(!isOnline()){
      await queueRequest('/api/pos/sale', body, authHeaders);
      showToast('Offline — sale queued, will sync when online');
      setCart([]); refreshQueue(); return;
    }
    try{
      const res = await fetch('/api/pos/sale', { method:'POST', headers:{ 'Content-Type':'application/json', ...authHeaders }, body: JSON.stringify(body) });
      if(!res.ok){ const j=await res.json().catch(()=>({error:res.statusText, code:res.status})); throw new Error(j.error || 'Sale failed'); }
      const order = await res.json();
      showToast(`Sale ${order.orderNumber} — $${Number(order.total).toFixed(2)} • ${order.lines?.length||cart.length} items`);
      setReceipt({ orderNumber: order.orderNumber, total: Number(order.total), items: order.lines?.length || cart.length, method: paymentMethod, footer: order.receiptFooter || '' });
      setCart([]); setTendered('');
    }catch(e){
      if(!isOnline()){
        await queueRequest('/api/pos/sale', body, authHeaders);
        showToast('Offline — queued for sync');
      } else showToast(e.message, true);
    }
    refreshQueue();
  }

  async function closeTill(){
    if(!session) return;
    const counted = Number(closingCash);
    if(!Number.isFinite(counted) || counted < 0){ showToast('Enter the counted cash', true); return; }
    try{
      const res = await fetch(`/api/pos/session/${session.id}/close`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ closingCash: counted }) });
      if(!res.ok){ const j=await res.json().catch(()=>({})); throw new Error(j.error || 'Close till failed'); }
      const s = await res.json();
      const by = { cash:0, eftpos:0, bank_transfer:0 };
      (s.payments||[]).forEach(p=>{ by[p.method] = (by[p.method]||0) + Number(p.amount); });
      setZReport({ location: s.location || 'Till', openedAt: s.openedAt, closedAt: s.closedAt, float: Number(s.openingCash), expected: Number(s.expectedCash), counted: Number(s.closingCash), variance: Number(s.variance), by });
      setSession(null); setCloseMode(false); setClosingCash('');
      showToast('Till closed');
    }catch(e){ showToast(e.message, true); }
  }

  const subtotal = cart.reduce((a,c)=> a + c.price*c.quantity, 0);
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {toast && <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-bold shadow-lg ${toastErr?'bg-red-600 text-white':'bg-bloom-500 text-white'}`}>{toast}</div>}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-black text-ink">POS — Perth Studio / Market</h1>
        <div className="text-xs flex gap-2">
          <span className={`px-3 py-1 rounded-full ${isOnline()?'bg-green-100 text-green-700':'bg-amber-100 text-amber-700'}`}>{isOnline()?'Online':'Offline'}</span>
          {queue.length>0 && <span className="bg-amber-500 text-white px-3 py-1 rounded-full">{queue.length} queued</span>}
        </div>
      </div>
      {receipt && (
        <div className="bg-surface2 border-2 border-dashed border-bloom-200 rounded-2xl p-4 max-w-md mx-auto text-center space-y-1">
          <div className="text-xs font-bold text-highlight tracking-widest">RECEIPT</div>
          <div className="font-black text-lg">{receipt.orderNumber}</div>
          <div className="text-2xl font-black text-ink">${receipt.total.toFixed(2)}</div>
          <div className="text-xs text-muted">{receipt.items} items • paid by {receipt.method}</div>
          {receipt.footer && <div className="text-xs text-muted border-t border-line pt-2 mt-2">{receipt.footer}</div>}
          <button onClick={() => setReceipt(null)} className="text-xs font-bold text-royal-600 hover:underline">Dismiss</button>
        </div>
      )}
      {zReport && (
        <div className="bg-surface2 border-2 border-dashed border-highlight/50 rounded-2xl p-4 max-w-md mx-auto text-center space-y-1">
          <div className="text-xs font-bold text-highlight tracking-widest">Z-REPORT — {zReport.location}</div>
          <div className="text-xs text-muted">Opened {new Date(zReport.openedAt).toLocaleString()} → Closed {new Date(zReport.closedAt).toLocaleString()}</div>
          <div className="text-sm">Sales: <b className="text-ink">cash ${zReport.by.cash.toFixed(2)}</b> · eftpos ${zReport.by.eftpos.toFixed(2)} · bank ${zReport.by.bank_transfer.toFixed(2)}</div>
          <div className="text-xs text-muted">Float ${zReport.float.toFixed(2)} + cash sales = expected ${zReport.expected.toFixed(2)}</div>
          <div className="text-sm">Counted <b>${zReport.counted.toFixed(2)}</b> → Variance <b className={zReport.variance === 0 ? 'text-green-600' : 'text-red-600'}>{zReport.variance >= 0 ? '+' : ''}${zReport.variance.toFixed(2)}</b></div>
          <button onClick={() => setZReport(null)} className="text-xs font-bold text-royal-600 hover:underline">Dismiss</button>
        </div>
      )}
      {!session ? <button onClick={openSession} className="bg-bloom-500 text-white px-6 py-3 rounded-xl font-bold">Open Till</button> : (
        <div className="bg-surface border border-bloom-100 rounded-2xl p-4">
          <div className="flex justify-between items-center gap-3">
            <div><div className="font-bold text-ink">Till open — {session.location}</div><div className="text-xs text-muted">Opened {new Date(session.openedAt).toLocaleString()} • Float ${Number(session.openingCash).toFixed(2)}</div></div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted hidden sm:inline">Queue flushes on reconnect</span>
              {!closeMode && <button onClick={() => { const exp = Number(session.openingCash) + (session.payments||[]).filter(p=>p.method==='cash').reduce((a,b)=>a+Number(b.amount),0); setClosingCash(exp.toFixed(2)); setCloseMode(true); }} className="text-xs font-bold border border-red-300 text-red-600 px-3 py-1.5 rounded-full hover:bg-red-50">Close till</button>}
            </div>
          </div>
          {closeMode && (
            <div className="mt-3 border-t border-line pt-3 flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[160px]">
                <label className="block text-xs font-semibold text-muted mb-1">Counted cash ($)</label>
                <input type="number" step="0.01" min="0" value={closingCash} onChange={e=>setClosingCash(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm" />
              </div>
              <button onClick={closeTill} className="bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-bold">Close & Z-report</button>
              <button onClick={()=>setCloseMode(false)} className="border px-3 py-2 rounded-xl text-sm font-bold hover:bg-surface3">Cancel</button>
            </div>
          )}
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-surface2 border rounded-2xl p-4">
          <div className="flex gap-2">
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Scan barcode or search — rose, banksia" className="flex-1 min-w-0 border rounded-xl px-3 py-2 text-sm" />
            <button onClick={()=>setScanOpen(true)} title="Camera scanner" aria-label="Open scanner" className="shrink-0 border rounded-xl px-3 hover:bg-surface3 font-bold">📷</button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 max-h-[400px] overflow-auto">
            {(Array.isArray(products)?products:[]).filter(p=> !q || p.title.toLowerCase().includes(q.toLowerCase()) || p.sku?.toLowerCase().includes(q.toLowerCase()) || p.barcode?.toLowerCase().includes(q.toLowerCase())).slice(0,12).map(p=> (
              <button key={p.id} onClick={()=>{ const active=(p.variants||[]).filter(v=>v.isActive!==false); if(active.length>1) setPickProduct(p); else addToCart(p, active[0]||null); }} className="border rounded-xl p-3 text-left hover:bg-surface3">
                <div className="font-bold text-sm text-ink line-clamp-1">{p.title}</div>
                <div className="text-xs text-muted">{p.sku || 'No SKU'}{(p.variants||[]).filter(v=>v.isActive!==false).length>1 ? ' · options' : ''}</div>
                <div className="text-sm font-bold text-highlight">${Number(p.price).toFixed(2)}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="bg-surface2 border rounded-2xl p-4">
          <h3 className="font-bold">Cart — {cart.length} lines</h3>
          <div className="mt-3 space-y-2 min-h-[200px]">
            {cart.map((c,i)=> (
              <div key={c.key || i} className="flex justify-between items-center gap-2 border rounded-xl p-2">
                <span className="text-sm font-bold min-w-0 line-clamp-1">{c.title}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={()=> setCart(cart.map((x,j)=> j===i? {...x, quantity: Math.max(1, x.quantity-1)} : x))} aria-label="Decrease quantity" className="w-6 h-6 border rounded-lg text-xs font-bold hover:bg-surface3">−</button>
                  <span className="text-sm w-5 text-center">{c.quantity}</span>
                  <button onClick={()=> setCart(cart.map((x,j)=> j===i? {...x, quantity: Math.min(99, x.quantity+1)} : x))} aria-label="Increase quantity" className="w-6 h-6 border rounded-lg text-xs font-bold hover:bg-surface3">+</button>
                </div>
                <span className="text-sm shrink-0">${(c.price*c.quantity).toFixed(2)}</span>
                <button onClick={()=> setCart(cart.filter((_,j)=>j!==i))} aria-label="Remove line" className="text-xs text-red-600 shrink-0">×</button>
              </div>
            ))}
            {cart.length===0 && <div className="text-xs text-muted py-8 text-center border-2 border-dashed rounded-xl">Scan or tap products</div>}
          </div>
          <div className="mt-4 border-t pt-3 flex justify-between font-bold"><span>Subtotal GST incl.</span><span>${subtotal.toFixed(2)}</span></div>
          <div className="mt-3 border rounded-xl p-2 space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-muted shrink-0">Cash received</label>
              <input type="number" min="0" step="0.01" value={tendered} onChange={e=>setTendered(e.target.value)} placeholder="0.00" className="flex-1 min-w-0 border rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div className="flex gap-1">
              {[['Exact', subtotal.toFixed(2)], ['$20','20'], ['$50','50'], ['$100','100']].map(([label,val])=> (
                <button key={label} onClick={()=>setTendered(String(val))} className="flex-1 text-xs font-bold border rounded-lg py-1 hover:bg-surface3">{label}</button>
              ))}
            </div>
            {Number(tendered||0) > 0 && (
              <div className="flex justify-between text-sm font-bold">
                <span className="text-muted">{Number(tendered) >= subtotal ? 'Change' : 'Still owing'}</span>
                <span className={Number(tendered) >= subtotal ? 'text-green-600' : 'text-amber-600'}>${Math.abs(Number(tendered) - subtotal).toFixed(2)}</span>
              </div>
            )}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button onClick={()=>sale('cash')} disabled={!session||cart.length===0||Number(tendered||0)<subtotal} className="bg-bloom-500 text-white py-2.5 rounded-xl font-bold disabled:opacity-50">Cash</button>
            <button onClick={()=>sale('eftpos')} disabled={!session||cart.length===0} className="border py-2.5 rounded-xl font-bold hover:bg-surface3 disabled:opacity-50">EFTPOS</button>
            <button onClick={()=>sale('bank_transfer')} disabled={!session||cart.length===0} className="border py-2.5 rounded-xl font-bold hover:bg-surface3 disabled:opacity-50">Bank</button>
          </div>
          <button onClick={()=>{ flushQueue(token).then(refreshQueue); }} className="w-full mt-2 text-xs border rounded-full py-2 hover:bg-surface3">Flush queued ({queue.length}) now</button>
        </div>
      </div>
      <div className="text-xs text-muted">Offline queue IndexedDB `krystal-offline` — sales queued when no signal (market), auto-flush on `online` event. Barcode: USB/BT scanner fires anywhere (1.5s duplicate ignore); 📷 opens camera scan (Chrome/Edge) with manual fallback.</div>
      {pickProduct && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={()=>setPickProduct(null)}>
          <div className="bg-surface border rounded-2xl p-4 w-full max-w-sm space-y-2" onClick={e=>e.stopPropagation()}>
            <div className="font-black text-ink">{pickProduct.title}</div>
            <div className="text-xs text-muted">Choose an option</div>
            {(pickProduct.variants||[]).filter(v=>v.isActive!==false).map(v=> {
              const out = pickProduct.stockMode === 'tracked' && Number(v.inventoryQuantity ?? 0) <= 0;
              return (
                <button key={v.id} disabled={out} onClick={()=>{ addToCart(pickProduct, v); setPickProduct(null); showToast(`Added — ${pickProduct.title} — ${v.title}`); }} className="w-full border rounded-xl p-3 text-left hover:bg-surface3 disabled:opacity-40 disabled:hover:bg-transparent">
                  <div className="text-sm font-bold text-ink">{v.title}</div>
                  <div className="text-xs text-muted">${Number(v.price).toFixed(2)}{v.sku?` · ${v.sku}`:''}{out?' · out of stock':(pickProduct.stockMode === 'tracked'?` · ${v.inventoryQuantity} left`:'')}</div>
                </button>
              );
            })}
            <button onClick={()=>setPickProduct(null)} className="w-full text-xs font-bold text-muted py-1">Cancel</button>
          </div>
        </div>
      )}
      <ScanModal
        open={scanOpen}
        onClose={()=>setScanOpen(false)}
        token={token}
        closeOnFound
        onResolved={(r)=>{ if (r.item && r.kind !== 'raw_material'){ const variant = r.kind === 'variant' ? r.variant : null; addToCart(r.item, variant); showToast(`Added — ${r.item.title}${variant ? ` — ${variant.title}` : ''}`); } else if (r.kind === 'raw_material'){ showToast('Raw material — not sellable at POS', true); } }}
      />
      <ScannerIndicator />
    </div>
  );
}
