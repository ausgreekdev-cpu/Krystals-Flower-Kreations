import { useEffect, useState } from 'react';

const STATES = ['drafting_proofing','cricut_cutting','hand_folding_assembly','quality_check','dispatched_pickup_ready'];
const LABEL = { drafting_proofing:'Drafting/Proofing', cricut_cutting:'Cricut Cutting', hand_folding_assembly:'Hand Folding', quality_check:'Quality Check', dispatched_pickup_ready:'Dispatched/Pickup Ready' };

export default function Kanban(){
  const [orders,setOrders]=useState([]);
  const [filter,setFilter]=useState('all');
  async function load(){
    const token = localStorage.getItem('token') || '';
    const res = await fetch(`http://localhost:3001/api/custom-orders`, { headers: token? {Authorization:`Bearer ${token}`}:{} });
    if(res.ok) setOrders(await res.json());
  }
  useEffect(()=>{ load(); }, []);
  async function move(id, state){
    const token = localStorage.getItem('token') || '';
    const res = await fetch(`http://localhost:3001/api/custom-orders/${id}/state`, { method:'PATCH', headers:{'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{})}, body: JSON.stringify({state}) });
    if(!res.ok){ const j=await res.json().catch(()=>({error:res.statusText})); alert(j.error); }
    load();
  }
  async function checkIn(qrPayload){
    const token = localStorage.getItem('token') || '';
    const res = await fetch(`http://localhost:3001/api/tickets/check-in`, { method:'POST', headers:{'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{})}, body: JSON.stringify({qrPayload}) });
    const j=await res.json().catch(()=>({}));
    alert(res.ok? `Checked in ${qrPayload}` : (j.error||'Check-in failed'));
  }
  const filtered = filter==='all'? orders : orders.filter(o=>o.state===filter);
  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-black text-bloom-700">Custom Order Kanban — Admin</h1>
      <div className="flex gap-2 mt-3 flex-wrap">{['all',...STATES].map(s=> <button key={s} onClick={()=>setFilter(s)} className={`px-3 py-1 rounded-full text-xs border ${filter===s?'bg-bloom-500 text-white':'bg-white'}`}>{s==='all'?'All':LABEL[s]}</button>)}</div>
      <div className="mt-6 grid md:grid-cols-5 gap-4">
        {STATES.map(state=> (
          <div key={state} className="bg-white rounded-2xl border p-3">
            <h3 className="font-bold text-xs text-bloom-700">{LABEL[state]}</h3>
            <div className="mt-3 space-y-3">
              {filtered.filter(o=>o.state===state).map(o=> (
                <div key={o.id} className="border rounded-xl p-3">
                  <div className="font-bold text-sm">{o.orderNumber}</div>
                  <div className="text-xs text-gray-600">{o.customerName} • {o.spec?.paperColor} • {o.spec?.stemCount} stems</div>
                  <div className="text-xs mt-1">${Number(o.totalPrice).toFixed(2)} • {o.estimatedMinutes}m</div>
                  {o.ticket?.qrPayload && <div className="text-[10px] font-mono bg-gray-100 rounded px-2 py-1 mt-1 break-all">{o.ticket.qrPayload}</div>}
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {STATES[STATES.indexOf(state)+1] && <button onClick={()=>move(o.id, STATES[STATES.indexOf(state)+1])} className="text-xs bg-bloom-500 text-white px-2 py-1 rounded">→ {LABEL[STATES[STATES.indexOf(state)+1]]}</button>}
                    {o.ticket?.qrPayload && <button onClick={()=>checkIn(o.ticket.qrPayload)} className="text-xs border px-2 py-1 rounded">QR Check-in</button>}
                  </div>
                </div>
              ))}
              {filtered.filter(o=>o.state===state).length===0 && <div className="text-xs text-gray-400">No orders</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
