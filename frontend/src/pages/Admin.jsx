import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../lib/api/customClient';
import { ToastProvider, useToast } from '../components/admin/Toast';
import Modal from '../components/admin/Modal';
import ConfirmDialog from '../components/admin/ConfirmDialog';
import StatusBadge from '../components/admin/Badge';

const TABS = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'orders', label: 'Orders', icon: '🧾' },
  { id: 'inventory', label: 'Inventory', icon: '📦' },
  { id: 'products', label: 'Products', icon: '🌹' },
  { id: 'workshops', label: 'Workshops', icon: '🎨' },
  { id: 'reviews', label: 'Reviews', icon: '⭐' },
  { id: 'blog', label: 'Blog', icon: '📝' },
  { id: 'pos', label: 'POS', icon: '💳' },
  { id: 'users', label: 'Users', icon: '👥' },
  { id: 'reports', label: 'Reports', icon: '📈' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
  { id: 'notebook', label: 'Notebook', icon: '📓' },
];

const ORDER_FLOW = ['pending_payment', 'paid', 'making', 'ready', 'shipped', 'delivered'];

function AdminInner() {
  const toast = useToast();
  const params = new URLSearchParams(window.location.search);
  const [tab, setTab] = useState(params.get('tab') || 'overview');
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const token = localStorage.getItem('token') || '';

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
        const [levels, materials, recon, locations] = await Promise.all([
          adminApi.inventory.levels(token).catch(() => []),
          adminApi.materials.list(token).catch(() => []),
          adminApi.inventory.reconciliation(token).catch(() => []),
          adminApi.inventory.locations(token).catch(() => []),
        ]);
        setData((s) => ({ ...s, levels, materials, recon, locations }));
      } else if (tabId === 'products') {
        const products = (await adminApi.products.list(token).catch(() => ({ products: [] }))).products || [];
        setData((s) => ({ ...s, products }));
      } else if (tabId === 'workshops') {
        const workshops = await adminApi.workshops.list().catch(() => []);
        setData((s) => ({ ...s, workshops }));
      } else if (tabId === 'reviews') {
        const reviews = await adminApi.reviews.pending(token).catch(() => []);
        setData((s) => ({ ...s, reviews }));
      } else if (tabId === 'blog') {
        const posts = await adminApi.posts.list(token).catch(() => []);
        setData((s) => ({ ...s, posts }));
      } else if (tabId === 'pos') {
        const posSession = await adminApi.pos.current(token).catch(() => null);
        setData((s) => ({ ...s, posSession }));
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

  useEffect(() => { load(tab); window.history.replaceState(null, '', `?tab=${tab}`); /* eslint-disable-next-line */ }, [tab]);

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
        </aside>

        <div className="flex-1 min-w-0">
          <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between lg:hidden">
            <h1 className="font-black text-royal-700">Studio Manager</h1>
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
                  {tab === 'workshops' && <Workshops data={data} reload={() => load('workshops')} token={token} />}
                  {tab === 'reviews' && <Reviews data={data} reload={() => load('reviews')} token={token} />}
                  {tab === 'blog' && <Blog data={data} reload={() => load('blog')} token={token} />}
                  {tab === 'pos' && <POS data={data} reload={() => load('pos')} token={token} />}
                  {tab === 'users' && <Users data={data} />}
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

export default function AdminStudio() {
  return <ToastProvider><AdminInner /></ToastProvider>;
}

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
  const workshops = Array.isArray(data.workshops) ? data.workshops : [];
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

function Inventory({ data, reload, token }) {
  const toast = useToast();
  const [adjusting, setAdjusting] = useState(null);
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
  async function adjustMat(m, delta) {
    setAdjusting(m.id);
    try { await adminApi.materials.adjust(m.id, delta, 'Admin adjust', token); toast('Material updated'); reload(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setAdjusting(null); }
  }
  return (
    <div className="space-y-5">
      {drifted.length > 0 && <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700">⚠️ {drifted.length} variants drift: ledger vs onHand — see reconciliation below</div>}
      <Card title={`Product stock — ${levels.length} levels`}>
        <div className="space-y-1.5">
          {levels.slice(0, 25).map((l) => (
            <div key={l.id} className="flex items-center gap-3 text-xs border-b border-gray-100 py-1.5">
              <span className="font-medium text-gray-700 flex-1">{l.product?.title || l.productId} {l.variant ? `— ${l.variant.title}` : ''} <span className="text-gray-400">@{l.location?.name}</span></span>
              <span className={`font-bold ${l.onHand <= 5 ? 'text-red-600' : 'text-gray-800'}`}>{l.onHand}</span>
              <button disabled={adjusting === l.id} onClick={() => adjustLevel(l, 1)} className="w-7 h-7 rounded-lg bg-royal-50 text-royal-700 font-bold hover:bg-royal-100">+</button>
              <button disabled={adjusting === l.id} onClick={() => adjustLevel(l, -1)} className="w-7 h-7 rounded-lg bg-gray-100 text-gray-700 font-bold hover:bg-gray-200">−</button>
            </div>
          ))}
          {levels.length === 0 && <div className="text-xs text-gray-400 py-4 text-center">No levels — seed inventory</div>}
        </div>
      </Card>
      <Card title={`Raw materials — ${materials.length}`}>
        <div className="space-y-1.5">
          {materials.map((m) => (
            <div key={m.id} className="flex items-center gap-3 text-xs border-b border-gray-100 py-1.5">
              <span className="font-medium text-gray-700 flex-1">{m.name} <span className="text-gray-400">{m.sku} • {m.unit}</span></span>
              <span className={`font-bold ${Number(m.onHand) <= Number(m.lowThreshold) ? 'text-amber-600' : 'text-gray-800'}`}>{m.onHand}</span>
              <button disabled={adjusting === m.id} onClick={() => adjustMat(m, 10)} className="w-7 h-7 rounded-lg bg-royal-50 text-royal-700 font-bold hover:bg-royal-100">+</button>
              <button disabled={adjusting === m.id} onClick={() => adjustMat(m, -10)} className="w-7 h-7 rounded-lg bg-gray-100 text-gray-700 font-bold hover:bg-gray-200">−</button>
            </div>
          ))}
          {materials.length === 0 && <div className="text-xs text-gray-400 py-4 text-center">No materials</div>}
        </div>
      </Card>
      <Card title={`Reconciliation — ledger vs quantity (${drifted.length} drift)`}>
        <div className="space-y-1">
          {recon.slice(0, 12).map((r) => <div key={r.variantId} className={`flex justify-between text-xs border-b border-gray-100 py-1 ${r.ok ? '' : 'text-red-600'}`}><span>{r.product} — {r.title}</span><span>{r.inventoryQuantity} vs ledger {r.ledgerTotal} {r.ok ? '✓' : `drift ${r.drift}`}</span></div>)}
          {recon.length === 0 && <div className="text-xs text-gray-400 py-4 text-center">No variants</div>}
        </div>
      </Card>
    </div>
  );
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
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
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

function Reviews({ data, reload, token }) {
  const toast = useToast();
  const [confirmDel, setConfirmDel] = useState(null);
  const reviews = Array.isArray(data.reviews) ? data.reviews : [];
  async function approve(r) { try { await adminApi.reviews.approve(r.id, token); toast('Review approved'); reload(); } catch (e) { toast(e.message, 'error'); } }
  async function doDelete() { try { await adminApi.reviews.remove(confirmDel.id, token); toast('Review deleted'); reload(); } catch (e) { toast(e.message, 'error'); } }
  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">{reviews.length} pending reviews</div>
      {reviews.map((r) => (
        <div key={r.id} className="border border-gray-200 rounded-xl p-4">
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1"><div className="font-bold text-sm text-gray-800">{'★'.repeat(Math.max(1, r.rating || 5))}{'☆'.repeat(5 - Math.max(1, r.rating || 5))} — {r.authorName || r.email || 'Anonymous'}</div>
              <div className="text-xs text-gray-500 mt-1">{r.productTitle || r.productId}</div>
              <p className="text-sm text-gray-600 mt-2">{r.comment || r.content}</p></div>
            <div className="flex gap-2 shrink-0"><Btn small color="royal" onClick={() => approve(r)}>Approve</Btn><Btn small color="red" onClick={() => setConfirmDel(r)}>Delete</Btn></div>
          </div>
        </div>
      ))}
      {reviews.length === 0 && <div className="text-xs text-gray-400 py-10 text-center">No pending reviews</div>}
      {confirmDel && <ConfirmDialog title="Delete review" message="Delete this review permanently?" onConfirm={doDelete} onClose={() => setConfirmDel(null)} />}
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
      {closing && <Modal title="Close till" onClose={() => setClosing(false)}>
        <div><label className="block text-xs font-semibold text-gray-600 mb-1">Closing cash ($)</label><input type="number" className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} /></div>
        <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={() => setClosing(false)}>Cancel</Btn><Btn onClick={close} disabled={busy}>Close till</Btn></div>
      </Modal>}
    </div>
  );
}

function Users({ data }) {
  const users = Array.isArray(data.users) ? data.users : [];
  return <div><div className="text-xs text-gray-500 mb-3">{users.length} accounts</div><div className="grid sm:grid-cols-2 gap-2">
    {users.map((u) => <div key={u.id} className="flex items-center gap-3 border border-gray-200 rounded-xl px-3 py-2 text-sm"><span className="font-medium text-gray-800 flex-1 truncate">{u.name}</span><span className="text-xs text-gray-500 truncate">{u.email}</span><StatusBadge value={u.role} /></div>)}
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
  const [form, setForm] = useState(() => ({ abn: data.settings?.abn || '', business_name: data.settings?.business_name || '', business_address: data.settings?.business_address || '', tax_gst_rate: data.settings?.tax_gst_rate || '0.10' }));
  const [busy, setBusy] = useState(false);
  const input = 'w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-gray-600 mb-1';
  async function save() {
    setBusy(true);
    try { await adminApi.settings.save(form, token); toast('Settings saved'); reload(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-3">
    <Card title="Business settings">
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className={label}>Business name</label><input className={input} value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} /></div>
        <div><label className={label}>ABN</label><input className={input} value={form.abn} onChange={(e) => setForm({ ...form, abn: e.target.value })} /></div>
        <div><label className={label}>Business address</label><input className={input} value={form.business_address} onChange={(e) => setForm({ ...form, business_address: e.target.value })} /></div>
        <div><label className={label}>GST rate</label><input className={input} value={form.tax_gst_rate} onChange={(e) => setForm({ ...form, tax_gst_rate: e.target.value })} /></div>
      </div>
      <div className="mt-4"><Btn onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</Btn></div>
    </Card>
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