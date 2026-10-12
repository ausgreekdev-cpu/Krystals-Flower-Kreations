import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Page, PageHeader, Breadcrumbs } from '../components/ui/Page';
import Btn from '../components/ui/Btn';

export default function Loyalty(){
  const [me,setMe]=useState(null); const [board,setBoard]=useState([]);
  async function load(){
    const token = localStorage.getItem('token') || '';
    // leaderboard public
    fetch(`${(import.meta.env.VITE_API_URL||'')}/api/loyalty/leaderboard`).then(r=>r.json()).then(d=> setBoard(Array.isArray(d)?d: (Array.isArray(d.board)?d.board:[]))).catch(()=> setBoard([]));
    if(!token) return;
    const res = await fetch(`${(import.meta.env.VITE_API_URL||'')}/api/loyalty/me`, { headers:{ Authorization:`Bearer ${token}` } });
    if(res.ok) setMe(await res.json());
  }
  useEffect(()=>{ load(); }, []);
  const tierColor = { seedling:'bg-success-50 text-success-800 border border-success-200', blossom:'bg-bloom-50 text-bloom-800 border border-bloom-200', garden:'bg-surface3 text-ink border' };
  return (
    <Page>
      <PageHeader crumbs={<Breadcrumbs items={[{label:'Bloom Points'}]} />} title="Bloom Points" lede="Earn 1 pt per $1 — plus extras for reviews, referrals and daily visits. Redeem points for $ off orders." />
      <div className="bg-surface2 border rounded-2xl p-6 mt-6">
        {!me ? <div className="text-sm text-muted">Sign in to see your points. <Link to="/login" className="underline text-highlight">Sign in</Link> or continue as guest for leaderboard.</div> : (
          <div>
            <div className="flex flex-wrap justify-between items-center gap-2"><span className="font-bold text-ink">{me.email}</span><span className={`px-3 py-1 rounded-full text-xs font-bold ${tierColor[me.tier]||'bg-surface3 border'}`}>{me.tier} • {me.points} pts</span></div>
            <div className="mt-3 text-xs text-muted">Tiers: seedling 0 → blossom 100 → garden 500. Redeem 100 pts = $5 off. Garden members get early access to new drops.</div>
            <div className="mt-4 space-y-2 max-h-40 overflow-auto">
              {(Array.isArray(me.transactions)?me.transactions:[]).map(t=> <div key={t.id} className="flex justify-between text-xs border-b py-1"><span>{t.reason}</span><span className={t.pointsDelta>0?'text-success-800':'text-danger-800'}>{t.pointsDelta>0?'+':''}{t.pointsDelta}</span></div>)}
              {(!me.transactions||(Array.isArray(me.transactions) && me.transactions.length===0)) && <div className="text-xs text-muted">No transactions yet — earn with first order.</div>}
            </div>
          </div>
        )}
      </div>
      <div className="bg-bloom-700 text-white rounded-2xl p-6 mt-6">
        <h3 className="font-bold">Leaderboard — Top 10</h3>
        <div className="mt-3 space-y-1">
          {(Array.isArray(board)?board:[]).map((b,i)=> <div key={i} className="flex justify-between text-sm bg-white/10 rounded-xl px-3 py-2"><span>#{i+1} {b.email}</span><span>{b.points} pts • {b.tier}</span></div>)}
          {(!Array.isArray(board) || board.length===0) && <div className="text-xs opacity-70">No points yet — be first.</div>}
        </div>
      </div>
      <div className="bg-surface2 border rounded-2xl p-6 mt-6">
        <h3 className="font-bold text-sm">How to earn</h3>
        <ul className="text-xs text-muted list-disc pl-4 mt-2 space-y-1">
          <li>Purchase: 1 pt per $1 once your order is paid</li>
          <li>Review photo: 10 pts when your review is approved</li>
          <li>Referral: share your code — 20 pts when a friend orders</li>
          <li>Streak: open the shop 7 days in a row → 15 pts</li>
        </ul>
        <Btn to="/login" variant="soft" size="md" className="mt-4">Sign in to start earning</Btn>
      </div>
    </Page>
  );
}
