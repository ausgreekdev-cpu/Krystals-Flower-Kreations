import { useEffect, useState } from 'react';
import { usePublicSettings } from '../lib/publicSettings';
import Breadcrumbs from '../components/layout/Breadcrumbs';
import Btn from '../components/ui/Btn';
import ProductCard from '../components/ProductCard';

export default function Shop(){
  const [q,setQ]=useState(new URLSearchParams(window.location.search).get('q') || ''); const [products,setProducts]=useState([]); const [filter,setFilter]=useState('all'); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
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
  const productsArr = Array.isArray(products) ? products : [];
  const filtered = filter==='all' ? productsArr : productsArr.filter(p=> filter==='made_to_order' ? p.stockMode==='made_to_order' : filter==='digital' ? p.type==='digital_template' : p.type===filter);
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
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Breadcrumbs items={[{label:'Shop'}]} />
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-ink">Shop — paper blooms & armature art</h1>
        <p className="text-sm text-muted mt-1">{subtitle}</p>
      </div>
      {/* Toolbar: search + filter chips directly under the heading (was a detached full-width row) */}
      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-3 flex-1 min-w-0 sm:max-w-md">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder={s.show_cricut === '1' ? 'Search — rose, banksia, Cricut…' : 'Search — rose, banksia, origami…'} aria-label="Search products" className="flex-1 min-w-0 border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-bloom-500/20" />
          <Btn variant="outline" size="inline" className="hidden sm:block" onClick={()=>setQ('')}>Clear</Btn>
        </div>
        <div className="flex gap-2 flex-wrap sm:ml-auto">
          {['all','made_to_order','digital','physical'].map(f=> <button key={f} onClick={()=>setFilter(f)} className={`px-3 py-1.5 rounded-full text-xs border ${filter===f?'bg-bloom-500 text-white border-bloom-500':'bg-surface2 hover:bg-surface3'}`}>{f==='all'?'All': f==='made_to_order'?'Made to order': f==='digital'?'SVG': f}</button>)}
        </div>
      </div>
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
      {error && <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs">Failed to load products: {error} <button onClick={()=>{ setQ(q); }} className="ml-2 underline">Retry</button></div>}
      <div className="mt-6 flex justify-between items-center text-sm">
        <span className="text-muted">{shown.length} blooms{pageSize > 0 && sorted.length > shown.length ? ` of ${sorted.length}` : ''}</span>
        <span className="text-muted hidden md:inline">Optimised for desktop — hover for zoom • Configurator for custom</span>
      </div>
      {shown.length===0 && !loading && !error && <p className="text-center text-muted mt-8 py-12 bg-surface2 border rounded-2xl">No blooms yet — seed the backend and refresh.</p>}
    </div>
  );
}
