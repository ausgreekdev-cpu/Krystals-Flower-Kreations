import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export default function Shop(){
  const [q,setQ]=useState(new URLSearchParams(window.location.search).get('q') || ''); const [products,setProducts]=useState([]); const [filter,setFilter]=useState('all'); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
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
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div><h1 className="text-2xl md:text-3xl font-black text-bloom-700">Shop — paper blooms & armature art</h1><p className="text-sm text-gray-600 mt-1">Perth studio • Made-to-order 3-7 days • Free Perth delivery over $150</p></div>
        <div className="flex gap-2 flex-wrap">
          {['all','made_to_order','digital','physical'].map(f=> <button key={f} onClick={()=>setFilter(f)} className={`px-3 py-1.5 rounded-full text-xs border ${filter===f?'bg-bloom-500 text-white border-bloom-500':'bg-white hover:bg-bloom-50'}`}>{f==='all'?'All': f==='made_to_order'?'Made to order': f==='digital'?'SVG': f}</button>)}
        </div>
      </div>
      <div className="mt-6 flex gap-3">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search — rose, banksia, Cricut…" className="flex-1 border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-bloom-500/20" />
        <button onClick={()=>setQ('')} className="hidden sm:block border rounded-xl px-4 text-sm hover:bg-gray-50">Clear</button>
      </div>
      {loading ? (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({length:10}).map((_,i)=><div key={i} className="bg-white rounded-2xl overflow-hidden border animate-pulse"><div className="h-44 md:h-52 bg-bloom-50"/><div className="p-3 space-y-2"><div className="h-4 bg-bloom-50 rounded"/><div className="h-3 bg-bloom-50 rounded w-2/3"/></div></div>)}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map(p=> (
            <Link key={p.id} to={`/product/${p.slug}`} className="bg-white rounded-2xl overflow-hidden border hover:shadow-lg hover:border-bloom-100 transition group">
              <div className="relative overflow-hidden"><img loading="lazy" decoding="async" src={p.images?.[0]?.url || `/placeholder-bloom.jpg`} alt={p.title} width="400" height="400" className="h-44 md:h-52 w-full object-cover group-hover:scale-105 transition duration-300" onError={(e)=>{ e.currentTarget.src='/placeholder-bloom.jpg'; }} /><span className="absolute top-2 left-2 bg-white/90 backdrop-blur text-[10px] font-bold px-2 py-1 rounded-full">{p.stockMode==='made_to_order'?'Made to order': p.type==='digital_template'?'SVG • Instant':'In stock'}</span></div>
              <div className="p-3">
                <div className="font-bold text-bloom-700 line-clamp-2 text-sm md:text-[15px] leading-tight">{p.title}</div>
                <div className="text-bloom-500 font-bold mt-1.5">${Number(p.price).toFixed(2)} <span className="text-xs font-normal text-gray-500">AUD</span></div>
                <div className="text-xs text-gray-500 mt-1">{p.paperStock || 'Canson 65lb'} {p.cricutCompatible && '• Cricut'}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
      {error && <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs">Failed to load products: {error} <button onClick={()=>{ setQ(q); }} className="ml-2 underline">Retry</button></div>}
      <div className="mt-6 flex justify-between items-center text-sm">
        <span className="text-gray-600">{filtered.length} blooms</span>
        <span className="text-gray-500 hidden md:inline">Optimised for desktop — hover for zoom • Configurator for custom</span>
      </div>
      {filtered.length===0 && !loading && !error && <p className="text-center text-gray-500 mt-8 py-12 bg-white border rounded-2xl">No blooms yet — seed the backend and refresh.</p>}
    </div>
  );
}
