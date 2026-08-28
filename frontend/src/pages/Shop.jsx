import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export default function Shop(){
  const [q,setQ]=useState(''); const [products,setProducts]=useState([]);
  useEffect(()=>{ fetch(`/api/products?q=${encodeURIComponent(q)}`).then(r=>r.json()).then(d=> setProducts(d.products||d)).catch(()=>{}); }, [q]);
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-black text-bloom-700">Shop — paper blooms & armature art</h1>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search — rose, banksia, cricut..." className="mt-4 w-full border rounded-xl px-4 py-3" />
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        {products.map(p=> (
          <Link key={p.id} to={`/product/${p.slug}`} className="bg-white rounded-2xl overflow-hidden border hover:shadow">
            <img src={p.images?.[0]?.url || `https://picsum.photos/seed/${p.slug}/400/400`} alt={p.title} className="h-44 w-full object-cover" />
            <div className="p-3">
              <div className="font-bold text-bloom-700 line-clamp-2">{p.title}</div>
              <div className="text-bloom-500 font-bold mt-1">${Number(p.price).toFixed(2)} AUD</div>
              <div className="text-xs text-gray-500">{p.stockMode==='made_to_order'?'Made to order': p.type==='digital_template'?'Digital SVG':'Perth • In stock'}</div>
            </div>
          </Link>
        ))}
      </div>
      {products.length===0 && <p className="text-center text-gray-500 mt-8">No blooms yet — seed the backend and refresh.</p>}
    </div>
  );
}
