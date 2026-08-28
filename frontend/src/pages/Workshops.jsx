import { useEffect, useState } from 'react';
export default function Workshops(){
  const [items,setItems]=useState([]);
  useEffect(()=>{ fetch('/api/workshops').then(r=>r.json()).then(setItems).catch(()=>{}); }, []);
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-black text-bloom-700">Workshops — Perth Studio</h1>
      <p className="text-gray-600 mt-2">Cricut Blooms 101, Origami Bouquet & Armature Art. Max 12, kits included.</p>
      <div className="mt-6 grid gap-4">
        {items.map(w=> (
          <div key={w.id} className="bg-white p-6 rounded-2xl border">
            <h3 className="font-bold text-bloom-700">{w.title}</h3>
            <p className="text-sm text-gray-600 mt-2">{w.description}</p>
            <div className="text-sm font-bold text-bloom-500 mt-2">${Number(w.price).toFixed(2)} • {w.durationMinutes} min</div>
            <div className="mt-3 space-y-1">{w.sessions?.map(s=> <div key={s.id} className="text-xs bg-bloom-50 rounded-lg px-3 py-2">{new Date(s.startsAt).toLocaleString()} — {s.capacity - s.bookedCount} spots left</div>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
