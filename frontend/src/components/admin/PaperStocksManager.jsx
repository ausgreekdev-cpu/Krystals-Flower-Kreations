import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/api/customClient';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import MediaPickerModal from './media/MediaPickerModal';

const TEXTURES = ['textured','smooth','pearl','linen'];

export default function PaperStocksManager({ token }) {
  const toast = useToast();
  const [papers, setPapers] = useState(null);
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [pickerFor, setPickerFor] = useState(null);

  async function load() {
    try { const rows = await adminApi.paperStocks.list(token); setPapers(rows); } catch (e) { toast(e.message,'error'); }
  }
  useEffect(()=>{ load(); }, [token]);

  async function save() {
    setBusy(true);
    const body = {
      name: editing.name.trim(),
      colour: editing.colour.trim(),
      colourHex: editing.colourHex?.trim() || null,
      paperType: editing.paperType.trim(),
      texture: editing.texture,
      weight: editing.weight.trim(),
      pricePremiumPerStem: Number(editing.pricePremiumPerStem) || 0,
      isActive: !!editing.isActive,
      sortOrder: Number(editing.sortOrder) || 0,
      onHand: Number(editing.onHand) || 0,
      lowThreshold: Number(editing.lowThreshold) || 5,
    };
    if (!body.name || !body.colour || !body.paperType || !body.weight) { toast('Name, colour, type and weight required','error'); setBusy(false); return; }
    try {
      if (editing.id) await adminApi.paperStocks.update(editing.id, body, token);
      else await adminApi.paperStocks.create(body, token);
      setEditing(null); load(); toast(editing.id ? 'Paper updated' : 'Paper created');
    } catch (e) { toast(e.message,'error'); }
    setBusy(false);
  }

  async function remove() {
    try { await adminApi.paperStocks.remove(confirmDel.id, token); setConfirmDel(null); load(); toast('Paper deleted'); } catch(e){ toast(e.message,'error'); }
  }

  async function uploadImage(id, file) {
    if (!file) return;
    try { await adminApi.paperStocks.uploadImage(id, file, token); load(); toast('Image uploaded — also saved to gallery'); } catch(e){ toast(e.message,'error'); }
  }
  async function pickFromGallery(asset) {
    if (!pickerFor || !asset?.id) return;
    try {
      await adminApi.media.attach(token, { assetId: asset.id, attachableType: 'PAPER_STOCK', attachableId: pickerFor, role: 'gallery' });
      toast('Gallery image attached to paper');
      setPickerFor(null); load();
    } catch (e) { toast(e.message,'error'); }
  }

  function downloadCsvTemplate() {
    const header = 'name,colour,colourHex,paperType,texture,weight,pricePremiumPerStem,onHand,lowThreshold,sortOrder,isActive\n';
    const example = 'Blush Pearl 80lb,Blush,#F8C4B4,Canson,pearl,80lb,1.5,30,5,1,true\n';
    const blob = new Blob([header+example], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='papers-template.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function handleBulkFile(file) {
    if (!file) return;
    setBulkBusy(true);
    try {
      const text = await file.text();
      const lines = text.trim().split(/\r?\n/);
      const hdr = lines[0].split(',').map((s)=> s.trim().toLowerCase());
      const idx = (k)=> hdr.indexOf(k);
      const rows = lines.slice(1).filter(Boolean).map((line)=>{
        const cols = line.split(',').map((s)=> s.trim());
        return {
          name: cols[idx('name')] || '',
          colour: cols[idx('colour')] || cols[idx('color')] || '',
          colourHex: cols[idx('colourhex')] || cols[idx('colorhex')] || null,
          paperType: cols[idx('papertype')] || 'Canson',
          texture: (cols[idx('texture')] || 'textured').toLowerCase(),
          weight: cols[idx('weight')] || '65lb',
          pricePremiumPerStem: Number(cols[idx('pricepremiumperstem')] || 0),
          onHand: Number(cols[idx('onhand')] || 0),
          lowThreshold: Number(cols[idx('lowthreshold')] || 5),
          sortOrder: Number(cols[idx('sortorder')] || 0),
          isActive: String(cols[idx('isactive')] || 'true').toLowerCase() !== 'false',
        };
      }).filter((r)=> r.name && r.colour);
      if (!rows.length) throw new Error('No valid rows — check CSV header');
      const res = await adminApi.paperStocks.bulk(rows, token);
      toast(`Bulk: ${res.count} created${res.errors?.length ? `, ${res.errors.length} errors` : ''}`);
      setShowBulk(false); load();
    } catch (e) { toast(e.message,'error'); }
    setBulkBusy(false);
  }

  if (papers===null) return <div className="text-xs text-muted py-6 text-center">Loading papers…</div>;

  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm bg-surface2 text-ink focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-muted mb-1';
  const lowCount = papers.filter(p=> Number(p.onHand) <= Number(p.lowThreshold)).length;
  const qLower = q.trim().toLowerCase();
  const filtered = papers.filter(p=> {
    if (showLowOnly && Number(p.onHand) > Number(p.lowThreshold)) return false;
    if (!qLower) return true;
    return [p.name, p.colour, p.paperType, p.texture, p.weight].some(v=> String(v||'').toLowerCase().includes(qLower));
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="font-black text-ink">Papers — sellable materials for configurator</h2>
          <p className="text-xs text-muted">Each paper is a colour+type+texture+weight with its own per-stem premium. Upload an image so customers can pick visually. Not a product — stocked as material. {lowCount>0 && <span className="text-amber-600 font-bold">{lowCount} low</span>}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={downloadCsvTemplate} className="text-xs border rounded-xl px-3 py-2">CSV template</button>
          <button onClick={()=> setShowBulk(true)} className="text-xs border rounded-xl px-3 py-2">Bulk import</button>
          <button onClick={()=> setEditing({ name:'', colour:'', colourHex:'#f8c4b4', paperType:'Canson', texture:'textured', weight:'65lb', pricePremiumPerStem:0, isActive:true, sortOrder:0, onHand:0, lowThreshold:5 })} className="text-xs font-bold bg-royal-600 text-white rounded-xl px-4 py-2">+ Add paper</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input value={q} onChange={(e)=> setQ(e.target.value)} placeholder="Search name, colour, type…" className="flex-1 min-w-[180px] border border-line-strong rounded-xl px-3 py-2 text-sm" />
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showLowOnly} onChange={(e)=> setShowLowOnly(e.target.checked)} /> Low only ({lowCount})</label>
        <span className="text-xs text-muted">{filtered.length} of {papers.length}</span>
      </div>

      {filtered.length===0 && <div className="text-xs text-muted py-10 text-center border-2 border-dashed rounded-xl">No papers match — try search or add first paper.</div>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((p)=> (
          <div key={p.id} className={`bg-surface2 border rounded-2xl overflow-hidden ${!p.isActive ? 'opacity-60' : ''}`}>
            <div className="h-32 bg-surface3 relative overflow-hidden">
              {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center text-muted text-xs" style={{backgroundColor: p.colourHex || '#f3f4f6'}}>{p.colour}</div>}
              {p.texture==='linen' && <div className="absolute inset-0 opacity-[0.08] mix-blend-multiply" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 2px, #000 2px 3px), repeating-linear-gradient(90deg, transparent 0 2px, #000 2px 3px)' }} aria-hidden />}
              {p.texture==='pearl' && <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.85), transparent 60%), linear-gradient(120deg, transparent 40%, rgba(255,255,255,0.5) 50%, transparent 60%)' }} aria-hidden />}
              {p.texture==='textured' && <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E")` }} aria-hidden />}
              <span className="absolute top-2 left-2 w-6 h-6 rounded-full border-2 border-white shadow" style={{backgroundColor: p.colourHex || '#fff'}} />
              {Number(p.pricePremiumPerStem) > 0 ? <span className="absolute top-2 right-2 text-[10px] font-bold bg-bloom-500 text-white px-2 py-0.5 rounded-full">+${Number(p.pricePremiumPerStem).toFixed(2)}/stem</span> : <span className="absolute top-2 right-2 text-[10px] bg-surface2 border px-2 py-0.5 rounded-full">included</span>}
              {!p.isActive && <span className="absolute bottom-1 left-1 text-[10px] bg-gray-800 text-white px-1.5 rounded">hidden</span>}
            </div>
            <div className="p-3 space-y-1">
              <div className="font-bold text-sm text-ink truncate">{p.name}</div>
              <div className="text-xs text-muted">{p.colour} • {p.paperType} • {p.texture} • {p.weight}</div>
              <div className="text-xs text-muted">{p.onHand} on hand {Number(p.onHand) <= Number(p.lowThreshold) && <span className="text-amber-600 font-bold">• low</span>}</div>
              <div className="flex gap-1.5 mt-2">
                <button onClick={()=> setEditing(p)} className="flex-1 text-xs border rounded-xl py-1.5 font-semibold hover:bg-surface3">Edit</button>
                <label className="flex-1 text-xs border rounded-xl py-1.5 font-semibold text-center hover:bg-surface3 cursor-pointer">Upload<input type="file" accept="image/*" className="hidden" onChange={(e)=> uploadImage(p.id, e.target.files?.[0])} /></label>
                <button onClick={()=> setPickerFor(p.id)} className="flex-1 text-xs border rounded-xl py-1.5 font-semibold hover:bg-surface3">Gallery</button>
                <button onClick={()=> setConfirmDel(p)} className="text-xs border border-red-200 text-red-600 rounded-xl px-3 py-1.5">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showBulk && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Bulk import papers">
          <div className="bg-surface border rounded-2xl p-5 w-full max-w-lg space-y-3">
            <h3 className="font-bold text-sm">Bulk import papers — CSV</h3>
            <p className="text-xs text-muted">Header: <code>name,colour,colourHex,paperType,texture,weight,pricePremiumPerStem,onHand,lowThreshold,sortOrder,isActive</code> — texture: textured/smooth/pearl/linen</p>
            <div className="flex gap-2">
              <button onClick={downloadCsvTemplate} className="text-xs border rounded-xl px-3 py-2">Download template</button>
              <label className="text-xs border rounded-xl px-3 py-2 cursor-pointer bg-royal-50">Choose CSV<input type="file" accept=".csv" className="hidden" onChange={(e)=> handleBulkFile(e.target.files?.[0])} /></label>
            </div>
            {bulkBusy && <div className="text-xs text-muted">Importing…</div>}
            <div className="flex justify-end gap-2">
              <button onClick={()=> setShowBulk(false)} className="text-xs border rounded-xl px-4 py-2">Close</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" role="dialog" aria-modal="true">
          <div className="bg-surface border rounded-2xl p-5 w-full max-w-lg space-y-3 max-h-[90vh] overflow-auto">
            <h3 className="font-bold text-sm">{editing.id ? 'Edit paper' : 'Add paper'}</h3>
            <div><label className={label}>Name</label><input className={input} value={editing.name} onChange={(e)=> setEditing({...editing, name:e.target.value})} placeholder="Blush Pearl 80lb" maxLength={100} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={label}>Colour name</label><input className={input} value={editing.colour} onChange={(e)=> setEditing({...editing, colour:e.target.value})} placeholder="Blush" /></div>
              <div><label className={label}>Colour hex</label><input type="color" className="w-full h-10 rounded-xl border" value={editing.colourHex || '#f8c4b4'} onChange={(e)=> setEditing({...editing, colourHex:e.target.value})} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={label}>Paper type</label><input className={input} value={editing.paperType} onChange={(e)=> setEditing({...editing, paperType:e.target.value})} placeholder="Canson / Colorplan / Quill" /></div>
              <div><label className={label}>Texture</label><select className={input} value={editing.texture} onChange={(e)=> setEditing({...editing, texture:e.target.value})}>{TEXTURES.map((t)=> <option key={t} value={t}>{t}</option>)}</select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={label}>Weight</label><input className={input} value={editing.weight} onChange={(e)=> setEditing({...editing, weight:e.target.value})} placeholder="65lb / 80lb / 160gsm" /></div>
              <div><label className={label}>Premium per stem ($)</label><input type="number" step="0.01" className={input} value={editing.pricePremiumPerStem} onChange={(e)=> setEditing({...editing, pricePremiumPerStem:e.target.value})} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className={label}>On hand</label><input type="number" className={input} value={editing.onHand} onChange={(e)=> setEditing({...editing, onHand:e.target.value})} /></div>
              <div><label className={label}>Low at</label><input type="number" className={input} value={editing.lowThreshold} onChange={(e)=> setEditing({...editing, lowThreshold:e.target.value})} /></div>
              <div><label className={label}>Sort</label><input type="number" className={input} value={editing.sortOrder} onChange={(e)=> setEditing({...editing, sortOrder:e.target.value})} /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!editing.isActive} onChange={(e)=> setEditing({...editing, isActive:e.target.checked})} /> Active (visible in configurator)</label>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={()=> setEditing(null)} className="text-xs border rounded-xl px-4 py-2">Cancel</button>
              <button onClick={save} disabled={busy} className="text-xs font-bold bg-royal-600 text-white rounded-xl px-4 py-2 disabled:opacity-50">{busy ? 'Saving…' : editing.id ? 'Save' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {pickerFor && <MediaPickerModal token={token} onClose={()=> setPickerFor(null)} onPick={pickFromGallery} />}
      {confirmDel && <ConfirmDialog title="Delete paper" message={`Delete ${confirmDel.name}?`} onConfirm={remove} onClose={()=> setConfirmDel(null)} />}
    </div>
  );
}
