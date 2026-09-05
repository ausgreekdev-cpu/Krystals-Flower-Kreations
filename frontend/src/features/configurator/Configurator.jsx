import { useEffect, useState } from 'react';
import { useConfiguratorStore, estimateLocalPrice } from './useConfiguratorStore';
import { ordersApi } from '../../lib/api/customClient';
import ARViewer from '../../components/ARViewer';
import NotebookPanel from '../../components/NotebookPanel';

const TEXTURES = ['textured','smooth','pearl','linen'];
const WEIGHTS = ['65lb','80lb','110lb'];
const COLORS = ['Blush','Sage','Ivory','Dusty Pink','Eucalyptus','Paper White'];
const TEMPLATES = [
  { id: 'wattle-sprig', label: 'Wattle Sprig' },
  { id: 'paper-rose', label: 'Paper Rose' },
  { id: 'banksia-petal', label: 'Banksia Petal' },
  { id: 'origami-lily', label: 'Origami Lily' },
];

export default function Configurator(){
  const { spec, setSpec, unitPrice } = useConfiguratorStore();
  const est = estimateLocalPrice(spec);
  const [form,setForm]=useState({ email:'', name:'', postcode:'6000' });
  const [msg,setMsg]=useState(''); const [err,setErr]=useState('');
  useEffect(()=>{ /* pricing derived */ }, [spec]);
  async function submit(){
    setErr(''); setMsg('');
    const email = form.email.trim(); const name = form.name.trim() || 'Perth Customer'; const postcode = form.postcode.trim() || '6000';
    if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ setErr('Valid email required'); return; }
    if(!/^6000|6\d{3}$/.test(postcode) && !/^\d{4}$/.test(postcode)){ setErr('Postcode must be 4 digits (e.g., 6000)'); return; }
    if(name.length<2){ setErr('Full name required'); return; }
    try{
      const order = await ordersApi.customCreate({ customerEmail: email, customerName: name, spec, shippingPostcode: postcode });
      setMsg(`Created ${order.orderNumber} — ${order.state} — $${Number(order.totalPrice).toFixed(2)} — ${order.estimatedMinutes}m — QR: ${order.ticket?.qrPayload || ''} — View Kanban → /kanban`);
    }catch(e){ setErr(e.message || 'Failed — is backend running?'); }
  }
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-black text-bloom-700">Custom Bouquet Configurator</h1>
      <p className="text-sm text-gray-600">Colour • texture • weight • stems • armature • Cricut template — live AUD price + Perth ETA.</p>
      <section className="bg-white p-4 rounded-2xl border">
        <h3 className="font-bold">1 · Paper Colour</h3>
        <div className="flex flex-wrap gap-2 mt-2">{COLORS.map(c=> <button key={c} onClick={()=>setSpec({paperColor:c})} className={`px-3 py-2 rounded-full text-xs border ${spec.paperColor===c?'bg-bloom-500 text-white border-bloom-500':'bg-white'}`}>{c}</button>)}</div>
      </section>
      <section className="bg-white p-4 rounded-2xl border">
        <h3 className="font-bold">2 · Texture & Weight</h3>
        <div className="flex gap-2 mt-2">{TEXTURES.map(t=> <button key={t} onClick={()=>setSpec({paperTexture:t})} className={`px-3 py-1 rounded-full text-xs border ${spec.paperTexture===t?'bg-bloom-500 text-white':'bg-white'}`}>{t}</button>)}</div>
        <div className="flex gap-2 mt-2">{WEIGHTS.map(w=> <button key={w} onClick={()=>setSpec({weight:w})} className={`px-3 py-1 rounded-full text-xs border ${spec.weight===w?'bg-bloom-500 text-white':'bg-white'}`}>{w}</button>)}</div>
      </section>
      <section className="bg-white p-4 rounded-2xl border space-y-3">
        <h3 className="font-bold">3 · Stems & Armature</h3>
        <div className="flex items-center gap-3">Stems <input type="range" min={1} max={25} value={spec.stemCount} onChange={e=>setSpec({stemCount: parseInt(e.target.value)})} /> {spec.stemCount}</div>
        <div className="flex items-center gap-3">Armature mm <input type="range" min={150} max={600} step={50} value={spec.armatureHeightMm} onChange={e=>setSpec({armatureHeightMm: parseInt(e.target.value)})} /> {spec.armatureHeightMm}</div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={spec.addGreenery} onChange={e=>setSpec({addGreenery:e.target.checked})} /> Add greenery (+$12)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={spec.vaseIncluded} onChange={e=>setSpec({vaseIncluded:e.target.checked})} /> Vase (+$22)</label>
      </section>
      <section className="bg-white p-4 rounded-2xl border">
        <h3 className="font-bold">4 · Cricut Template — $0 Inkscape SVG</h3>
        <div className="flex flex-wrap gap-2 mt-2">{TEMPLATES.map(t=> <button key={t.id} onClick={()=>setSpec({templateId:t.id})} className={`px-3 py-2 rounded-full text-xs border ${spec.templateId===t.id?'bg-bloom-500 text-white':'bg-white'}`}>{t.label}</button>)}</div>
        <div className="mt-4 bg-white border rounded-xl overflow-hidden">
          <img src={`/svg/${spec.templateId}.svg`} alt={TEMPLATES.find(t=>t.id===spec.templateId)?.label} className="w-full h-48 object-contain p-4" onError={(e)=>{e.currentTarget.style.display='none'; e.currentTarget.nextSibling.style.display='block';}} />
          <div style={{display:'none'}} className="bg-bloom-50 rounded-xl p-4 text-center border border-dashed m-4">✂ Preview: {spec.paperColor} • {spec.paperTexture} • {spec.weight} — {TEMPLATES.find(t=>t.id===spec.templateId)?.label} (add /public/svg/{spec.templateId}.svg via Inkscape potrace, free)</div>
        </div>
        <div className="text-[11px] text-gray-500 mt-2">Free pipeline: Inkscape Trace Bitmap → Plain SVG → store in <code>frontend/public/svg/</code> → served at <code>/svg/{spec.templateId}.svg</code>. No VectoSolve fees.</div>
      </section>
      <ARViewer productSlug={spec.templateId} title={`${spec.paperColor} ${TEMPLATES.find(t=>t.id===spec.templateId)?.label} — ${spec.stemCount} stems`} />
      <NotebookPanel query={`${spec.templateId} ${spec.paperColor} ${spec.weight} Perth humidity`} />
      <div className="bg-white border rounded-2xl p-4 space-y-3">
        <h3 className="font-bold">Your details — for custom order</h3>
        <input value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="Email*" type="email" className="w-full border rounded-xl px-3 py-2 text-sm" />
        <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Full name*" className="w-full border rounded-xl px-3 py-2 text-sm" />
        <input value={form.postcode} onChange={e=>setForm({...form,postcode:e.target.value})} placeholder="Postcode* (6000 Perth metro)" className="w-full border rounded-xl px-3 py-2 text-sm" />
        {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs">{err}</div>}
        {msg && <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-3 text-xs">{msg}</div>}
      </div>
      <div className="bg-bloom-700 text-white rounded-2xl p-5">
        <div className="flex justify-between"><span>Unit</span><span className="font-bold">${est.unitPrice.toFixed(2)} AUD</span></div>
        <div className="flex justify-between mt-1"><span>Total ({spec.stemCount} stems)</span><span className="font-bold">${est.totalPrice.toFixed(2)}</span></div>
        <div className="flex justify-between mt-1 text-sm opacity-80"><span>Est. craft time</span><span>{est.estimatedMinutes} min</span></div>
        <div className="text-xs opacity-60 mt-2">Live BOM: sheet cost × stems + labour $55/hr × minutes + 30% margin. Manual sheet price you set — no supplier API fees. Earn 1 Bloom pt per $1.</div>
        <button onClick={submit} className="w-full mt-4 bg-bloom-500 py-3 rounded-xl font-bold">Create Custom Order → Drafting/Proofing</button>
      </div>
    </div>
  );
}
