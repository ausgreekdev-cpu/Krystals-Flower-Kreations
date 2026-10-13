import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConfiguratorStore, estimateLocalPrice } from './useConfiguratorStore';
import { ordersApi } from '../../lib/api/customClient';
import { addToCart } from '../../lib/cartClient';
import { usePublicSettings } from '../../lib/publicSettings';
import ARViewer from '../../components/ARViewer';
import NotebookPanel from '../../components/NotebookPanel';
import { Page, PageHeader, Breadcrumbs } from '../../components/ui/Page';
import Alert from '../../components/ui/Alert';
import Btn from '../../components/ui/Btn';
import { Input } from '../../components/ui/Field';

const TEXTURES = ['textured','smooth','pearl','linen'];
const WEIGHTS = ['65lb','80lb','110lb'];
const COLORS = ['Blush','Sage','Ivory','Dusty Pink','Eucalyptus','Paper White'];
// Curated presets — sets colour + texture + weight together (stored on spec.palette)
const PALETTES = [
  { id: 'romantic-blush', label: 'Romantic Blush', apply: { paperColor: 'Blush', paperTexture: 'pearl', weight: '80lb' } },
  { id: 'native-australian', label: 'Native Australian', apply: { paperColor: 'Eucalyptus', paperTexture: 'linen', weight: '110lb' } },
  { id: 'classic-ivory', label: 'Classic Ivory', apply: { paperColor: 'Ivory', paperTexture: 'smooth', weight: '65lb' } },
];
const TEMPLATES = [
  { id: 'wattle-sprig', label: 'Wattle Sprig', flowerType: 'wattle' },
  { id: 'paper-rose', label: 'Paper Rose', flowerType: 'rose' },
  { id: 'banksia-petal', label: 'Banksia Petal', flowerType: 'banksia' },
  { id: 'origami-lily', label: 'Origami Lily', flowerType: 'lily' },
];
const CHIP = 'px-3 py-1.5 rounded-full text-xs border transition';
const CHIP_ON = 'bg-bloom-500 text-white border-bloom-500';
const CHIP_OFF = 'bg-surface2 hover:bg-surface3';

export default function Configurator(){
  const { spec, setSpec } = useConfiguratorStore();
  const s = usePublicSettings();
  const est = estimateLocalPrice(spec, s);
  const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
  const greeneryPrice = num(s.configurator_greenery, 12);
  const vasePrice = num(s.configurator_vase, 22);
  const domePrice = num(s.configurator_dome, 45);
  const ledPrice = num(s.configurator_led, 18);
  const [form,setForm]=useState({ email:'', name:'', postcode:'6000' });
  const [msg,setMsg]=useState(''); const [err,setErr]=useState('');
  // Ready-made stems matching the chosen template's flower — cross-sell into the catalog
  const [pairs,setPairs]=useState([]); const [pairBusy,setPairBusy]=useState(''); const [pairMsg,setPairMsg]=useState('');
  const activeTemplate = TEMPLATES.find(t=>t.id===spec.templateId);
  useEffect(()=>{
    setPairs([]); setPairMsg('');
    const ft = activeTemplate?.flowerType;
    if(!ft) return;
    let alive = true;
    fetch(`/api/products?flowerType=${encodeURIComponent(ft)}&limit=6`)
      .then(r=> r.ok? r.json(): null)
      .then(d=>{ const arr=(Array.isArray(d)?d:(Array.isArray(d?.products)?d.products:[])); if(alive) setPairs(arr.slice(0,3)); })
      .catch(()=>{});
    return ()=>{ alive=false; };
  }, [spec.templateId, activeTemplate]);
  async function addPair(p){
    setPairBusy(p.id); setPairMsg('');
    try{
      await addToCart({ productId: p.id, quantity: 1 });
      setPairMsg(`${p.title} added to cart`);
    }catch(e){ setPairMsg(e.message || 'Could not add — try the product page'); }
    finally{ setPairBusy(''); }
  }
  useEffect(()=>{ /* pricing derived */ }, [spec]);
  async function submit(){
    setErr(''); setMsg('');
    const email = form.email.trim(); const name = form.name.trim() || 'Perth Customer'; const postcode = form.postcode.trim() || '6000';
    if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ setErr('Valid email required'); return; }
    if(!/^6000|6\d{3}$/.test(postcode) && !/^\d{4}$/.test(postcode)){ setErr('Postcode must be 4 digits (e.g., 6000)'); return; }
    if(name.length<2){ setErr('Full name required'); return; }
    try{
      const order = await ordersApi.customCreate({ customerEmail: email, customerName: name, spec, shippingPostcode: postcode });
      setMsg(`Created ${order.orderNumber} — ${order.state} — $${Number(order.totalPrice).toFixed(2)} — ${order.estimatedMinutes}m — QR: ${order.ticket?.qrPayload || ''}${s.show_kanban === '1' ? ' — View Kanban → /kanban' : ''}`);
    }catch(e){ setErr(e.message || 'Failed — please try again'); }
  }
  return (
    <Page>
      <PageHeader crumbs={<Breadcrumbs items={[{label:'Configurator'}]} />} title="Custom Bouquet Configurator"
        lede={s.show_cricut === '1' ? 'Colour • texture • weight • stems • armature • Cricut template — live AUD price + Perth ETA.' : 'Colour • texture • weight • stems • armature — live AUD price + Perth ETA.'} />
      <div className="space-y-4 mt-6">
        <section className="bg-surface2 p-4 rounded-2xl border">
        <h3 className="font-bold flex items-center gap-2"><span aria-hidden="true" className="w-6 h-6 rounded-full bg-bloom-500 text-white text-xs font-bold grid place-items-center shrink-0">1</span> Paper Colour</h3>
        <div className="flex flex-wrap gap-2 mt-2" role="group" aria-label="Paper palette">{PALETTES.map(p=> <button key={p.id} onClick={()=>setSpec({ palette:p.id, ...p.apply })} aria-pressed={spec.palette===p.id} className={`${CHIP} ${spec.palette===p.id?CHIP_ON:CHIP_OFF}`}>{p.label}</button>)}</div>
        <div className="flex flex-wrap gap-2 mt-2" role="group" aria-label="Paper colour">{COLORS.map(c=> <button key={c} onClick={()=>setSpec({paperColor:c, palette:null})} aria-pressed={spec.paperColor===c && !spec.palette} className={`${CHIP} ${spec.paperColor===c && !spec.palette?CHIP_ON: spec.paperColor===c?'border-bloom-500 text-highlight':'bg-surface2'}`}>{c}</button>)}</div>
        </section>
        <section className="bg-surface2 p-4 rounded-2xl border">
        <h3 className="font-bold flex items-center gap-2"><span aria-hidden="true" className="w-6 h-6 rounded-full bg-bloom-500 text-white text-xs font-bold grid place-items-center shrink-0">2</span> Texture & Weight</h3>
        <div className="flex flex-wrap gap-2 mt-2" role="group" aria-label="Paper texture">{TEXTURES.map(t=> <button key={t} onClick={()=>setSpec({paperTexture:t})} aria-pressed={spec.paperTexture===t} className={`${CHIP} ${spec.paperTexture===t?CHIP_ON:CHIP_OFF}`}>{t}</button>)}</div>
        <div className="flex flex-wrap gap-2 mt-2" role="group" aria-label="Paper weight">{WEIGHTS.map(w=> <button key={w} onClick={()=>setSpec({weight:w})} aria-pressed={spec.weight===w} className={`${CHIP} ${spec.weight===w?CHIP_ON:CHIP_OFF}`}>{w}</button>)}</div>
        </section>
        <section className="bg-surface2 p-4 rounded-2xl border space-y-3">
          <h3 className="font-bold flex items-center gap-2"><span aria-hidden="true" className="w-6 h-6 rounded-full bg-bloom-500 text-white text-xs font-bold grid place-items-center shrink-0">3</span> Stems & Armature</h3>
          <div className="flex items-center gap-3"><label htmlFor="cfg-stems" className="shrink-0">Stems</label> <input id="cfg-stems" type="range" min={1} max={25} value={spec.stemCount} onChange={e=>setSpec({stemCount: parseInt(e.target.value)})} className="flex-1" aria-valuetext={`${spec.stemCount} stems`} /> <span aria-hidden="true">{spec.stemCount}</span></div>
          <div className="flex items-center gap-3"><label htmlFor="cfg-armature" className="shrink-0">Armature mm</label> <input id="cfg-armature" type="range" min={150} max={600} step={50} value={spec.armatureHeightMm} onChange={e=>setSpec({armatureHeightMm: parseInt(e.target.value)})} className="flex-1" aria-valuetext={`${spec.armatureHeightMm} millimetres`} /> <span aria-hidden="true">{spec.armatureHeightMm}</span></div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={spec.addGreenery} onChange={e=>setSpec({addGreenery:e.target.checked})} /> Add greenery (+${greeneryPrice})</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={spec.vaseIncluded} onChange={e=>setSpec({vaseIncluded:e.target.checked})} /> Vase (+${vasePrice})</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={spec.domeIncluded} onChange={e=>setSpec({domeIncluded:e.target.checked})} /> Glass display dome (+${domePrice})</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={spec.ledIncluded} onChange={e=>setSpec({ledIncluded:e.target.checked})} /> Warm LED fairy lights (+${ledPrice})</label>
        </section>
        {s.show_cricut === '1' && <section className="bg-surface2 p-4 rounded-2xl border">
          <h3 className="font-bold flex items-center gap-2"><span aria-hidden="true" className="w-6 h-6 rounded-full bg-bloom-500 text-white text-xs font-bold grid place-items-center shrink-0">4</span> Cricut Template — free SVG</h3>
          <div className="flex flex-wrap gap-2 mt-2" role="group" aria-label="Cricut template">{TEMPLATES.map(t=> <button key={t.id} onClick={()=>setSpec({templateId:t.id})} aria-pressed={spec.templateId===t.id} className={`${CHIP} ${spec.templateId===t.id?CHIP_ON:CHIP_OFF}`}>{t.label}</button>)}</div>
          <div className="mt-4 bg-surface2 border rounded-xl overflow-hidden">
            <img src={`/svg/${spec.templateId}.svg`} alt={TEMPLATES.find(t=>t.id===spec.templateId)?.label} className="w-full h-48 object-contain p-4" onError={(e)=>{e.currentTarget.style.display='none'; e.currentTarget.nextSibling.style.display='block';}} />
            <div style={{display:'none'}} className="bg-surface rounded-xl p-4 text-center border border-dashed m-4">✂ Preview: {spec.paperColor} • {spec.paperTexture} • {spec.weight} — {TEMPLATES.find(t=>t.id===spec.templateId)?.label}</div>
          </div>
          {import.meta.env.DEV && <div className="text-[11px] text-muted mt-2">Free pipeline: Inkscape Trace Bitmap → Plain SVG → store in <code>frontend/public/svg/</code> → served at <code>/svg/{spec.templateId}.svg</code>.</div>}
        </section>}
        <ARViewer productSlug={spec.templateId} title={`${spec.paperColor} ${TEMPLATES.find(t=>t.id===spec.templateId)?.label} — ${spec.stemCount} stems`} />
        {pairs.length>0 && (
          <section className="bg-surface2 p-4 rounded-2xl border">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold">Pairs well with — ready-made {activeTemplate?.flowerType} blooms</h3>
              {pairMsg && <span className="text-[11px] text-success-800">{pairMsg} — <Link to="/cart" className="underline font-semibold">view cart</Link></span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              {pairs.map(p=> (
                <div key={p.id} className="bg-surface border rounded-xl p-3 flex flex-col">
                  <Link to={`/product/${p.slug}`} className="text-sm font-semibold text-ink hover:underline line-clamp-2">{p.title}</Link>
                  <span className="text-sm text-highlight font-bold mt-1">${Number(p.price).toFixed(2)} <span className="text-[10px] font-normal text-muted">AUD</span></span>
                  <button onClick={()=>addPair(p)} disabled={pairBusy===p.id} className="mt-2 text-xs bg-bloom-500 text-white rounded-full py-1.5 font-bold disabled:opacity-60">{pairBusy===p.id?'Adding…':'Add to cart'}</button>
                </div>
              ))}
            </div>
          </section>
        )}
        <NotebookPanel query={`${spec.templateId} ${spec.paperColor} ${spec.weight} Perth humidity`} />
        <div className="bg-surface2 border rounded-2xl p-4 space-y-3">
          <h3 className="font-bold">Your details — for custom order</h3>
          <Input value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="you@example.com" type="email" label="Email" labelVisible size="sm" className="w-full" />
          <Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Full name" label="Full name" labelVisible size="sm" className="w-full" />
          <Input value={form.postcode} onChange={e=>setForm({...form,postcode:e.target.value})} placeholder="6000 Perth metro" label="Postcode" labelVisible size="sm" className="w-full" />
          {err && <Alert tone="danger" className="text-xs">{err}</Alert>}
          {msg && <Alert tone="ok" className="text-xs">{msg}</Alert>}
        </div>
        <div className="bg-bloom-700 text-white rounded-2xl p-5">
          <div className="flex justify-between"><span>Unit</span><span className="font-bold">${est.unitPrice.toFixed(2)} AUD</span></div>
          <div className="flex justify-between mt-1"><span>Total ({spec.stemCount} stems)</span><span className="font-bold">${est.totalPrice.toFixed(2)}</span></div>
          <div className="flex justify-between mt-1 text-sm opacity-80"><span>Est. craft time</span><span>{est.estimatedMinutes} min</span></div>
          <div className="text-xs opacity-60 mt-2">Live price — materials + craft time. Earn 1 Bloom pt per $1.</div>
          <Btn onClick={submit} className="w-full mt-4" variant="primary" size="lg">Create Custom Order → Drafting/Proofing</Btn>
        </div>
      </div>
    </Page>
  );
}
