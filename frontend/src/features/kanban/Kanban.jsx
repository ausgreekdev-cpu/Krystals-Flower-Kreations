import { useEffect, useState } from 'react';
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable, useDraggable } from '@dnd-kit/core';

const STATES = ['drafting_proofing','cricut_cutting','hand_folding_assembly','quality_check','dispatched_pickup_ready'];
const LABEL = { drafting_proofing:'Drafting/Proofing', cricut_cutting:'Cricut Cutting', hand_folding_assembly:'Hand Folding', quality_check:'Quality Check', dispatched_pickup_ready:'Dispatched/Pickup Ready' };
const STATE_HINT = {
  drafting_proofing: 'Next: Cricut Cutting — deducts BOM (cardstock/wire/tape)',
  cricut_cutting: 'Next: Hand Folding & Assembly',
  hand_folding_assembly: 'Next: Quality Check',
  quality_check: 'Next: Dispatched / Pickup Ready — generates QR done',
};

function DraggableCard({ order, onCheckIn }){
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: order.id, data: { order } });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 10 : 1 } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="border rounded-xl p-3 bg-white cursor-grab active:cursor-grabbing hover:shadow">
      <div className="font-bold text-sm">{order.orderNumber}</div>
      <div className="text-xs text-gray-600">{order.customerName} • {order.spec?.paperColor} • {order.spec?.stemCount} stems</div>
      <div className="text-xs mt-1">${Number(order.totalPrice).toFixed(2)} • {order.estimatedMinutes}m • {order.spec?.armatureHeightMm}mm</div>
      {order.ticket?.qrPayload && <div className="text-[10px] font-mono bg-gray-100 rounded px-2 py-1 mt-1 break-all">{order.ticket.qrPayload}</div>}
      <div className="flex gap-1 mt-2 flex-wrap" onPointerDown={e=>e.stopPropagation()}>
        {order.ticket?.qrPayload && <button onClick={()=>onCheckIn(order.ticket.qrPayload)} className="text-xs border px-2 py-1 rounded hover:bg-bloom-50">QR Check-in</button>}
      </div>
    </div>
  );
}
function DroppableColumn({ state, orders, onCheckIn, onMove }){
  const { setNodeRef, isOver } = useDroppable({ id: state });
  const safeOrders = Array.isArray(orders) ? orders : [];
  return (
    <div ref={setNodeRef} className={`bg-white rounded-2xl border p-3 min-h-[200px] ${isOver?'bg-bloom-50 border-bloom-200':''}`}>
      <div className="flex justify-between items-center"><h3 className="font-bold text-xs text-bloom-700">{LABEL[state]}</h3><span className="text-[11px] bg-gray-100 rounded-full px-2 py-0.5">{safeOrders.length}</span></div>
      <div className="text-[11px] text-gray-500 mt-1">{STATE_HINT[state]||''}</div>
      <div className="mt-3 space-y-3">
        {(safeOrders).map(o=> <DraggableCard key={o.id} order={o} onCheckIn={onCheckIn} />)}
        {safeOrders.length===0 && <div className="text-xs text-gray-400 py-6 text-center border-2 border-dashed rounded-xl">Drop here</div>}
      </div>
      {/* Fallback button for non-drag */}
      <div className="mt-2 flex flex-col gap-1">
        {safeOrders.slice(0,2).map(o=>{
          const nextIdx = STATES.indexOf(state)+1;
          const next = STATES[nextIdx];
          return next ? <button key={o.id} onClick={()=>onMove(o.id, next)} className="text-[11px] bg-bloom-500 text-white px-2 py-1 rounded">→ {LABEL[next]}</button> : null;
        })}
      </div>
    </div>
  );
}

export default function Kanban(){
  const [orders,setOrders]=useState([]);
  const [filter,setFilter]=useState('all');
  const [error,setError]=useState('');
  const [toast,setToast]=useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 }}), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 }}));
  async function load(){
    const token = localStorage.getItem('token') || '';
    const res = await fetch(`${(import.meta.env.VITE_API_URL||'')}/api/custom-orders`, { headers: token? {Authorization:`Bearer ${token}`}:{} });
    if(res.ok) {
      const d = await res.json();
      setOrders(Array.isArray(d) ? d : (Array.isArray(d.orders) ? d.orders : []));
    } else { const j=await res.json().catch(()=>({error:res.statusText, code:res.status})); setError(`${j.code||res.status}: ${j.error}`); }
  }
  useEffect(()=>{ load(); }, []);
  async function move(id, state){
    const token = localStorage.getItem('token') || '';
    const res = await fetch(`${(import.meta.env.VITE_API_URL||'')}/api/custom-orders/${id}/state`, { method:'PATCH', headers:{'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{})}, body: JSON.stringify({state}) });
    if(!res.ok){
      const j=await res.json().catch(()=>({error:res.statusText, code: 'unknown'}));
      const msg = j.code ? `${j.code}: ${j.error}` : j.error;
      setError(`${msg} — DoD: ${state} requires previous state, or BOM out_of_stock (422)`);
      return;
    }
    setError(''); setToast(`Moved to ${LABEL[state]}`);
    setTimeout(()=>setToast(''), 3000);
    load();
  }
  async function handleDragEnd(event){
    const { active, over } = event;
    if(!over || active.id===over.id) return;
    const targetState = over.id;
    if(!STATES.includes(targetState)) return;
    const dragged = orders.find(o=>o.id===active.id);
    if(!dragged || dragged.state===targetState) return;
    await move(active.id, targetState);
  }
  async function checkIn(qrPayload){
    const token = localStorage.getItem('token') || '';
    const res = await fetch(`${(import.meta.env.VITE_API_URL||'')}/api/tickets/check-in`, { method:'POST', headers:{'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{})}, body: JSON.stringify({qrPayload}) });
    const j=await res.json().catch(()=>({}));
    if(res.ok) { setToast(`Checked in ${qrPayload}`); setTimeout(()=>setToast(''), 3000); load(); } else setError(j.error||'Check-in failed');
  }
  const ordersArr = Array.isArray(orders) ? orders : [];
  const filtered = filter==='all'? ordersArr : ordersArr.filter(o=>o.state===filter);
  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="max-w-7xl mx-auto p-6">
        <h1 className="text-2xl font-black text-bloom-700">Custom Order Kanban — Admin</h1>
        <p className="text-xs text-gray-500 mt-1">Drag cards between columns (DoD enforced: 409 if skipping, 422 if BOM out_of_stock). Tap QR Check-in at POS.</p>
        {toast && <div className="mt-3 bg-green-50 border border-green-200 text-green-700 rounded-xl p-3 text-xs">{toast}</div>}
        {error && <div className="mt-3 bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-xs">{error} <button onClick={()=>setError('')} className="ml-2 underline">Dismiss</button></div>}
        <div className="flex gap-2 mt-3 flex-wrap">{['all',...STATES].map(s=> <button key={s} onClick={()=>setFilter(s)} className={`px-3 py-1 rounded-full text-xs border ${filter===s?'bg-bloom-500 text-white':'bg-white'}`}>{s==='all'?'All':LABEL[s]}</button>)}</div>
        {filter!=='all' ? (
          <div className="mt-6 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(o=> <DraggableCard key={o.id} order={o} onCheckIn={checkIn} />)}
            {filtered.length===0 && <div className="text-xs text-gray-400">No orders in {LABEL[filter]}</div>}
          </div>
        ) : (
          <div className="mt-6 grid md:grid-cols-5 gap-4">
            {STATES.map(state=> <DroppableColumn key={state} state={state} orders={filtered.filter(o=>o.state===state)} onCheckIn={checkIn} onMove={move} />)}
          </div>
        )}
      </div>
    </DndContext>
  );
}
