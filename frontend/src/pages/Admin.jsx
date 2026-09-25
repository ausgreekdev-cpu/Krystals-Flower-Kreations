import { useEffect, useState } from 'react';
import { adminApi, authApi, getToken, clearSession } from '../lib/api/customClient';
import { ToastProvider, useToast } from '../components/admin/Toast';
import Modal from '../components/admin/Modal';
import ConfirmDialog from '../components/admin/ConfirmDialog';
import StatusBadge from '../components/admin/Badge';

const TABS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'orders', label: 'Orders', icon: '🧾' },
  { id: 'inventory', label: 'Inventory', icon: '📦' },
  { id: 'products', label: 'Products', icon: '🌹' },
  { id: 'recipes', label: 'Recipes', icon: '🧪' },
  { id: 'collections', label: 'Collections', icon: '🗂️' },
  { id: 'workshops', label: 'Workshops', icon: '🎨' },
  { id: 'bookings', label: 'Bookings', icon: '🎟️' },
  { id: 'reviews', label: 'Reviews', icon: '⭐' },
  { id: 'blog', label: 'Blog', icon: '📝' },
  { id: 'discounts', label: 'Discounts', icon: '🏷️' },
  { id: 'meta', label: 'Meta Sync', icon: '🔗' },
  { id: 'pos', label: 'POS', icon: '💳' },
  { id: 'customers', label: 'Customers', icon: '🧑' },
  { id: 'shipping', label: 'Shipping', icon: '🚚' },
  { id: 'users', label: 'Users', icon: '👥' },
  { id: 'reports', label: 'Reports', icon: '📈' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
  { id: 'notebook', label: 'Notebook', icon: '📓' },
];

const ORDER_FLOW = ['pending_payment', 'paid', 'making', 'ready', 'shipped', 'delivered'];

function AdminInner({ user }) {
  const params = new URLSearchParams(window.location.search);
  const [tab, setTab] = useState(params.get('tab') || 'overview');
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const token = getToken();

  async function load(tabId) {
    setLoading(true); setErr('');
    try {
      if (tabId === 'overview') {
        const [orders, low, workshops] = await Promise.all([
          adminApi.orders.list(token).catch(() => []),
          adminApi.materials.lowStock(token).catch(() => []),
          adminApi.workshops.list().catch(() => []),
        ]);
        setData((s) => ({ ...s, orders, low, workshops }));
      } else if (tabId === 'orders') {
        const orders = await adminApi.orders.list(token).catch(() => []);
        setData((s) => ({ ...s, orders }));
      } else if (tabId === 'inventory') {
        const [levels, materials, recon, locations, movements] = await Promise.all([
          adminApi.inventory.levels(token).catch(() => []),
          adminApi.materials.list(token).catch(() => []),
          adminApi.inventory.reconciliation(token).catch(() => []),
          adminApi.inventory.locations(token).catch(() => []),
          adminApi.inventory.movements(token, 30).catch(() => []),
        ]);
        setData((s) => ({ ...s, levels, materials, recon, locations, movements }));
      } else if (tabId === 'customers') {
        const customers = await adminApi.customers.list(token).catch(() => []);
        setData((s) => ({ ...s, customers }));
      } else if (tabId === 'shipping') {
        const zones = await adminApi.shipping.list(token).catch(() => []);
        setData((s) => ({ ...s, zones }));
      } else if (tabId === 'products') {
        const products = (await adminApi.products.list(token).catch(() => ({ products: [] }))).products || [];
        setData((s) => ({ ...s, products }));
      } else if (tabId === 'recipes') {
        const [recipes, materials, products] = await Promise.all([
          adminApi.bom.recipes(token).catch(() => []),
          adminApi.materials.list(token).catch(() => []),
          adminApi.products.list(token).catch(() => ({ products: [] })),
        ]);
        setData((s) => ({ ...s, recipes, materials, products: products.products || products }));
      } else if (tabId === 'collections') {
        const [collections, products] = await Promise.all([
          adminApi.collections.list(token).catch(() => []),
          adminApi.products.list(token).catch(() => ({ products: [] })),
        ]);
        setData((s) => ({ ...s, collections, products: products.products || products }));
      } else if (tabId === 'meta') {
        const meta = await adminApi.meta.status(token).catch(() => ({}));
        setData((s) => ({ ...s, meta }));
      } else if (tabId === 'workshops') {
        const workshops = await adminApi.workshops.list().catch(() => []);
        setData((s) => ({ ...s, workshops }));
      } else if (tabId === 'bookings') {
        const bookings = await adminApi.bookings.list(token).catch(() => []);
        setData((s) => ({ ...s, bookings }));
      } else if (tabId === 'discounts') {
        const discounts = await adminApi.discounts.list(token).catch(() => []);
        setData((s) => ({ ...s, discounts }));
      } else if (tabId === 'reviews') {
        const reviews = await adminApi.reviews.pending(token).catch(() => []);
        setData((s) => ({ ...s, reviews }));
      } else if (tabId === 'blog') {
        const posts = await adminApi.posts.list(token).catch(() => []);
        setData((s) => ({ ...s, posts }));
      } else if (tabId === 'pos') {
        const [posSession, posSessions, posSales] = await Promise.all([
          adminApi.pos.current(token).catch(() => null),
          adminApi.pos.sessions(token).catch(() => []),
          adminApi.pos.sales(token).catch(() => []),
        ]);
        setData((s) => ({ ...s, posSession, posSessions, posSales }));
      } else if (tabId === 'users') {
        const users = await adminApi.users.list(token).catch(() => []);
        setData((s) => ({ ...s, users }));
      } else if (tabId === 'reports') {
        const leaderboard = await adminApi.loyalty.leaderboard().catch(() => []);
        setData((s) => ({ ...s, leaderboard }));
      } else if (tabId === 'settings') {
        const settings = await adminApi.settings.get().catch(() => ({}));
        setData((s) => ({ ...s, settings }));
      } else if (tabId === 'notebook') {
        const [settings, posts] = await Promise.all([
          adminApi.settings.get().catch(() => ({})),
          adminApi.notebook.posts().catch(() => []),
        ]);
        const url = settings.notebooklm_url || `https://notebooklm.google.com/notebook/459b06d5-2520-442a-ae3c-048b54c78902`;
        setData((s) => ({ ...s, notebookUrl: url, notebookPosts: Array.isArray(posts) ? posts : [] }));
      }
    } catch (e) { setErr(e?.message || 'Failed to load'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(tab); window.history.replaceState(null, '', `?tab=${tab}`); }, [tab]);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="flex">
        <aside className="w-56 shrink-0 bg-black min-h-screen p-4 hidden lg:block">
          <div className="flex items-center gap-2 px-2 py-3">
            <span className="w-9 h-9 rounded-xl bg-royal-600 flex items-center justify-center text-white font-black">K</span>
            <div>
              <div className="text-white font-black text-sm leading-tight">Studio Manager</div>
              <div className="text-white/50 text-[10px]">Admin Console</div>
            </div>
          </div>
          <nav className="mt-4 space-y-1">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold text-left transition-colors ${tab === t.id ? 'bg-royal-600 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
          </nav>
          <div className="mt-6 border-t border-white/10 pt-4 px-2">
            <div className="text-white text-xs font-semibold truncate">{user?.name || user?.email}</div>
            <div className="text-white/50 text-[10px] truncate">{user?.email} • {user?.role}</div>
            <button onClick={signOut} className="mt-2 text-xs text-white/70 hover:text-white underline">Sign out</button>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between lg:hidden">
            <h1 className="font-black text-royal-700">Studio Manager</h1>
            <button onClick={signOut} className="text-xs border border-gray-300 rounded-full px-3 py-1.5 text-gray-600">Sign out</button>
          </header>
          <div className="p-4 lg:p-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <h1 className="text-2xl font-black text-gray-900">{TABS.find((t) => t.id === tab)?.label}</h1>
                <p className="text-xs text-gray-500 mt-0.5">Krystal's Flower Kreations — Perth WA studio</p>
              </div>
              <a href="/api/health" target="_blank" rel="noreferrer" className="text-xs border border-gray-300 rounded-full px-3 py-1.5 hover:bg-gray-50 text-gray-600">Health</a>
            </div>
            {err && <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{err}</div>}

            {/* mobile tab strip */}
            <div className="flex gap-1.5 overflow-x-auto mb-4 lg:hidden pb-1">
              {TABS.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${tab === t.id ? 'bg-royal-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>{t.icon} {t.label}</button>
              ))}
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-4 lg:p-6 shadow-sm min-h-[60vh]">
              {loading ? <Skeleton /> : (
                <>
                  {tab === 'overview' && <Overview data={data} onOpen={setTab} />}
                  {tab === 'orders' && <Orders data={data} reload={() => load('orders')} token={token} />}
                  {tab === 'inventory' && <Inventory data={data} reload={() => load('inventory')} token={token} />}
                  {tab === 'products' && <Products data={data} reload={() => load('products')} token={token} />}
                  {tab === 'recipes' && <Recipes data={data} reload={() => load('recipes')} token={token} />}
                  {tab === 'collections' && <Collections data={data} reload={() => load('collections')} token={token} />}
                  {tab === 'workshops' && <Workshops data={data} reload={() => load('workshops')} token={token} />}
                  {tab === 'meta' && <MetaSync data={data} reload={() => load('meta')} token={token} />}
                  {tab === 'bookings' && <Bookings data={data} reload={() => load('bookings')} token={token} />}
                  {tab === 'discounts' && <Discounts data={data} reload={() => load('discounts')} token={token} />}
                  {tab === 'reviews' && <Reviews data={data} reload={() => load('reviews')} token={token} />}
                  {tab === 'blog' && <Blog data={data} reload={() => load('blog')} token={token} />}
                  {tab === 'pos' && <POS data={data} reload={() => load('pos')} token={token} />}
                  {tab === 'customers' && <Customers data={data} reload={() => load('customers')} token={token} />}
                  {tab === 'shipping' && <Shipping data={data} reload={() => load('shipping')} token={token} />}
                  {tab === 'users' && <Users data={data} reload={() => load('users')} token={token} />}
                  {tab === 'reports' && <Reports data={data} />}
                  {tab === 'settings' && <Settings data={data} reload={() => load('settings')} token={token} />}
                  {tab === 'notebook' && <NotebookAdmin data={data} onSave={(url) => setData((s) => ({ ...s, notebookUrl: url }))} token={token} />}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const STAFF_ROLES = ['staff', 'maker', 'admin', 'developer'];

export default function AdminStudio() {
  const [user, setUser] = useState(undefined); // undefined = checking
  useEffect(() => {
    const token = getToken();
    const toLogin = () => window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    if (!token) { toLogin(); return; }
    authApi.me(token)
      .then(({ user: u }) => {
        if (!u) { clearSession(); toLogin(); return; }
        if (!STAFF_ROLES.includes(u.role)) { setUser(null); return; }
        setUser(u);
      })
      .catch(() => { clearSession(); toLogin(); });
  }, []);

  if (user === undefined) return <div className="min-h-screen bg-gray-100 flex items-center justify-center text-sm text-gray-500">Checking session…</div>;
  if (user === null) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-sm text-center space-y-3">
        <h1 className="font-black text-gray-900">Staff access only</h1>
        <p className="text-sm text-gray-600">This account doesn't have access to the studio console.</p>
        <button onClick={() => { clearSession(); window.location.assign('/login?next=/admin'); }} className="bg-royal-600 hover:bg-royal-700 text-white font-bold rounded-xl px-4 py-2 text-sm">Sign in as staff</button>
      </div>
    </div>
  );
  return <ToastProvider><AdminInner user={user} /></ToastProvider>;
}

function signOut() { clearSession(); window.location.assign('/login'); }

function Skeleton() { return <div className="animate-pulse space-y-3"><div className="h-24 bg-gray-100 rounded-xl" /><div className="h-40 bg-gray-100 rounded-xl" /><div className="h-40 bg-gray-100 rounded-xl" /></div>; }
function Card({ title, children, actions }) {
  return <div className="border border-gray-200 rounded-2xl p-4"><div className="flex items-center justify-between mb-3"><h3 className="font-bold text-sm text-gray-800">{title}</h3>{actions}</div>{children}</div>;
}
const Btn = ({ children, onClick, color = 'royal', disabled, small }) => (
  <button onClick={onClick} disabled={disabled}
    className={`inline-flex items-center gap-1 rounded-xl font-semibold disabled:opacity-50 transition-colors ${small ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm'} ${color === 'royal' ? 'bg-royal-600 text-white hover:bg-royal-700' : color === 'black' ? 'bg-gray-900 text-white hover:bg-gray-800' : color === 'ghost' ? 'border border-gray-300 text-gray-700 hover:bg-gray-50' : color === 'red' ? 'bg-red-600 text-white hover:bg-red-700' : color === 'amber' ? 'bg-amber-500 text-white hover:bg-amber-600' : ''}`}>{children}</button>
);

function Overview({ data, onOpen }) {
  const orders = Array.isArray(data.orders) ? data.orders : [];
  const low = Array.isArray(data.low) ? data.low : [];
  const today = orders.filter((o) => new Date(o.createdAt).toDateString() === new Date().toDateString());
  const revenueToday = today.reduce((a, o) => a + Number(o.total || 0), 0);
  const revenueMonth = orders.filter((o) => new Date(o.createdAt).getMonth() === new Date().getMonth()).reduce((a, o) => a + Number(o.total || 0), 0);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Orders today" value={today.length} />
        <Stat label="Revenue today" value={`$${revenueToday.toFixed(2)}`} accent />
        <Stat label="Revenue this month" value={`$${revenueMonth.toFixed(2)}`} />
        <Stat label="Low stock items" value={low.length} warn={low.length > 0} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Recent orders" actions={<button onClick={() => onOpen('orders')} className="text-xs text-royal-700 hover:underline font-semibold">View all</button>}>
          <div className="space-y-1.5">
            {orders.slice(0, 6).map((o) => <div key={o.id} className="flex justify-between text-xs border-b border-gray-100 py-1.5"><span className="font-medium text-gray-700">{o.orderNumber} <span className="text-gray-400">• {o.email}</span></span><StatusBadge value={o.status} /></div>)}
            {orders.length === 0 && <div className="text-xs text-gray-400 py-4 text-center">No orders yet</div>}
          </div>
        </Card>
        <Card title="Low stock" actions={<button onClick={() => onOpen('inventory')} className="text-xs text-royal-700 hover:underline font-semibold">Manage</button>}>
          <div className="space-y-1.5">
            {low.slice(0, 6).map((m) => <div key={m.id || m.sku} className="flex justify-between text-xs border-b border-gray-100 py-1.5"><span className="font-medium text-gray-700">{m.name || m.sku}</span><span className="text-amber-600 font-semibold">{m.onHand}/{m.lowThreshold}</span></div>)}
            {low.length === 0 && <div className="text-xs text-gray-400 py-4 text-center">All stocked ✓</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
function Stat({ label, value, warn, accent }) {
  return <div className={`p-4 rounded-2xl border ${warn ? 'bg-amber-50 border-amber-200' : accent ? 'bg-royal-50 border-royal-100' : 'bg-gray-50 border-gray-200'}`}>
    <div className="text-xs text-gray-500">{label}</div>
    <div className={`text-xl font-black mt-0.5 ${warn ? 'text-amber-600' : accent ? 'text-royal-700' : 'text-gray-900'}`}>{value}</div>
  </div>;
}

function Orders({ data, reload, token }) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(null);
  const [busy, setBusy] = useState('');
  const orders = Array.isArray(data.orders) ? data.orders : [];
  async function move(o, status) {
    setBusy(`${o.id}-${status}`);
    try { await adminApi.orders.updateStatus(o.id, status, 'Updated from admin', token); toast(`Order ${o.orderNumber} → ${status}`); reload(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(''); }
  }
  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">{orders.length} orders (latest 100)</div>
      {orders.map((o) => (
        <div key={o.id} className="border border-gray-200 rounded-xl overflow-hidden">
          <button onClick={() => setExpanded(expanded === o.id ? null : o.id)} className="w-full flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left">
            <span className="font-bold text-sm text-gray-800">{o.orderNumber}</span>
            <span className="text-xs text-gray-500">{o.email}</span>
            <StatusBadge value={o.status} />
            <StatusBadge value={o.paymentStatus} />
            <span className="ml-auto font-bold text-sm text-royal-700">${Number(o.total).toFixed(2)}</span>
          </button>
          {expanded === o.id && (
            <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50">
              <div className="flex flex-wrap gap-1.5 mb-3">
                {ORDER_FLOW.map((s) => (
                  <button key={s} disabled={busy === `${o.id}-${s}`} onClick={() => move(o, s)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold ${o.status === s ? 'bg-royal-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-royal-50'}`}>{s.replace(/_/g, ' ')}</button>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="font-bold text-gray-700 mb-1">Lines</div>
                  {(o.lines || []).map((l, i) => <div key={i} className="flex justify-between py-0.5"><span>{l.title} × {l.quantity}</span><span>${Number(l.unitPrice).toFixed(2)}</span></div>)}
                </div>
                <div>
                  <div className="font-bold text-gray-700 mb-1">Details</div>
                  <div className="space-y-0.5 text-gray-600">
                    <div>Ship: {o.shippingName} — {o.shippingSuburb} {o.shippingPostcode}</div>
                    <div>Subtotal ${Number(o.subtotal).toFixed(2)} • GST ${Number(o.taxTotal).toFixed(2)} • Ship ${Number(o.shippingCost).toFixed(2)}</div>
                    <div>Payment: {o.paymentMethod}</div>
                    {(o.history || []).slice(-3).map((h, i) => <div key={i} className="text-gray-400">{h.fromStatus} → {h.toStatus} ({new Date(h.createdAt).toLocaleString()})</div>)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
      {orders.length === 0 && <div className="text-xs text-gray-400 py-10 text-center">No orders — login as admin@krystal.local (maker+ token required)</div>}
    </div>
  );
}

const INVENTORY_SUBS = [
  { id: 'stock', label: 'Stock' },
  { id: 'low', label: 'Low stock' },
  { id: 'stocktake', label: 'Stocktake' },
  { id: 'purchase', label: 'Purchase orders' },
  { id: 'transfer', label: 'Transfers' },
  { id: 'movements', label: 'Movements' },
  { id: 'lots', label: 'Lots' },
];

function Inventory({ data, reload, token }) {
  const [sub, setSub] = useState('stock');
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1 border-b border-gray-200">
        {INVENTORY_SUBS.map((s) => (
          <button key={s.id} onClick={() => setSub(s.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${sub === s.id ? 'bg-royal-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-royal-50'}`}>{s.label}</button>
        ))}
      </div>
      {sub === 'stock' && <InventoryStock data={data} reload={reload} token={token} />}
      {sub === 'low' && <InventoryLow data={data} reload={reload} token={token} />}
      {sub === 'stocktake' && <InventoryStocktake data={data} reload={reload} token={token} />}
      {sub === 'purchase' && <InventoryPurchase data={data} reload={reload} token={token} />}
      {sub === 'transfer' && <InventoryTransfer data={data} reload={reload} token={token} />}
      {sub === 'movements' && <InventoryMovements data={data} reload={reload} token={token} />}
      {sub === 'lots' && <InventoryLots data={data} reload={reload} token={token} />}
    </div>
  );
}

function InventoryStock({ data, reload, token }) {
  const toast = useToast();
  const [adjusting, setAdjusting] = useState(null);
  const [setVals, setSetVals] = useState({});
  const [thresholdVals, setThresholdVals] = useState({});
  const [materialEditor, setMaterialEditor] = useState(null);
  const [locationEditor, setLocationEditor] = useState(null);
  const levels = Array.isArray(data.levels) ? data.levels : [];
  const materials = Array.isArray(data.materials) ? data.materials : [];
  const recon = Array.isArray(data.recon) ? data.recon : [];
  const locations = Array.isArray(data.locations) ? data.locations : [];
  const drifted = recon.filter((r) => !r.ok);
  async function adjustLevel(l, delta) {
    setAdjusting(l.id);
    try { await adminApi.inventory.adjust({ productId: l.productId, variantId: l.variantId || null, locationId: l.locationId, quantity: delta, reason: 'Admin adjust' }, token); toast('Stock updated'); reload(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setAdjusting(null); }
  }
  async function setLevel(l, val) {
    const onHand = Number(val);
    if (!Number.isFinite(onHand) || onHand < 0) return toast('Enter a valid number', 'error');
    setAdjusting(l.id);
    try { await adminApi.inventory.set({ productId: l.productId, variantId: l.variantId || null, locationId: l.locationId, onHand, reason: 'Admin set' }, token); toast(`Set to ${onHand}`); reload(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setAdjusting(null); setSetVals((s) => ({ ...s, [l.id]: '' })); }
  }
  async function setThreshold(l, val) {
    const t = val === '' ? null : Number(val);
    setAdjusting(l.id);
    try { await adminApi.inventory.threshold(l.id, t, token); toast('Threshold updated'); reload(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setAdjusting(null); setThresholdVals((s) => ({ ...s, [l.id]: '' })); }
  }
  async function adjustMat(m, delta) {
    setAdjusting(m.id);
    try { await adminApi.materials.adjust(m.id, delta, 'Admin adjust', token); toast('Material updated'); reload(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setAdjusting(null); }
  }
  async function setMat(m, val) {
    const onHand = Number(val);
    if (!Number.isFinite(onHand) || onHand < 0) return toast('Enter a valid number', 'error');
    setAdjusting(m.id);
    try { await adminApi.materials.set(m.id, onHand, 'Admin set', token); toast(`Set to ${onHand}`); reload(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setAdjusting(null); setSetVals((s) => ({ ...s, [m.id]: '' })); }
  }
  return (
    <div className="space-y-5">
      {drifted.length > 0 && <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700">⚠️ {drifted.length} items drift: actual vs recorded — run a Stocktake or check Reconciliation</div>}
      <Card title={`Product stock — ${levels.length} levels`}>
        <div className="space-y-1.5">
          {levels.slice(0, 30).map((l) => (
            <div key={l.id} className="flex items-center gap-2 text-xs border-b border-gray-100 py-1.5 flex-wrap">
              <span className="font-medium text-gray-700 flex-1 min-w-[160px]">{l.product?.title || l.productId} {l.variant ? `— ${l.variant.title}` : ''} <span className="text-gray-400">@{l.location?.name}</span></span>
              <span className={`font-bold ${l.onHand <= (l.lowStockThreshold ?? 5) ? 'text-red-600' : 'text-gray-800'}`}>{l.onHand}</span>
              <button disabled={adjusting === l.id} onClick={() => adjustLevel(l, 1)} className="w-7 h-7 rounded-lg bg-royal-50 text-royal-700 font-bold hover:bg-royal-100">+</button>
              <button disabled={adjusting === l.id} onClick={() => adjustLevel(l, -1)} className="w-7 h-7 rounded-lg bg-gray-100 text-gray-700 font-bold hover:bg-gray-200">−</button>
              <input value={setVals[l.id] || ''} onChange={(e) => setSetVals((s) => ({ ...s, [l.id]: e.target.value }))} placeholder="set…" className="w-16 border border-gray-300 rounded-lg px-2 py-1" />
              <button disabled={adjusting === l.id} onClick={() => setLevel(l, setVals[l.id])} className="px-2 py-1 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800">Set</button>
              <input value={thresholdVals[l.id] ?? ''} onChange={(e) => setThresholdVals((s) => ({ ...s, [l.id]: e.target.value }))} placeholder={`lo ${l.lowStockThreshold ?? 5}`} title="Low-stock threshold" className="w-14 border border-gray-300 rounded-lg px-2 py-1 text-gray-500" />
              <button disabled={adjusting === l.id} onClick={() => setThreshold(l, thresholdVals[l.id])} className="px-2 py-1 rounded-lg bg-royal-100 text-royal-700 text-xs font-semibold hover:bg-royal-200">Thr</button>
            </div>
          ))}
          {levels.length === 0 && <div className="text-xs text-gray-400 py-4 text-center">No levels — seed inventory</div>}
        </div>
      </Card>
      <Card title={`Raw materials — ${materials.length}`} actions={<Btn small color="ghost" onClick={() => setMaterialEditor({})}>+ Add material</Btn>}>
        <div className="space-y-1.5">
          {materials.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-xs border-b border-gray-100 py-1.5 flex-wrap">
              <span className="font-medium text-gray-700 flex-1 min-w-[160px]">{m.name} <span className="text-gray-400">{m.sku} • {m.unit} • ${Number(m.costPerUnit).toFixed(2)}</span></span>
              <span className={`font-bold ${Number(m.onHand) <= Number(m.lowThreshold) ? 'text-amber-600' : 'text-gray-800'}`}>{m.onHand}</span>
              <button disabled={adjusting === m.id} onClick={() => adjustMat(m, 10)} className="w-7 h-7 rounded-lg bg-royal-50 text-royal-700 font-bold hover:bg-royal-100">+</button>
              <button disabled={adjusting === m.id} onClick={() => adjustMat(m, -10)} className="w-7 h-7 rounded-lg bg-gray-100 text-gray-700 font-bold hover:bg-gray-200">−</button>
              <input value={setVals[m.id] || ''} onChange={(e) => setSetVals((s) => ({ ...s, [m.id]: e.target.value }))} placeholder="set…" className="w-16 border border-gray-300 rounded-lg px-2 py-1" />
              <button disabled={adjusting === m.id} onClick={() => setMat(m, setVals[m.id])} className="px-2 py-1 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800">Set</button>
              <Btn small color="ghost" onClick={() => setMaterialEditor(m)}>Edit</Btn>
            </div>
          ))}
          {materials.length === 0 && <div className="text-xs text-gray-400 py-4 text-center">No materials</div>}
        </div>
      </Card>
      <Card title={`Locations — ${locations.length}`} actions={<Btn small color="ghost" onClick={() => setLocationEditor({})}>+ Add location</Btn>}>
        <div className="space-y-1">
          {locations.map((l) => <div key={l.id} className="flex justify-between text-xs border-b border-gray-100 py-1.5"><span className="font-medium text-gray-700">{l.name} {l.isDefault && <span className="text-royal-700 font-semibold">• default</span>}</span><span className="text-gray-400">{l.address || ''}</span></div>)}
          {locations.length === 0 && <div className="text-xs text-gray-400 py-4 text-center">No locations</div>}
        </div>
      </Card>
      <Card title={`Reconciliation — actual vs recorded (${drifted.length} drift)`}>
        <div className="space-y-1">
          {recon.slice(0, 15).map((r) => <div key={r.key} className={`flex justify-between text-xs border-b border-gray-100 py-1 ${r.ok ? '' : 'text-red-600'}`}><span>{r.title}</span><span>{r.actual} vs {r.recorded} {r.ok ? '✓' : `drift ${r.drift}`}</span></div>)}
          {recon.length === 0 && <div className="text-xs text-gray-400 py-4 text-center">No items to reconcile</div>}
        </div>
      </Card>
      {materialEditor && <MaterialModal material={materialEditor.id ? materialEditor : null} locations={locations} onClose={() => setMaterialEditor(null)} onSaved={() => { setMaterialEditor(null); toast(materialEditor.id ? 'Material updated' : 'Material created'); reload(); }} token={token} />}
      {locationEditor && <LocationModal location={locationEditor.id ? locationEditor : null} onClose={() => setLocationEditor(null)} onSaved={() => { setLocationEditor(null); toast('Location saved'); reload(); }} token={token} />}
    </div>
  );
}
function MaterialModal({ material, locations, onClose, onSaved, token }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    name: material?.name || '', sku: material?.sku || '', unit: material?.unit || 'sheet',
    onHand: material ? Number(material.onHand) : 0, lowThreshold: material ? Number(material.lowThreshold) : 5,
    costPerUnit: material ? Number(material.costPerUnit) : 0, supplier: material?.supplier || '', locationId: material?.locationId || '',
  }));
  const [busy, setBusy] = useState(false);
  const input = 'w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-gray-600 mb-1';
  async function save() {
    setBusy(true);
    try {
      const body = { ...form, onHand: Number(form.onHand), lowThreshold: Number(form.lowThreshold), costPerUnit: Number(form.costPerUnit), locationId: form.locationId || null };
      if (material) await adminApi.materials.update(material.id, body, token);
      else await adminApi.materials.create(body, token);
      onSaved();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return <Modal title={material ? 'Edit material' : 'New material'} onClose={onClose}>
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label}>Name</label><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label className={label}>SKU</label><input className={input} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className={label}>Unit</label><select className={input} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}><option value="sheet">sheet</option><option value="meter">meter</option><option value="stick">stick</option><option value="roll">roll</option><option value="piece">piece</option><option value="ml">ml</option><option value="gram">gram</option></select></div>
        <div><label className={label}>On hand</label><input type="number" className={input} value={form.onHand} onChange={(e) => setForm({ ...form, onHand: e.target.value })} /></div>
        <div><label className={label}>Low threshold</label><input type="number" className={input} value={form.lowThreshold} onChange={(e) => setForm({ ...form, lowThreshold: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label}>Cost per unit ($)</label><input type="number" step="0.01" className={input} value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })} /></div>
        <div><label className={label}>Supplier</label><input className={input} value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></div>
      </div>
      {locations.length > 0 && <div><label className={label}>Location</label><select className={input} value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}><option value="">None</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>}
    </div>
    <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy || !form.name || !form.sku}>{busy ? 'Saving…' : material ? 'Save changes' : 'Create'}</Btn></div>
  </Modal>;
}
function LocationModal({ location, onClose, onSaved, token }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({ name: location?.name || '', address: location?.address || '', isDefault: !!location?.isDefault }));
  const [busy, setBusy] = useState(false);
  const input = 'w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-gray-600 mb-1';
  async function save() {
    setBusy(true);
    try { await adminApi.inventory.createLocation({ ...form, address: form.address || null, isActive: true }, token); onSaved(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return <Modal title="Add location" onClose={onClose}>
    <div className="space-y-3">
      <div><label className={label}>Name</label><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div><label className={label}>Address</label><input className={input} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> Default location</label>
    </div>
    <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy || !form.name}>{busy ? 'Saving…' : 'Add'}</Btn></div>
  </Modal>;
}

function InventoryLow({ token }) {
  const [low, setLow] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { adminApi.inventory.lowStock(token).then((d) => { setLow(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false)); }, [token]);
  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">{low.length} items below threshold</div>
      {loading ? <p className="text-xs text-gray-400 py-6 text-center">Loading…</p> : (
        <div className="space-y-1.5">
          {low.map((l, i) => (
            <div key={i} className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-2.5 text-sm">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${l.type === 'material' ? 'bg-amber-100 text-amber-700' : l.type === 'product' ? 'bg-royal-100 text-royal-700' : 'bg-sky-100 text-sky-700'}`}>{l.type}</span>
              <span className="font-medium text-gray-800 flex-1 truncate">{l.name} <span className="text-gray-400">• {l.sku}</span></span>
              <span className="text-xs text-gray-500">{l.location}</span>
              <span className="font-bold text-red-600">{l.onHand} <span className="text-gray-400 font-normal">/ {l.threshold}</span></span>
            </div>
          ))}
          {low.length === 0 && <div className="text-xs text-gray-400 py-10 text-center">All stocked ✓</div>}
        </div>
      )}
    </div>
  );
}

function InventoryStocktake({ data, reload, token }) {
  const toast = useToast();
  const locations = Array.isArray(data.locations) ? data.locations : [];
  const levels = Array.isArray(data.levels) ? data.levels : [];
  const materials = Array.isArray(data.materials) ? data.materials : [];
  const [locationId, setLocationId] = useState(locations.find((l) => l.isDefault)?.id || locations[0]?.id || '');
  const [counts, setCounts] = useState({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  useEffect(() => { adminApi.inventory.stocktakes(token).then((d) => setHistory(Array.isArray(d) ? d : [])).catch(() => {}); }, [token]);
  const items = [
    ...levels.filter((l) => !locationId || l.locationId === locationId).map((l) => ({ key: `p-${l.id}`, productId: l.productId, variantId: l.variantId || null, rawMaterialId: null, name: `${l.product?.title || l.productId}${l.variant ? ` — ${l.variant.title}` : ''}`, expected: l.onHand })),
    ...materials.map((m) => ({ key: `m-${m.id}`, productId: null, variantId: null, rawMaterialId: m.id, name: `${m.name} (material)`, expected: Math.round(Number(m.onHand)) })),
  ];
  async function submit() {
    if (!locationId) return toast('Select a location', 'error');
    const itemsPayload = items.map((it) => ({ productId: it.productId, variantId: it.variantId, rawMaterialId: it.rawMaterialId, countedQty: counts[it.key] ?? it.expected }));
    setBusy(true);
    try { await adminApi.inventory.stocktake({ locationId, notes, items: itemsPayload }, token); toast('Stocktake complete — variance applied'); setCounts({}); reload(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-4">
      <Card title="Count stock">
        <div className="flex items-end gap-3 mb-3">
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">Location</label>
            <select className="border border-gray-300 rounded-xl px-3 py-2 text-sm" value={locationId} onChange={(e) => setLocationId(e.target.value)}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          </div>
          <div className="flex-1"><label className="block text-xs font-semibold text-gray-600 mb-1">Notes (optional)</label><input className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <div className="max-h-96 overflow-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
          {items.map((it) => (
            <div key={it.key} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="text-gray-700 flex-1 truncate">{it.name}</span>
              <span className="text-xs text-gray-400">expected {it.expected}</span>
              <input type="number" value={counts[it.key] ?? it.expected} onChange={(e) => setCounts((c) => ({ ...c, [it.key]: e.target.value }))} className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-right" />
              {counts[it.key] !== undefined && Number(counts[it.key]) !== it.expected && <span className={`text-xs font-bold ${Number(counts[it.key]) - it.expected > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{(Number(counts[it.key]) - it.expected > 0 ? '+' : '') + (Number(counts[it.key]) - it.expected)}</span>}
            </div>
          ))}
        </div>
        <div className="mt-3"><Btn onClick={submit} disabled={busy || !locationId}>{busy ? 'Applying…' : 'Complete stocktake'}</Btn></div>
      </Card>
      <Card title={`Stocktake history — ${history.length}`}>
        <div className="space-y-1">{history.map((h) => <div key={h.id} className="flex justify-between text-xs border-b border-gray-100 py-1.5"><span>{h.location?.name} • {h.status}</span><span className="text-gray-400">{new Date(h.createdAt).toLocaleString()} • {h._count?.lines} lines</span></div>)}</div>
      </Card>
    </div>
  );
}

function InventoryPurchase({ data, reload, token }) {
  const toast = useToast();
  const materials = Array.isArray(data.materials) ? data.materials : [];
  const [creating, setCreating] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [pos, setPos] = useState([]);
  useEffect(() => { adminApi.purchaseOrders.list(token).then((d) => setPos(Array.isArray(d) ? d : [])).catch(() => {}); }, [token]);
  async function doDelete() { try { await adminApi.purchaseOrders.remove(confirmDel.id, token); toast('PO deleted'); setPos((p) => p.filter((x) => x.id !== confirmDel.id)); } catch (e) { toast(e.message, 'error'); } }
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center"><div className="text-xs text-gray-500">{pos.length} purchase orders</div><Btn onClick={() => setCreating(true)}>+ New purchase order</Btn></div>
      {pos.map((po) => (
        <div key={po.id} className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3">
          <div className="flex-1 min-w-0"><div className="font-bold text-sm text-gray-800">{po.poNumber} — {po.supplier}</div><div className="text-xs text-gray-500">{po.lines?.length || 0} lines • {new Date(po.createdAt).toLocaleDateString('en-AU')}</div></div>
          <StatusBadge value={po.status} />
          <Btn small color="ghost" onClick={async () => { try { await adminApi.purchaseOrders.receive(po.id, token); toast(`Received ${po.poNumber}`); reload(); setPos((p) => p.map((x) => x.id === po.id ? { ...x, status: 'received' } : x)); } catch (e) { toast(e.message, 'error'); } }}>Receive</Btn>
          <Btn small color="red" onClick={() => setConfirmDel(po)}>Delete</Btn>
        </div>
      ))}
      {pos.length === 0 && !creating && <div className="text-xs text-gray-400 py-10 text-center">No purchase orders — create one to track supplier stock</div>}
      {creating && <POModal materials={materials} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); toast('PO created'); reload(); }} token={token} />}
      {confirmDel && <ConfirmDialog title="Delete purchase order" message={`Delete ${confirmDel.poNumber}?`} onConfirm={doDelete} onClose={() => setConfirmDel(null)} />}
    </div>
  );
}
function POModal({ materials, onClose, onSaved, token }) {
  const toast = useToast();
  const [supplier, setSupplier] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([{ rawMaterialId: '', qty: 10, unitCost: '' }]);
  const [busy, setBusy] = useState(false);
  const input = 'w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-gray-600 mb-1';
  function setLine(i, k, v) { setLines((l) => l.map((x, idx) => (idx === i ? { ...x, [k]: v } : x))); }
  function rmLine(i) { setLines((l) => l.filter((_, idx) => idx !== i)); }
  async function save() {
    if (!supplier) return toast('Supplier required', 'error');
    const clean = lines.filter((l) => l.rawMaterialId && Number(l.qty) > 0);
    if (!clean.length) return toast('Add at least one line', 'error');
    setBusy(true);
    try { await adminApi.purchaseOrders.create({ supplier, notes, lines: clean.map((l) => ({ rawMaterialId: l.rawMaterialId, qty: Number(l.qty), unitCost: l.unitCost === '' ? undefined : Number(l.unitCost) })) }, token); onSaved(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return <Modal title="New purchase order" onClose={onClose} wide>
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label}>Supplier</label><input className={input} value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div>
        <div><label className={label}>Notes</label><input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      <div><div className="flex items-center justify-between mb-1"><label className="text-xs font-semibold text-gray-600">Lines</label><button onClick={() => setLines((l) => [...l, { rawMaterialId: materials[0]?.id || '', qty: 10, unitCost: '' }])} className="text-xs text-royal-700 font-semibold hover:underline">+ Add line</button></div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_70px_80px_auto] gap-2 items-center">
              <select className={input} value={l.rawMaterialId} onChange={(e) => setLine(i, 'rawMaterialId', e.target.value)}><option value="">Select material…</option>{materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
              <input type="number" className={input} value={l.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} />
              <input type="number" step="0.01" className={input} value={l.unitCost} onChange={(e) => setLine(i, 'unitCost', e.target.value)} placeholder="$/unit" />
              <button onClick={() => rmLine(i)} className="w-7 h-7 rounded-lg bg-red-50 text-red-600 font-bold hover:bg-red-100">✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
    <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy}>{busy ? 'Creating…' : 'Create PO'}</Btn></div>
  </Modal>;
}

function InventoryTransfer({ data, reload, token }) {
  const toast = useToast();
  const locations = Array.isArray(data.locations) ? data.locations : [];
  const levels = Array.isArray(data.levels) ? data.levels : [];
  const materials = Array.isArray(data.materials) ? data.materials : [];
  const [fromId, setFromId] = useState(locations[0]?.id || '');
  const [toId, setToId] = useState(locations[1]?.id || locations[0]?.id || '');
  const [items, setItems] = useState([{ productId: '', variantId: '', rawMaterialId: '', qty: 1 }]);
  const [busy, setBusy] = useState(false);
  const input = 'w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-gray-600 mb-1';
  const productOptions = levels.map((l) => ({ value: l.productId, label: `${l.product?.title || l.productId}${l.variant ? ` — ${l.variant.title}` : ''}`, variantId: l.variantId || null, rawMaterialId: null }));
  const materialOptions = materials.map((m) => ({ value: m.id, label: `${m.name} (material)`, rawMaterialId: m.id, variantId: null }));
  const allOptions = [...productOptions, ...materialOptions];
  function setItem(i, k, v) { setItems((it) => it.map((x, idx) => (idx === i ? { ...x, [k]: v } : x))); }
  async function submit() {
    if (!fromId || !toId || fromId === toId) return toast('Pick two different locations', 'error');
    setBusy(true);
    try {
      for (const it of items) {
        const opt = allOptions.find((o) => o.value === it.productId);
        if (!opt || !Number(it.qty)) continue;
        await adminApi.inventory.transfer({ productId: opt.rawMaterialId ? null : opt.value, variantId: opt.variantId || null, rawMaterialId: opt.rawMaterialId || null, fromLocationId: fromId, toLocationId: toId, quantity: Number(it.qty) }, token);
      }
      toast('Transfer complete'); reload();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return (
    <Card title="Transfer stock between locations">
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div><label className={label}>From</label><select className={input} value={fromId} onChange={(e) => setFromId(e.target.value)}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        <div><label className={label}>To</label><select className={input} value={toId} onChange={(e) => setToId(e.target.value)}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
      </div>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-[1fr_80px_auto] gap-2 items-center">
            <select className={input} value={it.productId} onChange={(e) => setItem(i, 'productId', e.target.value)}><option value="">Select item…</option>{allOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            <input type="number" min="1" className={input} value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} />
            <button onClick={() => setItems((x) => x.filter((_, idx) => idx !== i))} className="w-7 h-7 rounded-lg bg-red-50 text-red-600 font-bold hover:bg-red-100">✕</button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2"><Btn small color="ghost" onClick={() => setItems((x) => [...x, { productId: '', variantId: '', rawMaterialId: '', qty: 1 }])}>+ Add item</Btn><Btn onClick={submit} disabled={busy}>{busy ? 'Transferring…' : 'Transfer'}</Btn></div>
    </Card>
  );
}

function InventoryMovements({ token }) {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [movs, setMovs] = useState({ data: [], total: 0, page: 1, pages: 1 });
  const [, setLoading] = useState(true);
  const TYPES = ['in', 'out', 'adjustment', 'sale', 'return', 'stocktake', 'po', 'transfer', 'bom_deduct'];
  useEffect(() => {
    setLoading(true);
    adminApi.inventory.movements(token, { limit: 25, page, type }).then((d) => { setMovs(d); setLoading(false); }).catch(() => setLoading(false));
  }, [page, type, token]);
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1 flex-wrap">
        <button onClick={() => { setType(''); setPage(1); }} className={`px-3 py-1 rounded-full text-xs font-semibold ${type === '' ? 'bg-royal-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>All</button>
        {TYPES.map((t) => <button key={t} onClick={() => { setType(t); setPage(1); }} className={`px-3 py-1 rounded-full text-xs font-semibold ${type === t ? 'bg-royal-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>{t}</button>)}
      </div>
      <div className="text-xs text-gray-500">{movs.total} movements</div>
      <div className="space-y-1">
        {movs.data.map((mv) => (
          <div key={mv.id} className="flex justify-between text-xs border-b border-gray-100 py-1.5">
            <span className="text-gray-700 truncate mr-2">{mv.product?.title || mv.rawMaterial?.name || '—'} <span className={mv.quantity > 0 ? 'text-emerald-600' : 'text-red-600'}>{(mv.quantity > 0 ? '+' : '') + mv.quantity}</span> <span className="text-gray-400">{mv.type} • {mv.location?.name || ''} {mv.reason ? `• ${mv.reason}` : ''}</span></span>
            <span className="text-gray-400 shrink-0">{new Date(mv.createdAt).toLocaleString()}</span>
          </div>
        ))}
        {movs.data.length === 0 && <div className="text-xs text-gray-400 py-6 text-center">No movements</div>}
      </div>
      {movs.pages > 1 && <div className="flex items-center gap-2 justify-end text-xs"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 rounded-lg border border-gray-300 disabled:opacity-40">Prev</button><span>{movs.page}/{movs.pages}</span><button disabled={page >= movs.pages} onClick={() => setPage(page + 1)} className="px-3 py-1 rounded-lg border border-gray-300 disabled:opacity-40">Next</button></div>}
    </div>
  );
}

function InventoryLots({ data, reload, token }) {
  const toast = useToast();
  const materials = Array.isArray(data.materials) ? data.materials : [];
  const levels = Array.isArray(data.levels) ? data.levels : [];
  const locations = Array.isArray(data.locations) ? data.locations : [];
  const [lots, setLots] = useState([]);
  const [expiring, setExpiring] = useState([]);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    adminApi.inventory.lots(token).then((d) => setLots(Array.isArray(d) ? d : [])).catch(() => {});
    adminApi.inventory.expiring(token).then((d) => setExpiring(Array.isArray(d) ? d : [])).catch(() => {});
  }, [token]);
  const productOptions = levels.map((l) => ({ value: l.productId, label: l.product?.title || l.productId, variantId: l.variantId || null, rawMaterialId: null }));
  const materialOptions = materials.map((m) => ({ value: m.id, label: `${m.name} (material)`, rawMaterialId: m.id, variantId: null }));
  const allOptions = [...productOptions, ...materialOptions];
  return (
    <div className="space-y-4">
      {expiring.length > 0 && <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700">⚠️ {expiring.length} lots expiring within 14 days</div>}
      <Card title={`Lots — ${lots.length}`} actions={<Btn small color="ghost" onClick={() => setCreating(true)}>+ Receive lot</Btn>}>
        <div className="space-y-1">{lots.slice(0, 30).map((l) => <div key={l.id} className="flex justify-between text-xs border-b border-gray-100 py-1.5"><span className="text-gray-700">{l.product?.title || l.rawMaterial?.name || l.variant?.title || '—'} {l.lotNumber ? `• ${l.lotNumber}` : ''}</span><span className="text-gray-400">{l.location?.name} • {l.remainingQty}/{l.quantity} left{l.expiresAt ? ` • exp ${new Date(l.expiresAt).toLocaleDateString('en-AU')}` : ''}</span></div>)}{lots.length === 0 && <div className="text-xs text-gray-400 py-4 text-center">No lots</div>}</div>
      </Card>
      {creating && <LotModal options={allOptions} locations={locations} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); toast('Lot received'); reload(); }} token={token} />}
    </div>
  );
}
function LotModal({ options, locations, onClose, onSaved, token }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({ productId: options[0]?.value || '', variantId: '', rawMaterialId: options[0]?.rawMaterialId || null, locationId: locations.find((l) => l.isDefault)?.id || locations[0]?.id || '', lotNumber: '', quantity: 10, costPerUnit: '', expiresAt: '' }));
  const [busy, setBusy] = useState(false);
  const input = 'w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-gray-600 mb-1';
  async function save() {
    setBusy(true);
    try {
      const opt = options.find((o) => o.value === form.productId);
      await adminApi.inventory.createLot({ productId: opt?.rawMaterialId ? null : form.productId, variantId: form.variantId || null, rawMaterialId: opt?.rawMaterialId || null, locationId: form.locationId, lotNumber: form.lotNumber || null, quantity: Number(form.quantity), costPerUnit: form.costPerUnit === '' ? null : Number(form.costPerUnit), expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null }, token);
      onSaved();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return <Modal title="Receive into lot" onClose={onClose}>
    <div className="space-y-3">
      <div><label className={label}>Item</label><select className={input} value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}><option value="">Select…</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label}>Location</label><select className={input} value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        <div><label className={label}>Lot number</label><input className={input} value={form.lotNumber} onChange={(e) => setForm({ ...form, lotNumber: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className={label}>Quantity</label><input type="number" className={input} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
        <div><label className={label}>Cost/unit ($)</label><input type="number" step="0.01" className={input} value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })} /></div>
        <div><label className={label}>Expires</label><input type="date" className={input} value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></div>
      </div>
    </div>
    <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Receive'}</Btn></div>
  </Modal>;
}

function Products({ data, reload, token }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [uploading, setUploading] = useState('');
  const products = Array.isArray(data.products) ? data.products : [];
  async function toggle(p, field) {
    try { await adminApi.products.update(p.id, { [field]: !p[field] }, token); toast(`${p.title} ${field} toggled`); reload(); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function doDelete() {
    try { await adminApi.products.remove(confirmDel.id, token); toast(`Deleted ${confirmDel.title}`); reload(); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function upload(id, files) {
    setUploading(id);
    try { await adminApi.products.uploadImages(id, files, token); toast('Images uploaded'); reload(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setUploading(''); }
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div className="text-xs text-gray-500">{products.length} products</div>
        <Btn onClick={() => setEditing({})}>+ New product</Btn>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {products.map((p) => (
          <div key={p.id} className="border border-gray-200 rounded-xl p-3">
            <div className="flex gap-3">
              {p.images?.[0] ? <img src={p.images[0].url} alt={p.title} className="w-16 h-16 rounded-lg object-cover" loading="lazy" /> : <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xs">no img</div>}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-gray-800 truncate">{p.title}</div>
                <div className="text-xs text-gray-500">{p.sku} • ${Number(p.price).toFixed(2)} • {p.stockMode}</div>
                <div className="mt-1.5 flex items-center gap-2">
                  <StatusBadge value={p.isActive ? 'published' : 'archived'} />
                  {p.isFeatured && <span className="text-xs text-royal-700 font-semibold">★ featured</span>}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Btn small color="ghost" onClick={() => setEditing(p)}>Edit</Btn>
              <Btn small color="ghost" onClick={() => toggle(p, 'isActive')}>{p.isActive ? 'Deactivate' : 'Activate'}</Btn>
              <Btn small color="ghost" onClick={() => toggle(p, 'isFeatured')}>{p.isFeatured ? 'Unfeature' : 'Feature'}</Btn>
              <label className={`inline-flex items-center px-2.5 py-1 text-xs rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer font-semibold ${uploading === p.id ? 'opacity-50' : ''}`}>
                {uploading === p.id ? 'Uploading…' : 'Upload'}
                <input type="file" accept="image/*" multiple className="hidden" disabled={uploading === p.id} onChange={(e) => e.target.files?.length && upload(p.id, e.target.files)} />
              </label>
              <Btn small color="red" onClick={() => setConfirmDel(p)}>Delete</Btn>
            </div>
          </div>
        ))}
      </div>
      {products.length === 0 && <div className="text-xs text-gray-400 py-10 text-center">No products</div>}
      {editing && <ProductModal product={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast(editing.id ? 'Product updated' : 'Product created'); reload(); }} token={token} />}
      {confirmDel && <ConfirmDialog title="Delete product" message={`Delete "${confirmDel.title}"? This cannot be undone.`} confirmLabel="Delete" onConfirm={doDelete} onClose={() => setConfirmDel(null)} />}
    </div>
  );
}

function ProductModal({ product, onClose, onSaved, token }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    title: product?.title || '', slug: product?.slug || '', sku: product?.sku || '',
    price: product ? Number(product.price) : '', description: product?.description || '',
    stockMode: product?.stockMode || 'made_to_order', type: product?.type || 'physical',
    isFeatured: !!product?.isFeatured, isActive: product ? !!product.isActive : true,
    madeToOrderDays: product?.madeToOrderDays || 5,
  }));
  const [variants, setVariants] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  useEffect(() => {
    if (product?.id) adminApi.variants.list(product.id, token).then(setVariants).catch(() => {});
  }, [product?.id, token]);
  async function save() {
    setBusy(true);
    try {
      const body = { ...form, price: Number(form.price), madeToOrderDays: form.madeToOrderDays ? Number(form.madeToOrderDays) : undefined };
      if (product) await adminApi.products.update(product.id, body, token);
      else await adminApi.products.create(body, token);
      onSaved();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  async function addVariant() {
    if (!product?.id) return toast('Save the product first to add variants', 'error');
    const title = window.prompt('Variant title (e.g. "Small — 6 stem")');
    if (!title) return;
    try {
      const res = await adminApi.variants.create(product.id, { title, price: Number(form.price) || 0, inventoryQuantity: 0 }, token);
      setVariants((v) => [...v, res]); toast('Variant added');
    } catch (e) { toast(e.message, 'error'); }
  }
  async function saveVariant(v, field, value) {
    try { await adminApi.variants.update(v.id, { [field]: value }, token); setVariants((vs) => vs.map((x) => (x.id === v.id ? { ...x, [field]: value } : x))); toast('Variant updated'); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function deleteVariant(v) {
    if (!window.confirm(`Delete variant "${v.title}"?`)) return;
    try { await adminApi.variants.remove(v.id, token); setVariants((vs) => vs.filter((x) => x.id !== v.id)); toast('Variant deleted'); }
    catch (e) { toast(e.message, 'error'); }
  }
  const input = 'w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-gray-600 mb-1';
  return (
    <Modal title={product ? 'Edit product' : 'New product'} onClose={onClose} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><label className={label}>Title</label><input className={input} value={form.title} onChange={(e) => set('title', e.target.value)} /></div>
        <div><label className={label}>Slug</label><input className={input} value={form.slug} onChange={(e) => set('slug', e.target.value)} placeholder="auto-from-title" /></div>
        <div><label className={label}>SKU</label><input className={input} value={form.sku} onChange={(e) => set('sku', e.target.value)} /></div>
        <div><label className={label}>Price ($)</label><input type="number" step="0.01" className={input} value={form.price} onChange={(e) => set('price', e.target.value)} /></div>
        <div><label className={label}>Stock mode</label>
          <select className={input} value={form.stockMode} onChange={(e) => set('stockMode', e.target.value)}>
            <option value="tracked">Tracked</option><option value="made_to_order">Made to order</option><option value="digital">Digital</option>
          </select>
        </div>
        <div><label className={label}>Type</label>
          <select className={input} value={form.type} onChange={(e) => set('type', e.target.value)}>
            <option value="physical">Physical</option><option value="made_to_order">Made to order</option><option value="digital_template">Digital template</option><option value="workshop_ticket">Workshop ticket</option><option value="commission">Commission</option>
          </select>
        </div>
        <div><label className={label}>Made-to-order days</label><input type="number" className={input} value={form.madeToOrderDays} onChange={(e) => set('madeToOrderDays', e.target.value)} /></div>
        <div className="sm:col-span-2"><label className={label}>Description</label><textarea rows={3} className={input} value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} /> Featured</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} /> Active (visible in shop)</label>
      </div>
      {product && (
        <div className="mt-4 border border-gray-200 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2"><label className="text-xs font-semibold text-gray-600">Variants ({variants.length})</label><button onClick={addVariant} className="text-xs text-royal-700 font-semibold hover:underline">+ Add variant</button></div>
          <div className="space-y-1">
            {variants.map((v) => (
              <div key={v.id} className="flex items-center gap-2 text-xs border-b border-gray-100 py-1.5 flex-wrap">
                <input value={v.title} onChange={(e) => saveVariant(v, 'title', e.target.value)} className="flex-1 min-w-[140px] border border-gray-200 rounded-lg px-2 py-1" />
                <span className="text-gray-400">${Number(v.price).toFixed(2)}</span>
                <span className="text-gray-400">{v.inventoryQuantity} in stock</span>
                <button onClick={() => saveVariant(v, 'inventoryQuantity', v.inventoryQuantity + 1)} className="w-6 h-6 rounded bg-royal-50 text-royal-700 font-bold hover:bg-royal-100">+</button>
                <button onClick={() => saveVariant(v, 'inventoryQuantity', Math.max(0, v.inventoryQuantity - 1))} className="w-6 h-6 rounded bg-gray-100 text-gray-700 font-bold hover:bg-gray-200">−</button>
                <button onClick={() => deleteVariant(v)} className="text-red-500 hover:underline">Del</button>
              </div>
            ))}
            {variants.length === 0 && <div className="text-xs text-gray-400">No variants — add sizes/options if this product varies</div>}
          </div>
        </div>
      )}
      {product && (product.images || []).length > 0 && (
        <div className="mt-4">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Images</label>
          <div className="flex flex-wrap gap-2">
            {(product.images || []).map((img) => (
              <div key={img.id} className="relative group">
                <img src={img.url} alt={img.alt || product.title} className="w-16 h-16 rounded-lg object-cover border border-gray-200" loading="lazy" />
                <button type="button" title="Delete image"
                  onClick={async () => { try { await adminApi.products.deleteImage(product.id, img.id, token); onSaved(); } catch (e) { toast(e.message, 'error'); } }}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Btn color="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={busy || !form.title || !form.slug}>{busy ? 'Saving…' : product ? 'Save changes' : 'Create product'}</Btn>
      </div>
    </Modal>
  );
}

function Workshops({ data, reload, token }) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [sessionFor, setSessionFor] = useState(null);
  const workshops = Array.isArray(data.workshops) ? data.workshops : [];
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center"><div className="text-xs text-gray-500">{workshops.length} workshops</div><Btn onClick={() => setCreating(true)}>+ New workshop</Btn></div>
      {workshops.map((w) => (
        <div key={w.id} className="border border-gray-200 rounded-xl p-4">
          <div className="flex justify-between items-start gap-3">
            <div><div className="font-bold text-gray-800">{w.title}</div><div className="text-xs text-gray-500">{w.location} • {w.capacity} cap • ${Number(w.price).toFixed(2)} • {w.level}</div></div>
            <Btn small color="ghost" onClick={() => setSessionFor(w)}>+ Session</Btn>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(w.sessions || []).map((s) => (
              <span key={s.id} className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">{new Date(s.startsAt).toLocaleDateString('en-AU')} {new Date(s.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {s.bookedCount}/{s.capacity}</span>
            ))}
            {(w.sessions || []).length === 0 && <span className="text-xs text-gray-400">No sessions yet</span>}
          </div>
        </div>
      ))}
      {workshops.length === 0 && <div className="text-xs text-gray-400 py-10 text-center">No workshops</div>}
      {creating && <WorkshopModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); toast('Workshop created'); reload(); }} token={token} />}
      {sessionFor && <SessionModal workshop={sessionFor} onClose={() => setSessionFor(null)} onSaved={() => { setSessionFor(null); toast('Session added'); reload(); }} token={token} />}
    </div>
  );
}
function WorkshopModal({ onClose, onSaved, token }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: '', slug: '', price: '', capacity: 12, location: 'Perth Studio, WA', description: '' });
  const [busy, setBusy] = useState(false);
  const input = 'w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-gray-600 mb-1';
  async function save() {
    setBusy(true);
    try { await adminApi.workshops.create({ ...form, price: Number(form.price), capacity: Number(form.capacity) }, token); onSaved(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return <Modal title="New workshop" onClose={onClose}>
    <div className="space-y-3">
      <div><label className={label}>Title</label><input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
      <div><label className={label}>Slug</label><input className={input} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label}>Price ($)</label><input type="number" className={input} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
        <div><label className={label}>Capacity</label><input type="number" className={input} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></div>
      </div>
      <div><label className={label}>Location</label><input className={input} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
      <div><label className={label}>Description</label><textarea rows={3} className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
    </div>
    <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy || !form.title || !form.slug}>{busy ? 'Saving…' : 'Create'}</Btn></div>
  </Modal>;
}
function SessionModal({ workshop, onClose, onSaved, token }) {
  const toast = useToast();
  const [startsAt, setStartsAt] = useState('');
  const [capacity, setCapacity] = useState(workshop.capacity);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const start = new Date(startsAt);
    const end = new Date(start.getTime() + (workshop.durationMinutes || 180) * 60000);
    try { await adminApi.workshops.addSession(workshop.id, { startsAt: start.toISOString(), endsAt: end.toISOString(), capacity: Number(capacity) }, token); onSaved(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return <Modal title={`Add session — ${workshop.title}`} onClose={onClose}>
    <div className="space-y-3">
      <div><label className="block text-xs font-semibold text-gray-600 mb-1">Starts at</label><input type="datetime-local" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div>
      <div><label className="block text-xs font-semibold text-gray-600 mb-1">Capacity</label><input type="number" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></div>
    </div>
    <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy || !startsAt}>{busy ? 'Saving…' : 'Add session'}</Btn></div>
  </Modal>;
}

function Recipes({ data, reload, token }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const recipes = Array.isArray(data.recipes) ? data.recipes : [];
  const materials = Array.isArray(data.materials) ? data.materials : [];
  const products = Array.isArray(data.products) ? data.products : [];
  async function doDelete() { try { await adminApi.bom.deleteRecipe(confirmDel.id, token); toast('Recipe deleted'); reload(); } catch (e) { toast(e.message, 'error'); } }
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center"><div className="text-xs text-gray-500">{recipes.length} recipes</div><Btn onClick={() => setCreating(true)}>+ New recipe</Btn></div>
      {recipes.map((r) => (
        <div key={r.id} className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-gray-800">{r.product?.title || r.variant?.title || 'Generic'} {r.variant ? `— ${r.variant.title}` : ''}</div>
            <div className="text-xs text-gray-500">{r.lines?.length || 0} materials • labour {r.labourMinutesPerUnit}m + cricut {r.cricutMinutesPerUnit}m</div>
          </div>
          <Btn small color="ghost" onClick={() => setEditing(r)}>Edit</Btn>
          <Btn small color="red" onClick={() => setConfirmDel(r)}>Delete</Btn>
        </div>
      ))}
      {recipes.length === 0 && <div className="text-xs text-gray-400 py-10 text-center">No recipes — create one to price configurator builds</div>}
      {(editing || creating) && <RecipeModal recipe={creating ? null : editing} materials={materials} products={products} onClose={() => { setEditing(null); setCreating(false); }} onSaved={() => { setEditing(null); setCreating(false); toast(creating ? 'Recipe created' : 'Recipe updated'); reload(); }} token={token} />}
      {confirmDel && <ConfirmDialog title="Delete recipe" message={`Delete recipe for "${confirmDel.product?.title || confirmDel.variant?.title || 'generic'}"?`} onConfirm={doDelete} onClose={() => setConfirmDel(null)} />}
    </div>
  );
}
function RecipeModal({ recipe, materials, products, onClose, onSaved, token }) {
  const toast = useToast();
  const [productId, setProductId] = useState(recipe?.productId || '');
  const [labour, setLabour] = useState(recipe?.labourMinutesPerUnit ?? 25);
  const [cricut, setCricut] = useState(recipe?.cricutMinutesPerUnit ?? 8);
  const [lines, setLines] = useState(() => (recipe?.lines || []).map((l) => ({ rawMaterialId: l.rawMaterialId, qtyPerUnit: Number(l.qtyPerUnit) || 1, wasteFactor: Number.isFinite(Number(l.wasteFactor)) ? Number(l.wasteFactor) : 0.05 })));
  const [busy, setBusy] = useState(false);
  const input = 'w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-gray-600 mb-1';
  function addLine() { setLines((l) => [...l, { rawMaterialId: materials[0]?.id || '', qtyPerUnit: 1, wasteFactor: 0.05 }]); }
  function setLine(i, k, v) { setLines((l) => l.map((x, idx) => (idx === i ? { ...x, [k]: v } : x))); }
  function rmLine(i) { setLines((l) => l.filter((_, idx) => idx !== i)); }
  async function save() {
    if (!productId) return toast('Select a product', 'error');
    const cleanLines = lines.filter((l) => l.rawMaterialId);
    if (!cleanLines.length) return toast('Add at least one material line', 'error');
    setBusy(true);
    try {
      const body = { productId, labourMinutesPerUnit: Number(labour), cricutMinutesPerUnit: Number(cricut), lines: cleanLines.map((l) => ({ ...l, qtyPerUnit: Number(l.qtyPerUnit), wasteFactor: Number(l.wasteFactor) })) };
      if (recipe) await adminApi.bom.updateRecipe(recipe.id, body, token);
      else await adminApi.bom.createRecipe(body, token);
      onSaved();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return <Modal title={recipe ? 'Edit recipe' : 'New recipe'} onClose={onClose} wide>
    <div className="space-y-3">
      <div><label className={label}>Product</label>
        <select className={input} value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Select product…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label}>Labour min/unit</label><input type="number" className={input} value={labour} onChange={(e) => setLabour(e.target.value)} /></div>
        <div><label className={label}>Cricut min/unit</label><input type="number" className={input} value={cricut} onChange={(e) => setCricut(e.target.value)} /></div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1"><label className="text-xs font-semibold text-gray-600">Material lines</label><button onClick={addLine} className="text-xs text-royal-700 font-semibold hover:underline">+ Add material</button></div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_70px_70px_auto] gap-2 items-center">
              <select className={input} value={l.rawMaterialId} onChange={(e) => setLine(i, 'rawMaterialId', e.target.value)}>
                <option value="">Select material…</option>{materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <input type="number" step="0.01" className={input} value={l.qtyPerUnit} onChange={(e) => setLine(i, 'qtyPerUnit', e.target.value)} title="qty per unit" />
              <input type="number" step="0.01" className={input} value={l.wasteFactor} onChange={(e) => setLine(i, 'wasteFactor', e.target.value)} title="waste factor" />
              <button onClick={() => rmLine(i)} className="w-7 h-7 rounded-lg bg-red-50 text-red-600 font-bold hover:bg-red-100">✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
    <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy}>{busy ? 'Saving…' : recipe ? 'Save changes' : 'Create recipe'}</Btn></div>
  </Modal>;
}

function Collections({ data, reload, token }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const collections = Array.isArray(data.collections) ? data.collections : [];
  const products = Array.isArray(data.products) ? data.products : [];
  async function doDelete() { try { await adminApi.collections.remove(confirmDel.id, token); toast('Collection deleted'); reload(); } catch (e) { toast(e.message, 'error'); } }
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center"><div className="text-xs text-gray-500">{collections.length} collections</div><Btn onClick={() => setCreating(true)}>+ New collection</Btn></div>
      {collections.map((c) => (
        <div key={c.id} className="border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0"><div className="font-bold text-sm text-gray-800">{c.title}</div><div className="text-xs text-gray-500">{c.slug} • {(c.products || []).length} products</div></div>
            <StatusBadge value={c.isActive ? 'published' : 'archived'} />
            <Btn small color="ghost" onClick={() => setEditing(c)}>Manage</Btn>
            <Btn small color="red" onClick={() => setConfirmDel(c)}>Delete</Btn>
          </div>
        </div>
      ))}
      {collections.length === 0 && <div className="text-xs text-gray-400 py-10 text-center">No collections</div>}
      {(editing || creating) && <CollectionModal collection={creating ? null : editing} products={products} onClose={() => { setEditing(null); setCreating(false); }} onSaved={() => { setEditing(null); setCreating(false); toast(creating ? 'Collection created' : 'Collection updated'); reload(); }} token={token} />}
      {confirmDel && <ConfirmDialog title="Delete collection" message={`Delete "${confirmDel.title}"? Products stay, membership removed.`} onConfirm={doDelete} onClose={() => setConfirmDel(null)} />}
    </div>
  );
}
function CollectionModal({ collection, products, onClose, onSaved, token }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({ title: collection?.title || '', slug: collection?.slug || '', description: collection?.description || '', isActive: collection ? !!collection.isActive : true }));
  const [members] = useState(() => (collection?.products || []).map((p) => ({ id: p.product?.id || p.productId, title: p.product?.title || p.productId, sortOrder: p.sortOrder || 0 })));
  const [busy, setBusy] = useState(false);
  const input = 'w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-gray-600 mb-1';
  const memberIds = new Set(members.map((m) => m.id));
  async function save() {
    if (!form.title || !form.slug) return toast('Title + slug required', 'error');
    setBusy(true);
    try {
      if (collection) await adminApi.collections.update(collection.id, form, token);
      else await adminApi.collections.create(form, token);
      onSaved();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  async function toggleMember(p) {
    if (memberIds.has(p.id)) {
      try { await adminApi.collections.removeProduct(collection.id, p.id, token); toast('Removed'); } catch (e) { toast(e.message, 'error'); }
    } else {
      try { await adminApi.collections.addProduct(collection.id, p.id, members.length, token); toast('Added'); } catch (e) { toast(e.message, 'error'); }
    }
    onSaved();
  }
  return <Modal title={collection ? `Manage — ${collection.title}` : 'New collection'} onClose={onClose} wide>
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className={label}>Title</label><input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div><label className={label}>Slug</label><input className={input} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div>
      </div>
      <div><label className={label}>Description</label><input className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active (visible in shop)</label>
      {collection && (
        <>
          <div className="flex items-center justify-between"><label className="text-xs font-semibold text-gray-600">Products in collection ({members.length})</label><label className="text-xs text-gray-400">{products.length} available</label></div>
          <div className="max-h-64 overflow-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
            {products.map((p) => (
              <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={memberIds.has(p.id)} onChange={() => toggleMember(p)} />
                <img src={p.images?.[0]?.url || '/placeholder-bloom.jpg'} alt="" className="w-8 h-8 rounded object-cover" onError={(e) => { e.currentTarget.src = '/placeholder-bloom.jpg'; }} />
                <span className="text-gray-700 flex-1 truncate">{p.title}</span>
                <span className="text-xs text-gray-400">${Number(p.price).toFixed(2)}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
    <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy || !form.title || !form.slug}>{busy ? 'Saving…' : collection ? 'Save changes' : 'Create collection'}</Btn></div>
  </Modal>;
}

function MetaSync({ data, reload, token }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const meta = data.meta || {};
  const logs = Array.isArray(meta.logs) ? meta.logs : [];
  async function syncAll() {
    setBusy(true);
    try { const r = await adminApi.meta.syncAll(token); toast(`Synced ${r.queued} products`); reload(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-4">
      <Card title="Meta Catalog — Facebook/Instagram Shopping">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${meta.configured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{meta.configured ? '● Configured' : '○ Not configured'}</span>
          <span className="text-xs text-gray-500">{meta.synced || 0} synced • {meta.pending || 0} pending</span>
          <div className="ml-auto flex gap-2"><Btn onClick={syncAll} disabled={busy || !meta.configured}>{busy ? 'Syncing…' : 'Sync all products'}</Btn></div>
        </div>
        {!meta.configured && <p className="text-xs text-gray-500 mt-3">Set META_CATALOG_ID + META_ACCESS_TOKEN in Netlify env to enable.</p>}
      </Card>
      <Card title={`Sync log — ${logs.length} recent`}>
        <div className="space-y-1">{logs.map((l) => (
          <div key={l.id} className="flex justify-between text-xs border-b border-gray-100 py-1.5"><span className="text-gray-700 truncate mr-2">{l.message || l.action} {l.productId ? `• ${l.productId.slice(-6)}` : ''}</span><span className="text-gray-400 shrink-0">{new Date(l.createdAt).toLocaleString()}</span></div>
        ))}{logs.length === 0 && <div className="text-xs text-gray-400 py-4 text-center">No sync activity yet</div>}</div>
      </Card>
    </div>
  );
}

function Bookings({ data }) {
  const bookings = Array.isArray(data.bookings) ? data.bookings : [];
  const confirmed = bookings.filter((b) => b.status === 'confirmed' || b.status === 'attended').length;
  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">{bookings.length} bookings • {confirmed} confirmed/attended</div>
      {bookings.map((b) => (
        <div key={b.id} className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3 text-sm">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-gray-800">{b.name} <span className="text-gray-400 font-normal">• {b.email}</span></div>
            <div className="text-xs text-gray-500">{b.session?.workshop?.title} • {b.session ? new Date(b.session.startsAt).toLocaleDateString('en-AU') : ''} • qty {b.quantity}</div>
          </div>
          <StatusBadge value={b.status} />
          <span className="text-xs font-bold text-royal-700">${Number(b.totalPaid).toFixed(2)}</span>
          {b.ticket && <span className="text-[10px] text-gray-400 font-mono" title={b.ticket.qrPayload}>✓ ticket</span>}
        </div>
      ))}
      {bookings.length === 0 && <div className="text-xs text-gray-400 py-10 text-center">No bookings yet</div>}
    </div>
  );
}

function Discounts({ data, reload, token }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const discounts = Array.isArray(data.discounts) ? data.discounts : [];
  async function toggle(d) { try { await adminApi.discounts.update(d.id, { isActive: !d.isActive }, token); toast('Discount updated'); reload(); } catch (e) { toast(e.message, 'error'); } }
  async function doDelete() { try { await adminApi.discounts.remove(confirmDel.id, token); toast('Discount deleted'); reload(); } catch (e) { toast(e.message, 'error'); } }
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center"><div className="text-xs text-gray-500">{discounts.length} discount codes</div><Btn onClick={() => setEditing({})}>+ New code</Btn></div>
      {discounts.map((d) => (
        <div key={d.id} className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2"><span className="font-black text-royal-700">{d.code}</span><StatusBadge value={d.isActive ? 'published' : 'archived'} /></div>
            <div className="text-xs text-gray-500">{d.type === 'percent' ? `${d.value}% off` : `$${Number(d.value).toFixed(2)} off`}{d.minSpend ? ` • min $${Number(d.minSpend).toFixed(2)}` : ''}{d.maxUses ? ` • used ${d.usedCount}/${d.maxUses}` : ''}</div>
          </div>
          <Btn small color="ghost" onClick={() => setEditing(d)}>Edit</Btn>
          <Btn small color="ghost" onClick={() => toggle(d)}>{d.isActive ? 'Disable' : 'Enable'}</Btn>
          <Btn small color="red" onClick={() => setConfirmDel(d)}>Delete</Btn>
        </div>
      ))}
      {discounts.length === 0 && <div className="text-xs text-gray-400 py-10 text-center">No discounts</div>}
      {editing && <DiscountModal discount={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast(editing.id ? 'Discount updated' : 'Discount created'); reload(); }} token={token} />}
      {confirmDel && <ConfirmDialog title="Delete discount" message={`Delete code "${confirmDel.code}"?`} onConfirm={doDelete} onClose={() => setConfirmDel(null)} />}
    </div>
  );
}
function DiscountModal({ discount, onClose, onSaved, token }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    code: discount?.code || '', description: discount?.description || '', type: discount?.type || 'percent',
    value: discount ? Number(discount.value) : '', minSpend: discount?.minSpend ? Number(discount.minSpend) : '',
    maxUses: discount?.maxUses || '', isActive: discount ? !!discount.isActive : true,
  }));
  const [busy, setBusy] = useState(false);
  const input = 'w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-gray-600 mb-1';
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  async function save() {
    setBusy(true);
    try {
      const body = { ...form, value: Number(form.value), minSpend: form.minSpend === '' ? null : Number(form.minSpend), maxUses: form.maxUses === '' ? null : Number(form.maxUses) };
      if (discount) await adminApi.discounts.update(discount.id, body, token);
      else await adminApi.discounts.create(body, token);
      onSaved();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return <Modal title={discount ? 'Edit discount' : 'New discount'} onClose={onClose}>
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label}>Code</label><input className={input} value={form.code} onChange={(e) => set('code', e.target.value)} /></div>
        <div><label className={label}>Type</label>
          <select className={input} value={form.type} onChange={(e) => set('type', e.target.value)}><option value="percent">Percent (%)</option><option value="fixed">Fixed ($)</option></select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className={label}>Value</label><input type="number" step="0.01" className={input} value={form.value} onChange={(e) => set('value', e.target.value)} /></div>
        <div><label className={label}>Min spend ($)</label><input type="number" step="0.01" className={input} value={form.minSpend} onChange={(e) => set('minSpend', e.target.value)} /></div>
        <div><label className={label}>Max uses</label><input type="number" className={input} value={form.maxUses} onChange={(e) => set('maxUses', e.target.value)} /></div>
      </div>
      <div><label className={label}>Description</label><input className={input} value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} /> Active</label>
    </div>
    <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy || !form.code || form.value === ''}>{busy ? 'Saving…' : discount ? 'Save changes' : 'Create'}</Btn></div>
  </Modal>;
}

function Reviews({ data, reload, token }) {
  const toast = useToast();
  const [confirmDel, setConfirmDel] = useState(null);
  const [confirmReject, setConfirmReject] = useState(null);
  const reviews = Array.isArray(data.reviews) ? data.reviews : [];
  async function approve(r) { try { await adminApi.reviews.approve(r.id, token); toast('Review approved'); reload(); } catch (e) { toast(e.message, 'error'); } }
  async function doDelete() { try { await adminApi.reviews.remove(confirmDel.id, token); toast('Review deleted'); reload(); } catch (e) { toast(e.message, 'error'); } }
  async function doReject() { try { await adminApi.reviews.reject(confirmReject.id, token); toast('Review rejected'); reload(); } catch (e) { toast(e.message, 'error'); } }
  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">{reviews.length} pending reviews</div>
      {reviews.map((r) => (
        <div key={r.id} className="border border-gray-200 rounded-xl p-4">
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1"><div className="font-bold text-sm text-gray-800">{'★'.repeat(Math.max(1, r.rating || 5))}{'☆'.repeat(5 - Math.max(1, r.rating || 5))} — {r.name || 'Anonymous'}</div>
              <div className="text-xs text-gray-500 mt-1">{r.product?.title || r.productId}</div>
              {r.title && <div className="text-sm font-semibold text-gray-700 mt-1">{r.title}</div>}
              <p className="text-sm text-gray-600 mt-1">{r.body || '—'}</p></div>
            <div className="flex gap-2 shrink-0">
              <Btn small color="royal" onClick={() => approve(r)}>Approve</Btn>
              <Btn small color="ghost" onClick={() => setConfirmReject(r)}>Reject</Btn>
              <Btn small color="red" onClick={() => setConfirmDel(r)}>Delete</Btn>
            </div>
          </div>
        </div>
      ))}
      {reviews.length === 0 && <div className="text-xs text-gray-400 py-10 text-center">No pending reviews</div>}
      {confirmDel && <ConfirmDialog title="Delete review" message="Delete this review permanently?" onConfirm={doDelete} onClose={() => setConfirmDel(null)} />}
      {confirmReject && <ConfirmDialog title="Reject review" message={`Reject this review from ${confirmReject.name}? It will be removed (audited).`} confirmLabel="Reject" onConfirm={doReject} onClose={() => setConfirmReject(null)} />}
    </div>
  );
}

function Blog({ data, reload, token }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const posts = Array.isArray(data.posts) ? data.posts : [];
  async function setStatus(p, status) { try { await adminApi.posts.update(p.id, { status }, token); toast(`Post → ${status}`); reload(); } catch (e) { toast(e.message, 'error'); } }
  async function doDelete() { try { await adminApi.posts.remove(confirmDel.id, token); toast('Post deleted'); reload(); } catch (e) { toast(e.message, 'error'); } }
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center"><div className="text-xs text-gray-500">{posts.length} posts</div><Btn onClick={() => setEditing({})}>+ New post</Btn></div>
      {posts.map((p) => (
        <div key={p.id} className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3">
          <div className="flex-1 min-w-0"><div className="font-bold text-sm text-gray-800 truncate">{p.title}</div><div className="text-xs text-gray-500">{p.slug} • {new Date(p.publishedAt || p.createdAt).toLocaleDateString('en-AU')} • {p.viewCount || 0} views</div></div>
          <StatusBadge value={p.status} />
          <Btn small color="ghost" onClick={() => setEditing(p)}>Edit</Btn>
          <Btn small color="ghost" onClick={() => setStatus(p, p.status === 'published' ? 'draft' : 'published')}>{p.status === 'published' ? 'Unpublish' : 'Publish'}</Btn>
          <Btn small color="red" onClick={() => setConfirmDel(p)}>Delete</Btn>
        </div>
      ))}
      {posts.length === 0 && <div className="text-xs text-gray-400 py-10 text-center">No posts</div>}
      {editing && <PostModal post={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast(editing.id ? 'Post updated' : 'Post created'); reload(); }} token={token} />}
      {confirmDel && <ConfirmDialog title="Delete post" message={`Delete "${confirmDel.title}"?`} onConfirm={doDelete} onClose={() => setConfirmDel(null)} />}
    </div>
  );
}
function PostModal({ post, onClose, onSaved, token }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: post?.title || '', slug: post?.slug || '', excerpt: post?.excerpt || '', content: post?.content || '', status: post?.status || 'draft', tags: post?.tags || [] });
  const [busy, setBusy] = useState(false);
  const input = 'w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-gray-600 mb-1';
  async function save() {
    setBusy(true);
    try {
      const tags = typeof form.tags === 'string' ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : form.tags;
      const body = { ...form, tags };
      if (post) await adminApi.posts.update(post.id, body, token);
      else await adminApi.posts.create(body, token);
      onSaved();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return <Modal title={post ? 'Edit post' : 'New post'} onClose={onClose} wide>
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className={label}>Title</label><input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div><label className={label}>Slug</label><input className={input} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div>
      </div>
      <div><label className={label}>Excerpt</label><input className={input} value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} /></div>
      <div><label className={label}>Tags (comma-separated)</label><input className={input} value={Array.isArray(form.tags) ? form.tags.join(', ') : form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></div>
      <div><label className={label}>Content</label><textarea rows={8} className={input} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
    </div>
    <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy || !form.title}>{busy ? 'Saving…' : post ? 'Save changes' : 'Create post'}</Btn></div>
  </Modal>;
}

function POS({ data, reload, token }) {
  const toast = useToast();
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closingCash, setClosingCash] = useState('');
  const [busy, setBusy] = useState(false);
  const s = data.posSession;
  async function open() {
    setBusy(true);
    try { await adminApi.pos.open({ location: 'Perth Studio', openingCash: Number(opening) || 0 }, token); toast('Till opened'); reload(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  async function close() {
    setBusy(true);
    try { await adminApi.pos.close(s.id, Number(closingCash), token); toast('Till closed'); reload(); setClosing(false); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  const sessions = Array.isArray(data.posSessions) ? data.posSessions : [];
  const sales = Array.isArray(data.posSales) ? data.posSales : [];
  const totalSales = sales.reduce((a, o) => a + Number(o.total || 0), 0);
  return (
    <div className="space-y-4">
      <Card title="Point of Sale">
        {s ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-royal-50 border border-royal-100">
              <div className="font-bold text-royal-700">{s.location} — {s.status}</div>
              <div className="text-xs text-gray-600 mt-1">Opened {new Date(s.openedAt).toLocaleString()} • Float ${Number(s.openingCash).toFixed(2)} • {s.payments?.length || 0} payments</div>
            </div>
            <Btn onClick={() => setClosing(true)}>Close till</Btn>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-gray-500">No open till — open one to record POS sales.</div>
            <div className="flex items-end gap-3"><div><label className="block text-xs font-semibold text-gray-600 mb-1">Opening float ($)</label><input type="number" className="w-32 border border-gray-300 rounded-xl px-3 py-2 text-sm" value={opening} onChange={(e) => setOpening(e.target.value)} /></div><Btn onClick={open} disabled={busy}>Open till</Btn></div>
          </div>
        )}
      </Card>
      {sales.length > 0 && (
        <Card title={`POS sales — ${sales.length} • $${totalSales.toFixed(2)}`}>
          <div className="space-y-1">{sales.slice(0, 20).map((o) => (
            <div key={o.id} className="flex justify-between text-xs border-b border-gray-100 py-1.5"><span className="font-medium text-gray-700">{o.orderNumber} <span className="text-gray-400">• {o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-AU') : ''}</span></span><span className="font-bold text-royal-700">${Number(o.total).toFixed(2)}</span></div>
          ))}</div>
        </Card>
      )}
      {sessions.length > 0 && (
        <Card title={`Till sessions — ${sessions.length}`}>
          <div className="space-y-1">{sessions.slice(0, 15).map((se) => (
            <div key={se.id} className="flex justify-between text-xs border-b border-gray-100 py-1.5"><span>{se.location} • {new Date(se.openedAt).toLocaleString()}</span><span className="flex items-center gap-2"><StatusBadge value={se.status} />{se.variance !== null && se.variance !== undefined && <span className={Number(se.variance) < 0 ? 'text-red-600' : 'text-emerald-600'}>var ${Number(se.variance).toFixed(2)}</span>}</span></div>
          ))}</div>
        </Card>
      )}
      {closing && <Modal title="Close till" onClose={() => setClosing(false)}>
        <div><label className="block text-xs font-semibold text-gray-600 mb-1">Closing cash ($)</label><input type="number" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} /></div>
        <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={() => setClosing(false)}>Cancel</Btn><Btn onClick={close} disabled={busy}>Close till</Btn></div>
      </Modal>}
    </div>
  );
}

function Customers({ data, reload, token }) {
  const toast = useToast();
  const [detail, setDetail] = useState(null);
  const [busyLoyalty, setBusyLoyalty] = useState('');
  const customers = Array.isArray(data.customers) ? data.customers : [];
  async function openDetail(c) {
    const d = await adminApi.customers.get(c.id, token).catch(() => null);
    if (d) setDetail(d);
  }
  async function adjustLoyalty(c, delta) {
    setBusyLoyalty(c.id);
    try { await adminApi.customers.setLoyalty(c.email, { delta: Number(delta) }, token); toast(`Points adjusted for ${c.name}`); reload(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusyLoyalty(''); }
  }
  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">{customers.length} customers</div>
      <div className="space-y-1.5">
        {customers.map((c) => (
          <div key={c.id} className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-2.5 text-sm flex-wrap">
            <span className="font-bold text-gray-800 flex-1 min-w-[160px]">{c.name || '—'}</span>
            <span className="text-xs text-gray-500 truncate">{c.email}</span>
            <span className="text-xs text-gray-500">{c.orders} orders • <span className="font-semibold text-royal-700">${Number(c.spend).toFixed(2)}</span></span>
            <span className="text-xs font-semibold text-gray-700">{c.points} pts <span className="text-gray-400">({c.tier})</span></span>
            <Btn small color="ghost" onClick={() => openDetail(c)}>View</Btn>
            <Btn small color="ghost" onClick={() => adjustLoyalty(c, -50)} disabled={busyLoyalty === c.id}>−50</Btn>
            <Btn small color="ghost" onClick={() => adjustLoyalty(c, 50)} disabled={busyLoyalty === c.id}>+50</Btn>
          </div>
        ))}
        {customers.length === 0 && <div className="text-xs text-gray-400 py-10 text-center">No customers yet</div>}
      </div>
      {detail && <CustomerModal customer={detail} onClose={() => setDetail(null)} token={token} />}
    </div>
  );
}
function CustomerModal({ customer, onClose, token }) {
  const toast = useToast();
  const [points, setPoints] = useState(customer.loyalty?.points || 0);
  const [busy, setBusy] = useState(false);
  const orders = Array.isArray(customer.orders) ? customer.orders : [];
  const bookings = Array.isArray(customer.bookings) ? customer.bookings : [];
  const customOrders = Array.isArray(customer.customOrders) ? customer.customOrders : [];
  const txs = customer.loyalty?.transactions || [];
  async function savePoints() {
    setBusy(true);
    try { await adminApi.customers.setLoyalty(customer.email, { set: Number(points) }, token); toast('Points set'); onClose(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return (
    <Modal title={customer.name || customer.email} onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        <div className="text-xs text-gray-500">{customer.email} • {customer.role} • joined {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('en-AU') : ''}</div>
        <div className="flex items-end gap-3 border border-gray-200 rounded-xl p-3">
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">Loyalty points</label><input type="number" className="w-28 border border-gray-300 rounded-xl px-3 py-2 text-sm" value={points} onChange={(e) => setPoints(e.target.value)} /></div>
          <Btn onClick={savePoints} disabled={busy}>{busy ? 'Saving…' : 'Set points'}</Btn>
        </div>
        <div>
          <div className="font-bold text-gray-700 mb-1">Orders ({orders.length})</div>
          <div className="space-y-1 max-h-40 overflow-auto">{orders.map((o) => <div key={o.id} className="flex justify-between text-xs border-b border-gray-100 py-1"><span>{o.orderNumber} <span className="text-gray-400">• {new Date(o.createdAt).toLocaleDateString('en-AU')}</span></span><span><StatusBadge value={o.status} /> <span className="font-bold text-royal-700">${Number(o.total).toFixed(2)}</span></span></div>)}{orders.length === 0 && <div className="text-xs text-gray-400">No orders</div>}</div>
        </div>
        <div>
          <div className="font-bold text-gray-700 mb-1">Bookings ({bookings.length})</div>
          <div className="space-y-1 max-h-32 overflow-auto">{bookings.map((b) => <div key={b.id} className="flex justify-between text-xs border-b border-gray-100 py-1"><span>{b.session?.workshop?.title || 'Workshop'} • {b.quantity} seat(s)</span><StatusBadge value={b.status} /></div>)}{bookings.length === 0 && <div className="text-xs text-gray-400">No bookings</div>}</div>
        </div>
        <div>
          <div className="font-bold text-gray-700 mb-1">Custom art orders ({customOrders.length})</div>
          <div className="space-y-1 max-h-32 overflow-auto">{customOrders.map((co) => <div key={co.id} className="flex justify-between text-xs border-b border-gray-100 py-1"><span>{co.orderNumber}</span><span className="text-gray-500">{co.state}</span></div>)}{customOrders.length === 0 && <div className="text-xs text-gray-400">None</div>}</div>
        </div>
        {txs.length > 0 && (
          <div>
            <div className="font-bold text-gray-700 mb-1">Loyalty history</div>
            <div className="space-y-1 max-h-32 overflow-auto">{txs.map((t) => <div key={t.id} className="flex justify-between text-xs border-b border-gray-100 py-1"><span className="text-gray-500">{t.reason}</span><span className={t.pointsDelta > 0 ? 'text-emerald-600' : 'text-red-600'}>{(t.pointsDelta > 0 ? '+' : '') + t.pointsDelta}</span></div>)}</div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Shipping({ data, reload, token }) {
  const toast = useToast();
  const [zoneEditor, setZoneEditor] = useState(null);
  const [rateFor, setRateFor] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const zones = Array.isArray(data.zones) ? data.zones : [];
  async function toggleZone(z, active) { try { await adminApi.shipping.updateZone(z.id, { isActive: active }, token); toast('Zone updated'); reload(); } catch (e) { toast(e.message, 'error'); } }
  async function doDelete() {
    try {
      if (confirmDel.type === 'zone') await adminApi.shipping.deleteZone(confirmDel.id, token);
      else await adminApi.shipping.deleteRate(confirmDel.id, token);
      toast('Deleted'); reload();
    } catch (e) { toast(e.message, 'error'); }
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center"><div className="text-xs text-gray-500">{zones.length} shipping zones</div><Btn onClick={() => setZoneEditor({})}>+ New zone</Btn></div>
      {zones.map((z) => (
        <div key={z.id} className="border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0"><div className="font-bold text-sm text-gray-800">{z.name}</div><div className="text-xs text-gray-500">{z.postcodes ? (Array.isArray(z.postcodes) ? z.postcodes.join(', ') : z.postcodes) : 'All postcodes'} </div></div>
            <StatusBadge value={z.isActive ? 'published' : 'archived'} />
            <Btn small color="ghost" onClick={() => toggleZone(z, !z.isActive)}>{z.isActive ? 'Disable' : 'Enable'}</Btn>
            <Btn small color="ghost" onClick={() => setRateFor(z)}>+ Rate</Btn>
            <Btn small color="red" onClick={() => setConfirmDel({ type: 'zone', id: z.id })}>Delete</Btn>
          </div>
          <div className="mt-2 space-y-1">
            {(z.rates || []).map((r) => (
              <div key={r.id} className="flex items-center gap-3 text-xs border-b border-gray-100 py-1">
                <span className="font-medium text-gray-700 flex-1">{r.name}</span>
                <span className="text-gray-500">${Number(r.price).toFixed(2)}{r.freeOver ? ` • free over $${Number(r.freeOver).toFixed(2)}` : ''}{r.maxWeightGrams ? ` • ≤${r.maxWeightGrams}g` : ''}</span>
                <Btn small color="ghost" onClick={() => setRateFor(z, r)}>Edit</Btn>
                <Btn small color="red" onClick={() => setConfirmDel({ type: 'rate', id: r.id })}>Del</Btn>
              </div>
            ))}
            {(z.rates || []).length === 0 && <div className="text-xs text-gray-400">No rates — add one</div>}
          </div>
        </div>
      ))}
      {zones.length === 0 && <div className="text-xs text-gray-400 py-10 text-center">No zones — add one to configure delivery pricing</div>}
      {zoneEditor && <ZoneModal zone={zoneEditor.id ? zoneEditor : null} onClose={() => setZoneEditor(null)} onSaved={() => { setZoneEditor(null); toast(zoneEditor.id ? 'Zone updated' : 'Zone created'); reload(); }} token={token} />}
      {rateFor && <RateModal zone={rateFor} rate={rateFor._rate} onClose={() => setRateFor(null)} onSaved={() => { setRateFor(null); toast('Rate saved'); reload(); }} token={token} />}
      {confirmDel && <ConfirmDialog title="Delete" message={`Delete this ${confirmDel.type}?`} onConfirm={doDelete} onClose={() => setConfirmDel(null)} />}
    </div>
  );
}
function ZoneModal({ zone, onClose, onSaved, token }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({ name: zone?.name || '', postcodes: zone?.postcodes ? (Array.isArray(zone.postcodes) ? zone.postcodes.join(', ') : zone.postcodes) : '', isActive: zone ? !!zone.isActive : true }));
  const [busy, setBusy] = useState(false);
  const input = 'w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-gray-600 mb-1';
  async function save() {
    setBusy(true);
    try {
      const postcodes = form.postcodes.split(',').map((p) => p.trim()).filter(Boolean).join(',');
      const body = { ...form, postcodes };
      if (zone) await adminApi.shipping.updateZone(zone.id, body, token);
      else await adminApi.shipping.createZone(body, token);
      onSaved();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return <Modal title={zone ? 'Edit zone' : 'New zone'} onClose={onClose}>
    <div className="space-y-3">
      <div><label className={label}>Name</label><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div><label className={label}>Postcodes (comma-separated, prefix-matched)</label><input className={input} value={form.postcodes} onChange={(e) => setForm({ ...form, postcodes: e.target.value })} placeholder="6000, 6151, 6152" /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active</label>
    </div>
    <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy || !form.name}>{busy ? 'Saving…' : zone ? 'Save changes' : 'Create'}</Btn></div>
  </Modal>;
}
function RateModal({ zone, rate, onClose, onSaved, token }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({ name: rate?.name || 'Standard', price: rate ? Number(rate.price) : '', freeOver: rate?.freeOver ? Number(rate.freeOver) : '', maxWeightGrams: rate?.maxWeightGrams || '', isActive: rate ? !!rate.isActive : true }));
  const [busy, setBusy] = useState(false);
  const input = 'w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-gray-600 mb-1';
  async function save() {
    setBusy(true);
    try {
      const body = { ...form, price: Number(form.price), freeOver: form.freeOver === '' ? null : Number(form.freeOver), maxWeightGrams: form.maxWeightGrams === '' ? null : Number(form.maxWeightGrams) };
      if (rate) await adminApi.shipping.updateRate(rate.id, body, token);
      else await adminApi.shipping.addRate(zone.id, body, token);
      onSaved();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return <Modal title={`${rate ? 'Edit' : 'Add'} rate — ${zone.name}`} onClose={onClose}>
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label}>Name</label><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label className={label}>Price ($)</label><input type="number" step="0.01" className={input} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label}>Free over ($, optional)</label><input type="number" step="0.01" className={input} value={form.freeOver} onChange={(e) => setForm({ ...form, freeOver: e.target.value })} /></div>
        <div><label className={label}>Max weight (g, optional)</label><input type="number" className={input} value={form.maxWeightGrams} onChange={(e) => setForm({ ...form, maxWeightGrams: e.target.value })} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active</label>
    </div>
    <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy || form.price === ''}>{busy ? 'Saving…' : 'Save'}</Btn></div>
  </Modal>;
}

function Users({ data, reload, token }) {
  const toast = useToast();
  const [busyId, setBusyId] = useState('');
  const users = Array.isArray(data.users) ? data.users : [];
  async function setRole(u, role) {
    setBusyId(u.id);
    try {
      const res = await fetch(`/api/users/${u.id}/role`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ role }) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Failed'); }
      toast(`Role → ${role}`); reload();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusyId(''); }
  }
  return <div><div className="text-xs text-gray-500 mb-3">{users.length} accounts — change a role to update access</div><div className="grid sm:grid-cols-2 gap-2">
    {users.map((u) => <div key={u.id} className="flex items-center gap-3 border border-gray-200 rounded-xl px-3 py-2 text-sm">
      <span className="font-medium text-gray-800 flex-1 truncate">{u.name}</span>
      <span className="text-xs text-gray-500 truncate">{u.email}</span>
      <select value={u.role} disabled={busyId === u.id} onChange={(e) => setRole(u, e.target.value)}
        className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-royal-500">
        <option value="customer">customer</option><option value="staff">staff</option><option value="maker">maker</option><option value="admin">admin</option><option value="developer">developer</option>
      </select>
    </div>)}
    {users.length === 0 && <div className="text-xs text-gray-400 py-8 text-center">No users</div>}
  </div></div>;
}

function Reports({ data }) {
  const board = Array.isArray(data.leaderboard) ? data.leaderboard : [];
  return <div><div className="text-xs text-gray-500 mb-3">Loyalty leaderboard (top 10)</div>
    <div className="space-y-1.5">{board.map((b, i) => (
      <div key={i} className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-2.5 text-sm">
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${i < 3 ? 'bg-royal-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{i + 1}</span>
        <span className="font-medium text-gray-800 flex-1 truncate">{b.email}</span>
        <span className="text-xs text-gray-500">{b.tier}</span><span className="font-bold text-royal-700">{b.points} pts</span>
      </div>))}
    {board.length === 0 && <div className="text-xs text-gray-400 py-8 text-center">No points yet</div>}
    </div></div>;
}

function Settings({ data, reload, token }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    // business
    abn: data.settings?.abn || '', business_name: data.settings?.business_name || '', business_address: data.settings?.business_address || '', tax_gst_rate: data.settings?.tax_gst_rate || '0.10',
    // theme
    theme_primary: data.settings?.theme_primary || '', theme_primary_dark: data.settings?.theme_primary_dark || '', theme_bg: data.settings?.theme_bg || '', theme_admin_purple: data.settings?.theme_admin_purple || '', theme_color: data.settings?.theme_color || '', theme_font: data.settings?.theme_font || '',
    // criteria
    labour_rate_per_hour: data.settings?.labour_rate_per_hour || '55', bom_margin: data.settings?.bom_margin || '1.30',
    shipping_free_over: data.settings?.shipping_free_over || '150',
    loyalty_blossom_threshold: data.settings?.loyalty_blossom_threshold || '100', loyalty_garden_threshold: data.settings?.loyalty_garden_threshold || '500', loyalty_earn_rate: data.settings?.loyalty_earn_rate || '1', loyalty_redeem_rate: data.settings?.loyalty_redeem_rate || '5',
    configurator_floor: data.settings?.configurator_floor || '45', configurator_per_stem: data.settings?.configurator_per_stem || '9.5', configurator_vase: data.settings?.configurator_vase || '22', configurator_greenery: data.settings?.configurator_greenery || '12', low_stock_default: data.settings?.low_stock_default || '5',
  }));
  const [busy, setBusy] = useState(false);
  const input = 'w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-gray-600 mb-1';
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  async function save() {
    setBusy(true);
    try { await adminApi.settings.save(form, token); toast('Settings saved'); reload(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  const colorInput = (k, placeholder) => (
    <div className="flex items-end gap-2"><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(form[k]) ? form[k] : '#B85C5C'} onChange={(e) => set(k, e.target.value)} className="w-10 h-9 rounded-lg border border-gray-300 cursor-pointer" /><input className={input} value={form[k]} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} /></div>
  );
  return <div className="space-y-4">
    <Card title="Business">
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className={label}>Business name</label><input className={input} value={form.business_name} onChange={(e) => set('business_name', e.target.value)} /></div>
        <div><label className={label}>ABN</label><input className={input} value={form.abn} onChange={(e) => set('abn', e.target.value)} /></div>
        <div><label className={label}>Business address</label><input className={input} value={form.business_address} onChange={(e) => set('business_address', e.target.value)} /></div>
        <div><label className={label}>GST rate (decimal)</label><input className={input} value={form.tax_gst_rate} onChange={(e) => set('tax_gst_rate', e.target.value)} /></div>
      </div>
    </Card>
    <Card title="Web options — colours & fonts" description="Changes apply live to the shop (theme + browser tab colour).">
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className={label}>Primary colour (buttons/accents)</label>{colorInput('theme_primary', '#B85C5C')}</div>
        <div><label className={label}>Dark shade (text on light)</label>{colorInput('theme_primary_dark', '#4A2C2A')}</div>
        <div><label className={label}>Background tint</label>{colorInput('theme_bg', '#FFF7F0')}</div>
        <div><label className={label}>Admin purple accent</label>{colorInput('theme_admin_purple', '#7C3AED')}</div>
        <div><label className={label}>Browser theme colour</label>{colorInput('theme_color', '#B85C5C')}</div>
        <div><label className={label}>Font family</label>
          <select className={input} value={form.theme_font} onChange={(e) => set('theme_font', e.target.value)}>
            <option value="">Inter (default)</option><option value="Georgia, serif">Georgia (serif)</option><option value="'Times New Roman', serif">Times (serif)</option><option value="system-ui, sans-serif">System UI</option><option value="'Courier New', monospace">Monospace</option>
          </select>
        </div>
      </div>
    </Card>
    <Card title="Business criteria">
      <div className="grid sm:grid-cols-3 gap-3">
        <div><label className={label}>Labour rate ($/hr)</label><input className={input} value={form.labour_rate_per_hour} onChange={(e) => set('labour_rate_per_hour', e.target.value)} /></div>
        <div><label className={label}>BOM margin (×)</label><input className={input} value={form.bom_margin} onChange={(e) => set('bom_margin', e.target.value)} /></div>
        <div><label className={label}>Free shipping over ($)</label><input className={input} value={form.shipping_free_over} onChange={(e) => set('shipping_free_over', e.target.value)} /></div>
        <div><label className={label}>Loyalty — blossom threshold (pts)</label><input className={input} value={form.loyalty_blossom_threshold} onChange={(e) => set('loyalty_blossom_threshold', e.target.value)} /></div>
        <div><label className={label}>Loyalty — garden threshold (pts)</label><input className={input} value={form.loyalty_garden_threshold} onChange={(e) => set('loyalty_garden_threshold', e.target.value)} /></div>
        <div><label className={label}>Loyalty — earn rate (pts/$)</label><input className={input} value={form.loyalty_earn_rate} onChange={(e) => set('loyalty_earn_rate', e.target.value)} /></div>
        <div><label className={label}>Loyalty — redeem ($ per 100 pts)</label><input className={input} value={form.loyalty_redeem_rate} onChange={(e) => set('loyalty_redeem_rate', e.target.value)} /></div>
        <div><label className={label}>Configurator floor ($)</label><input className={input} value={form.configurator_floor} onChange={(e) => set('configurator_floor', e.target.value)} /></div>
        <div><label className={label}>Configurator per-stem ($)</label><input className={input} value={form.configurator_per_stem} onChange={(e) => set('configurator_per_stem', e.target.value)} /></div>
        <div><label className={label}>Configurator vase add-on ($)</label><input className={input} value={form.configurator_vase} onChange={(e) => set('configurator_vase', e.target.value)} /></div>
        <div><label className={label}>Configurator greenery add-on ($)</label><input className={input} value={form.configurator_greenery} onChange={(e) => set('configurator_greenery', e.target.value)} /></div>
        <div><label className={label}>Low-stock default threshold</label><input className={input} value={form.low_stock_default} onChange={(e) => set('low_stock_default', e.target.value)} /></div>
      </div>
    </Card>
    <div className="flex gap-2"><Btn onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save all settings'}</Btn></div>
  </div>;
}

function NotebookAdmin({ data, onSave, token }) {
  const toast = useToast();
  const [url, setUrl] = useState(data.notebookUrl || '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data.notebookUrl) setUrl(data.notebookUrl); }, [data.notebookUrl]);
  async function save() {
    setSaving(true);
    try { await adminApi.settings.save({ notebooklm_url: url }, token); toast('Notebook URL updated'); onSave(url); }
    catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }
  const posts = Array.isArray(data.notebookPosts) ? data.notebookPosts : [];
  return (
    <div className="space-y-4">
      <Card title="NotebookLM — published URL">
        <p className="text-xs text-gray-500 mb-3">Public /notebook page reads this setting; falls back to the hardcoded notebook when unset.</p>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://notebooklm.google.com/notebook/…" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />
        <div className="mt-3 flex items-center gap-3"><Btn onClick={save} disabled={saving || !url}>{saving ? 'Saving…' : 'Save URL'}</Btn><a href={url} target="_blank" rel="noreferrer" className="text-xs text-royal-700 hover:underline">Open in NotebookLM →</a></div>
      </Card>
      <Card title={`Posts tagged "notebook" (${posts.length})`}>
        <div className="space-y-1">{posts.map((p) => <div key={p.id} className="text-xs border-b border-gray-100 py-1.5"><span className="font-bold text-gray-700">{p.title}</span> <span className="text-gray-400">— {p.slug}</span></div>)}{posts.length === 0 && <div className="text-xs text-gray-400">No posts with tag notebook</div>}</div>
      </Card>
    </div>
  );
}