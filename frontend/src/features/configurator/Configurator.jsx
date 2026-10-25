import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useConfiguratorStore, estimateLocalPrice, DEFAULT_SPEC } from './useConfiguratorStore';
import { ordersApi, paperStocksApi } from '../../lib/api/customClient';
import { addToCart } from '../../lib/cartClient';
import { usePublicSettings } from '../../lib/publicSettings';
import ARViewer from '../../components/ARViewer';
import NotebookPanel from '../../components/NotebookPanel';
import { Page, PageHeader, Breadcrumbs } from '../../components/ui/Page';
import Alert from '../../components/ui/Alert';
import Btn from '../../components/ui/Btn';
import { Input } from '../../components/ui/Field';

import { ALLOWED_PAPER_COLORS as COLORS, ALLOWED_PAPER_TEXTURES as TEXTURES, ALLOWED_WEIGHTS as WEIGHTS, WEIGHT_LABELS } from '../../../../shared/configurator.js';
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
// Full-bouquet presets — one-tap starting points (template + palette + stems + heightAdj + add-ons).
// Every field is still adjustable afterwards; apply = the spec after tapping the preset.
const BOUQUET_PRESETS = [
  { id: 'table-centrepiece', label: 'Table centrepiece', hint: 'Paper roses · 9 stems · vase',
    apply: { templateId: 'paper-rose', palette: 'romantic-blush', paperColor: 'Blush', paperTexture: 'pearl', weight: '80lb', stemCount: 9, heightMm: 350, addGreenery: true, vaseIncluded: true, domeIncluded: false, ledIncluded: false, notes: '' } },
  { id: 'native-posy', label: 'Native posy', hint: 'Banksia · 7 stems · greenery',
    apply: { templateId: 'banksia-petal', palette: 'native-australian', paperColor: 'Eucalyptus', paperTexture: 'linen', weight: '110lb', stemCount: 7, heightMm: 300, addGreenery: true, vaseIncluded: false, domeIncluded: false, ledIncluded: false, notes: '' } },
  { id: 'tall-statement', label: 'Tall statement', hint: 'Origami lilies · 15 stems · dome + lights',
    apply: { templateId: 'origami-lily', palette: 'classic-ivory', paperColor: 'Ivory', paperTexture: 'smooth', weight: '65lb', stemCount: 15, heightMm: 550, addGreenery: false, vaseIncluded: false, domeIncluded: true, ledIncluded: true, notes: '' } },
  { id: 'mini-gift', label: 'Mini gift', hint: 'Wattle sprig · 3 stems',
    apply: { templateId: 'wattle-sprig', palette: 'classic-ivory', paperColor: 'Ivory', paperTexture: 'smooth', weight: '65lb', stemCount: 3, heightMm: 250, addGreenery: false, vaseIncluded: false, domeIncluded: false, ledIncluded: false, notes: '' } },
];
const CHIP = 'px-3 py-1.5 rounded-full text-xs border transition';
const CHIP_ON = 'bg-bloom-500 text-white border-bloom-500';
const CHIP_OFF = 'bg-surface2 hover:bg-surface3';
// A bouquet preset reads as active when its headline fields match the spec.
const isPresetActive = (spec, apply) =>
  spec.templateId === apply.templateId && spec.stemCount === apply.stemCount
  && spec.heightMm === apply.heightMm && spec.paperColor === apply.paperColor;

export default function Configurator(){
  const { spec, setSpec } = useConfiguratorStore();
  const s = usePublicSettings();
  const [papers, setPapers] = useState([]);
  const [paperQ, setPaperQ] = useState('');
  const [paperTypeFilter, setPaperTypeFilter] = useState('');
  const [paperTextureFilter, setPaperTextureFilter] = useState('');
  useEffect(()=>{ paperStocksApi.list().then(setPapers).catch(()=>{}); }, []);
  const selectedPaper = papers.find(p=> p.id===spec.paperStockId) || null;
  const paperPremium = selectedPaper ? Number(selectedPaper.pricePremiumPerStem) || 0 : 0;
  const est = estimateLocalPrice(spec, s, paperPremium);
  const [paperZoom, setPaperZoom] = useState(false);
  const [compareId, setCompareId] = useState(null);
  const [splitPos, setSplitPos] = useState(50);
  const splitRef = useRef(null);
  const draggingRef = useRef(false);
  const updateSplit = (clientX) => {
    const el = splitRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.min(95, Math.max(5, ((clientX - rect.left) / rect.width) * 100));
    setSplitPos(pct);
  };
  const onHandleDown = (e) => {
    e.preventDefault(); e.stopPropagation();
    draggingRef.current = true;
    const move = (ev) => {
      if (!draggingRef.current) return;
      if (ev.touches) ev.preventDefault();
      updateSplit(ev.touches ? ev.touches[0].clientX : ev.clientX);
    };
    const up = () => { draggingRef.current = false; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
    if (e.touches) updateSplit(e.touches[0].clientX); else updateSplit(e.clientX);
  };
  const paperTypes = [...new Set(availablePapers.map(p=> p.paperType).filter(Boolean))].sort();
  const paperTextures = [...new Set(availablePapers.map(p=> p.texture).filter(Boolean))].sort();
  const textureOverlay = selectedPaper?.texture === 'linen' ? 'repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,0,0,0.04) 2px 3px), repeating-linear-gradient(90deg, transparent 0 2px, rgba(0,0,0,0.04) 2px 3px)'
    : selectedPaper?.texture === 'pearl' ? 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.55), transparent 60%)'
    : selectedPaper?.texture === 'textured' ? 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.06), transparent 70%)'
    : 'none';
  const comparePaper = papers.find(p=> p.id===compareId) || null;
  // Only display available papers to customers — hide out-of-stock (onHand <= 0). Low-stock (≤ lowThreshold) still shows with amber badge but is available.
  const availablePapers = papers.filter(p=> Number(p.onHand) > 0);
  useEffect(()=>{ if (spec.paperStockId && !availablePapers.find(p=> p.id===spec.paperStockId)) setSpec({ paperStockId: null }); }, [availablePapers.map(p=> p.id).join(','), spec.paperStockId]);
  useEffect(()=>{ if (compareId && !availablePapers.find(p=> p.id===compareId)) setCompareId(null); }, [availablePapers.map(p=> p.id).join(','), compareId]);
  const filteredPapers = availablePapers.filter(p=> {
    const q = paperQ.trim().toLowerCase();
    if (q && ![p.name, p.colour, p.paperType, p.weight].some(v=> String(v||'').toLowerCase().includes(q))) return false;
    if (paperTypeFilter && p.paperType !== paperTypeFilter) return false;
    if (paperTextureFilter && p.texture !== paperTextureFilter) return false;
    return true;
  });
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
    const ft = TEMPLATES.find(t=>t.id===spec.templateId)?.flowerType;
    if(!ft) return;
    let alive = true;
    fetch(`/api/products?flowerType=${encodeURIComponent(ft)}&limit=6`)
      .then(r=> r.ok? r.json(): null)
      .then(d=>{ const arr=(Array.isArray(d)?d:(Array.isArray(d?.products)?d.products:[])); if(alive) setPairs(arr.slice(0,3)); })
      .catch(()=>{});
    return ()=>{ alive=false; };
  }, [spec.templateId]);
  async function addPair(p){
    setPairBusy(p.id); setPairMsg('');
    try{
      await addToCart({ productId: p.id, quantity: 1 });
      setPairMsg(`${p.title} added to cart`);
    }catch(e){ setPairMsg(e.message || 'Could not add — try the product page'); }
    finally{ setPairBusy(''); }
  }
  async function submit(){
    setErr(''); setMsg('');
    const email = form.email.trim(); const name = form.name.trim() || 'Perth Customer'; const postcode = form.postcode.trim() || '6000';
    if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ setErr('Valid email required'); return; }
    if(!/^\d{4}$/.test(postcode)){ setErr('Postcode must be 4 digits (e.g., 6000)'); return; }
    if(name.length<2){ setErr('Full name required'); return; }
    try{
      const order = await ordersApi.customCreate({ customerEmail: email, customerName: name, spec, shippingPostcode: postcode });
      setMsg(`Created ${order.orderNumber} — ${order.state} — $${Number(order.totalPrice).toFixed(2)} — ${order.estimatedMinutes}m — QR: ${order.ticket?.qrPayload || ''}${s.show_kanban === '1' ? ' — View Kanban → /kanban' : ''}`);
    }catch(e){ setErr(e.message || 'Failed — please try again'); }
  }
  return (
    <Page>
      <PageHeader crumbs={<Breadcrumbs items={[{label:'Configurator'}]} />} title="Custom Bouquet Configurator"
        lede={s.show_cricut === '1' ? 'Colour • texture • weight • stems • height • template — live AUD price + Perth ETA.' : 'Colour • texture • weight • stems • height — live AUD price + Perth ETA.'} />
      <div className="space-y-3 sm:space-y-4 mt-6 pb-24 sm:pb-0">
        <section className="bg-surface2 p-3 sm:p-4 rounded-2xl border">
          <h2 className="font-bold flex items-center gap-2">Start from a look</h2>
          <p className="text-xs text-muted mt-1">One tap sets the whole bouquet — fine-tune anything after.</p>
          <div className="flex flex-wrap gap-2 mt-2" role="group" aria-label="Bouquet presets">
            {BOUQUET_PRESETS.map(p=> (
              <button key={p.id} onClick={()=>setSpec({ ...p.apply })} aria-pressed={isPresetActive(spec, p.apply)} className={`${CHIP} text-left ${isPresetActive(spec, p.apply)?CHIP_ON:CHIP_OFF}`}>
                {p.label}<span className="block text-[10px] font-normal opacity-80">{p.hint}</span>
              </button>
            ))}
            <button onClick={()=>setSpec({ ...DEFAULT_SPEC })} className={`${CHIP} ${CHIP_OFF}`}>Reset</button>
          </div>
        </section>
        {papers.length === 0 ? (
          <>
            <section className="bg-surface2 p-3 sm:p-4 rounded-2xl border">
              <h2 className="font-bold flex items-center gap-2"><span aria-hidden="true" className="w-6 h-6 rounded-full bg-bloom-500 text-white text-xs font-bold grid place-items-center shrink-0">1</span> Paper Colour</h2>
              <div className="flex flex-wrap gap-2 mt-2" role="group" aria-label="Paper palette">{PALETTES.map(p=> <button key={p.id} onClick={()=>setSpec({ palette:p.id, ...p.apply })} aria-pressed={spec.palette===p.id} className={`${CHIP} ${spec.palette===p.id?CHIP_ON:CHIP_OFF}`}>{p.label}</button>)}</div>
              <div className="flex flex-wrap gap-2 mt-2" role="group" aria-label="Paper colour">{COLORS.map(c=> <button key={c} onClick={()=>setSpec({paperColor:c, palette:null})} aria-pressed={spec.paperColor===c && !spec.palette} className={`${CHIP} ${spec.paperColor===c && !spec.palette?CHIP_ON: spec.paperColor===c?'border-bloom-500 text-highlight':'bg-surface2'}`}>{c}</button>)}</div>
            </section>
            <section className="bg-surface2 p-3 sm:p-4 rounded-2xl border">
              <h2 className="font-bold flex items-center gap-2"><span aria-hidden="true" className="w-6 h-6 rounded-full bg-bloom-500 text-white text-xs font-bold grid place-items-center shrink-0">2</span> Texture &amp; Weight</h2>
              <div className="flex flex-wrap gap-2 mt-2" role="group" aria-label="Paper texture">{TEXTURES.map(t=> <button key={t} onClick={()=>setSpec({paperTexture:t})} aria-pressed={spec.paperTexture===t} className={`${CHIP} ${spec.paperTexture===t?CHIP_ON:CHIP_OFF}`}>{t}</button>)}</div>
              <div className="flex flex-wrap gap-2 mt-2" role="group" aria-label="Paper weight">{WEIGHTS.map(w=> {
                const lbl = WEIGHT_LABELS[w];
                const sur = w==='80lb' ? Number(s.configurator_weight_80lb || 0) : w==='110lb' ? Number(s.configurator_weight_110lb || 0) : 0;
                return <button key={w} onClick={()=>setSpec({weight:w})} aria-pressed={spec.weight===w} className={`${CHIP} ${spec.weight===w?CHIP_ON:CHIP_OFF}`}>{lbl.label} <span className="text-[11px] font-normal opacity-70">({w})</span> {sur>0 && <span className="text-[11px] font-bold">+${sur.toFixed(2)}</span>}<span className="block text-[10px] font-normal opacity-60">{lbl.description}</span></button>;
              })}</div>
              {(() => {
                const hExtra = Math.max(0, Number(spec.heightMm) - 400);
                const hSur = Math.floor(hExtra / 100) * Number(s.configurator_height_per_100mm || 0);
                return hSur>0 ? <div className="text-xs text-muted mt-2">Height {spec.heightMm}mm: +${hSur.toFixed(2)} (above 400mm, ${Number(s.configurator_height_per_100mm||0).toFixed(2)}/100mm)</div> : null;
              })()}
            </section>
          </>
        ) : availablePapers.length > 0 ? (
          <section className="bg-surface2 p-3 sm:p-4 rounded-2xl border">
            <h2 className="font-bold flex items-center gap-2"><span aria-hidden="true" className="w-6 h-6 rounded-full bg-bloom-500 text-white text-xs font-bold grid place-items-center shrink-0">1</span> Paper — pick colour & type {paperPremium > 0 && <span className="text-xs font-normal text-muted">+${paperPremium.toFixed(2)}/stem</span>}</h2>
            <div className="flex flex-wrap gap-2 mt-3 items-center">
              <input value={paperQ} onChange={(e)=> setPaperQ(e.target.value)} placeholder="Search papers…" className="flex-1 min-w-[160px] border border-line-strong rounded-xl px-3 py-2 text-sm" />
              <select value={paperTypeFilter} onChange={(e)=> setPaperTypeFilter(e.target.value)} className="border border-line-strong rounded-xl px-3 py-2 text-xs">
                <option value="">All types</option>{paperTypes.map(t=> <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={paperTextureFilter} onChange={(e)=> setPaperTextureFilter(e.target.value)} className="border border-line-strong rounded-xl px-3 py-2 text-xs">
                <option value="">All textures</option>{paperTextures.map(t=> <option key={t} value={t}>{t}</option>)}
              </select>
              {(paperQ || paperTypeFilter || paperTextureFilter) && <button onClick={()=> { setPaperQ(''); setPaperTypeFilter(''); setPaperTextureFilter('');}} className="text-xs underline">Clear</button>}
              <span className="text-xs text-muted">{filteredPapers.length} of {availablePapers.length} available</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-3">
              {filteredPapers.map((p)=> (
                <button key={p.id} onClick={()=> {
                  if (compareId && p.id !== spec.paperStockId) { setCompareId(p.id); return; }
                  setSpec({ paperStockId: p.id, paperColor: p.colour, paperTexture: p.texture, weight: p.weight, palette: null });
                }} aria-pressed={spec.paperStockId===p.id} className={`text-left rounded-2xl border-2 overflow-hidden transition ${spec.paperStockId===p.id ? 'border-bloom-500 ring-2 ring-bloom-200' : compareId===p.id ? 'border-amber-500 ring-2 ring-amber-200' : 'border-line hover:border-bloom-200'}`}>
                  <div className="h-24 bg-surface3 relative overflow-hidden">
                    {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center text-2xl" style={{backgroundColor: p.colourHex || '#f3f4f6'}}>{p.colour.slice(0,1)}</div>}
                    {p.texture==='linen' && <div className="absolute inset-0 opacity-[0.08] mix-blend-multiply" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 2px, #000 2px 3px), repeating-linear-gradient(90deg, transparent 0 2px, #000 2px 3px)' }} aria-hidden />}
                    {p.texture==='pearl' && <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.85), transparent 60%), linear-gradient(120deg, transparent 40%, rgba(255,255,255,0.5) 50%, transparent 60%)' }} aria-hidden />}
                    {p.texture==='textured' && <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E")` }} aria-hidden />}
                    <span className="absolute top-2 left-2 w-6 h-6 rounded-full border-2 border-white shadow" style={{backgroundColor: p.colourHex || '#fff'}} title={p.colour} />
                    {Number(p.pricePremiumPerStem) > 0 && <span className="absolute top-2 right-2 text-[10px] font-bold bg-bloom-500 text-white px-1.5 py-0.5 rounded-full">+${Number(p.pricePremiumPerStem).toFixed(2)}</span>}
                    {p.onHand <= (p.lowThreshold ?? 5) && <span className="absolute bottom-1 right-1 text-[10px] bg-amber-500 text-white px-1 rounded">low</span>}
                    {compareId===p.id && <span className="absolute bottom-1 left-1 text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full">compare</span>}
                  </div>
                  <div className="p-2">
                    <div className="text-xs font-bold text-ink truncate">{p.name}</div>
                    <div className="text-[11px] text-muted truncate">{p.paperType} • {p.texture} • {p.weight}</div>
                    <div className="text-[11px] text-muted">{p.colour} {Number(p.pricePremiumPerStem)===0 ? '• included' : `• +$${Number(p.pricePremiumPerStem).toFixed(2)}/stem`}</div>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <button onClick={()=> setCompareId(compareId ? null : (selectedPaper ? filteredPapers.find(p=> p.id!==selectedPaper.id)?.id || null : filteredPapers[0]?.id || null))} className={`text-xs border rounded-xl px-3 py-1.5 ${compareId? 'bg-amber-50 border-amber-200 text-amber-800' : ''}`}>{compareId ? 'Exit compare' : 'Compare 2 papers'}</button>
              {compareId && <span className="text-xs text-muted">Tap another paper to set compare (amber ring)</span>}
              {compareId && comparePaper && selectedPaper && (
                <button onClick={()=> { setSpec({ paperStockId: comparePaper.id, paperColor: comparePaper.colour, paperTexture: comparePaper.texture, weight: comparePaper.weight, palette: null }); setCompareId(selectedPaper.id); }} className="text-xs border rounded-xl px-3 py-1.5">Swap</button>
              )}
            </div>
            {compareId && comparePaper && selectedPaper && comparePaper.id !== selectedPaper.id && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {[selectedPaper, comparePaper].map((p)=> (
                  <div key={p.id} className="bg-surface border rounded-xl overflow-hidden">
                    <div className="h-20 relative">
                      {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{backgroundColor: p.colourHex || '#f3f4f6'}} />}
                      <span className="absolute bottom-1 left-1 text-[10px] bg-black/70 text-white px-2 py-0.5 rounded-full">{p.name}</span>
                    </div>
                    <div className="p-2 text-[11px] space-y-1">
                      <div className="flex justify-between"><span className="text-muted">Colour</span><span className="font-semibold flex items-center gap-1"><span className="w-3 h-3 rounded-full border" style={{backgroundColor: p.colourHex || '#fff'}} />{p.colour}</span></div>
                      <div className="flex justify-between"><span className="text-muted">Type</span><span>{p.paperType}</span></div>
                      <div className="flex justify-between"><span className="text-muted">Texture</span><span className="capitalize">{p.texture}</span></div>
                      <div className="flex justify-between"><span className="text-muted">Weight</span><span>{p.weight}</span></div>
                      <div className="flex justify-between"><span className="text-muted">Premium</span><span className={Number(p.pricePremiumPerStem)>0?'text-highlight font-bold':''}>${Number(p.pricePremiumPerStem).toFixed(2)}/stem</span></div>
                      <div className="flex justify-between border-t pt-1 font-bold"><span>Total +</span><span>${(Number(p.pricePremiumPerStem)*spec.stemCount).toFixed(2)}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {selectedPaper && <div className="mt-3 text-xs text-muted">Selected: <span className="font-semibold text-ink">{selectedPaper.name}</span> — {selectedPaper.paperType} {selectedPaper.weight} • +${Number(selectedPaper.pricePremiumPerStem).toFixed(2)}/stem × {spec.stemCount} stems = <span className="font-bold text-highlight">+${(paperPremium * spec.stemCount).toFixed(2)}</span></div>}
            <div className="mt-3 bg-surface border rounded-xl p-3 text-xs space-y-1">
              <div className="font-semibold text-ink">Price breakdown</div>
              <div className="flex justify-between"><span className="text-muted">Floor</span><span>${Number(s.configurator_floor || 45).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted">Stems ({spec.stemCount} × ${Number(s.configurator_per_stem || 9.5).toFixed(2)})</span><span>${(spec.stemCount * Number(s.configurator_per_stem || 9.5)).toFixed(2)}</span></div>
              {paperPremium > 0 && <div className="flex justify-between"><span className="text-muted">Paper premium ({spec.stemCount} × ${paperPremium.toFixed(2)})</span><span className="text-highlight font-bold">+${(paperPremium * spec.stemCount).toFixed(2)}</span></div>}
              {(() => {
                const wSur = spec.weight === '80lb' ? Number(s.configurator_weight_80lb || 0) : spec.weight === '110lb' ? Number(s.configurator_weight_110lb || 0) : 0;
                const hExtra = Math.max(0, Number(spec.heightMm) - 400);
                const hSur = Math.floor(hExtra / 100) * Number(s.configurator_height_per_100mm || 0);
                const wh = wSur + hSur;
                return wh > 0 ? <div className="flex justify-between"><span className="text-muted">Weight/height surcharge</span><span>+${wh.toFixed(2)}</span></div> : null;
              })()}
              {(spec.addGreenery || spec.vaseIncluded || spec.domeIncluded || spec.ledIncluded) && <div className="flex justify-between"><span className="text-muted">Add-ons</span><span>+${((spec.addGreenery? Number(s.configurator_greenery||12):0)+(spec.vaseIncluded? Number(s.configurator_vase||22):0)+(spec.domeIncluded? Number(s.configurator_dome||45):0)+(spec.ledIncluded? Number(s.configurator_led||18):0)).toFixed(2)}</span></div>}
              <div className="flex justify-between font-bold border-t pt-1"><span>Total</span><span>${est.totalPrice.toFixed(2)} AUD</span></div>
              <div className="text-[11px] text-muted">BOM-heavy bouquets may be charged above this estimate — final price confirmed at proofing.</div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={()=> setSpec({ paperStockId: null })} className={`${CHIP} ${!spec.paperStockId ? CHIP_ON : CHIP_OFF}`}>No paper premium</button>
            </div>
          </section>
        ) : (
          <section className="bg-surface2 p-3 sm:p-4 rounded-2xl border text-center">
            <div className="font-bold text-ink">Papers out of stock</div>
            <div className="text-xs text-muted mt-1">All uploaded papers are currently out of stock — check back soon or contact the studio at {s.contact_email || 'krystal@krystalsflowerkreations.com.au'}.</div>
          </section>
        )}
        <section className="bg-surface2 p-3 sm:p-4 rounded-2xl border space-y-3">
          <h2 className="font-bold flex items-center gap-2"><span aria-hidden="true" className="w-6 h-6 rounded-full bg-bloom-500 text-white text-xs font-bold grid place-items-center shrink-0">3</span> Stems &amp; Height</h2>
          <div className="flex items-center gap-3 min-w-0"><label htmlFor="cfg-stems" className="shrink-0">Stems</label> <input id="cfg-stems" type="range" min={1} max={25} value={spec.stemCount} onChange={e=>setSpec({stemCount: parseInt(e.target.value)})} className="flex-1 min-w-0" aria-valuetext={`${spec.stemCount} stems`} /> <span aria-hidden="true" className="shrink-0 w-6 text-right">{spec.stemCount}</span></div>
          <div className="flex items-center gap-3 min-w-0"><label htmlFor="cfg-height" className="shrink-0">Height mm</label> <input id="cfg-height" type="range" min={150} max={600} step={50} value={spec.heightMm} onChange={e=>setSpec({heightMm: parseInt(e.target.value)})} className="flex-1 min-w-0" aria-valuetext={`${spec.heightMm} millimetres`} /> <span aria-hidden="true" className="shrink-0 w-8 text-right">{spec.heightMm}</span></div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Add-ons">
            <button type="button" onClick={()=>setSpec({addGreenery:!spec.addGreenery})} aria-pressed={spec.addGreenery} className={`${CHIP} ${spec.addGreenery?CHIP_ON:CHIP_OFF}`}>Greenery <span aria-hidden="true">+${greeneryPrice}</span></button>
            <button type="button" onClick={()=>setSpec({vaseIncluded:!spec.vaseIncluded})} aria-pressed={spec.vaseIncluded} className={`${CHIP} ${spec.vaseIncluded?CHIP_ON:CHIP_OFF}`}>Vase <span aria-hidden="true">+${vasePrice}</span></button>
            <button type="button" onClick={()=>setSpec({domeIncluded:!spec.domeIncluded})} aria-pressed={spec.domeIncluded} className={`${CHIP} ${spec.domeIncluded?CHIP_ON:CHIP_OFF}`}>Glass dome <span aria-hidden="true">+${domePrice}</span></button>
            <button type="button" onClick={()=>setSpec({ledIncluded:!spec.ledIncluded})} aria-pressed={spec.ledIncluded} className={`${CHIP} ${spec.ledIncluded?CHIP_ON:CHIP_OFF}`}>LED lights <span aria-hidden="true">+${ledPrice}</span></button>
          </div>
        </section>
        {s.show_cricut === '1' && <section className="bg-surface2 p-3 sm:p-4 rounded-2xl border">
          <h2 className="font-bold flex items-center gap-2"><span aria-hidden="true" className="w-6 h-6 rounded-full bg-bloom-500 text-white text-xs font-bold grid place-items-center shrink-0">4</span> Template — free preview</h2>
          <div className="flex flex-wrap gap-2 mt-2" role="group" aria-label="template">{TEMPLATES.map(t=> <button key={t.id} onClick={()=>setSpec({templateId:t.id})} aria-pressed={spec.templateId===t.id} className={`${CHIP} ${spec.templateId===t.id?CHIP_ON:CHIP_OFF}`}>{t.label}</button>)}</div>
          {comparePaper && selectedPaper && comparePaper.id !== selectedPaper.id ? (
            <div ref={splitRef} className="mt-4 border rounded-xl overflow-hidden relative h-48 flex select-none cursor-zoom-in" onClick={()=> setPaperZoom(true)}>
              <div className="relative" style={{ width: `${splitPos}%`, backgroundColor: selectedPaper.colourHex || '#fff', backgroundImage: selectedPaper.imageUrl ? `url(${selectedPaper.imageUrl})` : undefined, backgroundSize: '120px', backgroundRepeat: 'repeat' }}>
                <div className="absolute inset-0 bg-white/25" />
                {selectedPaper.texture==='linen' && <div className="absolute inset-0 opacity-[0.07] mix-blend-multiply" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 2px, #000 2px 3px), repeating-linear-gradient(90deg, transparent 0 2px, #000 2px 3px)' }} aria-hidden />}
                {selectedPaper.texture==='pearl' && <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.85), transparent 60%)' }} aria-hidden />}
                <span className="absolute bottom-1 left-1 text-[10px] bg-black/70 text-white px-2 py-0.5 rounded-full">{selectedPaper.name}</span>
              </div>
              <div className="relative" style={{ width: `${100 - splitPos}%`, backgroundColor: comparePaper.colourHex || '#fff', backgroundImage: comparePaper.imageUrl ? `url(${comparePaper.imageUrl})` : undefined, backgroundSize: '120px', backgroundRepeat: 'repeat' }}>
                <div className="absolute inset-0 bg-white/25" />
                {comparePaper.texture==='linen' && <div className="absolute inset-0 opacity-[0.07] mix-blend-multiply" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 2px, #000 2px 3px), repeating-linear-gradient(90deg, transparent 0 2px, #000 2px 3px)' }} aria-hidden />}
                {comparePaper.texture==='pearl' && <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.85), transparent 60%)' }} aria-hidden />}
                <span className="absolute bottom-1 right-1 text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full">{comparePaper.name}</span>
              </div>
              <div className="absolute inset-0 grid place-items-center pointer-events-none">
                <img src={`/svg/${spec.templateId}.svg`} alt="" className="w-3/4 h-3/4 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.25)] bg-white/60 rounded-xl p-2 backdrop-blur-sm" onError={(e)=> e.currentTarget.style.display='none'} />
              </div>
              <div onMouseDown={onHandleDown} onTouchStart={onHandleDown} className="absolute top-0 bottom-0 w-6 -ml-3 flex items-center justify-center cursor-ew-resize touch-none" style={{ left: `${splitPos}%` }} aria-label="Drag to compare">
                <div className="w-1 h-full bg-white shadow-[0_0_6px_rgba(0,0,0,0.3)]" />
                <div className="absolute w-8 h-8 bg-white rounded-full shadow-lg border grid place-items-center">
                  <span className="text-[10px] font-bold">↔</span>
                </div>
              </div>
              <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] bg-black/70 text-white px-2 py-0.5 rounded-full pointer-events-none">drag ↔ to wipe • tap to zoom</span>
            </div>
          ) : (
            <div onClick={()=> selectedPaper?.imageUrl && setPaperZoom(true)} className={`mt-4 border rounded-xl overflow-hidden relative ${selectedPaper?.imageUrl ? 'cursor-zoom-in' : ''}`} style={{
                backgroundColor: selectedPaper?.colourHex || '#ffffff',
                backgroundImage: [selectedPaper?.imageUrl ? `url(${selectedPaper.imageUrl})` : null, textureOverlay !== 'none' ? textureOverlay : null].filter(Boolean).join(', '),
                backgroundSize: selectedPaper?.imageUrl ? '160px, auto' : undefined,
                backgroundRepeat: 'repeat',
              }}>
              <div className="absolute inset-0 bg-white/30 backdrop-blur-[0.5px]" aria-hidden />
              {selectedPaper?.texture === 'linen' && <div className="absolute inset-0 opacity-[0.07] mix-blend-multiply" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 3px, #000 3px 4px), repeating-linear-gradient(90deg, transparent 0 3px, #000 3px 4px)' }} aria-hidden />}
              {selectedPaper?.texture === 'pearl' && <div className="absolute inset-0 opacity-40" style={{ background: 'radial-gradient(ellipse at 25% 20%, rgba(255,255,255,0.9), transparent 55%), linear-gradient(120deg, transparent 40%, rgba(255,255,255,0.45) 50%, transparent 60%)' }} aria-hidden />}
              {selectedPaper?.texture === 'textured' && <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E")` }} aria-hidden />}
              <img src={`/svg/${spec.templateId}.svg`} alt={TEMPLATES.find(t=>t.id===spec.templateId)?.label} className="relative w-full h-48 object-contain p-4 drop-shadow-sm" style={{ filter: selectedPaper ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))' : undefined }} onError={(e)=>{e.currentTarget.style.display='none'; e.currentTarget.nextSibling.style.display='block';}} />
              <div style={{display:'none'}} className="relative bg-surface rounded-xl p-4 text-center border border-dashed m-4">✂ Preview: {spec.paperColor} • {spec.paperTexture} • {spec.weight} — {TEMPLATES.find(t=>t.id===spec.templateId)?.label}</div>
              {selectedPaper && <div className="absolute bottom-1 left-1 right-1 flex justify-between gap-2 text-[10px]">
                <span className="bg-black/70 text-white px-2 py-1 rounded-full">{selectedPaper.name} • {selectedPaper.texture}{selectedPaper.imageUrl ? ' • tap to zoom' : ''}</span>
                <span className="bg-bloom-500 text-white px-2 py-1 rounded-full">{selectedPaper.paperType} {selectedPaper.weight}</span>
              </div>}
            </div>
          )}
          {paperZoom && selectedPaper?.imageUrl && (
            <div className="fixed inset-0 z-50 bg-black/80 grid place-items-center p-4" onClick={()=> setPaperZoom(false)} role="dialog" aria-modal="true" aria-label="Paper texture">
              <div className="bg-surface rounded-2xl overflow-hidden max-w-2xl w-full" onClick={(e)=> e.stopPropagation()}>
                {comparePaper && comparePaper.imageUrl && comparePaper.id !== selectedPaper.id ? (
                  <div className="grid grid-cols-2 gap-0">
                    {[selectedPaper, comparePaper].map((p)=> (
                      <div key={p.id} className="border-r last:border-0">
                        <img src={p.imageUrl} alt={p.name} className="w-full h-[50vh] object-cover" />
                        <div className="p-3">
                          <div className="font-bold text-sm text-ink">{p.name}</div>
                          <div className="text-xs text-muted">{p.colour} • {p.paperType} • {p.texture} • {p.weight}</div>
                          <div className="text-xs font-bold text-highlight">+${Number(p.pricePremiumPerStem).toFixed(2)}/stem</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <img src={selectedPaper.imageUrl} alt={selectedPaper.name} className="w-full h-[60vh] object-contain bg-surface3" />
                    <div className="p-4 flex justify-between items-center gap-3">
                      <div>
                        <div className="font-bold text-ink">{selectedPaper.name}</div>
                        <div className="text-xs text-muted">{selectedPaper.colour} • {selectedPaper.paperType} • {selectedPaper.texture} • {selectedPaper.weight} • +${Number(selectedPaper.pricePremiumPerStem).toFixed(2)}/stem</div>
                      </div>
                      <button onClick={()=> setPaperZoom(false)} className="text-xs border rounded-xl px-4 py-2">Close</button>
                    </div>
                  </>
                )}
                {comparePaper && comparePaper.imageUrl && comparePaper.id !== selectedPaper.id && (
                  <div className="p-3 border-t flex justify-end">
                    <button onClick={()=> setPaperZoom(false)} className="text-xs border rounded-xl px-4 py-2">Close</button>
                  </div>
                )}
              </div>
            </div>
          )}
          {import.meta.env.DEV && <div className="text-[11px] text-muted mt-2">Free pipeline: Inkscape Trace Bitmap → Plain SVG → store in <code>frontend/public/svg/</code> → served at <code>/svg/{spec.templateId}.svg</code>.</div>}
        </section>}
        <ARViewer productSlug={spec.templateId} title={`${spec.paperColor} ${TEMPLATES.find(t=>t.id===spec.templateId)?.label} — ${spec.stemCount} stems`} />
        {pairs.length>0 && (
          <section className="bg-surface2 p-3 sm:p-4 rounded-2xl border">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-bold">Pairs well with — ready-made {activeTemplate?.flowerType} blooms & templates</h2>
              {pairMsg && <span className="text-[11px] text-success-800">{pairMsg} — <Link to="/cart" className="underline font-semibold">view cart</Link></span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              {pairs.map(p=> (
                <div key={p.id} className="bg-surface border rounded-xl p-3 flex flex-col">
                  <Link to={`/product/${p.slug}`} className="text-sm font-semibold text-ink hover:underline line-clamp-2">{p.title}</Link>
                  {(p.stockMode === 'digital' || p.type === 'digital_template') && <span className="mt-1 self-start text-[10px] font-bold bg-highlight/10 text-highlight border border-highlight/20 px-1.5 py-0.5 rounded-full">Instant download</span>}
                  <span className="text-sm text-highlight font-bold mt-1">${Number(p.price).toFixed(2)} <span className="text-[10px] font-normal text-muted">AUD</span></span>
                  <button onClick={()=>addPair(p)} disabled={pairBusy===p.id} className="mt-2 text-xs bg-bloom-500 text-white rounded-full py-1.5 font-bold disabled:opacity-60">{pairBusy===p.id?'Adding…':'Add to cart'}</button>
                </div>
              ))}
            </div>
          </section>
        )}
        <NotebookPanel query={`${spec.templateId} ${spec.paperColor} ${spec.weight} Perth humidity`} />
        <div id="cfg-order" className="bg-surface2 border rounded-2xl p-3 sm:p-4 space-y-3 scroll-mt-24">
          <h2 className="font-bold">Your details — for custom order</h2>
          <Input value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="you@example.com" type="email" label="Email" labelVisible size="sm" className="w-full" />
          <Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Full name" label="Full name" labelVisible size="sm" className="w-full" />
          <Input value={form.postcode} onChange={e=>setForm({...form,postcode:e.target.value})} placeholder="6000 Perth metro" label="Postcode" labelVisible size="sm" className="w-full" />
          {err && <Alert tone="danger" className="text-xs">{err}</Alert>}
          {msg && <Alert tone="ok" className="text-xs">{msg}</Alert>}
        </div>
        <div className="bg-bloom-700 text-white rounded-2xl p-5">
          <div className="flex justify-between"><span>Total ({spec.stemCount} stems)</span><span className="font-bold">${est.totalPrice.toFixed(2)} AUD</span></div>
          <div className="flex justify-between mt-1 text-sm opacity-80"><span>Est. craft time</span><span>{est.estimatedMinutes} min</span></div>
          <div className="text-xs opacity-60 mt-2">Estimate — final price confirmed at proofing. Earn 1 Bloom pt per $1.</div>
          <Btn onClick={submit} className="w-full mt-4" variant="primary" size="lg">Create Custom Order → Drafting/Proofing</Btn>
        </div>
      </div>
      <div role="region" aria-label="Price summary" className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-bloom-700 text-white px-4 py-3 flex items-center justify-between gap-3 shadow-[0_-4px_16px_rgba(0,0,0,0.25)] border-t border-white/10">
        <div className="text-sm min-w-0">
          <span className="opacity-70">Total</span>{' '}
          <span className="font-bold">${est.totalPrice.toFixed(2)}</span>
          <span className="block text-[10px] opacity-70 truncate">{spec.stemCount} stems · {spec.paperColor} · {est.estimatedMinutes} min</span>
        </div>
        <a href="#cfg-order" className="shrink-0 text-xs font-bold bg-white text-bloom-700 rounded-full px-4 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Review &amp; order</a>
      </div>
    </Page>
  );
}
