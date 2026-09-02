import { useEffect, useState } from 'react';

const TABS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'orders', label: 'Orders', icon: '🧾' },
  { id: 'inventory', label: 'Inventory', icon: '📦' },
  { id: 'products', label: 'Products', icon: '🌹' },
  { id: 'pos', label: 'POS', icon: '💳' },
  { id: 'workshops', label: 'Workshops', icon: '🎨' },
  { id: 'users', label: 'Users', icon: '👥' },
  { id: 'reports', label: 'Reports', icon: '📈' },
];

export default function AdminStudio(){
  const params = new URLSearchParams(window.location.search);
  const initial = params.get('tab') || 'overview';
  const [tab,setTab]=useState(initial);
  const [data,setData]=useState({}); const [loading,setLoading]=useState(false);
  const token = localStorage.getItem('token') || '';
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  async function load(tabId){
    setLoading(true);
    try{
      if(tabId==='overview'){
        const [orders, low, workshops] = await Promise.all([
          fetch('/api/orders', { headers: authHeader }).then(r=> r.ok?r.json():[]).catch(()=>[]),
          fetch('/api/bom/low-stock', { headers: authHeader }).then(r=> r.ok?r.json():[]).catch(()=>[]),
          fetch('/api/workshops').then(r=>r.json()).catch(()=>[]),
        ]);
        setData(s=> ({...s, orders, low, workshops}));
      } else if(tabId==='orders'){
        const orders = await fetch('/api/orders', { headers: authHeader }).then(r=> r.ok?r.json():[]).catch(()=>[]);
        setData(s=> ({...s, orders}));
      } else if(tabId==='inventory'){
        const [levels, low, materials] = await Promise.all([
          fetch('/api/inventory/levels', { headers: authHeader }).then(r=> r.ok?r.json():[]).catch(()=>[]),
          fetch('/api/bom/low-stock', { headers: authHeader }).then(r=> r.ok?r.json():[]).catch(()=>[]),
          fetch('/api/materials', { headers: authHeader }).then(r=> r.ok?r.json():[]).catch(()=>[]),
        ]);
        setData(s=> ({...s, levels, low, materials}));
      } else if(tabId==='products'){
        const res = await fetch('/api/products?limit=50').then(r=>r.json()).catch(()=>({products:[]}));
        setData(s=> ({...s, products: res.products || res}));
      } else if(tabId==='pos'){
        const sess = await fetch('/api/pos/session/current', { headers: authHeader }).then(r=> r.ok?r.json():null).catch(()=>null);
        setData(s=> ({...s, posSession: sess}));
      } else if(tabId==='workshops'){
        const workshops = await fetch('/api/workshops').then(r=>r.json()).catch(()=>[]);
        setData(s=> ({...s, workshops}));
      } else if(tabId==='users'){
        const users = await fetch('/api/users', { headers: authHeader }).then(r=> r.ok?r.json():[]).catch(()=>[]);
        setData(s=> ({...s, users}));
      } else if(tabId==='reports'){
        const stats = await fetch('/api/loyalty/leaderboard').then(r=>r.json()).catch(()=>[]);
        setData(s=> ({...s, leaderboard: stats}));
      }
    } finally{ setLoading(false); }
  }

  useEffect(()=>{ load(tab); window.history.replaceState(null,'',`?tab=${tab}`); }, [tab]);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-black text-bloom-700">Studio Manager — Admin</h1>
        <a href="/api/health" target="_blank" className="text-xs border rounded-full px-3 py-1 hover:bg-bloom-50">Health</a>
      </div>
      <div className="mt-6 flex flex-col lg:flex-row gap-6">
        <nav className="lg:w-56 shrink-0 flex lg:flex-col gap-2 overflow-auto">
          {TABS.map(t=> <button key={t.id} onClick={()=>setTab(t.id)} className={`px-4 py-2 rounded-xl text-sm font-bold text-left border ${tab===t.id?'bg-bloom-500 text-white border-bloom-500':'bg-white hover:bg-bloom-50'}`}>{t.icon} {t.label}</button>)}
        </nav>
        <div className="flex-1 min-w-0 bg-white border rounded-2xl p-6">
          {loading ? <div className="animate-pulse bg-bloom-50 h-32 rounded-xl"/> : (
            <>
              {tab==='overview' && <Overview data={data} />}
              {tab==='orders' && <Orders data={data} />}
              {tab==='inventory' && <Inventory data={data} />}
              {tab==='products' && <Products data={data} />}
              {tab==='pos' && <POS data={data} />}
              {tab==='workshops' && <Workshops data={data} />}
              {tab==='users' && <Users data={data} />}
              {tab==='reports' && <Reports data={data} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Overview({data}){
  const orders = data.orders || []; const low = data.low || []; const workshops = data.workshops || [];
  const todayOrders = orders.filter(o=> new Date(o.createdAt).toDateString()===new Date().toDateString()).length;
  const revenueToday = orders.filter(o=> new Date(o.createdAt).toDateString()===new Date().toDateString()).reduce((a,o)=> a+Number(o.total||0),0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Orders today" value={todayOrders} />
        <Stat label="Revenue today" value={`$${revenueToday.toFixed(2)}`} />
        <Stat label="Low stock" value={low.length} warn={low.length>0} />
        <Stat label="Workshops" value={workshops.length} />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="border rounded-xl p-4">
          <h3 className="font-bold text-sm">Recent orders</h3>
          <div className="mt-2 space-y-2">{orders.slice(0,5).map(o=> <div key={o.id} className="flex justify-between text-xs border-b py-1"><span>{o.orderNumber} • {o.email}</span><span>${Number(o.total).toFixed(2)}</span></div>)}{orders.length===0 && <div className="text-xs text-gray-400">No orders yet</div>}</div>
        </div>
        <div className="border rounded-xl p-4">
          <h3 className="font-bold text-sm">Low stock alert</h3>
          <div className="mt-2 space-y-1">{low.slice(0,5).map(m=> <div key={m.id} className="text-xs flex justify-between"><span>{m.name}</span><span className="text-amber-600">{m.onHand}/{m.lowThreshold}</span></div>)}{low.length===0 && <div className="text-xs text-gray-400">All stocked</div>}</div>
        </div>
      </div>
    </div>
  );
}
function Stat({label,value,warn}){ return <div className={`p-4 rounded-xl border ${warn?'bg-amber-50 border-amber-200':'bg-bloom-50 border-bloom-100'}`}><div className="text-xs text-gray-600">{label}</div><div className="text-xl font-black text-bloom-700">{value}</div></div>; }
function Orders({data}){ const orders=data.orders||[]; return <div><h3 className="font-bold">Orders — {orders.length}</h3><div className="mt-3 max-h-[400px] overflow-auto space-y-2">{orders.map(o=> <div key={o.id} className="flex justify-between text-xs border rounded-xl p-2"><span>{o.orderNumber} — {o.status} — {o.paymentStatus}</span><span>${Number(o.total).toFixed(2)}</span></div>)}{orders.length===0 && <div className="text-xs text-gray-400">No orders — check auth (maker+ token required)</div>}</div></div>; }
function Inventory({data}){ const levels=data.levels||[]; const low=data.low||[]; return <div><h3 className="font-bold">Inventory — {levels.length} levels, {low.length} low</h3><div className="mt-3 max-h-[400px] overflow-auto space-y-1">{levels.slice(0,20).map(l=> <div key={l.id} className="flex justify-between text-xs border rounded-lg p-2"><span>{l.product?.title || l.productId} {l.variant?`— ${l.variant.title}`:''} @ {l.location?.name}</span><span className={l.onHand<=5?'text-red-600':''}>{l.onHand}</span></div>)}{levels.length===0 && <div className="text-xs text-gray-400">No levels — seed inventory</div>}</div></div>; }
function Products({data}){ const products=data.products||[]; return <div><h3 className="font-bold">Products — {products.length}</h3><div className="mt-3 grid sm:grid-cols-2 gap-3">{products.map(p=> <div key={p.id} className="border rounded-xl p-3"><div className="font-bold text-sm text-bloom-700">{p.title}</div><div className="text-xs text-gray-500">{p.sku} • ${Number(p.price).toFixed(2)} • {p.stockMode}</div><div className="text-xs text-gray-400">{p.variants?.length||0} variants • {p.images?.length||0} images</div></div>)}{products.length===0 && <div className="text-xs text-gray-400">No products</div>}</div></div>; }
function POS({data}){ const s=data.posSession; return <div><h3 className="font-bold">POS — Till</h3>{s ? <div className="mt-3 border rounded-xl p-4"><div className="font-bold text-sm">{s.location} — {s.status}</div><div className="text-xs text-gray-600">Opened {new Date(s.openedAt).toLocaleString()} • Float ${Number(s.openingCash).toFixed(2)} • {s.payments?.length||0} payments</div></div> : <div className="text-xs text-gray-400 mt-3">No open till — open via /pos</div>}<div className="mt-3 text-xs text-gray-500">Use POS page for sales — offline queue IndexedDB krystal-offline</div></div>; }
function Workshops({data}){ const w=data.workshops||[]; return <div><h3 className="font-bold">Workshops — {w.length}</h3><div className="mt-3 space-y-2">{w.map(ws=> <div key={ws.id} className="border rounded-xl p-3"><div className="font-bold text-sm">{ws.title}</div><div className="text-xs text-gray-500">{ws.location} • {ws.capacity} cap • ${Number(ws.price).toFixed(2)}</div><div className="text-xs text-gray-400">{ws.sessions?.length||0} sessions</div></div>)}{w.length===0 && <div className="text-xs text-gray-400">No workshops</div>}</div></div>; }
function Users({data}){ const users=data.users||[]; return <div><h3 className="font-bold">Users — {users.length}</h3><div className="text-xs text-gray-500">Requires developer role — if 403, login as admin@krystal.local / admin123 (seed)</div><div className="mt-3 space-y-1 max-h-[300px] overflow-auto">{users.map(u=> <div key={u.id} className="flex justify-between text-xs border rounded-lg p-2"><span>{u.name} • {u.email}</span><span className="bg-gray-100 rounded-full px-2 py-0.5">{u.role}</span></div>)}</div></div>; }
function Reports({data}){ const board=data.leaderboard||[]; return <div><h3 className="font-bold">Reports — Loyalty Leaderboard</h3><div className="mt-3 space-y-1">{board.map((b,i)=> <div key={i} className="flex justify-between text-xs border rounded-lg p-2"><span>#{i+1} {b.email}</span><span>{b.points} pts • {b.tier}</span></div>)}{board.length===0 && <div className="text-xs text-gray-400">No points yet</div>}</div></div>; }
