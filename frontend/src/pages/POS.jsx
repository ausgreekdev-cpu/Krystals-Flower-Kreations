import { useEffect, useState } from 'react';
import { queueRequest, flushQueue, getQueue, isOnline, onOnline } from '../lib/offlineQueue';

export default function POS(){
  const [session,setSession]=useState(null);
  const [products,setProducts]=useState([]);
  const [q,setQ]=useState('');
  const [cart,setCart]=useState([]);
  const [queue,setQueue]=useState([]);
  const [toast,setToast]=useState(''); const [toastErr,setToastErr]=useState(false);
  const [receipt,setReceipt]=useState(null);
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
  function addToCart(p){
    setCart(c=>{ const ex=c.find(i=>i.productId===p.id); if(ex) return c.map(i=> i.productId===p.id? {...i, quantity:i.quantity+1}:i); return [...c, { productId:p.id, title:p.title, price:Number(p.price), quantity:1 }]; });
  }
  async function sale(paymentMethod='cash'){
    if(cart.length===0) return;
    const body = { sessionId: session?.id, items: cart.map(c=> ({ productId:c.productId, quantity:c.quantity })), paymentMethod };
    if(!isOnline()){
      await queueRequest('/api/pos/sale', body, { Authorization: token?`Bearer ${token}`:'' });
      showToast('Offline — sale queued, will sync when online');
      setCart([]); refreshQueue(); return;
    }
    try{
      const res = await fetch('/api/pos/sale', { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`}, body: JSON.stringify(body) });
      if(!res.ok){ const j=await res.json().catch(()=>({error:res.statusText, code:res.status})); throw new Error(j.error || 'Sale failed'); }
      const order = await res.json();
      showToast(`Sale ${order.orderNumber} — $${Number(order.total).toFixed(2)} • ${order.lines?.length||cart.length} items`);
      setReceipt({ orderNumber: order.orderNumber, total: Number(order.total), items: order.lines?.length || cart.length, method: paymentMethod, footer: order.receiptFooter || '' });
      setCart([]);
    }catch(e){
      if(!isOnline()){
        await queueRequest('/api/pos/sale', body, { Authorization: token?`Bearer ${token}`:'' });
        showToast('Offline — queued for sync');
      } else showToast(e.message, true);
    }
    refreshQueue();
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
      {!session ? <button onClick={openSession} className="bg-bloom-500 text-white px-6 py-3 rounded-xl font-bold">Open Till</button> : (
        <div className="bg-surface border border-bloom-100 rounded-2xl p-4 flex justify-between items-center">
          <div><div className="font-bold text-ink">Till open — {session.location}</div><div className="text-xs text-muted">Opened {new Date(session.openedAt).toLocaleString()} • Float ${Number(session.openingCash).toFixed(2)}</div></div>
          <div className="text-xs text-muted">Queue flushes on reconnect</div>
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-surface2 border rounded-2xl p-4">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Scan barcode or search — rose, banksia" className="w-full border rounded-xl px-3 py-2 text-sm" />
          <div className="mt-3 grid grid-cols-2 gap-2 max-h-[400px] overflow-auto">
            {(Array.isArray(products)?products:[]).filter(p=> !q || p.title.toLowerCase().includes(q.toLowerCase()) || p.sku?.toLowerCase().includes(q.toLowerCase())).slice(0,12).map(p=> (
              <button key={p.id} onClick={()=>addToCart(p)} className="border rounded-xl p-3 text-left hover:bg-surface3">
                <div className="font-bold text-sm text-ink line-clamp-1">{p.title}</div>
                <div className="text-xs text-muted">{p.sku || 'No SKU'}</div>
                <div className="text-sm font-bold text-highlight">${Number(p.price).toFixed(2)}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="bg-surface2 border rounded-2xl p-4">
          <h3 className="font-bold">Cart — {cart.length} lines</h3>
          <div className="mt-3 space-y-2 min-h-[200px]">
            {cart.map((c,i)=> <div key={i} className="flex justify-between items-center border rounded-xl p-2"><span className="text-sm font-bold">{c.title} ×{c.quantity}</span><span className="text-sm">${(c.price*c.quantity).toFixed(2)}</span><button onClick={()=> setCart(cart.filter((_,j)=>j!==i))} className="text-xs text-red-600">×</button></div>)}
            {cart.length===0 && <div className="text-xs text-muted py-8 text-center border-2 border-dashed rounded-xl">Scan or tap products</div>}
          </div>
          <div className="mt-4 border-t pt-3 flex justify-between font-bold"><span>Subtotal GST incl.</span><span>${subtotal.toFixed(2)}</span></div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button onClick={()=>sale('cash')} disabled={!session||cart.length===0} className="bg-bloom-500 text-white py-2.5 rounded-xl font-bold disabled:opacity-50">Cash</button>
            <button onClick={()=>sale('eftpos')} disabled={!session||cart.length===0} className="border py-2.5 rounded-xl font-bold hover:bg-surface3">EFTPOS</button>
            <button onClick={()=>sale('bank_transfer')} disabled={!session||cart.length===0} className="border py-2.5 rounded-xl font-bold hover:bg-surface3">Bank</button>
          </div>
          <button onClick={()=>{ flushQueue(token).then(refreshQueue); }} className="w-full mt-2 text-xs border rounded-full py-2 hover:bg-surface3">Flush queued ({queue.length}) now</button>
        </div>
      </div>
      <div className="text-xs text-muted">Offline queue IndexedDB `krystal-offline` — sales queued when no signal (market), auto-flush on `online` event. Camera scan via `expo-camera` on mobile, `BarcodeDetector` on web (fallback input).</div>
    </div>
  );
}
