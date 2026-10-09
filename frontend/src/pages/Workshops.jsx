import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import NotebookPanel from '../components/NotebookPanel';
import Breadcrumbs from '../components/layout/Breadcrumbs';
import Btn from '../components/ui/Btn';
import { Input, Select } from '../components/ui/Field';
import { usePublicSettings } from '../lib/publicSettings';
export default function Workshops(){
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState('');
  const [booking,setBooking]=useState({ sessionId:'', name:'', email:'', phone:'', quantity:1, kitAddOn:false });
  const [bookMsg,setBookMsg]=useState(''); const [bookErr,setBookErr]=useState(''); const [qr,setQr]=useState(null);
  useEffect(()=>{
    setLoading(true); setErr('');
    fetch('/api/workshops').then(r=>{ if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).then(d=> setItems(Array.isArray(d)?d: d.workshops||[])).catch(e=> setErr(e.message)).finally(()=>setLoading(false));
  }, []);
  async function book(){
    setBookErr(''); setBookMsg(''); setQr(null);
    if(!booking.sessionId) return setBookErr('Select a session');
    if(!booking.name.trim() || booking.name.trim().length<2) return setBookErr('Name required (2+ chars)');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(booking.email)) return setBookErr('Valid email required');
    if(booking.quantity<1 || booking.quantity>10) return setBookErr('Quantity 1-10');
    try{
      const res = await fetch(`/api/workshops/sessions/${booking.sessionId}/book`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(booking) });
      const j = await res.json().catch(()=>({error:res.statusText}));
      if(!res.ok) throw new Error(j.error || 'Book failed');
      setBookMsg(`Booked ${j.status} — ${j.quantity} spot(s)${j.ticket?` • QR ${j.ticket.qrPayload}`:''}`);
      if(j.ticket) setQr(j.ticket);
      // refresh workshops to update spots left
      const refreshed = await fetch('/api/workshops').then(r=>r.json()).then(d=> Array.isArray(d)?d: d.workshops||[]).catch(()=>null);
      if(refreshed) setItems(refreshed);
    }catch(e){ setBookErr(e.message); }
  }
  const settings = usePublicSettings();
  if (settings.show_workshops === undefined) return <div className="max-w-4xl mx-auto px-4 py-8 text-sm text-muted">Loading…</div>;
  if (settings.show_workshops !== '1') return <Navigate to="/" replace />;
  if(loading) return <div className="max-w-4xl mx-auto px-4 py-8"><div className="animate-pulse bg-surface2 border rounded-2xl p-6 h-32">Loading workshops…</div></div>;
  if(err) return <div className="max-w-4xl mx-auto px-4 py-8"><div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4">Failed to load workshops: {err} <button onClick={()=>window.location.reload()} className="ml-2 underline">Retry</button></div></div>;
  if(!loading && items.length===0) return <div className="max-w-4xl mx-auto px-4 py-8 text-center"><Breadcrumbs items={[{label:'Workshops'}]} /><h1 className="text-2xl font-black text-ink">Workshops — Perth Studio</h1><p className="text-muted mt-2">No workshops yet — check back or design via Configurator.</p><Btn to="/configurator" size="lg" className="mt-4 inline-block">Design Custom Bouquet</Btn></div>;
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Breadcrumbs items={[{label:'Workshops'}]} />
      <h1 className="text-2xl font-black text-ink">Workshops — Perth Studio</h1>
      <p className="text-muted mt-2">Cricut Blooms 101, Origami Bouquet & Armature Art. Max 12, kits included.</p>
      <div className="mt-4 bg-surface border border-bloom-100 rounded-xl px-4 py-3 flex justify-between items-center">
        <span className="text-sm text-ink">Before you book, explore Notebook guide — supplies & folding previews</span>
        <Btn to="/notebook?workshop=cricut-blooms-101" variant="soft" size="pill" className="text-xs">Notebook →</Btn>
      </div>
      <div className="mt-6 bg-surface2 border rounded-2xl p-4">
        <h3 className="font-bold text-sm">Book a session</h3>
        <div className="mt-3 grid md:grid-cols-2 gap-3">
          <Select size="sm" label="Session" value={booking.sessionId} onChange={e=>setBooking({...booking, sessionId:e.target.value})}>
            <option value="">Select session</option>
            {items.flatMap(w=> (w.sessions||[]).map(s=> <option key={s.id} value={s.id}>{w.title} — {new Date(s.startsAt).toLocaleString('en-AU', { timeZone:'Australia/Perth', weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})} — {Math.max(0,s.capacity - s.bookedCount)} left</option>))}
          </Select>
          <Input size="sm" label="Full name" placeholder="Full name*" value={booking.name} onChange={e=>setBooking({...booking,name:e.target.value})} />
          <Input size="sm" label="Email" placeholder="Email*" type="email" value={booking.email} onChange={e=>setBooking({...booking,email:e.target.value})} />
          <Input size="sm" label="Phone" placeholder="Phone" value={booking.phone} onChange={e=>setBooking({...booking,phone:e.target.value})} />
          <label className="flex items-center gap-2 text-sm"><Input type="number" min={1} max={10} value={booking.quantity} onChange={e=>setBooking({...booking,quantity: parseInt(e.target.value)||1})} className="w-20" /> spots</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={booking.kitAddOn} onChange={e=>setBooking({...booking,kitAddOn:e.target.checked})} /> Kit add-on (+$25)</label>
        </div>
        <Btn size="md" className="mt-3" onClick={book}>Book — Pay later (manual)</Btn>
        {bookErr && <div className="mt-3 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs">{bookErr}</div>}
        {bookMsg && <div className="mt-3 bg-green-50 border border-green-200 text-green-700 rounded-xl p-3 text-xs">{bookMsg}</div>}
        {qr && <div className="mt-3 text-center"><img src={qr.qrUrl} alt={qr.qrPayload} className="mx-auto w-48 h-48 border rounded-xl" /><div className="text-[11px] font-mono bg-surface3 rounded px-2 py-1 mt-2 break-all">{qr.qrPayload}</div><div className="text-xs text-muted mt-1">Show at POS — /pos check-in or workshop door</div></div>}
      </div>
      <div className="mt-6 grid gap-4">
        {items.map(w=> (
          <div key={w.id} className="bg-surface2 p-6 rounded-2xl border">
            <h3 className="font-bold text-ink">{w.title}</h3>
            <p className="text-sm text-muted mt-2">{w.description}</p>
            <div className="text-sm font-bold text-highlight mt-2">${Number(w.price).toFixed(2)} • {w.durationMinutes} min • {w.level || 'beginner'}</div>
            <div className="mt-3 space-y-1">{(w.sessions||[]).map(s=> <div key={s.id} className={`text-xs rounded-lg px-3 py-2 flex justify-between ${s.capacity - s.bookedCount<=0?'bg-red-50 border border-red-200 text-red-700':'bg-surface'}`}><span>{new Date(s.startsAt).toLocaleString('en-AU', { timeZone:'Australia/Perth', weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}</span><span>{Math.max(0,s.capacity - s.bookedCount)} spots left {s.capacity - s.bookedCount<=0 && '• Waitlist'}</span></div>)}</div>
            <div className="mt-3"><NotebookPanel compact query={`${w.slug} ${w.title}`} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
