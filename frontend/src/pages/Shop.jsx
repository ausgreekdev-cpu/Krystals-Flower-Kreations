import { useEffect, useState } from 'react';
import { usePublicSettings } from '../lib/publicSettings';
import { Page, PageHeader, Breadcrumbs } from '../components/ui/Page';
import Btn from '../components/ui/Btn';
import Alert from '../components/ui/Alert';
import { Input } from '../components/ui/Field';
import { EmptyState } from '../components/ui/State';
import ProductCard from '../components/ProductCard';

export default function Shop(){
  const init = new URLSearchParams(window.location.search);
  const [q,setQ]=useState(init.get('q') || ''); const [products,setProducts]=useState([]); const [filter,setFilter]=useState('all'); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  const [flowerType,setFlowerType]=useState(init.get('flowerType') || ''); const [colourFamily,setColourFamily]=useState(init.get('colourFamily') || ''); const [occasion,setOccasion]=useState(init.get('occasion') || '');
  const s = usePublicSettings();
  useEffect(()=>{
    setLoading(true); setError('');
    const id = setTimeout(()=>{
      fetch(`/api/products?q=${encodeURIComponent(q)}`)
        .then(r=>{ if(!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(d=>{ const arr = Array.isArray(d) ? d : (Array.isArray(d.products) ? d.products : []); setProducts(arr); if(!Array.isArray(d) && !Array.isArray(d.products) && d.error) { throw new Error(d.error); } })
        .catch(e=>{ setError(e.message); setProducts([]); })
        .finally(()=>setLoading(false));
    }, q?300:0);
    return ()=>clearTimeout(id);
  }, [q]);
  // Shareable florist filters — keep the URL in sync (e.g. ?occasion=wedding)
  useEffect(()=>{
    const p = new URLSearchParams();
    if(q) p.set('q', q); if(flowerType) p.set('flowerType', flowerType); if(colourFamily) p.set('colourFamily', colourFamily); if(occasion) p.set('occasion', occasion);
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [q, flowerType, colourFamily, occasion]);
  const productsArr = Array.isArray(products) ? products : [];
  // Facet options derive from the loaded catalog so new admin values appear automatically
  const flowerTypes = [...new Set(productsArr.map(p=>p.flowerType).filter(Boolean))].sort();
  const colourFamilies = [...new Set(productsArr.map(p=>p.colourFamily).filter(Boolean))].sort();
  const occasions = [...new Set(productsArr.flatMap(p=>p.occasions||[]))].sort();
  const floristFiltered = productsArr.filter(p =>
    (!flowerType || p.flowerType === flowerType) &&
    (!colourFamily || p.colourFamily === colourFamily) &&
    (!occasion || (p.occasions||[]).includes(occasion))
  );
  const filtered = filter==='all' ? floristFiltered : floristFiltered.filter(p=> filter==='made_to_order' ? p.stockMode==='made_to_order' : filter==='digital' ? p.type==='digital_template' : p.type===filter);
  const floristActive = !!(flowerType || colourFamily || occasion);
  const CHIP = 'px-3 py-1.5 rounded-full text-xs border cursor-pointer';
  const CHIP_ON = 'bg-bloom-500 text-white border-bloom-500';
  const CHIP_OFF = 'bg-surface2 border-line hover:bg-surface3';
  const chip = (active) => `${CHIP} ${active ? CHIP_ON : CHIP_OFF}`;
  const FloristGroup = ({label, options, value, set}) => options.length === 0 ? null : (
    <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label={`Filter by ${label.toLowerCase()}`}>
      <span className="text-[11px] font-semibold text-muted uppercase tracking-wide" aria-hidden="true">{label}</span>
      {options.map(o => <button key={o} onClick={()=>set(value===o?'':o)} aria-pressed={value===o} className={chip(value===o)}>{o.replace(/-/g,' ')}</button>)}
    </div>
  );
  // Storefront settings: default sort + page size (0 = everything)
  const sort = s.shop_sort_default || 'newest';
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'price_asc') return Number(a.price) - Number(b.price);
    if (sort === 'price_desc') return Number(b.price) - Number(a.price);
    if (sort === 'title_asc') return String(a.title).localeCompare(String(b.title));
    return 0; // newest = API order (createdAt desc)
  });
  const pageSize = Number(s.shop_page_size) || 0;
  const shown = pageSize > 0 ? sorted.slice(0, pageSize) : sorted;
  const freeOver = Number(s.shipping_free_over) || 150;
  const subtitle = `Perth studio • Made-to-order ${s.handling_days_text || '3-7 days'} • Free Perth delivery over $${freeOver}`;
  return (
    <Page width="wide">
      <PageHeader crumbs={<Breadcrumbs items={[{label:'Shop'}]} />} title="Shop — paper blooms & armature art" lede={subtitle} />
      {/* Toolbar: search + filter chips directly under the heading (was a detached full-width row) */}
      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0 sm:max-w-md flex items-stretch border rounded-xl bg-surface2 overflow-hidden focus-within:ring-2 focus-within:ring-bloom-500/40 focus-within:border-bloom-500">
          <Input label="Search products" value={q} onChange={e=>setQ(e.target.value)} placeholder={s.show_cricut === '1' ? 'Search — rose, banksia, Cricut…' : 'Search — rose, banksia, origami…'} className="flex-1 min-w-0 border-0 rounded-none bg-transparent focus:ring-0 focus:border-0" />
          <button type="button" onClick={()=>setQ('')} className="px-4 border-l border-line text-xs font-bold text-muted hover:text-ink shrink-0" aria-label="Clear search">Clear</button>
        </div>
        <div className="flex gap-2 flex-wrap sm:ml-auto" role="group" aria-label="Filter by type">
          {['all','made_to_order','digital','physical'].map(f=> <button key={f} onClick={()=>setFilter(f)} aria-pressed={filter===f} className={chip(filter===f)}>{f==='all'?'All': f==='made_to_order'?'Made to order': f==='digital'?'SVG': f}</button>)}
        </div>
      </div>
      {/* Florist discovery: bloom / colour / occasion chips (shareable via URL) */}
      {(flowerTypes.length > 0 || colourFamilies.length > 0 || occasions.length > 0) && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
            <FloristGroup label="Bloom" options={flowerTypes} value={flowerType} set={setFlowerType} />
            <FloristGroup label="Colour" options={colourFamilies} value={colourFamily} set={setColourFamily} />
            <FloristGroup label="Occasion" options={occasions} value={occasion} set={setOccasion} />
            {floristActive && <button onClick={()=>{ setFlowerType(''); setColourFamily(''); setOccasion(''); }} className="text-[11px] text-highlight font-semibold underline">Reset filters</button>}
          </div>
        </div>
      )}
      {error && <Alert tone="danger" className="mt-4">Failed to load products: {error} <button onClick={()=>{ setQ(q); }} className="ml-2 underline font-semibold">Retry</button></Alert>}
      {loading ? (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({length:10}).map((_,i)=><div key={i} className="bg-surface2 rounded-2xl overflow-hidden border animate-pulse"><div className="h-44 md:h-52 bg-surface"/><div className="p-3 space-y-2"><div className="h-4 bg-surface rounded"/><div className="h-3 bg-surface rounded w-2/3"/></div></div>)}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {shown.map(p=> (
            <ProductCard key={p.id} p={p} showCricut={s.show_cricut === '1'} />
          ))}
        </div>
      )}
      <div className="mt-6 flex justify-between items-center text-sm">
        <span className="text-muted">{shown.length} blooms{pageSize > 0 && sorted.length > shown.length ? ` of ${sorted.length}` : ''}</span>
        <span className="text-muted hidden md:inline">Configurator for custom blooms</span>
      </div>
      {shown.length===0 && !loading && !error && (floristActive
        ? <EmptyState className="mt-6" title="No blooms match these filters" body="Try fewer selections." action={<Btn size="md" onClick={()=>{ setFlowerType(''); setColourFamily(''); setOccasion(''); }}>Clear filters</Btn>} />
        : <EmptyState className="mt-6" title="No blooms yet" body="New pieces land here first — check back soon or design your own." action={<Btn to="/configurator" size="md">Open the configurator</Btn>} />)}
    </Page>
  );
}
