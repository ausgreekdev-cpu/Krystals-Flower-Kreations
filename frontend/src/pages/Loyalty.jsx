import { useEffect, useState } from 'react';

export default function Loyalty(){
  const [me,setMe]=useState(null); const [board,setBoard]=useState([]);
  async function load(){
    const token = localStorage.getItem('token') || '';
    // leaderboard public
    fetch(`${(import.meta.env.VITE_API_URL||'')}/api/loyalty/leaderboard`).then(r=>r.json()).then(setBoard).catch(()=>{});
    if(!token) return;
    const res = await fetch(`${(import.meta.env.VITE_API_URL||'')}/api/loyalty/me`, { headers:{ Authorization:`Bearer ${token}` } });
    if(res.ok) setMe(await res.json());
  }
  useEffect(()=>{ load(); }, []);
  const tierColor = { seedling:'bg-green-100 text-green-700', blossom:'bg-pink-100 text-pink-700', garden:'bg-purple-100 text-purple-700' };
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-black text-bloom-700">Bloom Points — $0 Loyalty</h1>
      <p className="text-sm text-gray-600">1 pt per $1. Earn for review, referral, streak. No paid gamification — all free Postgres.</p>
      <div className="bg-white border rounded-2xl p-6">
        {!me ? <div className="text-sm text-gray-600">Login to see your points. <a href="/login" className="underline text-bloom-500">Login</a> or continue as guest for leaderboard.</div> : (
          <div>
            <div className="flex justify-between items-center"><span className="font-bold text-bloom-700">{me.email}</span><span className={`px-3 py-1 rounded-full text-xs font-bold ${tierColor[me.tier]||'bg-gray-100'}`}>{me.tier} • {me.points} pts</span></div>
            <div className="mt-3 text-xs text-gray-500">Tier: seedling 0 → blossom 100 → garden 500. Redeem 100 pts = $5 off. Garden gets early lamp drops.</div>
            <div className="mt-4 space-y-2 max-h-40 overflow-auto">
              {me.transactions?.map(t=> <div key={t.id} className="flex justify-between text-xs border-b py-1"><span>{t.reason}</span><span className={t.pointsDelta>0?'text-green-600':'text-red-600'}>{t.pointsDelta>0?'+':''}{t.pointsDelta}</span></div>)}
              {(!me.transactions||me.transactions.length===0) && <div className="text-xs text-gray-400">No transactions yet — earn with first order.</div>}
            </div>
          </div>
        )}
      </div>
      <div className="bg-bloom-700 text-white rounded-2xl p-6">
        <h3 className="font-bold">Leaderboard — Top 10 (free)</h3>
        <div className="mt-3 space-y-1">
          {board.map((b,i)=> <div key={i} className="flex justify-between text-sm bg-white/10 rounded-xl px-3 py-2"><span>#{i+1} {b.email}</span><span>{b.points} pts • {b.tier}</span></div>)}
          {board.length===0 && <div className="text-xs opacity-70">No points yet — be first.</div>}
        </div>
      </div>
      <div className="bg-white border rounded-2xl p-6">
        <h3 className="font-bold text-sm">How to earn (manual, $0)</h3>
        <ul className="text-xs text-gray-600 list-disc pl-4 mt-2 space-y-1">
          <li>Purchase: auto 1 pt per $1 on order paid (hook to Order status paid → earn)</li>
          <li>Review photo: staff awards 10 pts via POST /api/loyalty/earn</li>
          <li>Referral: share code, friend orders → 20 pts each</li>
          <li>Streak: open app 7 days → 15 pts</li>
        </ul>
      </div>
    </div>
  );
}
