import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, authApi, getToken, clearSession } from '../lib/api/customClient';
import { subscribe, nextColorMode, getColorMode, MODES } from '../lib/colorMode';
import { applyTheme } from '../lib/theme';
import { invalidatePublicSettings } from '../lib/publicSettings';
import { renderMarkdown } from '../lib/markdown';
import { ToastProvider, useToast } from '../components/admin/Toast';
import Modal from '../components/admin/Modal';
import LabelPrintModal from '../components/admin/LabelPrintModal';
import InventoryDetail from '../components/admin/InventoryDetail';
import SupplierDetail from '../components/admin/SupplierDetail';
import ConfirmDialog from '../components/admin/ConfirmDialog';
import StatusBadge from '../components/admin/Badge';
import ScanModal from '../components/scan/ScanModal';
import ScannerIndicator from '../components/scan/ScannerIndicator';
import { useWedgeScanner } from '../components/scan/useWedgeScanner';
import { lookupScan } from '../components/scan/scanApi';
import { chimeSuccess, beepError, registerScan } from '../components/scan/feedback';

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
  { id: 'procedures', label: 'Procedures', icon: '📐' },
  { id: 'discounts', label: 'Discounts', icon: '🏷️' },
  { id: 'meta', label: 'Meta Sync', icon: '🔗' },
  { id: 'pos', label: 'POS', icon: '💳' },
  { id: 'customers', label: 'Customers', icon: '🧑' },
  { id: 'shipping', label: 'Shipping', icon: '🚚' },
  { id: 'suppliers', label: 'Suppliers', icon: '🏭' },
  { id: 'users', label: 'Users', icon: '👥' },
  { id: 'reports', label: 'Reports', icon: '📈' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
  { id: 'notebook', label: 'Notebook', icon: '📓' },
];

const ORDER_FLOW = ['pending_payment', 'paid', 'making', 'ready', 'shipped', 'delivered'];

// Sidebar/strip grouping — tab ids only, deep-links (?tab=) unchanged.
const NAV_GROUPS = [
  { label: null, tabs: ['overview'] },
  { label: 'Sales', tabs: ['orders', 'pos', 'discounts', 'customers', 'reports'] },
  { label: 'Catalog', tabs: ['products', 'collections', 'recipes', 'inventory'] },
  { label: 'Content', tabs: ['blog', 'procedures', 'reviews', 'meta', 'notebook'] },
  { label: 'Studio', tabs: ['workshops', 'bookings', 'shipping', 'suppliers'] },
  { label: 'System', tabs: ['users', 'settings'] },
];

// Case-insensitive alphanumeric ordering (A2 before A10) for material lists.
const byNameNatural = (a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { numeric: true, sensitivity: 'base' });

function AdminInner({ user }) {
  const params = new URLSearchParams(window.location.search);
  const [tab, setTab] = useState(params.get('tab') || 'overview');
  const [navQ, setNavQ] = useState('');
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const tabRef = useRef(tab);
  const prevTabRef = useRef(tab);
  const skipUrlWriteRef = useRef(false);
  const loadedTabsRef = useRef(new Set());
  const [err, setErr] = useState('');
  const token = getToken();
  const [colorMode, setColorModeState] = useState(() => getColorMode() || 'system');
  useEffect(() => subscribe((m) => setColorModeState(m)), []);
  const toggleColorMode = () => { const n = nextColorMode(); setColorModeState(n); };
  const nextModeLabel = MODES[(MODES.indexOf(colorMode) + 1) % MODES.length];

  async function load(tabId) {
    setLoading(true); setErr('');
    try {
      if (tabId === 'overview') {
        const [orders, low, workshops, purchaseOrders, suppliers] = await Promise.all([
          adminApi.orders.list(token).catch(() => []),
          adminApi.materials.lowStock(token).catch(() => []),
          adminApi.workshops.list().catch(() => []),
          adminApi.purchaseOrders.list(token).catch(() => []),
          adminApi.suppliers.list(token).catch(() => []),
        ]);
        setData((s) => ({ ...s, orders, low, workshops, purchaseOrders, suppliers }));
      } else if (tabId === 'orders') {
        const orders = await adminApi.orders.list(token).catch(() => []);
        setData((s) => ({ ...s, orders }));
      } else if (tabId === 'inventory') {
        const [levels, materials, recon, locations, movements, suppliers] = await Promise.all([
          adminApi.inventory.levels(token).catch(() => []),
          adminApi.materials.list(token).catch(() => []),
          adminApi.inventory.reconciliation(token).catch(() => []),
          adminApi.inventory.locations(token).catch(() => []),
          adminApi.inventory.movements(token, 30).catch(() => []),
          adminApi.suppliers.list(token).catch(() => []),
        ]);
        setData((s) => ({ ...s, levels, materials: [...materials].sort(byNameNatural), recon, locations, movements, suppliers }));
      } else if (tabId === 'customers') {
        const customers = await adminApi.customers.list(token).catch(() => []);
        setData((s) => ({ ...s, customers }));
      } else if (tabId === 'shipping') {
        const zones = await adminApi.shipping.list(token).catch(() => []);
        setData((s) => ({ ...s, zones }));
      } else if (tabId === 'suppliers') {
        const suppliers = await adminApi.suppliers.list(token).catch(() => []);
        setData((s) => ({ ...s, suppliers }));
      } else if (tabId === 'products') {
        const products = (await adminApi.products.list(token).catch(() => ({ products: [] }))).products || [];
        setData((s) => ({ ...s, products }));
      } else if (tabId === 'recipes') {
        const [recipes, materials, products] = await Promise.all([
          adminApi.bom.recipes(token).catch(() => []),
          adminApi.materials.list(token).catch(() => []),
          adminApi.products.list(token).catch(() => ({ products: [] })),
        ]);
        setData((s) => ({ ...s, recipes, materials: [...materials].sort(byNameNatural), products: products.products || products }));
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
        const workshops = await adminApi.workshops.list(token).catch(() => []);
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
    finally { loadedTabsRef.current.add(tabId); setLoading(false); }
  }

  useEffect(() => {
    tabRef.current = tab;
    load(tab);
    if (skipUrlWriteRef.current) { skipUrlWriteRef.current = false; prevTabRef.current = tab; return; }
    // Preserve URL params (deep-link ?sub/?inv must survive mount); clear drill
    // params only when the tab actually changes.
    const p = new URLSearchParams(window.location.search);
    if (prevTabRef.current !== tab) { p.delete('sub'); p.delete('inv'); }
    prevTabRef.current = tab;
    p.set('tab', tab);
    window.history.replaceState(null, '', `?${p}`);
  }, [tab]);

  // Back/forward across tabs must resync the tab state (URL already correct —
  // skip the effect's URL write so history's sub/inv params stay intact).
  useEffect(() => {
    const onPop = () => {
      const t = new URLSearchParams(window.location.search).get('tab') || 'overview';
      if (t !== tabRef.current && TABS.some((x) => x.id === t)) {
        skipUrlWriteRef.current = true;
        setTab(t);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const tabMatches = (t) => !navQ.trim() || t.label.toLowerCase().includes(navQ.trim().toLowerCase());
  const groupTabs = (g) => g.tabs.map((id) => TABS.find((t) => t.id === id)).filter(Boolean).filter(tabMatches);

  return (
    <div className="min-h-screen bg-surface3">
      <div className="flex">
        <aside className="w-56 shrink-0 bg-black min-h-screen p-4 hidden lg:block">
          <Link to="/" className="flex items-center gap-2 px-2 py-3 hover:opacity-80" title="Back to storefront">
            <span className="w-9 h-9 rounded-xl bg-royal-600 flex items-center justify-center text-white font-black">K</span>
            <div>
              <div className="text-white font-black text-sm leading-tight">Studio Manager</div>
              <div className="text-white/50 text-[10px]">Admin Console</div>
            </div>
          </Link>
          <input value={navQ} onChange={(e) => setNavQ(e.target.value)} placeholder="Jump to…"
            className="mt-3 w-full bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-royal-500" />
          <nav className="mt-3 space-y-3">
            {NAV_GROUPS.map((g) => {
              const tabs = groupTabs(g);
              if (!tabs.length) return null;
              return (
                <div key={g.label || 'top'}>
                  {g.label && <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-white/40">{g.label}</div>}
                  <div className="space-y-1">
                    {tabs.map((t) => (
                      <button key={t.id} onClick={() => { setTab(t.id); setNavQ(''); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold text-left transition-colors ${tab === t.id ? 'bg-royal-600 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
                        <span>{t.icon}</span>{t.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {!NAV_GROUPS.some((g) => groupTabs(g).length > 0) && <div className="px-3 text-xs text-white/40">No match</div>}
          </nav>
          <Link to="/" className="mt-4 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white border border-white/10">🏠 View storefront</Link>
          <div className="mt-6 border-t border-white/10 pt-4 px-2">
            <div className="text-white text-xs font-semibold truncate">{user?.name || user?.email}</div>
            <div className="text-white/50 text-[10px] truncate">{user?.email} • {user?.role}</div>
            <button onClick={toggleColorMode} title={`Click for ${nextModeLabel}`}
              className="mt-2 w-full text-xs text-white/70 hover:text-white border border-white/20 rounded-lg px-2 py-1.5">
              {colorMode === 'system' ? '🖥️' : colorMode === 'light' ? '☀️' : '🌙'} {colorMode} → {nextModeLabel}
            </button>
            <button onClick={signOut} className="mt-2 text-xs text-white/70 hover:text-white underline">Sign out</button>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <header className="bg-surface2 border-b border-line px-6 py-4 flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-2">
              <Link to="/" className="text-xs border border-line-strong rounded-full px-3 py-1.5 text-muted">🏠 Home</Link>
              <h1 className="font-black text-royal-700">Studio Manager</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={toggleColorMode} title={`Click for ${nextModeLabel}`}
                className="text-xs border border-line-strong rounded-full px-3 py-1.5 text-muted">
                {colorMode === 'system' ? '🖥️' : colorMode === 'light' ? '☀️' : '🌙'} {colorMode}
              </button>
              <button onClick={signOut} className="text-xs border border-line-strong rounded-full px-3 py-1.5 text-muted">Sign out</button>
            </div>
          </header>
          <div className="p-4 lg:p-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <h1 className="text-2xl font-black text-ink">{TABS.find((t) => t.id === tab)?.label}</h1>
                <p className="text-xs text-muted mt-0.5">Krystals Flower Creations — Perth WA studio</p>
              </div>
              <div className="flex items-center gap-2">
                <Link to="/" className="text-xs border border-line-strong rounded-full px-3 py-1.5 hover:bg-surface3 text-muted">🏠 Storefront</Link>
                <a href="/api/health" target="_blank" rel="noreferrer" className="text-xs border border-line-strong rounded-full px-3 py-1.5 hover:bg-surface3 text-muted">Health</a>
              </div>
            </div>
            {err && <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{err}</div>}

            {/* mobile tab strip — grouped, filtered */}
            <div className="flex gap-1.5 overflow-x-auto mb-4 lg:hidden pb-1">
              {NAV_GROUPS.map((g) => {
                const tabs = groupTabs(g);
                if (!tabs.length) return null;
                return (
                  <div key={g.label || 'top'} className="flex gap-1.5 shrink-0 items-center">
                    {g.label && <span className="text-[9px] font-bold uppercase text-muted px-1">{g.label}</span>}
                    {tabs.map((t) => (
                      <button key={t.id} onClick={() => setTab(t.id)}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${tab === t.id ? 'bg-royal-600 text-white' : 'bg-surface2 border border-line text-muted'}`}>{t.icon} {t.label}</button>
                    ))}
                  </div>
                );
              })}
            </div>

            <div className={`bg-surface2 border border-line rounded-2xl p-4 lg:p-6 shadow-sm min-h-[60vh] ${loading ? 'opacity-60' : ''}`}>
              {loading && !loadedTabsRef.current.has(tab) ? <Skeleton /> : (
                <>
                  {tab === 'overview' && <Overview data={data} onOpen={setTab} />}
                  {tab === 'orders' && <Orders data={data} reload={() => load('orders')} token={token} />}
                  {tab === 'inventory' && <Inventory data={data} reload={() => load('inventory')} token={token} role={user?.role} />}
                  {tab === 'products' && <Products data={data} reload={() => load('products')} token={token} />}
                  {tab === 'recipes' && <Recipes data={data} reload={() => load('recipes')} token={token} />}
                  {tab === 'collections' && <Collections data={data} reload={() => load('collections')} token={token} />}
                  {tab === 'workshops' && <Workshops data={data} reload={() => load('workshops')} token={token} />}
                  {tab === 'meta' && <MetaSync data={data} reload={() => load('meta')} token={token} />}
                  {tab === 'bookings' && <Bookings data={data} reload={() => load('bookings')} token={token} />}
                  {tab === 'discounts' && <Discounts data={data} reload={() => load('discounts')} token={token} />}
                  {tab === 'reviews' && <Reviews data={data} reload={() => load('reviews')} token={token} />}
                  {tab === 'blog' && <Blog data={data} reload={() => load('blog')} token={token} />}
                  {tab === 'procedures' && <Procedures token={token} role={user?.role} />}
                  {tab === 'pos' && <POS data={data} reload={() => load('pos')} token={token} />}
                  {tab === 'customers' && <Customers data={data} reload={() => load('customers')} token={token} />}
                  {tab === 'shipping' && <Shipping data={data} reload={() => load('shipping')} token={token} />}
                  {tab === 'suppliers' && <Suppliers data={data} reload={() => load('suppliers')} token={token} />}
                  {tab === 'users' && <Users data={data} reload={() => load('users')} token={token} user={user} />}
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

  if (user === undefined) return <div className="min-h-screen bg-surface3 flex items-center justify-center text-sm text-muted">Checking session…</div>;
  if (user === null) return (
    <div className="min-h-screen bg-surface3 flex items-center justify-center p-4">
      <div className="bg-surface2 border border-line rounded-2xl p-6 max-w-sm text-center space-y-3">
        <h1 className="font-black text-ink">Staff access only</h1>
        <p className="text-sm text-muted">This account doesn't have access to the studio console.</p>
        <button onClick={() => { clearSession(); window.location.assign('/login?next=/admin'); }} className="bg-royal-600 hover:bg-royal-700 text-white font-bold rounded-xl px-4 py-2 text-sm">Sign in as staff</button>
        <Link to="/" className="block text-xs text-muted hover:underline">← Back to storefront</Link>
      </div>
    </div>
  );
  return <ToastProvider><AdminInner user={user} /></ToastProvider>;
}

function signOut() { clearSession(); window.location.assign('/login'); }

function Skeleton() { return <div className="animate-pulse space-y-3"><div className="h-24 bg-surface3 rounded-xl" /><div className="h-40 bg-surface3 rounded-xl" /><div className="h-40 bg-surface3 rounded-xl" /></div>; }
function Card({ title, children, actions, description }) {
  return <div className="border border-line rounded-2xl p-4"><div className="flex items-center justify-between mb-3"><div><h3 className="font-bold text-sm text-ink">{title}</h3>{description && <p className="text-xs text-muted mt-0.5">{description}</p>}</div>{actions}</div>{children}</div>;
}
const Btn = ({ children, onClick, color = 'royal', disabled, small }) => (
  <button onClick={onClick} disabled={disabled}
    className={`inline-flex items-center gap-1 rounded-xl font-semibold disabled:opacity-50 transition-colors ${small ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm'} ${color === 'royal' ? 'bg-royal-600 text-white hover:bg-royal-700' : color === 'black' ? 'bg-gray-900 text-white hover:bg-gray-800' : color === 'ghost' ? 'border border-line-strong text-ink hover:bg-surface3' : color === 'red' ? 'bg-red-600 text-white hover:bg-red-700' : color === 'amber' ? 'bg-amber-500 text-white hover:bg-amber-600' : ''}`}>{children}</button>
);

function Overview({ data, onOpen }) {
  const orders = Array.isArray(data.orders) ? data.orders : [];
  const low = Array.isArray(data.low) ? data.low : [];
  const workshops = Array.isArray(data.workshops) ? data.workshops : [];
  const pos = Array.isArray(data.purchaseOrders) ? data.purchaseOrders : [];
  const suppliers = Array.isArray(data.suppliers) ? data.suppliers : [];
  const today = orders.filter((o) => new Date(o.createdAt).toDateString() === new Date().toDateString());
  const revenueToday = today.reduce((a, o) => a + Number(o.total || 0), 0);
  const revenueMonth = orders.filter((o) => new Date(o.createdAt).getMonth() === new Date().getMonth()).reduce((a, o) => a + Number(o.total || 0), 0);
  const openPos = pos.filter((p) => p.status !== 'received');
  const poTotal = (p) => (p.lines || []).reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.unitCost) || 0), 0);
  const totalSpend = suppliers.reduce((a, s) => a + Number(s.stats?.totalSpend || 0), 0);
  const upcoming = workshops
    .flatMap((w) => (w.sessions || []).filter((s) => new Date(s.startsAt).getTime() > Date.now()).map((s) => ({ ...s, workshop: w })))
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
    .slice(0, 5);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Orders today" value={today.length} />
        <Stat label="Revenue today" value={`$${revenueToday.toFixed(2)}`} accent />
        <Stat label="Revenue this month" value={`$${revenueMonth.toFixed(2)}`} />
        <Stat label="Low stock items" value={low.length} warn={low.length > 0} />
        <Stat label="Open POs" value={openPos.length} warn={openPos.length > 0} />
        <Stat label="Supplier spend" value={`$${totalSpend.toFixed(2)}`} accent />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Recent orders" actions={<button onClick={() => onOpen('orders')} className="text-xs text-royal-700 hover:underline font-semibold">View all</button>}>
          <div className="space-y-1.5">
            {orders.slice(0, 6).map((o) => <div key={o.id} className="flex justify-between text-xs border-b border-line py-1.5"><span className="font-medium text-ink">{o.orderNumber} <span className="text-muted">• {o.email}</span></span><StatusBadge value={o.status} /></div>)}
            {orders.length === 0 && <div className="text-xs text-muted py-4 text-center">No orders yet</div>}
          </div>
        </Card>
        <Card title="Low stock" actions={<button onClick={() => onOpen('inventory')} className="text-xs text-royal-700 hover:underline font-semibold">Manage</button>}>
          <div className="space-y-1.5">
            {low.slice(0, 6).map((m) => <div key={m.id || m.sku} className="flex justify-between text-xs border-b border-line py-1.5"><span className="font-medium text-ink">{m.name || m.sku}</span><span className="text-amber-600 font-semibold">{m.onHand}/{m.lowThreshold}</span></div>)}
            {low.length === 0 && <div className="text-xs text-muted py-4 text-center">All stocked ✓</div>}
          </div>
        </Card>
        <Card title="Open purchase orders" actions={<button onClick={() => onOpen('inventory')} className="text-xs text-royal-700 hover:underline font-semibold">Manage</button>}>
          <div className="space-y-1.5">
            {openPos.slice(0, 5).map((p) => (
              <div key={p.id} className="flex justify-between items-center text-xs border-b border-line py-1.5">
                <span className="font-medium text-ink">{p.poNumber} <span className="text-muted">• {p.supplier}</span></span>
                <span className="flex items-center gap-2"><span className="font-semibold text-ink">${poTotal(p).toFixed(2)}</span><StatusBadge value={p.status} /></span>
              </div>
            ))}
            {openPos.length === 0 && <div className="text-xs text-muted py-4 text-center">No open POs ✓</div>}
          </div>
        </Card>
        <Card title="Upcoming workshops" actions={<button onClick={() => onOpen('workshops')} className="text-xs text-royal-700 hover:underline font-semibold">View all</button>}>
          <div className="space-y-1.5">
            {upcoming.map((s) => (
              <div key={s.id} className="flex justify-between items-center text-xs border-b border-line py-1.5">
                <span className="font-medium text-ink">{s.workshop.title} <span className="text-muted">• {new Date(s.startsAt).toLocaleDateString('en-AU')} {new Date(s.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span>
                <span className={`font-semibold ${s.bookedCount >= s.capacity ? 'text-amber-600' : 'text-ink'}`}>{s.bookedCount}/{s.capacity}</span>
              </div>
            ))}
            {upcoming.length === 0 && <div className="text-xs text-muted py-4 text-center">No upcoming sessions</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
function Stat({ label, value, warn, accent }) {
  return <div className={`p-4 rounded-2xl border ${warn ? 'bg-amber-50 border-amber-200' : accent ? 'bg-royal-50 border-royal-100' : 'bg-surface3 border-line'}`}>
    <div className="text-xs text-muted">{label}</div>
    <div className={`text-xl font-black mt-0.5 ${warn ? 'text-amber-600' : accent ? 'text-royal-700' : 'text-ink'}`}>{value}</div>
  </div>;
}

function Orders({ data, reload, token }) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(null);
  const [busy, setBusy] = useState('');
  const [confirmRefund, setConfirmRefund] = useState(null);
  const orders = Array.isArray(data.orders) ? data.orders : [];
  async function move(o, status) {
    setBusy(`${o.id}-${status}`);
    try { await adminApi.orders.updateStatus(o.id, status, 'Updated from admin', token); toast(`Order ${o.orderNumber} → ${status}`); reload(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(''); }
  }
  async function doRefund() {
    const o = confirmRefund;
    setConfirmRefund(null);
    setBusy(`${o.id}-refund`);
    try { await adminApi.orders.paypalRefund(o.id, token); toast(`Order ${o.orderNumber} refunded via PayPal`); reload(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(''); }
  }
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted">{orders.length} orders (latest 100)</div>
      {orders.map((o) => (
        <div key={o.id} className="border border-line rounded-xl overflow-hidden">
          <button onClick={() => setExpanded(expanded === o.id ? null : o.id)} className="w-full flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface3 text-left">
            <span className="font-bold text-sm text-ink">{o.orderNumber}</span>
            <span className="text-xs text-muted">{o.email}</span>
            <StatusBadge value={o.status} />
            <StatusBadge value={o.paymentStatus} />
            <span className="ml-auto font-bold text-sm text-royal-700">${Number(o.total).toFixed(2)}</span>
          </button>
          {expanded === o.id && (
            <div className="border-t border-line px-4 py-3 bg-surface3/50">
              <div className="flex flex-wrap gap-1.5 mb-3">
                {ORDER_FLOW.map((s) => (
                  <button key={s} disabled={busy === `${o.id}-${s}`} onClick={() => move(o, s)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold ${o.status === s ? 'bg-royal-600 text-white' : 'bg-surface2 border border-line-strong text-muted hover:bg-royal-50'}`}>{s.replace(/_/g, ' ')}</button>
                ))}
                {o.paymentMethod === 'paypal' && o.paymentStatus === 'paid' && (
                  <button disabled={busy === `${o.id}-refund`} onClick={() => setConfirmRefund(o)}
                    className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-600 text-white disabled:opacity-50 hover:bg-red-700">refund via PayPal</button>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="font-bold text-ink mb-1">Lines</div>
                  {(o.lines || []).map((l, i) => <div key={i} className="flex justify-between py-0.5"><span>{l.title} × {l.quantity}</span><span>${Number(l.unitPrice).toFixed(2)}</span></div>)}
                </div>
                <div>
                  <div className="font-bold text-ink mb-1">Details</div>
                  <div className="space-y-0.5 text-muted">
                    <div>Ship: {o.shippingName} — {o.shippingSuburb} {o.shippingPostcode}</div>
                    <div>Subtotal ${Number(o.subtotal).toFixed(2)} • GST ${Number(o.taxTotal).toFixed(2)} • Ship ${Number(o.shippingCost).toFixed(2)}</div>
                    <div>Payment: {o.paymentMethod}</div>
                    {(o.history || []).slice(-3).map((h, i) => <div key={i} className="text-muted">{h.fromStatus} → {h.toStatus} ({new Date(h.createdAt).toLocaleString()})</div>)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
      {orders.length === 0 && <div className="text-xs text-muted py-10 text-center">No orders — login as admin@krystal.local (maker+ token required)</div>}
      {confirmRefund && <ConfirmDialog title="Refund via PayPal" message={`Refund PayPal order ${confirmRefund.orderNumber} ($${Number(confirmRefund.total).toFixed(2)})? The money goes back to the buyer and the stock is returned.`} confirmLabel="Refund" onConfirm={doRefund} onClose={() => setConfirmRefund(null)} />}
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
const DETAIL_KINDS = new Set(['material', 'level', 'location', 'stocktake', 'purchase', 'movement', 'lot', 'variant', 'product']);
const DETAIL_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

function Inventory({ data, reload, token, role }) {
  // URL-addressable drill-in: /admin?tab=inventory&sub=<sub>&inv=<kind>:<id>
  const initial = new URLSearchParams(window.location.search);
  const initSub = initial.get('sub') || 'stock';
  const [sub, setSub] = useState(INVENTORY_SUBS.some((s) => s.id === initSub) ? initSub : 'stock');
  const [inv, setInv] = useState(initial.get('inv') || '');
  const [materialEditor, setMaterialEditor] = useState(null);
  const [tick, setTick] = useState(0);
  const pushedInv = useRef(false);

  useEffect(() => {
    const onPop = () => {
      const p = new URLSearchParams(window.location.search);
      setSub(p.get('sub') || 'stock');
      setInv(p.get('inv') || '');
      pushedInv.current = false;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function writeUrl(nextSub, nextInv, replace) {
    const p = new URLSearchParams(window.location.search);
    p.set('tab', 'inventory');
    if (nextSub) p.set('sub', nextSub); else p.delete('sub');
    if (nextInv) p.set('inv', nextInv); else p.delete('inv');
    const url = `${window.location.pathname}?${p.toString()}`;
    window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
  }
  function changeSub(s) {
    setSub(s);
    if (inv) { setInv(''); pushedInv.current = false; }
    writeUrl(s, '', true);
  }
  function openDetail(kind, id, row) {
    if (!id) return;
    const key = `${kind}:${id}`;
    if (row) { try { sessionStorage.setItem(`inv:${key}`, JSON.stringify(row)); } catch { /* quota */ } }
    writeUrl(sub, key, false);
    pushedInv.current = true;
    setInv(key);
  }
  function closeDetail() {
    if (pushedInv.current) { pushedInv.current = false; window.history.back(); }
    else { writeUrl(sub, '', true); setInv(''); }
  }
  function seedFor(kind, id) {
    if (kind === 'material') return (data.materials || []).find((x) => x.id === id) || readSession(kind, id);
    if (kind === 'level') return (data.levels || []).find((x) => x.id === id) || readSession(kind, id);
    if (kind === 'location') return (data.locations || []).find((x) => x.id === id) || readSession(kind, id);
    return readSession(kind, id);
  }
  function readSession(kind, id) {
    try { return JSON.parse(sessionStorage.getItem(`inv:${kind}:${id}`) || 'null'); } catch { return null; }
  }

  const colon = inv.indexOf(':');
  const detailKind = colon > 0 ? inv.slice(0, colon) : '';
  const detailId = colon > 0 ? inv.slice(colon + 1) : '';
  const detailOk = DETAIL_KINDS.has(detailKind) && DETAIL_ID_RE.test(detailId);
  const locations = Array.isArray(data.locations) ? data.locations : [];
  const materials = Array.isArray(data.materials) ? data.materials : [];

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1 border-b border-line">
        {INVENTORY_SUBS.map((s) => (
          <button key={s.id} onClick={() => changeSub(s.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${sub === s.id ? 'bg-royal-600 text-white' : 'bg-surface2 border border-line text-muted hover:bg-royal-50'}`}>{s.label}</button>
        ))}
      </div>
      {detailOk ? (
        <InventoryDetail
          key={`${detailKind}:${detailId}:${tick}`}
          kind={detailKind} id={detailId} seed={seedFor(detailKind, detailId)}
          token={token} data={data} reload={reload} role={role}
          onBack={closeDetail} onOpen={openDetail} onEditMaterial={setMaterialEditor}
        />
      ) : (
        <>
          {sub === 'stock' && <InventoryStock data={data} reload={reload} token={token} onOpen={openDetail} />}
          {sub === 'low' && <InventoryLow token={token} onOpen={openDetail} />}
          {sub === 'stocktake' && <InventoryStocktake data={data} reload={reload} token={token} onOpen={openDetail} />}
          {sub === 'purchase' && <InventoryPurchase data={data} reload={reload} token={token} onOpen={openDetail} />}
          {sub === 'transfer' && <InventoryTransfer data={data} reload={reload} token={token} />}
          {sub === 'movements' && <InventoryMovements token={token} onOpen={openDetail} />}
          {sub === 'lots' && <InventoryLots data={data} reload={reload} token={token} onOpen={openDetail} />}
        </>
      )}
      {materialEditor && <MaterialModal material={materialEditor.id ? materialEditor : null} locations={locations} materials={materials} suppliers={Array.isArray(data.suppliers) ? data.suppliers : []} onClose={() => setMaterialEditor(null)} onSaved={() => { setMaterialEditor(null); setTick((t) => t + 1); reload(); }} token={token} />}
      <ScannerIndicator />
    </div>
  );
}

function InventoryStock({ data, reload, token, onOpen }) {
  const toast = useToast();
  const [adjusting, setAdjusting] = useState(null);
  const [setVals, setSetVals] = useState({});
  const [thresholdVals, setThresholdVals] = useState({});
  const [materialEditor, setMaterialEditor] = useState(null);
  const [labels, setLabels] = useState(false);
  const [locationEditor, setLocationEditor] = useState(null);
  const [confirmDelLoc, setConfirmDelLoc] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanHit, setScanHit] = useState(null);
  const [matQ, setMatQ] = useState('');
  const levels = Array.isArray(data.levels) ? data.levels : [];
  const materials = Array.isArray(data.materials) ? data.materials : [];
  const mq = matQ.trim().toLowerCase();
  const filteredMaterials = !mq ? materials : materials.filter((m) => [m.name, m.sku, m.supplier, m.brand, m.colour, m.size, m.barcode,
    m.weightValue != null ? `${m.weightValue}${m.weightUnit || ''}` : ''].some((v) => String(v ?? '').toLowerCase().includes(mq)));
  const recon = Array.isArray(data.recon) ? data.recon : [];
  const locations = Array.isArray(data.locations) ? data.locations : [];
  const drifted = recon.filter((r) => !r.ok);

  // USB/barcode scanner — active whenever this stock view is mounted.
  async function handleScanCode(code) {
    if (!registerScan(code)) return; // 1.5s duplicate window (shared with ScanModal)
    try {
      const r = await lookupScan(code, token);
      setScanHit(r);
      if (r.found) chimeSuccess();
      else { beepError(); toast(`Not found: ${code} — use 📷 to create it`, 'error'); }
    } catch (e) { beepError(); toast(e.message, 'error'); }
  }
  useWedgeScanner(handleScanCode, true);

  async function adjustScanLine(line, delta) {
    try {
      await adminApi.inventory.adjust({ productId: scanHit.item.id, variantId: scanHit.variant?.id || null, locationId: line.locationId, quantity: delta, reason: 'Scan adjust' }, token);
      setScanHit((h) => h ? { ...h, stock: h.stock.map((s) => s.locationId === line.locationId ? { ...s, onHand: s.onHand + delta } : s), totalOnHand: (h.totalOnHand || 0) + delta } : h);
      toast('Stock updated');
    } catch (e) { toast(e.message, 'error'); }
  }
  async function adjustScanMat(delta) {
    try {
      await adminApi.materials.adjust(scanHit.item.id, delta, 'Scan adjust', token);
      setScanHit((h) => h ? { ...h, item: { ...h.item, onHand: Number(h.item.onHand) + delta } } : h);
      toast('Material updated');
    } catch (e) { toast(e.message, 'error'); }
  }
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
      {scanHit && (
        <Card title={scanHit.found ? `Scan: ${scanHit.item?.title || scanHit.item?.name || ''}` : `Scan not found: ${scanHit.scanned || ''}`}
          actions={<Btn small color="ghost" onClick={() => setScanHit(null)}>Clear</Btn>}>
          {scanHit.found ? (
            <div className="space-y-2 text-xs">
              <div className="text-muted">
                {scanHit.item?.sku ? `SKU ${scanHit.item.sku}` : ''}
                {scanHit.item?.sku && scanHit.item?.barcode ? ' • ' : ''}
                {scanHit.item?.barcode ? `Barcode ${scanHit.item.barcode}` : ''}
                {scanHit.item?.price != null ? ` • $${Number(scanHit.item.price).toFixed(2)}` : ''}
                {typeof scanHit.totalOnHand === 'number' ? ` • ${scanHit.totalOnHand} on hand` : ''}
              </div>
              {scanHit.kind === 'raw_material' ? (
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-medium">{scanHit.item?.name} — <span className="font-bold">{scanHit.item?.onHand}</span> {scanHit.item?.unit}</span>
                  <button onClick={() => adjustScanMat(1)} className="w-7 h-7 rounded-lg bg-royal-50 text-royal-700 font-bold hover:bg-royal-100">+</button>
                  <button onClick={() => adjustScanMat(-1)} className="w-7 h-7 rounded-lg bg-surface3 text-ink font-bold hover:bg-gray-200">−</button>
                </div>
              ) : (
                <div className="space-y-1">
                  {(scanHit.stock || []).map((s) => (
                    <div key={s.locationId} className="flex items-center gap-2 border-b border-line py-1">
                      <span className="flex-1">{s.location} {s.low && <span className="text-amber-600">(low)</span>}</span>
                      <span className="font-bold">{s.onHand}</span>
                      <button onClick={() => adjustScanLine(s, 1)} className="w-7 h-7 rounded-lg bg-royal-50 text-royal-700 font-bold hover:bg-royal-100">+</button>
                      <button onClick={() => adjustScanLine(s, -1)} className="w-7 h-7 rounded-lg bg-surface3 text-ink font-bold hover:bg-gray-200">−</button>
                    </div>
                  ))}
                  {(scanHit.stock || []).length === 0 && <div className="text-muted">No stock levels yet — a sale or stocktake creates them</div>}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted">Unknown code — press 📷 Scan to create a product carrying this barcode.</div>
          )}
        </Card>
      )}
      <Card title={`Product stock — ${levels.length} levels`} actions={<Btn small onClick={() => setScanOpen(true)}>📷 Scan</Btn>}>
        <div className="space-y-1.5">
          {levels.slice(0, 30).map((l) => (
            <div key={l.id} className="flex items-center gap-2 text-xs border-b border-line py-1.5 flex-wrap">
              <span className="font-medium text-ink flex-1 min-w-[160px] cursor-pointer hover:text-royal-700 hover:underline" title="View details" onClick={() => onOpen('level', l.id, l)}>{l.product?.title || l.productId} {l.variant ? `— ${l.variant.title}` : ''} <span className="text-muted">@{l.location?.name}</span></span>
              <span className={`font-bold ${l.onHand <= (l.lowStockThreshold ?? 5) ? 'text-red-600' : 'text-ink'}`}>{l.onHand}</span>
              <button disabled={adjusting === l.id} onClick={() => adjustLevel(l, 1)} className="w-7 h-7 rounded-lg bg-royal-50 text-royal-700 font-bold hover:bg-royal-100">+</button>
              <button disabled={adjusting === l.id} onClick={() => adjustLevel(l, -1)} className="w-7 h-7 rounded-lg bg-surface3 text-ink font-bold hover:bg-gray-200">−</button>
              <input value={setVals[l.id] || ''} onChange={(e) => setSetVals((s) => ({ ...s, [l.id]: e.target.value }))} placeholder="set…" className="w-16 border border-line-strong rounded-lg px-2 py-1" />
              <button disabled={adjusting === l.id} onClick={() => setLevel(l, setVals[l.id])} className="px-2 py-1 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800">Set</button>
              <input value={thresholdVals[l.id] ?? ''} onChange={(e) => setThresholdVals((s) => ({ ...s, [l.id]: e.target.value }))} placeholder={`lo ${l.lowStockThreshold ?? 5}`} title="Low-stock threshold" className="w-14 border border-line-strong rounded-lg px-2 py-1 text-muted" />
              <button disabled={adjusting === l.id} onClick={() => setThreshold(l, thresholdVals[l.id])} className="px-2 py-1 rounded-lg bg-royal-100 text-royal-700 text-xs font-semibold hover:bg-royal-200">Thr</button>
            </div>
          ))}
          {levels.length === 0 && <div className="text-xs text-muted py-4 text-center">No levels — seed inventory</div>}
        </div>
      </Card>
      <Card title={`Raw materials — ${filteredMaterials.length}${mq ? ` of ${materials.length}` : ''}`} actions={<div className="flex gap-2 items-center">
        <input value={matQ} onChange={(e) => setMatQ(e.target.value)} placeholder="Search name, SKU, brand…" className="w-40 lg:w-56 border border-line-strong rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-royal-500" />
        <Btn small color="ghost" onClick={() => setLabels(true)}>🖨 Labels</Btn><Btn small color="ghost" onClick={() => setMaterialEditor({})}>+ Add material</Btn></div>}>
        <div className="space-y-1.5">
          {filteredMaterials.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-xs border-b border-line py-1.5 flex-wrap">
              <span className="font-medium text-ink flex-1 min-w-[160px] cursor-pointer hover:text-royal-700 hover:underline" title="View details" onClick={() => onOpen('material', m.id, m)}>{m.name} <span className="text-muted">{m.sku} • {m.unit} • ${Number(m.costPerUnit).toFixed(2)}</span>
                {(m.brand || m.weightValue != null || m.colour || m.size || m.supplier) && <span className="block text-[11px] text-muted font-normal">{[m.supplier, m.brand, m.weightValue != null ? `${m.weightValue}${m.weightUnit || ''}` : null, m.colour, m.size].filter(Boolean).join(' • ')}</span>}
              </span>
              <span className={`font-bold ${Number(m.onHand) <= Number(m.lowThreshold) ? 'text-amber-600' : 'text-ink'}`}>{m.onHand}</span>
              <button disabled={adjusting === m.id} onClick={() => adjustMat(m, 10)} className="w-7 h-7 rounded-lg bg-royal-50 text-royal-700 font-bold hover:bg-royal-100">+</button>
              <button disabled={adjusting === m.id} onClick={() => adjustMat(m, -10)} className="w-7 h-7 rounded-lg bg-surface3 text-ink font-bold hover:bg-gray-200">−</button>
              <input value={setVals[m.id] || ''} onChange={(e) => setSetVals((s) => ({ ...s, [m.id]: e.target.value }))} placeholder="set…" className="w-16 border border-line-strong rounded-lg px-2 py-1" />
              <button disabled={adjusting === m.id} onClick={() => setMat(m, setVals[m.id])} className="px-2 py-1 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800">Set</button>
              <Btn small color="ghost" onClick={() => setMaterialEditor(m)}>Edit</Btn>
            </div>
          ))}
          {filteredMaterials.length === 0 && <div className="text-xs text-muted py-4 text-center">{mq ? 'No materials match your search' : 'No materials'}</div>}
        </div>
      </Card>
      <Card title={`Locations — ${locations.length}`} actions={<Btn small color="ghost" onClick={() => setLocationEditor({})}>+ Add location</Btn>}>
        <div className="space-y-1">
          {locations.map((l) => (
            <div key={l.id} className="flex items-center gap-2 text-xs border-b border-line py-1.5">
              <span className="font-medium text-ink cursor-pointer hover:text-royal-700 hover:underline flex-1 min-w-0 truncate" title="View details" onClick={() => onOpen('location', l.id, l)}>{l.name} {l.isDefault && <span className="text-royal-700 font-semibold">• default</span>}</span>
              <span className="text-muted truncate">{l.address || ''}</span>
              <Btn small color="ghost" onClick={() => setLocationEditor(l)}>Edit</Btn>
              <Btn small color="red" onClick={() => setConfirmDelLoc(l)}>Delete</Btn>
            </div>
          ))}
          {locations.length === 0 && <div className="text-xs text-muted py-4 text-center">No locations</div>}
        </div>
      </Card>
      <Card title={`Reconciliation — actual vs recorded (${drifted.length} drift)`}>
        <div className="space-y-1">
          {recon.slice(0, 15).map((r) => <div key={r.key} className={`flex justify-between text-xs border-b border-line py-1 ${r.ok ? '' : 'text-red-600'}`}><span>{r.title}</span><span>{r.actual} vs {r.recorded} {r.ok ? '✓' : `drift ${r.drift}`}</span></div>)}
          {recon.length === 0 && <div className="text-xs text-muted py-4 text-center">No items to reconcile</div>}
        </div>
      </Card>
      {materialEditor && <MaterialModal material={materialEditor.id ? materialEditor : null} locations={locations} materials={materials} suppliers={Array.isArray(data.suppliers) ? data.suppliers : []} onClose={() => setMaterialEditor(null)} onSaved={() => { setMaterialEditor(null); toast(materialEditor.id ? 'Material updated' : 'Material created'); reload(); }} token={token} />}
      {labels && <LabelPrintModal title="Print material labels" items={filteredMaterials.map((m) => ({ id: m.id, name: m.name, value: m.barcode || m.sku || '' }))} onClose={() => setLabels(false)} />}
      {locationEditor && <LocationModal location={locationEditor.id ? locationEditor : null} onClose={() => setLocationEditor(null)} onSaved={() => { setLocationEditor(null); toast('Location saved'); reload(); }} token={token} />}
      {confirmDelLoc && <ConfirmDialog title="Delete location" message={`Delete ${confirmDelLoc.name}? Materials pointing at it will keep their stock but lose the location link.`} onConfirm={async () => { try { await adminApi.inventory.deleteLocation(confirmDelLoc.id, token); toast('Location deleted'); setConfirmDelLoc(null); reload(); } catch (e) { toast(e.message, 'error'); setConfirmDelLoc(null); } }} onClose={() => setConfirmDelLoc(null)} />}
      <ScanModal open={scanOpen} onClose={() => setScanOpen(false)} token={token} allowCreate closeOnFound
        onResolved={(r) => { setScanHit(r); reload(); }} />
    </div>
  );
}
function partToken(s, n) { return String(s || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, n); }
function generateMaterialSku(form, materials) {
  const taken = new Set((materials || []).map((m) => m.sku));
  const parts = ['RM'];
  if (form.brand) parts.push(partToken(form.brand, 4));
  if (form.weightValue !== '' && form.weightValue != null && Number.isFinite(Number(form.weightValue))) {
    parts.push(String(Math.round(Number(form.weightValue))) + (form.weightUnit === 'gsm' ? 'G' : ''));
  }
  if (form.colour) parts.push(partToken(form.colour, 3));
  if (form.size) parts.push(partToken(form.size, 6));
  if (parts.length === 1) parts.push(Date.now().toString(36).toUpperCase().slice(-4));
  const base = parts.join('-');
  let candidate = base;
  let i = 2;
  while (taken.has(candidate)) candidate = `${base}-${i++}`;
  return candidate;
}
// Zod `flatten()` details → flat { field: message } map (handles both the
// { fieldErrors } wrapper and a plain map defensively).
function extractFieldErrors(details) {
  if (!details || typeof details !== 'object') return {};
  const src = details.fieldErrors && typeof details.fieldErrors === 'object' ? details.fieldErrors : details;
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    if (k === 'formErrors') continue;
    out[k] = Array.isArray(v) ? v[0] : (v && typeof v === 'object' ? (Array.isArray(v._errors) ? v._errors[0] : '') : String(v));
  }
  return out;
}
function MaterialModal({ material, locations, materials, suppliers = [], onClose, onSaved, token }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    name: material?.name || '', sku: material?.sku || '', barcode: material?.barcode || '', unit: material?.unit || 'sheet',
    onHand: material ? Number(material.onHand) : 0, lowThreshold: material ? Number(material.lowThreshold) : 5,
    costPerUnit: material ? Number(material.costPerUnit) : 0, supplier: material?.supplier || '', locationId: material?.locationId || '',
    brand: material?.brand || '', weightValue: material?.weightValue ?? '', weightUnit: material?.weightUnit || 'lb',
    colour: material?.colour || '', size: material?.size || '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const initialJsonRef = useRef(JSON.stringify(form));
  const dirty = JSON.stringify(form) !== initialJsonRef.current;
  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-muted mb-1';
  const fieldCls = (key) => (fieldErrors[key] ? `${input} border-red-400` : input);
  const fieldErr = (key) => (fieldErrors[key] ? <div className="text-[11px] text-red-500 mt-1">{fieldErrors[key]}</div> : null);
  const requestClose = () => { if (!dirty || window.confirm('Discard unsaved changes?')) onClose(); };
  async function save() {
    setError(''); setFieldErrors({});
    const fe = {};
    if (!form.name.trim()) fe.name = 'Name is required';
    if (!form.sku.trim()) fe.sku = 'SKU is required';
    const wv = form.weightValue;
    if (wv !== '' && wv != null && (Number.isNaN(Number(wv)) || Number(wv) < 0 || Number(wv) > 10000)) fe.weightValue = 'Weight must be between 0 and 10000';
    if (Object.keys(fe).length) { setFieldErrors(fe); setError('Please fix the highlighted fields.'); return; }
    setBusy(true);
    try {
      const body = { ...form, barcode: form.barcode?.trim() || null, onHand: Number(form.onHand), lowThreshold: Number(form.lowThreshold), costPerUnit: Number(form.costPerUnit), locationId: form.locationId || null,
        brand: form.brand?.trim() || null,
        weightValue: form.weightValue === '' || form.weightValue == null ? null : Number(form.weightValue),
        weightUnit: form.weightValue === '' || form.weightValue == null ? null : form.weightUnit,
        colour: form.colour?.trim() || null,
        size: form.size?.trim() || null };
      if (material) await adminApi.materials.update(material.id, body, token);
      else await adminApi.materials.create(body, token);
      onSaved();
    } catch (e) {
      setFieldErrors(extractFieldErrors(e.details));
      setError(e.message || 'Could not save material');
      toast(e.message, 'error');
    }
    finally { setBusy(false); }
  }
  return <Modal title={material ? 'Edit material' : 'New material'} onClose={requestClose}>
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label}>Name</label><input className={fieldCls('name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />{fieldErr('name')}</div>
        <div><label className={label}>SKU</label>
          <div className="flex gap-1.5">
            <input className={fieldCls('sku')} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            <button type="button" title="Generate part number from brand/weight/colour/size" onClick={() => setForm((f) => ({ ...f, sku: generateMaterialSku(f, materials) }))} className="shrink-0 px-2 rounded-xl border border-line-strong text-xs font-semibold text-royal-700 bg-royal-50 hover:bg-royal-100">Generate</button>
          </div>
          {fieldErr('sku')}
        </div>
        <div className="col-span-2"><label className={label}>Barcode (for scanner stocktakes)</label><input className={input} value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="e.g. 200000000001" /></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className={label}>Unit</label><select className={input} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}><option value="sheet">sheet</option><option value="meter">meter</option><option value="stick">stick</option><option value="roll">roll</option><option value="piece">piece</option><option value="ml">ml</option><option value="gram">gram</option></select></div>
        <div><label className={label}>On hand</label><input type="number" className={input} value={form.onHand} onChange={(e) => setForm({ ...form, onHand: e.target.value })} /></div>
        <div><label className={label}>Low threshold</label><input type="number" className={input} value={form.lowThreshold} onChange={(e) => setForm({ ...form, lowThreshold: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label}>Cost per unit ($)</label><input type="number" step="0.01" className={input} value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })} /></div>
        <div><label className={label}>Supplier</label>
          <input className={input} value={form.supplier} list={`supplier-pick-${material?.id || 'new'}`} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Type or pick from directory" />
          <datalist id={`supplier-pick-${material?.id || 'new'}`}>
            {suppliers.filter((s) => s.isActive !== false).map((s) => <option key={s.id} value={s.name}>{s.contact || s.email || ''}</option>)}
          </datalist>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label}>Brand</label><input className={input} value={form.brand} placeholder="e.g. Canson" onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
        <div><label className={label}>Colour</label><input className={input} value={form.colour} placeholder="e.g. Blush" onChange={(e) => setForm({ ...form, colour: e.target.value })} /></div>
        <div><label className={label}>Weight (gsm/lb)</label>
          <div className="flex gap-1.5">
            <input type="number" min={0} max={10000} step="any" className={fieldCls('weightValue') + ' flex-1 min-w-0'} value={form.weightValue} placeholder="65" onChange={(e) => setForm({ ...form, weightValue: e.target.value })} />
            <select className="w-24 shrink-0 border border-line-strong rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500" value={form.weightUnit} onChange={(e) => setForm({ ...form, weightUnit: e.target.value })}><option value="lb">lb</option><option value="gsm">gsm</option></select>
          </div>
          {fieldErr('weightValue')}
        </div>
        <div><label className={label}>Paper/board size</label><input className={input} value={form.size} placeholder="e.g. A4 / 12x12in" onChange={(e) => setForm({ ...form, size: e.target.value })} /></div>
      </div>
      {locations.length > 0 && <div><label className={label}>Location</label><select className={input} value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}><option value="">None</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>}
    </div>
    {error && <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
    <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={requestClose}>Cancel</Btn><Btn onClick={save} disabled={busy}>{busy ? 'Saving…' : material ? 'Save changes' : 'Create'}</Btn></div>
  </Modal>;
}
function LocationModal({ location, onClose, onSaved, token }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({ name: location?.name || '', address: location?.address || '', isDefault: !!location?.isDefault }));
  const [busy, setBusy] = useState(false);
  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-muted mb-1';
  async function save() {
    setBusy(true);
    try {
      const body = { ...form, address: form.address || null };
      if (location) await adminApi.inventory.updateLocation(location.id, body, token);
      else await adminApi.inventory.createLocation({ ...body, isActive: true }, token);
      onSaved();
    }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return <Modal title={location ? 'Edit location' : 'Add location'} onClose={onClose}>
    <div className="space-y-3">
      <div><label className={label}>Name</label><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
      <div><label className={label}>Address</label><input className={input} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> Default location</label>
    </div>
    <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy || !form.name}>{busy ? 'Saving…' : location ? 'Save changes' : 'Add'}</Btn></div>
  </Modal>;
}

function InventoryLow({ token, onOpen }) {
  const [low, setLow] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { adminApi.inventory.lowStock(token).then((d) => { setLow(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false)); }, [token]);
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted">{low.length} items below threshold</div>
      {loading ? <p className="text-xs text-muted py-6 text-center">Loading…</p> : (
        <div className="space-y-1.5">
          {low.map((l, i) => (
            <div key={i} className="flex items-center gap-3 border border-line rounded-xl px-4 py-2.5 text-sm">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${l.type === 'material' ? 'bg-amber-100 text-amber-700' : l.type === 'product' ? 'bg-royal-100 text-royal-700' : 'bg-sky-100 text-sky-700'}`}>{l.type}</span>
              <span className="font-medium text-ink flex-1 truncate cursor-pointer hover:text-royal-700 hover:underline" title="View details" onClick={() => onOpen(l.type === 'material' ? 'material' : l.type === 'product' ? 'level' : 'variant', l.id, l)}>{l.name} <span className="text-muted">• {l.sku}</span></span>
              <span className="text-xs text-muted">{l.location}</span>
              <span className="font-bold text-red-600">{l.onHand} <span className="text-muted font-normal">/ {l.threshold}</span></span>
            </div>
          ))}
          {low.length === 0 && <div className="text-xs text-muted py-10 text-center">All stocked ✓</div>}
        </div>
      )}
    </div>
  );
}

function InventoryStocktake({ data, reload, token, onOpen }) {
  const toast = useToast();
  const locations = Array.isArray(data.locations) ? data.locations : [];
  const levels = Array.isArray(data.levels) ? data.levels : [];
  const materials = Array.isArray(data.materials) ? data.materials : [];
  const [locationId, setLocationId] = useState(locations.find((l) => l.isDefault)?.id || locations[0]?.id || '');
  const [counts, setCounts] = useState({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const [scanOpen, setScanOpen] = useState(false);
  useEffect(() => { adminApi.inventory.stocktakes(token).then((d) => setHistory(Array.isArray(d) ? d : [])).catch(() => {}); }, [token]);
  const items = [
    ...levels.filter((l) => !locationId || l.locationId === locationId).map((l) => ({ key: `p-${l.id}`, productId: l.productId, variantId: l.variantId || null, rawMaterialId: null, name: `${l.product?.title || l.productId}${l.variant ? ` — ${l.variant.title}` : ''}`, expected: l.onHand })),
    ...materials.map((m) => ({ key: `m-${m.id}`, productId: null, variantId: null, rawMaterialId: m.id, name: `${m.name} (material)`, expected: Math.round(Number(m.onHand)) })),
  ];

  // Scanner counts the matched line: expected/typed +1 for every scan.
  function applyScan(r) {
    if (!r.found || !r.item) { beepError(); toast('Item not found', 'error'); return; }
    let it;
    if (r.kind === 'raw_material') {
      it = items.find((x) => x.rawMaterialId === r.item.id);
    } else {
      const vid = r.variant?.id || null;
      it = items.find((x) => x.productId === r.item.id && x.variantId === vid) || items.find((x) => x.productId === r.item.id && x.variantId == null);
    }
    if (!it) { beepError(); toast('Not part of this stocktake (wrong location?)', 'error'); return; }
    setCounts((c) => ({ ...c, [it.key]: Number(c[it.key] ?? it.expected) + 1 }));
    chimeSuccess();
    toast(`Counted +1 — ${it.name}`);
  }
  async function handleScanCode(code) {
    if (!registerScan(code)) return; // 1.5s duplicate window (shared with ScanModal)
    try { applyScan(await lookupScan(code, token)); }
    catch (e) { beepError(); toast(e.message, 'error'); }
  }
  useWedgeScanner(handleScanCode, true);

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
      <Card title="Count stock" actions={<Btn small onClick={() => setScanOpen(true)}>📷 Scan</Btn>}>
        <div className="flex items-end gap-3 mb-3">
          <div><label className="block text-xs font-semibold text-muted mb-1">Location</label>
            <select className="border border-line-strong rounded-xl px-3 py-2 text-sm" value={locationId} onChange={(e) => setLocationId(e.target.value)}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          </div>
          <div className="flex-1"><label className="block text-xs font-semibold text-muted mb-1">Notes (optional)</label><input className="w-full border border-line-strong rounded-xl px-3 py-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <div className="max-h-96 overflow-auto border border-line rounded-xl divide-y divide-line">
          {items.map((it) => (
            <div key={it.key} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="text-ink flex-1 truncate">{it.name}</span>
              <span className="text-xs text-muted">expected {it.expected}</span>
              <input type="number" value={counts[it.key] ?? it.expected} onChange={(e) => setCounts((c) => ({ ...c, [it.key]: e.target.value }))} className="w-20 border border-line-strong rounded-lg px-2 py-1 text-right" />
              {counts[it.key] !== undefined && Number(counts[it.key]) !== it.expected && <span className={`text-xs font-bold ${Number(counts[it.key]) - it.expected > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{(Number(counts[it.key]) - it.expected > 0 ? '+' : '') + (Number(counts[it.key]) - it.expected)}</span>}
            </div>
          ))}
        </div>
        <div className="mt-3"><Btn onClick={submit} disabled={busy || !locationId}>{busy ? 'Applying…' : 'Complete stocktake'}</Btn></div>
      </Card>
      <Card title={`Stocktake history — ${history.length}`}>
        <div className="space-y-1">{history.map((h) => <div key={h.id} className="flex justify-between text-xs border-b border-line py-1.5"><span className="cursor-pointer hover:text-royal-700 hover:underline" title="View details" onClick={() => onOpen('stocktake', h.id, h)}>{h.location?.name} • {h.status}</span><span className="text-muted">{new Date(h.createdAt).toLocaleString()} • {h._count?.lines} lines</span></div>)}</div>
      </Card>
      <ScanModal open={scanOpen} onClose={() => setScanOpen(false)} token={token} closeOnFound onResolved={applyScan} />
    </div>
  );
}

function InventoryPurchase({ data, reload, token, onOpen }) {
  const toast = useToast();
  const materials = Array.isArray(data.materials) ? data.materials : [];
  const suppliers = Array.isArray(data.suppliers) ? data.suppliers : [];
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewSupplier, setViewSupplier] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [pos, setPos] = useState([]);
  useEffect(() => { adminApi.purchaseOrders.list(token).then((d) => setPos(Array.isArray(d) ? d : [])).catch(() => {}); }, [token]);
  async function doDelete() { try { await adminApi.purchaseOrders.remove(confirmDel.id, token); toast('PO deleted'); setPos((p) => p.filter((x) => x.id !== confirmDel.id)); } catch (e) { toast(e.message, 'error'); } }
  const supplierIdFor = (po) => po.supplierRef?.id || suppliers.find((x) => x.name === po.supplier)?.id || null;
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center"><div className="text-xs text-muted">{pos.length} purchase orders</div><Btn onClick={() => setCreating(true)}>+ New purchase order</Btn></div>
      {pos.map((po) => (
        <div key={po.id} className="flex items-center gap-3 border border-line rounded-xl px-4 py-3">
          <div className="flex-1 min-w-0 cursor-pointer hover:text-royal-700" title="View details" onClick={() => onOpen('purchase', po.id, po)}>
            <div className="font-bold text-sm text-ink">{po.poNumber} — <span className="text-royal-700" title="View supplier" onClick={(e) => { const sid = supplierIdFor(po); if (sid) { e.stopPropagation(); setViewSupplier(sid); } }}>{po.supplier}</span></div>
            <div className="text-xs text-muted">{po.lines?.length || 0} lines • {new Date(po.createdAt).toLocaleDateString('en-AU')}</div>
          </div>
          <StatusBadge value={po.status} />
          {po.status !== 'received' && <Btn small color="ghost" onClick={() => setEditing(po)}>Edit</Btn>}
          {po.status !== 'received' && <Btn small color="ghost" onClick={async () => { try { await adminApi.purchaseOrders.receive(po.id, token); toast(`Received ${po.poNumber}`); reload(); setPos((p) => p.map((x) => x.id === po.id ? { ...x, status: 'received' } : x)); } catch (e) { toast(e.message, 'error'); } }}>Receive</Btn>}
          {po.status === 'ordered' && <Btn small color="red" onClick={() => setConfirmDel(po)}>Delete</Btn>}
        </div>
      ))}
      {pos.length === 0 && !creating && !editing && <div className="text-xs text-muted py-10 text-center">No purchase orders — create one to track supplier stock</div>}
      {creating && <POModal materials={materials} suppliers={suppliers} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); toast('PO created'); reload(); }} token={token} />}
      {editing && <POModal po={editing} materials={materials} suppliers={suppliers} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast('PO updated'); reload(); }} token={token} />}
      {viewSupplier && <SupplierDetail supplierId={viewSupplier} token={token} onClose={() => setViewSupplier(null)} />}
      {confirmDel && <ConfirmDialog title="Delete purchase order" message={`Delete ${confirmDel.poNumber}?`} onConfirm={doDelete} onClose={() => setConfirmDel(null)} />}
    </div>
  );
}
function POModal({ po, materials, suppliers = [], onClose, onSaved, token }) {
  const toast = useToast();
  const [supplier, setSupplier] = useState(po?.supplier || '');
  const [notes, setNotes] = useState(po?.notes || '');
  const [lines, setLines] = useState(
    po?.lines?.length
      ? po.lines.map((l) => ({ rawMaterialId: l.rawMaterialId || '', qty: l.qty, unitCost: l.unitCost == null ? '' : Number(l.unitCost) }))
      : [{ rawMaterialId: '', qty: 10, unitCost: '' }]
  );
  const [busy, setBusy] = useState(false);
  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-muted mb-1';
  function setLine(i, k, v) { setLines((l) => l.map((x, idx) => (idx === i ? { ...x, [k]: v } : x))); }
  function rmLine(i) { setLines((l) => l.filter((_, idx) => idx !== i)); }
  async function save() {
    if (!supplier) return toast('Supplier required', 'error');
    const clean = lines.filter((l) => l.rawMaterialId && Number(l.qty) > 0);
    if (!clean.length) return toast('Add at least one line', 'error');
    setBusy(true);
    try {
      const body = { supplier, notes, lines: clean.map((l) => ({ rawMaterialId: l.rawMaterialId, qty: Number(l.qty), unitCost: l.unitCost === '' ? undefined : Number(l.unitCost) })) };
      if (po) await adminApi.purchaseOrders.update(po.id, body, token);
      else await adminApi.purchaseOrders.create(body, token);
      onSaved();
    }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return <Modal title={po ? `Edit ${po.poNumber}` : 'New purchase order'} onClose={onClose} wide>
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label}>Supplier</label>
          <input className={input} value={supplier} list={`po-supplier-${po?.id || 'new'}`} onChange={(e) => setSupplier(e.target.value)} placeholder="Type or pick from directory" />
          <datalist id={`po-supplier-${po?.id || 'new'}`}>
            {suppliers.filter((s) => s.isActive !== false).map((s) => <option key={s.id} value={s.name}>{s.contact || s.email || ''}</option>)}
          </datalist>
        </div>
        <div><label className={label}>Notes</label><input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      <div><div className="flex items-center justify-between mb-1"><label className="text-xs font-semibold text-muted">Lines</label><button onClick={() => setLines((l) => [...l, { rawMaterialId: materials[0]?.id || '', qty: 10, unitCost: '' }])} className="text-xs text-royal-700 font-semibold hover:underline">+ Add line</button></div>
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
    <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy}>{busy ? 'Saving…' : po ? 'Save changes' : 'Create PO'}</Btn></div>
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
  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-muted mb-1';
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

function InventoryMovements({ token, onOpen }) {
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
        <button onClick={() => { setType(''); setPage(1); }} className={`px-3 py-1 rounded-full text-xs font-semibold ${type === '' ? 'bg-royal-600 text-white' : 'bg-surface2 border border-line text-muted'}`}>All</button>
        {TYPES.map((t) => <button key={t} onClick={() => { setType(t); setPage(1); }} className={`px-3 py-1 rounded-full text-xs font-semibold ${type === t ? 'bg-royal-600 text-white' : 'bg-surface2 border border-line text-muted'}`}>{t}</button>)}
      </div>
      <div className="text-xs text-muted">{movs.total} movements</div>
      <div className="space-y-1">
        {movs.data.map((mv) => (
          <div key={mv.id} className="flex justify-between text-xs border-b border-line py-1.5">
            <span className="text-ink truncate mr-2 cursor-pointer hover:text-royal-700" title="View details" onClick={() => onOpen('movement', mv.id, mv)}>{mv.product?.title || mv.rawMaterial?.name || '—'} <span className={mv.quantity > 0 ? 'text-emerald-600' : 'text-red-600'}>{(mv.quantity > 0 ? '+' : '') + mv.quantity}</span> <span className="text-muted">{mv.type} • {mv.location?.name || ''} {mv.reason ? `• ${mv.reason}` : ''}</span></span>
            <span className="text-muted shrink-0">{new Date(mv.createdAt).toLocaleString()}</span>
          </div>
        ))}
        {movs.data.length === 0 && <div className="text-xs text-muted py-6 text-center">No movements</div>}
      </div>
      {movs.pages > 1 && <div className="flex items-center gap-2 justify-end text-xs"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 rounded-lg border border-line-strong disabled:opacity-40">Prev</button><span>{movs.page}/{movs.pages}</span><button disabled={page >= movs.pages} onClick={() => setPage(page + 1)} className="px-3 py-1 rounded-lg border border-line-strong disabled:opacity-40">Next</button></div>}
    </div>
  );
}

function InventoryLots({ data, reload, token, onOpen }) {
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
        <div className="space-y-1">{lots.slice(0, 30).map((l) => <div key={l.id} className="flex justify-between text-xs border-b border-line py-1.5"><span className="text-ink cursor-pointer hover:text-royal-700 hover:underline" title="View details" onClick={() => onOpen('lot', l.id, l)}>{l.product?.title || l.rawMaterial?.name || l.variant?.title || '—'} {l.lotNumber ? `• ${l.lotNumber}` : ''}</span><span className="text-muted">{l.location?.name} • {l.remainingQty}/{l.quantity} left{l.expiresAt ? ` • exp ${new Date(l.expiresAt).toLocaleDateString('en-AU')}` : ''}</span></div>)}{lots.length === 0 && <div className="text-xs text-muted py-4 text-center">No lots</div>}</div>
      </Card>
      {creating && <LotModal options={allOptions} locations={locations} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); toast('Lot received'); reload(); }} token={token} />}
    </div>
  );
}
function LotModal({ options, locations, onClose, onSaved, token }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({ productId: options[0]?.value || '', variantId: '', rawMaterialId: options[0]?.rawMaterialId || null, locationId: locations.find((l) => l.isDefault)?.id || locations[0]?.id || '', lotNumber: '', quantity: 10, costPerUnit: '', expiresAt: '' }));
  const [busy, setBusy] = useState(false);
  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-muted mb-1';
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
  const [labels, setLabels] = useState(false);
  const [q, setQ] = useState('');
  const products = Array.isArray(data.products) ? data.products : [];
  const nq = q.trim().toLowerCase();
  const filteredProducts = !nq ? products : products.filter((p) => [p.title, p.sku, p.barcode, p.description, p.stockMode]
    .some((v) => String(v ?? '').toLowerCase().includes(nq)));
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
      <div className="flex justify-between items-center gap-2">
        <div className="flex items-center gap-2.5">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, SKU, barcode…" className="w-44 sm:w-60 border border-line-strong rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-royal-500" />
          <div className="text-xs text-muted">{nq ? `${filteredProducts.length} of ${products.length} products` : `${products.length} products`}</div>
        </div>
        <div className="flex gap-2">
          <Btn color="ghost" onClick={() => setLabels(true)}>🖨 Labels</Btn>
          <Btn onClick={() => setEditing({})}>+ New product</Btn>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {filteredProducts.map((p) => (
          <div key={p.id} className="border border-line rounded-xl p-3">
            <div className="flex gap-3">
              {p.images?.[0] ? <img src={p.images[0].url} alt={p.title} className="w-16 h-16 rounded-lg object-cover" loading="lazy" /> : <div className="w-16 h-16 rounded-lg bg-surface3 flex items-center justify-center text-muted text-xs">no img</div>}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-ink truncate">{p.title}</div>
                <div className="text-xs text-muted">{p.sku} • ${Number(p.price).toFixed(2)} • {p.stockMode}</div>
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
              <label className={`inline-flex items-center px-2.5 py-1 text-xs rounded-xl border border-line-strong text-ink hover:bg-surface3 cursor-pointer font-semibold ${uploading === p.id ? 'opacity-50' : ''}`}>
                {uploading === p.id ? 'Uploading…' : 'Upload'}
                <input type="file" accept="image/*" multiple className="hidden" disabled={uploading === p.id} onChange={(e) => e.target.files?.length && upload(p.id, e.target.files)} />
              </label>
              <Btn small color="red" onClick={() => setConfirmDel(p)}>Delete</Btn>
            </div>
          </div>
        ))}
      </div>
      {filteredProducts.length === 0 && <div className="text-xs text-muted py-10 text-center">{nq ? 'No products match your search' : 'No products'}</div>}
      {editing && <ProductModal product={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast(editing.id ? 'Product updated' : 'Product created'); reload(); }} token={token} />}
      {confirmDel && <ConfirmDialog title="Delete product" message={`Delete "${confirmDel.title}"? This cannot be undone.`} confirmLabel="Delete" onConfirm={doDelete} onClose={() => setConfirmDel(null)} />}
      {labels && <LabelPrintModal title="Print product labels" items={filteredProducts.map((p) => ({ id: p.id, name: p.title, value: p.barcode || p.sku || '' }))} onClose={() => setLabels(false)} />}
    </div>
  );
}

const FLOWER_TYPES = ['rose','lily','wattle','banksia','peony','mixed'];
const COLOUR_FAMILIES = ['blush','sage','ivory','dusty-pink','eucalyptus','white','mixed'];
const OCCASIONS = ['birthday','wedding','anniversary','sympathy','valentines','mothers-day'];

function ProductModal({ product, onClose, onSaved, token }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    title: product?.title || '', slug: product?.slug || '', sku: product?.sku || '',
    barcode: product?.barcode || '',
    price: product ? Number(product.price) : '', description: product?.description || '',
    stockMode: product?.stockMode || 'made_to_order', type: product?.type || 'physical',
    isFeatured: !!product?.isFeatured, isActive: product ? !!product.isActive : true,
    madeToOrderDays: product?.madeToOrderDays || 5,
    flowerType: product?.flowerType || '', colourFamily: product?.colourFamily || '',
    stemLengthMm: product?.stemLengthMm ?? '', careInstructions: product?.careInstructions || '',
    occasions: Array.isArray(product?.occasions) ? product.occasions : [],
  }));
  const [variants, setVariants] = useState([]);
  const [busy, setBusy] = useState(false);
  const [fieldDefs, setFieldDefs] = useState([]);
  const [custom, setCustom] = useState(() => ({ ...(product?.customFields || {}) }));
  const [manageFields, setManageFields] = useState(false);
  const [newField, setNewField] = useState({ label: '', type: 'text' });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  useEffect(() => {
    if (product?.id) adminApi.variants.list(product.id, token).then(setVariants).catch(() => {});
    adminApi.productFields.list().then(setFieldDefs).catch(() => {});
  }, [product?.id, token]);
  async function save() {
    setBusy(true);
    try {
      // Custom field values: omit empties, coerce number inputs — booleans are presence-only (true).
      const cf = {};
      for (const d of fieldDefs) {
        const v = custom[d.key];
        if (d.type === 'boolean') { if (v === true) cf[d.key] = true; }
        else if (d.type === 'number') { if (v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v))) cf[d.key] = Number(v); }
        else if (v !== undefined && String(v).trim() !== '') cf[d.key] = String(v).trim();
      }
      const body = { ...form, barcode: form.barcode?.trim() || null, price: Number(form.price), madeToOrderDays: form.madeToOrderDays ? Number(form.madeToOrderDays) : undefined,
        flowerType: form.flowerType?.trim() || null,
        colourFamily: form.colourFamily?.trim() || null,
        stemLengthMm: form.stemLengthMm === '' || form.stemLengthMm == null ? null : Number(form.stemLengthMm),
        careInstructions: form.careInstructions?.trim() || null,
        occasions: Array.isArray(form.occasions) ? form.occasions : [],
        // Updates always send customFields (even {}) so cleared values actually clear.
        ...(product ? { customFields: cf } : (Object.keys(cf).length ? { customFields: cf } : {})) };
      if (product) await adminApi.products.update(product.id, body, token);
      else await adminApi.products.create(body, token);
      onSaved();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  async function addField() {
    const label = newField.label.trim();
    if (label.length < 2) return toast('Field label needs 2+ characters', 'error');
    try {
      const f = await adminApi.productFields.create({ label, type: newField.type }, token);
      setFieldDefs((ds) => [...ds, f]); setNewField({ label: '', type: 'text' }); toast('Field added');
    } catch (e) { toast(e.message, 'error'); }
  }
  async function renameField(d) {
    const label = window.prompt('Field label', d.label);
    if (!label || label.trim() === d.label) return;
    try {
      const f = await adminApi.productFields.update(d.id, { label: label.trim() }, token);
      setFieldDefs((ds) => ds.map((x) => (x.id === d.id ? f : x))); toast('Field renamed');
    } catch (e) { toast(e.message, 'error'); }
  }
  async function removeField(d) {
    if (!window.confirm(`Delete field "${d.label}"? Products keep their stored values but stop showing them.`)) return;
    try {
      await adminApi.productFields.remove(d.id, token);
      setFieldDefs((ds) => ds.filter((x) => x.id !== d.id));
      setCustom((c) => { const { [d.key]: _drop, ...rest } = c; return rest; });
      toast('Field deleted');
    } catch (e) { toast(e.message, 'error'); }
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
  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-muted mb-1';
  return (
    <Modal title={product ? 'Edit product' : 'New product'} onClose={onClose} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><label className={label}>Title</label><input className={input} value={form.title} onChange={(e) => set('title', e.target.value)} /></div>
        <div><label className={label}>Slug</label><input className={input} value={form.slug} onChange={(e) => set('slug', e.target.value)} placeholder="auto-from-title" /></div>
        <div><label className={label}>SKU</label><input className={input} value={form.sku} onChange={(e) => set('sku', e.target.value)} /></div>
        <div><label className={label}>Barcode</label><input className={input} value={form.barcode} onChange={(e) => set('barcode', e.target.value)} placeholder="scan label (unique)" /></div>
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
        <div><label className={label}>Flower type</label>
          <select className={input} value={form.flowerType} onChange={(e) => set('flowerType', e.target.value)}>
            <option value="">—</option>{FLOWER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div><label className={label}>Colour family</label>
          <select className={input} value={form.colourFamily} onChange={(e) => set('colourFamily', e.target.value)}>
            <option value="">—</option>{COLOUR_FAMILIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div><label className={label}>Stem length (mm)</label><input type="number" className={input} value={form.stemLengthMm} onChange={(e) => set('stemLengthMm', e.target.value)} /></div>
        <div className="sm:col-span-2"><label className={label}>Occasions</label>
          <div className="flex flex-wrap gap-2 mt-1">{OCCASIONS.map(o => (
            <label key={o} className="flex items-center gap-1 text-xs border border-line rounded-full px-2 py-1">
              <input type="checkbox" checked={form.occasions.includes(o)} onChange={(e) => set('occasions', e.target.checked ? [...form.occasions, o] : form.occasions.filter(x => x !== o))} /> {o}
            </label>
          ))}</div>
        </div>
        <div className="sm:col-span-2"><label className={label}>Care instructions</label><textarea rows={2} className={input} value={form.careInstructions} onChange={(e) => set('careInstructions', e.target.value)} placeholder="Keep dry, dust with a soft brush…" /></div>
        <div className="sm:col-span-2"><label className={label}>Description</label><textarea rows={3} className={input} value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} /> Featured</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} /> Active (visible in shop)</label>
      </div>
      <div className="mt-4 border border-line rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-muted">Custom fields</label>
          <button onClick={() => setManageFields((m) => !m)} className="text-xs text-royal-700 font-semibold hover:underline">{manageFields ? 'Done' : '+ Manage fields'}</button>
        </div>
        {manageFields && (
          <div className="space-y-2 mb-3 bg-surface3 rounded-lg p-2">
            {fieldDefs.length === 0 && <div className="text-xs text-muted">No fields defined yet — add one below.</div>}
            {fieldDefs.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-xs flex-wrap">
                <span className="font-semibold text-ink">{d.label}</span>
                <code className="text-muted">{d.key}</code>
                <span className="px-1.5 py-0.5 rounded bg-surface2 border text-muted">{d.type}</span>
                <span className="flex-1" />
                <button onClick={() => renameField(d)} className="text-royal-700 hover:underline">Rename</button>
                <button onClick={() => removeField(d)} className="text-red-600 hover:underline">Delete</button>
              </div>
            ))}
            <div className="flex gap-2 items-end flex-wrap border-t border-line pt-2">
              <div className="flex-1 min-w-[140px]"><label className={label}>New field label</label><input className={input} value={newField.label} onChange={(e) => setNewField({ ...newField, label: e.target.value })} placeholder="e.g. Material" /></div>
              <div><label className={label}>Type</label>
                <select className={input} value={newField.type} onChange={(e) => setNewField({ ...newField, type: e.target.value })}>
                  <option value="text">Text</option><option value="number">Number</option><option value="boolean">Yes / No</option>
                </select>
              </div>
              <button onClick={addField} className="bg-bloom-500 text-white px-3 py-2 rounded-xl text-xs font-bold">Add</button>
            </div>
          </div>
        )}
        {fieldDefs.length === 0 && !manageFields && (
          <div className="text-xs text-muted">No custom fields yet — open <b>Manage fields</b> to define your own (e.g. Material, Origin, Care).</div>
        )}
        {fieldDefs.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-3 mt-1">
            {fieldDefs.map((d) => d.type === 'boolean' ? (
              <label key={d.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={custom[d.key] === true} onChange={(e) => setCustom((c) => ({ ...c, [d.key]: e.target.checked }))} /> {d.label}</label>
            ) : (
              <div key={d.id}><label className={label}>{d.label}</label><input className={input} type={d.type === 'number' ? 'number' : 'text'} value={custom[d.key] ?? ''} onChange={(e) => setCustom((c) => ({ ...c, [d.key]: e.target.value }))} /></div>
            ))}
          </div>
        )}
      </div>
      {product && (
        <div className="mt-4 border border-line rounded-xl p-3">
          <div className="flex items-center justify-between mb-2"><label className="text-xs font-semibold text-muted">Variants ({variants.length})</label><button onClick={addVariant} className="text-xs text-royal-700 font-semibold hover:underline">+ Add variant</button></div>
          <div className="space-y-1">
            {variants.map((v) => (
              <div key={v.id} className="flex items-center gap-2 text-xs border-b border-line py-1.5 flex-wrap">
                <input value={v.title} onChange={(e) => saveVariant(v, 'title', e.target.value)} className="flex-1 min-w-[140px] border border-line rounded-lg px-2 py-1" />
                <span className="text-muted">${Number(v.price).toFixed(2)}</span>
                <span className="text-muted">{v.inventoryQuantity} in stock</span>
                <button onClick={() => saveVariant(v, 'inventoryQuantity', v.inventoryQuantity + 1)} className="w-6 h-6 rounded bg-royal-50 text-royal-700 font-bold hover:bg-royal-100">+</button>
                <button onClick={() => saveVariant(v, 'inventoryQuantity', Math.max(0, v.inventoryQuantity - 1))} className="w-6 h-6 rounded bg-surface3 text-ink font-bold hover:bg-gray-200">−</button>
                <button onClick={() => deleteVariant(v)} className="text-red-500 hover:underline">Del</button>
              </div>
            ))}
            {variants.length === 0 && <div className="text-xs text-muted">No variants — add sizes/options if this product varies</div>}
          </div>
        </div>
      )}
      {product && (product.images || []).length > 0 && (
        <div className="mt-4">
          <label className="block text-xs font-semibold text-muted mb-1">Images</label>
          <div className="flex flex-wrap gap-2">
            {(product.images || []).map((img) => (
              <div key={img.id} className="relative group">
                <img src={img.url} alt={img.alt || product.title} className="w-16 h-16 rounded-lg object-cover border border-line" loading="lazy" />
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
  const [editing, setEditing] = useState(null);
  const [sessionFor, setSessionFor] = useState(null);
  const [sessionEdit, setSessionEdit] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [visFilter, setVisFilter] = useState('all'); // all | visible | hidden
  const allWorkshops = Array.isArray(data.workshops) ? data.workshops : [];
  const workshops = allWorkshops.filter((w) => visFilter === 'visible' ? w.isActive !== false : visFilter === 'hidden' ? w.isActive === false : true);
  const hiddenCount = allWorkshops.filter((w) => w.isActive === false).length;
  async function doDelete() {
    try {
      if (confirmDel.kind === 'workshop') await adminApi.workshops.remove(confirmDel.id, token);
      else await adminApi.workshops.removeSession(confirmDel.id, token);
      toast('Deleted'); reload();
    } catch (e) { toast(e.message, 'error'); }
    finally { setConfirmDel(null); }
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div className="text-xs text-muted">{workshops.length} workshops{hiddenCount > 0 && visFilter !== 'hidden' && <> • <span className="text-amber-600 font-semibold">{hiddenCount} hidden</span></>}</div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex rounded-xl border border-line-strong overflow-hidden text-xs font-semibold">
            {[['all', 'All'], ['visible', 'Visible'], ['hidden', 'Hidden']].map(([k, label]) => (
              <button key={k} onClick={() => setVisFilter(k)} className={`px-2.5 py-1.5 ${visFilter === k ? 'bg-royal-600 text-white' : 'bg-surface2 text-muted hover:bg-surface3'}`}>{label}</button>
            ))}
          </div>
          <Btn onClick={() => setCreating(true)}>+ New workshop</Btn>
        </div>
      </div>
      {workshops.map((w) => (
        <div key={w.id} className={`border rounded-xl p-4 ${w.isActive === false ? 'border-amber-300 bg-amber-50/40' : 'border-line'}`}>
          <div className="flex justify-between items-start gap-3">
            <div><div className="font-bold text-ink">{w.title} {w.isActive === false && <span className="ml-1 align-middle text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">Hidden</span>}</div><div className="text-xs text-muted">{w.location} • {w.capacity} cap • ${Number(w.price).toFixed(2)} • {w.level}</div></div>
            <div className="flex gap-1.5 shrink-0">
              <Btn small color="ghost" onClick={() => setSessionFor(w)}>+ Session</Btn>
              <Btn small color="ghost" onClick={() => setEditing(w)}>Edit</Btn>
              <Btn small color="red" onClick={() => setConfirmDel({ kind: 'workshop', id: w.id, label: w.title })}>Delete</Btn>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(w.sessions || []).map((s) => (
              <span key={s.id} className="text-xs bg-surface3 border border-line rounded-lg px-2 py-1 group">
                {new Date(s.startsAt).toLocaleDateString('en-AU')} {new Date(s.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {s.bookedCount}/{s.capacity}
                <button className="ml-1.5 font-bold text-muted hover:text-royal-700" title="Edit session" onClick={() => setSessionEdit({ workshop: w, session: s })}>✎</button>
                <button className="ml-1 font-bold text-muted hover:text-red-600" title="Delete session" onClick={() => setConfirmDel({ kind: 'session', id: s.id, label: `session on ${new Date(s.startsAt).toLocaleDateString('en-AU')}` })}>✕</button>
              </span>
            ))}
            {(w.sessions || []).length === 0 && <span className="text-xs text-muted">No sessions yet</span>}
          </div>
        </div>
      ))}
      {workshops.length === 0 && <div className="text-xs text-muted py-10 text-center">{allWorkshops.length === 0 ? 'No workshops' : visFilter === 'hidden' ? 'No hidden workshops' : visFilter === 'visible' ? 'No visible workshops' : 'No workshops'}</div>}
      {creating && <WorkshopModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); toast('Workshop created'); reload(); }} token={token} />}
      {editing && <WorkshopModal workshop={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast('Workshop updated'); reload(); }} token={token} />}
      {sessionFor && <SessionModal workshop={sessionFor} onClose={() => setSessionFor(null)} onSaved={() => { setSessionFor(null); toast('Session added'); reload(); }} token={token} />}
      {sessionEdit && <SessionModal workshop={sessionEdit.workshop} session={sessionEdit.session} onClose={() => setSessionEdit(null)} onSaved={() => { setSessionEdit(null); toast('Session updated'); reload(); }} token={token} />}
      {confirmDel && <ConfirmDialog title={confirmDel.kind === 'workshop' ? 'Delete workshop' : 'Delete session'} message={`Delete ${confirmDel.label}?${confirmDel.kind === 'workshop' ? '' : ''}`} onConfirm={doDelete} onClose={() => setConfirmDel(null)} />}
    </div>
  );
}
function WorkshopModal({ workshop, onClose, onSaved, token }) {
  const toast = useToast();
  const [form, setForm] = useState(() => workshop
    ? { title: workshop.title, slug: workshop.slug, price: Number(workshop.price), capacity: workshop.capacity, location: workshop.location || '', description: workshop.description || '', level: workshop.level || '', isActive: workshop.isActive !== false }
    : { title: '', slug: '', price: '', capacity: 12, location: 'Perth Studio, WA', description: '', level: '', isActive: true });
  const [busy, setBusy] = useState(false);
  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-muted mb-1';
  useEffect(() => {
    if (workshop) return;
    adminApi.settings.get()
      .then((s) => { const cap = Number(s?.workshop_default_capacity); if (Number.isFinite(cap) && cap >= 1) setForm((f) => ({ ...f, capacity: cap })); })
      .catch(() => {});
  }, [workshop]);
  async function save() {
    setBusy(true);
    try {
      const body = { ...form, price: Number(form.price), capacity: Number(form.capacity) };
      if (workshop) await adminApi.workshops.update(workshop.id, body, token);
      else await adminApi.workshops.create(body, token);
      onSaved();
    }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return <Modal title={workshop ? 'Edit workshop' : 'New workshop'} onClose={onClose}>
    <div className="space-y-3">
      <div><label className={label}>Title</label><input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
      <div><label className={label}>Slug</label><input className={input} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className={label}>Price ($)</label><input type="number" className={input} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
        <div><label className={label}>Capacity</label><input type="number" className={input} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></div>
        <div><label className={label}>Level</label><input className={input} value={form.level} placeholder="beginner" onChange={(e) => setForm({ ...form, level: e.target.value })} /></div>
      </div>
      <div><label className={label}>Location</label><input className={input} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
      <div><label className={label}>Description</label><textarea rows={3} className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Visible on the public Workshops page</label>
    </div>
    <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy || !form.title || !form.slug}>{busy ? 'Saving…' : workshop ? 'Save changes' : 'Create'}</Btn></div>
  </Modal>;
}
function SessionModal({ workshop, session, onClose, onSaved, token }) {
  const toast = useToast();
  const [startsAt, setStartsAt] = useState(() => {
    if (!session) return '';
    const d = new Date(session.startsAt);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [capacity, setCapacity] = useState(session?.capacity ?? workshop.capacity);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      if (session) {
        const start = new Date(startsAt);
        const end = new Date(start.getTime() + (workshop.durationMinutes || 180) * 60000);
        await adminApi.workshops.updateSession(session.id, { startsAt: start.toISOString(), endsAt: end.toISOString(), capacity: Number(capacity) }, token);
      } else {
        const start = new Date(startsAt);
        const end = new Date(start.getTime() + (workshop.durationMinutes || 180) * 60000);
        await adminApi.workshops.addSession(workshop.id, { startsAt: start.toISOString(), endsAt: end.toISOString(), capacity: Number(capacity) }, token);
      }
      onSaved();
    }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return <Modal title={`${session ? 'Edit' : 'Add'} session — ${workshop.title}`} onClose={onClose}>
    <div className="space-y-3">
      <div><label className="block text-xs font-semibold text-muted mb-1">Starts at</label><input type="datetime-local" className="w-full border border-line-strong rounded-xl px-3 py-2 text-sm" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div>
      <div><label className="block text-xs font-semibold text-muted mb-1">Capacity</label><input type="number" className="w-full border border-line-strong rounded-xl px-3 py-2 text-sm" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></div>
      {session && session.bookedCount > 0 && <div className="text-xs text-muted">{session.bookedCount} confirmed booking(s) — capacity cannot drop below this</div>}
    </div>
    <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy || !startsAt}>{busy ? 'Saving…' : session ? 'Save changes' : 'Add session'}</Btn></div>
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
      <div className="flex justify-between items-center"><div className="text-xs text-muted">{recipes.length} recipes</div><Btn onClick={() => setCreating(true)}>+ New recipe</Btn></div>
      {recipes.map((r) => (
        <div key={r.id} className="flex items-center gap-3 border border-line rounded-xl px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-ink">{r.product?.title || r.variant?.title || 'Generic'} {r.variant ? `— ${r.variant.title}` : ''}</div>
            <div className="text-xs text-muted">{r.lines?.length || 0} materials • labour {r.labourMinutesPerUnit}m + cricut {r.cricutMinutesPerUnit}m</div>
          </div>
          <Btn small color="ghost" onClick={() => setEditing(r)}>Edit</Btn>
          <Btn small color="red" onClick={() => setConfirmDel(r)}>Delete</Btn>
        </div>
      ))}
      {recipes.length === 0 && <div className="text-xs text-muted py-10 text-center">No recipes — create one to price configurator builds</div>}
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
  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-muted mb-1';
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
        <div className="flex items-center justify-between mb-1"><label className="text-xs font-semibold text-muted">Material lines</label><button onClick={addLine} className="text-xs text-royal-700 font-semibold hover:underline">+ Add material</button></div>
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
      <div className="flex justify-between items-center"><div className="text-xs text-muted">{collections.length} collections</div><Btn onClick={() => setCreating(true)}>+ New collection</Btn></div>
      {collections.map((c) => (
        <div key={c.id} className="border border-line rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0"><div className="font-bold text-sm text-ink">{c.title}</div><div className="text-xs text-muted">{c.slug} • {(c.products || []).length} products</div></div>
            <StatusBadge value={c.isActive ? 'published' : 'archived'} />
            <Btn small color="ghost" onClick={() => setEditing(c)}>Manage</Btn>
            <Btn small color="red" onClick={() => setConfirmDel(c)}>Delete</Btn>
          </div>
        </div>
      ))}
      {collections.length === 0 && <div className="text-xs text-muted py-10 text-center">No collections</div>}
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
  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-muted mb-1';
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
          <div className="flex items-center justify-between"><label className="text-xs font-semibold text-muted">Products in collection ({members.length})</label><label className="text-xs text-muted">{products.length} available</label></div>
          <div className="max-h-64 overflow-auto border border-line rounded-xl divide-y divide-line">
            {products.map((p) => (
              <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface3 cursor-pointer">
                <input type="checkbox" checked={memberIds.has(p.id)} onChange={() => toggleMember(p)} />
                <img src={p.images?.[0]?.url || '/placeholder-bloom.jpg'} alt="" className="w-8 h-8 rounded object-cover" onError={(e) => { e.currentTarget.src = '/placeholder-bloom.jpg'; }} />
                <span className="text-ink flex-1 truncate">{p.title}</span>
                <span className="text-xs text-muted">${Number(p.price).toFixed(2)}</span>
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
          <span className="text-xs text-muted">{meta.synced || 0} synced • {meta.pending || 0} pending</span>
          <div className="ml-auto flex gap-2"><Btn onClick={syncAll} disabled={busy || !meta.configured}>{busy ? 'Syncing…' : 'Sync all products'}</Btn></div>
        </div>
        {!meta.configured && <p className="text-xs text-muted mt-3">Set META_CATALOG_ID + META_ACCESS_TOKEN in Netlify env to enable.</p>}
      </Card>
      <Card title={`Sync log — ${logs.length} recent`}>
        <div className="space-y-1">{logs.map((l) => (
          <div key={l.id} className="flex justify-between text-xs border-b border-line py-1.5"><span className="text-ink truncate mr-2">{l.message || l.action} {l.productId ? `• ${l.productId.slice(-6)}` : ''}</span><span className="text-muted shrink-0">{new Date(l.createdAt).toLocaleString()}</span></div>
        ))}{logs.length === 0 && <div className="text-xs text-muted py-4 text-center">No sync activity yet</div>}</div>
      </Card>
    </div>
  );
}

function Bookings({ data, reload, token }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(null); // { kind: 'cancel'|'refund', booking }
  const bookings = Array.isArray(data.bookings) ? data.bookings : [];
  const [filter, setFilter] = useState('all');
  const confirmed = bookings.filter((b) => b.status === 'confirmed' || b.status === 'attended').length;
  async function setStatus(b, status, label) {
    try {
      await adminApi.bookings.update(b.id, { status }, token);
      toast(`${b.name} → ${label}`); reload();
    } catch (e) { toast(e.message, 'error'); }
  }
  async function doConfirm() {
    const { kind, booking } = confirm;
    try {
      if (kind === 'cancel') {
        await adminApi.bookings.update(booking.id, { status: 'cancelled' }, token);
        toast(`${booking.name} cancelled — ${booking.quantity} seat(s) freed`);
      } else {
        await adminApi.bookings.update(booking.id, { refund: true }, token);
        toast(`Refund marked for ${booking.name}`);
      }
      reload();
    } catch (e) { toast(e.message, 'error'); }
  }
  const shown = bookings.filter((b) => {
    if (filter === 'active') return ['pending', 'confirmed', 'waitlisted'].includes(b.status);
    if (filter === 'attended') return b.status === 'attended';
    if (filter === 'cancelled') return b.status === 'cancelled';
    return true;
  });
  const FILTERS = [['all', 'All'], ['active', 'Active'], ['attended', 'Attended'], ['cancelled', 'Cancelled']];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-xs text-muted flex-1">{bookings.length} bookings • {confirmed} confirmed/attended</div>
        {FILTERS.map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold ${filter === id ? 'bg-royal-600 text-white' : 'bg-surface2 border border-line text-muted'}`}>{label}</button>
        ))}
      </div>
      {shown.map((b) => (
        <div key={b.id} className="flex flex-wrap items-center gap-3 border border-line rounded-xl px-4 py-3 text-sm">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-ink">{b.name} <span className="text-muted font-normal">• {b.email}</span></div>
            <div className="text-xs text-muted">{b.session?.workshop?.title} • {b.session ? new Date(b.session.startsAt).toLocaleDateString('en-AU') : ''} • qty {b.quantity}</div>
          </div>
          <StatusBadge value={b.status} />
          {b.refundedAt && <StatusBadge value="refunded" />}
          <span className="text-xs font-bold text-royal-700">${Number(b.totalPaid).toFixed(2)}</span>
          {b.ticket && <span className="text-[10px] text-muted font-mono" title={b.ticket.qrPayload}>✓ ticket</span>}
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            {['pending', 'confirmed', 'waitlisted'].includes(b.status) && (
              <Btn small color="red" onClick={() => setConfirm({ kind: 'cancel', booking: b })}>Cancel</Btn>
            )}
            {b.status === 'cancelled' && (
              <Btn small color="ghost" onClick={() => setStatus(b, 'confirmed', 'restored')}>Restore</Btn>
            )}
            {['pending', 'confirmed'].includes(b.status) && (
              <>
                <Btn small color="ghost" onClick={() => setStatus(b, 'attended', 'attended')}>Attended</Btn>
                <Btn small color="ghost" onClick={() => setStatus(b, 'no_show', 'no-show')}>No-show</Btn>
              </>
            )}
            {Number(b.totalPaid) > 0 && !b.refundedAt && (
              <Btn small color="ghost" onClick={() => setConfirm({ kind: 'refund', booking: b })}>Refund</Btn>
            )}
          </div>
        </div>
      ))}
      {shown.length === 0 && <div className="text-xs text-muted py-10 text-center">{bookings.length === 0 ? 'No bookings yet' : 'No bookings match this filter'}</div>}
      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'cancel' ? 'Cancel booking' : 'Mark refund'}
          message={confirm.kind === 'cancel'
            ? `Cancel ${confirm.booking.name}'s booking (${confirm.booking.quantity} seat(s))? The seat returns to the session and check-in is blocked.`
            : `Record a refund of $${Number(confirm.booking.totalPaid).toFixed(2)} for ${confirm.booking.name}? (Payments are not processed automatically.)`}
          confirmLabel={confirm.kind === 'cancel' ? 'Cancel booking' : 'Mark refunded'}
          onConfirm={doConfirm}
          onClose={() => setConfirm(null)}
        />
      )}
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
      <div className="flex justify-between items-center"><div className="text-xs text-muted">{discounts.length} discount codes</div><Btn onClick={() => setEditing({})}>+ New code</Btn></div>
      {discounts.map((d) => (
        <div key={d.id} className="flex items-center gap-3 border border-line rounded-xl px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2"><span className="font-black text-royal-700">{d.code}</span><StatusBadge value={d.isActive ? 'published' : 'archived'} /></div>
            <div className="text-xs text-muted">{d.type === 'percent' ? `${d.value}% off` : `$${Number(d.value).toFixed(2)} off`}{d.minSpend ? ` • min $${Number(d.minSpend).toFixed(2)}` : ''}{d.maxUses ? ` • used ${d.usedCount}/${d.maxUses}` : ''}</div>
          </div>
          <Btn small color="ghost" onClick={() => setEditing(d)}>Edit</Btn>
          <Btn small color="ghost" onClick={() => toggle(d)}>{d.isActive ? 'Disable' : 'Enable'}</Btn>
          <Btn small color="red" onClick={() => setConfirmDel(d)}>Delete</Btn>
        </div>
      ))}
      {discounts.length === 0 && <div className="text-xs text-muted py-10 text-center">No discounts</div>}
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
  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-muted mb-1';
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
      <div className="text-xs text-muted">{reviews.length} pending reviews</div>
      {reviews.map((r) => (
        <div key={r.id} className="border border-line rounded-xl p-4">
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1"><div className="font-bold text-sm text-ink">{'★'.repeat(Math.max(1, r.rating || 5))}{'☆'.repeat(5 - Math.max(1, r.rating || 5))} — {r.name || 'Anonymous'}</div>
              <div className="text-xs text-muted mt-1">{r.product?.title || r.productId}</div>
              {r.title && <div className="text-sm font-semibold text-ink mt-1">{r.title}</div>}
              <p className="text-sm text-muted mt-1">{r.body || '—'}</p></div>
            <div className="flex gap-2 shrink-0">
              <Btn small color="royal" onClick={() => approve(r)}>Approve</Btn>
              <Btn small color="ghost" onClick={() => setConfirmReject(r)}>Reject</Btn>
              <Btn small color="red" onClick={() => setConfirmDel(r)}>Delete</Btn>
            </div>
          </div>
        </div>
      ))}
      {reviews.length === 0 && <div className="text-xs text-muted py-10 text-center">No pending reviews</div>}
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
      <div className="flex justify-between items-center"><div className="text-xs text-muted">{posts.length} posts</div><Btn onClick={() => setEditing({})}>+ New post</Btn></div>
      {posts.map((p) => (
        <div key={p.id} className="flex items-center gap-3 border border-line rounded-xl px-4 py-3">
          <div className="flex-1 min-w-0"><div className="font-bold text-sm text-ink truncate">{p.title}</div><div className="text-xs text-muted">{p.slug} • {new Date(p.publishedAt || p.createdAt).toLocaleDateString('en-AU')} • {p.viewCount || 0} views</div></div>
          <StatusBadge value={p.status} />
          <Btn small color="ghost" onClick={() => setEditing(p)}>Edit</Btn>
          <Btn small color="ghost" onClick={() => setStatus(p, p.status === 'published' ? 'draft' : 'published')}>{p.status === 'published' ? 'Unpublish' : 'Publish'}</Btn>
          <Btn small color="red" onClick={() => setConfirmDel(p)}>Delete</Btn>
        </div>
      ))}
      {posts.length === 0 && <div className="text-xs text-muted py-10 text-center">No posts</div>}
      {editing && <PostModal post={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast(editing.id ? 'Post updated' : 'Post created'); reload(); }} token={token} />}
      {confirmDel && <ConfirmDialog title="Delete post" message={`Delete "${confirmDel.title}"?`} onConfirm={doDelete} onClose={() => setConfirmDel(null)} />}
    </div>
  );
}
function PostModal({ post, onClose, onSaved, token }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: post?.title || '', slug: post?.slug || '', excerpt: post?.excerpt || '', content: post?.content || '', status: post?.status || 'draft', tags: post?.tags || '', metaTitle: post?.metaTitle || '', metaDescription: post?.metaDescription || '' });
  const [busy, setBusy] = useState(false);
  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-muted mb-1';
  async function save() {
    setBusy(true);
    try {
      // API expects tags as a comma-separated string (z.string) — normalise whatever the field holds
      const tags = (Array.isArray(form.tags) ? form.tags.join(', ') : String(form.tags || ''))
        .split(',').map((t) => t.trim()).filter(Boolean).join(', ');
      const body = { ...form, tags, metaTitle: form.metaTitle.trim() || null, metaDescription: form.metaDescription.trim() || null };
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
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className={label}>Meta title (SEO ≤70)</label><input className={input} maxLength={70} value={form.metaTitle} onChange={(e) => setForm({ ...form, metaTitle: e.target.value })} placeholder="Shown in Google results" /></div>
        <div><label className={label}>Meta description (SEO ≤200)</label><input className={input} maxLength={200} value={form.metaDescription} onChange={(e) => setForm({ ...form, metaDescription: e.target.value })} placeholder="Short summary for search results" /></div>
      </div>
      <div><label className={label}>Tags (comma-separated)</label><input className={input} value={Array.isArray(form.tags) ? form.tags.join(', ') : form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></div>
      <div><label className={label}>Content (markdown: ## heading, **bold**, - lists)</label><textarea rows={8} className={input} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
    </div>
    <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy || !form.title}>{busy ? 'Saving…' : post ? 'Save changes' : 'Create post'}</Btn></div>
  </Modal>;
}

const PROC_CATEGORIES = [
  { v: 'PAPER_FLOWER', l: 'Paper flower' },
  { v: 'ORIGAMI', l: 'Origami' },
  { v: 'MANUFACTURING_SPEC', l: 'Manufacturing spec' },
];
const PROC_DIFFICULTIES = ['', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const PROC_FOLDING = ['', 'simple', 'moderate', 'complex'];

function Procedures({ token, role }) {
  const toast = useToast();
  const [params, setParams] = useState({ status: 'all', category: '', difficulty: '', q: '', page: 1 });
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const canDelete = ['admin', 'developer'].includes(role);
  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm bg-surface2 text-ink focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-muted mb-1';

  useEffect(() => {
    const t = setTimeout(() => setParams((p) => (p.q === search.trim() ? p : { ...p, q: search.trim(), page: 1 })), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let dead = false;
    setRows(null);
    adminApi.procedures.list(token, params)
      .then((r) => { if (dead) return; setRows(r.procedures); setTotal(r.total); setPages(r.pages); setErr(''); })
      .catch((e) => { if (!dead) { setErr(e.message); setRows([]); } });
    return () => { dead = true; };
  }, [params, token]);

  const setF = (patch) => setParams((p) => ({ ...p, ...patch, page: 1 }));
  async function openEdit(p) {
    // List rows omit contentMarkdown — fetch the full doc before editing.
    try { setEditing(await adminApi.procedures.get(p.id, token)); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function doDelete() {
    try { await adminApi.procedures.remove(confirmDel.id, token); toast('Procedure deleted'); setConfirmDel(null); setParams((p) => ({ ...p })); }
    catch (e) { toast(e.message, 'error'); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[180px]"><label className={label}>Search</label>
          <input className={input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title…" /></div>
        <div><label className={label}>Status</label>
          <select className={input} value={params.status} onChange={(e) => setF({ status: e.target.value })}>
            {['all', 'draft', 'published', 'archived'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select></div>
        <div><label className={label}>Category</label>
          <select className={input} value={params.category} onChange={(e) => setF({ category: e.target.value })}>
            <option value="">All</option>
            {PROC_CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select></div>
        <div><label className={label}>Difficulty</label>
          <select className={input} value={params.difficulty} onChange={(e) => setF({ difficulty: e.target.value })}>
            {PROC_DIFFICULTIES.map((d) => <option key={d} value={d}>{d || 'All'}</option>)}
          </select></div>
        <Btn onClick={() => setEditing({})}>+ New procedure</Btn>
      </div>

      {err && <div className="text-xs text-red-600">{err}</div>}
      {rows === null && <div className="text-xs text-muted py-6 text-center">Loading…</div>}
      {rows?.length === 0 && <div className="text-xs text-muted py-10 text-center">No procedures match</div>}
      {rows?.map((p) => (
        <div key={p.id} className="flex items-center gap-3 border border-line rounded-xl px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-ink truncate">{p.title}</div>
            <div className="text-xs text-muted truncate">{p.version} • {PROC_CATEGORIES.find((c) => c.v === p.category)?.l || p.category}{p.sku ? ` • ${p.sku}` : ''} • {p._count?.media ?? 0} files • {new Date(p.updatedAt).toLocaleDateString('en-AU')}</div>
          </div>
          <StatusBadge value={p.status} />
          <Btn small color="ghost" onClick={() => setDetailId(p.id)}>View</Btn>
          <Btn small color="ghost" onClick={() => openEdit(p)}>Edit</Btn>
          {canDelete && <Btn small color="red" onClick={() => setConfirmDel(p)}>Delete</Btn>}
        </div>
      ))}

      {rows?.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted pt-1">
          <span>{total} total</span>
          <div className="flex items-center gap-2">
            <Btn small color="ghost" disabled={params.page <= 1} onClick={() => setParams((p) => ({ ...p, page: p.page - 1 }))}>Prev</Btn>
            <span>Page {params.page} of {pages}</span>
            <Btn small color="ghost" disabled={params.page >= pages} onClick={() => setParams((p) => ({ ...p, page: p.page + 1 }))}>Next</Btn>
          </div>
        </div>
      )}

      {editing && <ProcedureModal doc={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast(editing.id ? 'Procedure updated' : 'Procedure created'); setParams((p) => ({ ...p })); }} token={token} />}
      {detailId && <ProcedureDetail id={detailId} onClose={() => setDetailId(null)} token={token} role={role} />}
      {confirmDel && <ConfirmDialog title="Delete procedure" message={`Delete "${confirmDel.title}"?`} onConfirm={doDelete} onClose={() => setConfirmDel(null)} />}
    </div>
  );
}

function ProcedureModal({ doc, onClose, onSaved, token }) {
  const toast = useToast();
  const [form, setForm] = useState({
    title: doc?.title || '',
    category: doc?.category || 'PAPER_FLOWER',
    sku: doc?.sku || '',
    status: doc?.status || 'draft',
    contentMarkdown: doc?.contentMarkdown || '',
    difficulty: doc?.metadata?.difficulty || '',
    estimatedTimeMinutes: doc?.metadata?.estimatedTimeMinutes || '',
    materialGsm: doc?.metadata?.materialGsm || '',
    foldingComplexity: doc?.metadata?.foldingComplexity || '',
    tools: (doc?.metadata?.tools || []).join(', '),
    notes: doc?.metadata?.notes || '',
    revisionNote: '',
  });
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm bg-surface2 text-ink focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-muted mb-1';

  async function save() {
    setBusy(true);
    try {
      const metadata = {};
      if (form.difficulty) metadata.difficulty = form.difficulty;
      if (form.estimatedTimeMinutes) metadata.estimatedTimeMinutes = Number(form.estimatedTimeMinutes);
      if (form.materialGsm) metadata.materialGsm = Number(form.materialGsm);
      if (form.foldingComplexity) metadata.foldingComplexity = form.foldingComplexity;
      const tools = form.tools.split(',').map((t) => t.trim()).filter(Boolean);
      if (tools.length) metadata.tools = tools;
      if (form.notes.trim()) metadata.notes = form.notes.trim();
      const body = {
        title: form.title.trim(),
        category: form.category,
        contentMarkdown: form.contentMarkdown,
        status: form.status,
        metadata,
        ...(form.sku.trim() ? { sku: form.sku.trim() } : {}),
      };
      if (doc?.id) {
        if (form.revisionNote.trim()) body.revisionNote = form.revisionNote.trim();
        await adminApi.procedures.update(doc.id, body, token);
      } else {
        await adminApi.procedures.create(body, token);
      }
      onSaved();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  async function importFromUrl() {
    const u = importUrl.trim();
    if (!u) return;
    setImporting(true);
    try {
      const r = await adminApi.procedures.importContent(u, token);
      if (form.contentMarkdown.trim()) {
        toast('Editor not empty — clear the content first, then import', 'error');
        return;
      }
      setForm((f) => ({ ...f, contentMarkdown: r.contentMarkdown, title: f.title.trim() ? f.title : (r.suggestedTitle || f.title) }));
      toast(r.suggestedTitle ? `Imported — title set to "${r.suggestedTitle}"` : 'Imported content');
      setImportUrl('');
    } catch (e) { toast(e.message, 'error'); }
    finally { setImporting(false); }
  }

  return <Modal title={doc ? `Edit — ${doc.title}` : 'New procedure'} onClose={onClose} wide>
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className={label}>Title</label><input className={input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div><label className={label}>SKU (optional, unique)</label><input className={input} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="e.g. SPEC-DIECUT-120GSM" /></div>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <div><label className={label}>Category</label>
          <select className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {PROC_CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select></div>
        <div><label className={label}>Status</label>
          <select className={input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {['draft', 'published', 'archived'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select></div>
        <div><label className={label}>Difficulty</label>
          <select className={input} value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
            {PROC_DIFFICULTIES.map((d) => <option key={d} value={d}>{d || '—'}</option>)}
          </select></div>
      </div>
      <div className="grid sm:grid-cols-4 gap-3">
        <div><label className={label}>Est. minutes</label><input type="number" min="1" className={input} value={form.estimatedTimeMinutes} onChange={(e) => setForm({ ...form, estimatedTimeMinutes: e.target.value })} /></div>
        <div><label className={label}>Material gsm</label><input type="number" min="1" className={input} value={form.materialGsm} onChange={(e) => setForm({ ...form, materialGsm: e.target.value })} /></div>
        <div><label className={label}>Folding complexity</label>
          <select className={input} value={form.foldingComplexity} onChange={(e) => setForm({ ...form, foldingComplexity: e.target.value })}>
            {PROC_FOLDING.map((f) => <option key={f} value={f}>{f || '—'}</option>)}
          </select></div>
        <div><label className={label}>Tools (comma-separated)</label><input className={input} value={form.tools} onChange={(e) => setForm({ ...form, tools: e.target.value })} /></div>
      </div>
      <div><label className={label}>Notes (metadata)</label><input className={input} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      <div className="flex items-end gap-2">
        <div className="flex-1"><label className={label}>Import content from URL (.md / .txt)</label>
          <input className={input} value={importUrl} onChange={(e) => setImportUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') importFromUrl(); }}
            placeholder="https://…/assembly-guide.md" /></div>
        <Btn small color="ghost" onClick={importFromUrl} disabled={importing || !importUrl.trim()}>{importing ? 'Fetching…' : 'Import'}</Btn>
      </div>
      <div className="flex items-center justify-between">
        <label className={label + ' mb-0'}>Content (markdown: ## heading, **bold**, 1. steps)</label>
        <Btn small color="ghost" onClick={() => setPreview((v) => !v)}>{preview ? 'Edit' : 'Preview'}</Btn>
      </div>
      {preview
        ? <div className="prose markdown-body border border-line rounded-xl p-4 max-h-[40vh] overflow-y-auto" dangerouslySetInnerHTML={{ __html: renderMarkdown(form.contentMarkdown) }} />
        : <textarea rows={14} className={input + ' font-mono'} value={form.contentMarkdown} onChange={(e) => setForm({ ...form, contentMarkdown: e.target.value })} />}
      {doc?.id && <div><label className={label}>Revision note (optional — bumps to {bumpVersionLabel(doc.version)})</label>
        <input className={input} value={form.revisionNote} onChange={(e) => setForm({ ...form, revisionNote: e.target.value })} placeholder="What changed?" /></div>}
    </div>
    <div className="mt-5 flex justify-end gap-2">
      <Btn color="ghost" onClick={onClose}>Cancel</Btn>
      <Btn onClick={save} disabled={busy || !form.title.trim() || !form.contentMarkdown.trim()}>{busy ? 'Saving…' : doc ? 'Save changes' : 'Create procedure'}</Btn>
    </div>
  </Modal>;
}

function bumpVersionLabel(v) {
  const m = /^v(\d+)\.(\d+)$/.exec(String(v || ''));
  return m ? `v${m[1]}.${Number(m[2]) + 1}` : 'v1.1';
}

function ProcedureDetail({ id, onClose, token, role }) {
  const toast = useToast();
  const [doc, setDoc] = useState(null);
  const [revs, setRevs] = useState(null);
  const [revView, setRevView] = useState(null);
  const [err, setErr] = useState('');
  const [urlModal, setUrlModal] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const fileRef = useRef(null);
  const canEdit = ['staff', 'maker', 'admin', 'developer'].includes(role);

  const refresh = () => adminApi.procedures.get(id, token).then(setDoc).catch((e) => setErr(e.message));
  useEffect(() => { refresh(); adminApi.procedures.revisions(id, token).then(setRevs).catch(() => setRevs([])); }, [id, token]);

  async function onPick(e) {
    // FileList is live — snapshot before clearing the input, or it empties.
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length) return;
    try {
      await adminApi.procedures.uploadMedia(id, picked, token);
      toast(`Uploaded ${picked.length} file${picked.length > 1 ? 's' : ''}`);
      refresh();
    } catch (e2) { toast(e2.message, 'error'); }
  }
  async function move(m, dir) {
    try { await adminApi.procedures.reorderMedia(id, m.id, Math.max(0, m.displayOrder + dir), token); refresh(); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function removeMedia(m) {
    try { await adminApi.procedures.deleteMedia(id, m.id, token); toast('File removed'); refresh(); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function attachFromUrl() {
    const u = mediaUrl.trim();
    if (!u) return;
    setUrlBusy(true);
    try {
      await adminApi.procedures.addMediaUrl(id, u, token);
      toast('Attached from URL');
      setMediaUrl('');
      setUrlModal(false);
      refresh();
    } catch (e) { toast(e.message, 'error'); }
    finally { setUrlBusy(false); }
  }

  if (err) return <Modal title="Procedure" onClose={onClose}><div className="text-sm text-red-600">{err}</div></Modal>;
  if (!doc) return <Modal title="Procedure" onClose={onClose}><div className="text-sm text-muted">Loading…</div></Modal>;

  const media = [...(doc.media || [])].sort((a, b) => a.displayOrder - b.displayOrder);
  const shown = revView ? revView : null;
  return <>
    <Modal title={doc.title} onClose={onClose} wide>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <StatusBadge value={doc.status} />
        <span>{doc.version}</span>
        <span>•</span>
        <span>{PROC_CATEGORIES.find((c) => c.v === doc.category)?.l || doc.category}</span>
        {doc.sku && <><span>•</span><span className="font-mono">{doc.sku}</span></>}
        <span>•</span><span>by {doc.author?.name || 'unknown'}</span>
      </div>

      <div className="border border-line rounded-xl p-4 max-h-[36vh] overflow-y-auto prose markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(shown ? shown.contentMarkdown : doc.contentMarkdown) }} />

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-muted">Media ({media.length})</div>
          {canEdit && <>
            <input ref={fileRef} type="file" multiple className="hidden" accept="image/*,.svg,.pdf,.zip,.stl,video/mp4,video/quicktime" onChange={onPick} />
            <div className="flex gap-2">
              <Btn small onClick={() => fileRef.current?.click()}>Upload files</Btn>
              <Btn small color="ghost" onClick={() => setUrlModal(true)}>Add from URL</Btn>
            </div>
          </>}
        </div>
        {media.length === 0 && <div className="text-xs text-muted">No files</div>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {media.map((m, i) => (
            <div key={m.id} className="border border-line rounded-lg p-2 space-y-1">
              {m.mediaType === 'IMAGE'
                ? <img src={m.url} alt="" className="w-full h-20 object-cover rounded bg-surface3" />
                : <a href={m.url} target="_blank" rel="noreferrer" className="flex h-20 items-center justify-center text-2xl rounded bg-surface3" title={m.url}>📄</a>}
              <div className="text-[10px] text-muted truncate">{m.mediaType}</div>
              {canEdit && (
                <div className="flex gap-1">
                  <Btn small color="ghost" disabled={i === 0} onClick={() => move(m, -1)}>↑</Btn>
                  <Btn small color="ghost" disabled={i === media.length - 1} onClick={() => move(m, 1)}>↓</Btn>
                  <Btn small color="red" onClick={() => removeMedia(m)}>✕</Btn>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-muted mb-2">Revisions ({revs ? revs.length : '…'})</div>
        {revs?.length === 0 && <div className="text-xs text-muted">No revisions yet</div>}
        <div className="space-y-1 max-h-[20vh] overflow-y-auto">
          {revs?.map((r) => (
            <div key={r.id} className={`flex items-center gap-3 border rounded-lg px-3 py-1.5 text-xs ${shown?.id === r.id ? 'border-royal-500 bg-royal-100' : 'border-line'}`}>
              <span className="font-bold">{r.version}</span>
              <span className="flex-1 truncate text-muted">{r.note || '—'}</span>
              <span className="text-muted">{new Date(r.createdAt).toLocaleDateString('en-AU')}</span>
              <Btn small color="ghost" onClick={() => setRevView(shown?.id === r.id ? null : r)}>{shown?.id === r.id ? 'Current' : 'View'}</Btn>
            </div>
          ))}
        </div>
      </div>
    </div>
    </Modal>

    {urlModal && <Modal title="Add media from URL" onClose={() => setUrlModal(false)}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-muted mb-1">Public file URL (image, SVG, PDF, ZIP, STL, MP4)</label>
          <input className="w-full border border-line-strong rounded-xl px-3 py-2 text-sm bg-surface2 text-ink focus:outline-none focus:ring-2 focus:ring-royal-500"
            value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') attachFromUrl(); }}
            placeholder="https://…/diagram.svg" autoFocus />
        </div>
        <div className="text-[11px] text-muted">Fetched server-side and stored with the procedure. Private/network addresses are blocked.</div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Btn color="ghost" onClick={() => setUrlModal(false)}>Cancel</Btn>
        <Btn onClick={attachFromUrl} disabled={urlBusy || !mediaUrl.trim()}>{urlBusy ? 'Fetching…' : 'Fetch & attach'}</Btn>
      </div>
    </Modal>}
  </>;
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
              <div className="text-xs text-muted mt-1">Opened {new Date(s.openedAt).toLocaleString()} • Float ${Number(s.openingCash).toFixed(2)} • {s.payments?.length || 0} payments</div>
            </div>
            <Btn onClick={() => setClosing(true)}>Close till</Btn>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-muted">No open till — open one to record POS sales.</div>
            <div className="flex items-end gap-3"><div><label className="block text-xs font-semibold text-muted mb-1">Opening float ($)</label><input type="number" className="w-32 border border-line-strong rounded-xl px-3 py-2 text-sm" value={opening} onChange={(e) => setOpening(e.target.value)} /></div><Btn onClick={open} disabled={busy}>Open till</Btn></div>
          </div>
        )}
      </Card>
      {sales.length > 0 && (
        <Card title={`POS sales — ${sales.length} • $${totalSales.toFixed(2)}`}>
          <div className="space-y-1">{sales.slice(0, 20).map((o) => (
            <div key={o.id} className="flex justify-between text-xs border-b border-line py-1.5"><span className="font-medium text-ink">{o.orderNumber} <span className="text-muted">• {o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-AU') : ''}</span></span><span className="font-bold text-royal-700">${Number(o.total).toFixed(2)}</span></div>
          ))}</div>
        </Card>
      )}
      {sessions.length > 0 && (
        <Card title={`Till sessions — ${sessions.length}`}>
          <div className="space-y-1">{sessions.slice(0, 15).map((se) => (
            <div key={se.id} className="flex justify-between text-xs border-b border-line py-1.5"><span>{se.location} • {new Date(se.openedAt).toLocaleString()}</span><span className="flex items-center gap-2"><StatusBadge value={se.status} />{se.variance !== null && se.variance !== undefined && <span className={Number(se.variance) < 0 ? 'text-red-600' : 'text-emerald-600'}>var ${Number(se.variance).toFixed(2)}</span>}</span></div>
          ))}</div>
        </Card>
      )}
      {closing && <Modal title="Close till" onClose={() => setClosing(false)}>
        <div><label className="block text-xs font-semibold text-muted mb-1">Closing cash ($)</label><input type="number" className="w-full border border-line-strong rounded-xl px-3 py-2 text-sm" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} /></div>
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
      <div className="text-xs text-muted">{customers.length} customers</div>
      <div className="space-y-1.5">
        {customers.map((c) => (
          <div key={c.id} className="flex items-center gap-3 border border-line rounded-xl px-4 py-2.5 text-sm flex-wrap">
            <span className="font-bold text-ink flex-1 min-w-[160px]">{c.name || '—'}</span>
            <span className="text-xs text-muted truncate">{c.email}</span>
            <span className="text-xs text-muted">{c.orders} orders • <span className="font-semibold text-royal-700">${Number(c.spend).toFixed(2)}</span></span>
            <span className="text-xs font-semibold text-ink">{c.points} pts <span className="text-muted">({c.tier})</span></span>
            <Btn small color="ghost" onClick={() => openDetail(c)}>View</Btn>
            <Btn small color="ghost" onClick={() => adjustLoyalty(c, -50)} disabled={busyLoyalty === c.id}>−50</Btn>
            <Btn small color="ghost" onClick={() => adjustLoyalty(c, 50)} disabled={busyLoyalty === c.id}>+50</Btn>
          </div>
        ))}
        {customers.length === 0 && <div className="text-xs text-muted py-10 text-center">No customers yet</div>}
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
        <div className="text-xs text-muted">{customer.email} • {customer.role} • joined {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('en-AU') : ''}</div>
        <div className="flex items-end gap-3 border border-line rounded-xl p-3">
          <div><label className="block text-xs font-semibold text-muted mb-1">Loyalty points</label><input type="number" className="w-28 border border-line-strong rounded-xl px-3 py-2 text-sm" value={points} onChange={(e) => setPoints(e.target.value)} /></div>
          <Btn onClick={savePoints} disabled={busy}>{busy ? 'Saving…' : 'Set points'}</Btn>
        </div>
        <div>
          <div className="font-bold text-ink mb-1">Orders ({orders.length})</div>
          <div className="space-y-1 max-h-40 overflow-auto">{orders.map((o) => <div key={o.id} className="flex justify-between text-xs border-b border-line py-1"><span>{o.orderNumber} <span className="text-muted">• {new Date(o.createdAt).toLocaleDateString('en-AU')}</span></span><span><StatusBadge value={o.status} /> <span className="font-bold text-royal-700">${Number(o.total).toFixed(2)}</span></span></div>)}{orders.length === 0 && <div className="text-xs text-muted">No orders</div>}</div>
        </div>
        <div>
          <div className="font-bold text-ink mb-1">Bookings ({bookings.length})</div>
          <div className="space-y-1 max-h-32 overflow-auto">{bookings.map((b) => <div key={b.id} className="flex justify-between text-xs border-b border-line py-1"><span>{b.session?.workshop?.title || 'Workshop'} • {b.quantity} seat(s)</span><StatusBadge value={b.status} /></div>)}{bookings.length === 0 && <div className="text-xs text-muted">No bookings</div>}</div>
        </div>
        <div>
          <div className="font-bold text-ink mb-1">Custom art orders ({customOrders.length})</div>
          <div className="space-y-1 max-h-32 overflow-auto">{customOrders.map((co) => <div key={co.id} className="flex justify-between text-xs border-b border-line py-1"><span>{co.orderNumber}</span><span className="text-muted">{co.state}</span></div>)}{customOrders.length === 0 && <div className="text-xs text-muted">None</div>}</div>
        </div>
        {txs.length > 0 && (
          <div>
            <div className="font-bold text-ink mb-1">Loyalty history</div>
            <div className="space-y-1 max-h-32 overflow-auto">{txs.map((t) => <div key={t.id} className="flex justify-between text-xs border-b border-line py-1"><span className="text-muted">{t.reason}</span><span className={t.pointsDelta > 0 ? 'text-emerald-600' : 'text-red-600'}>{(t.pointsDelta > 0 ? '+' : '') + t.pointsDelta}</span></div>)}</div>
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
      <div className="flex justify-between items-center"><div className="text-xs text-muted">{zones.length} shipping zones</div><Btn onClick={() => setZoneEditor({})}>+ New zone</Btn></div>
      {zones.map((z) => (
        <div key={z.id} className="border border-line rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0"><div className="font-bold text-sm text-ink">{z.name}</div><div className="text-xs text-muted">{z.postcodes ? (Array.isArray(z.postcodes) ? z.postcodes.join(', ') : z.postcodes) : 'All postcodes'} </div></div>
            <StatusBadge value={z.isActive ? 'published' : 'archived'} />
            <Btn small color="ghost" onClick={() => toggleZone(z, !z.isActive)}>{z.isActive ? 'Disable' : 'Enable'}</Btn>
            <Btn small color="ghost" onClick={() => setRateFor(z)}>+ Rate</Btn>
            <Btn small color="red" onClick={() => setConfirmDel({ type: 'zone', id: z.id })}>Delete</Btn>
          </div>
          <div className="mt-2 space-y-1">
            {(z.rates || []).map((r) => (
              <div key={r.id} className="flex items-center gap-3 text-xs border-b border-line py-1">
                <span className="font-medium text-ink flex-1">{r.name}</span>
                <span className="text-muted">${Number(r.price).toFixed(2)}{r.freeOver ? ` • free over $${Number(r.freeOver).toFixed(2)}` : ''}{r.maxWeightGrams ? ` • ≤${r.maxWeightGrams}g` : ''}</span>
                <Btn small color="ghost" onClick={() => setRateFor(z, r)}>Edit</Btn>
                <Btn small color="red" onClick={() => setConfirmDel({ type: 'rate', id: r.id })}>Del</Btn>
              </div>
            ))}
            {(z.rates || []).length === 0 && <div className="text-xs text-muted">No rates — add one</div>}
          </div>
        </div>
      ))}
      {zones.length === 0 && <div className="text-xs text-muted py-10 text-center">No zones — add one to configure delivery pricing</div>}
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
  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-muted mb-1';
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
  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-muted mb-1';
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

function Suppliers({ data, reload, token }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // all | active | inactive
  const [editing, setEditing] = useState(null); // null | {} | supplier
  const [viewing, setViewing] = useState(null); // supplier id for detail modal
  const [confirmDel, setConfirmDel] = useState(null);
  const [deactivateFor, setDeactivateFor] = useState(null);
  const suppliers = Array.isArray(data.suppliers) ? data.suppliers : [];
  const mq = q.trim().toLowerCase();
  const filtered = suppliers.filter((s) => {
    if (activeFilter === 'active' && !s.isActive) return false;
    if (activeFilter === 'inactive' && s.isActive) return false;
    if (!mq) return true;
    return [s.name, s.contact, s.email, s.phone, s.website, s.address].some((v) => String(v || '').toLowerCase().includes(mq));
  });
  const totals = suppliers.reduce((acc, s) => ({
    spend: acc.spend + Number(s.stats?.totalSpend || 0),
    active: acc.active + (s.isActive ? 1 : 0),
  }), { spend: 0, active: 0 });
  async function doDelete() {
    try { await adminApi.suppliers.remove(confirmDel.id, token); toast('Supplier deleted'); setConfirmDel(null); reload(); }
    catch (e) {
      setConfirmDel(null);
      if (e.code === 'conflict') setDeactivateFor(confirmDel);
      else toast(e.message, 'error');
    }
  }
  async function doDeactivate() {
    try { await adminApi.suppliers.update(deactivateFor.id, { isActive: false }, token); toast(`${deactivateFor.name} deactivated`); setDeactivateFor(null); reload(); }
    catch (e) { toast(e.message, 'error'); setDeactivateFor(null); }
  }
  function exportCsv() {
    const cols = ['name', 'contact', 'email', 'phone', 'website', 'address', 'active', 'materials', 'purchaseOrders', 'totalSpend', 'lastOrder', 'notes'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = suppliers.map((s) => [
      s.name, s.contact, s.email, s.phone, s.website, s.address, s.isActive ? 'yes' : 'no',
      s._count?.rawMaterials ?? 0, s._count?.purchaseOrders ?? 0,
      Number(s.stats?.totalSpend || 0).toFixed(2),
      s.stats?.lastPoAt ? new Date(s.stats.lastPoAt).toISOString().slice(0, 10) : '',
      s.notes,
    ].map(esc).join(','));
    const blob = new Blob([[cols.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `suppliers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div className="text-xs text-muted">{suppliers.length} suppliers • {totals.active} active • total spend <span className="font-bold text-royal-700">${totals.spend.toFixed(2)}</span></div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex rounded-xl border border-line-strong overflow-hidden text-xs font-semibold">
            {[['all', 'All'], ['active', 'Active'], ['inactive', 'Inactive']].map(([k, label]) => (
              <button key={k} onClick={() => setActiveFilter(k)} className={`px-2.5 py-1.5 ${activeFilter === k ? 'bg-royal-600 text-white' : 'bg-surface2 text-muted hover:bg-surface3'}`}>{label}</button>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search suppliers…" className="w-40 sm:w-52 border border-line-strong rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-royal-500" />
          <Btn small color="ghost" onClick={exportCsv}>⬇ CSV</Btn>
          <Btn onClick={() => setEditing({})}>+ New supplier</Btn>
        </div>
      </div>
      {filtered.map((s) => (
        <div key={s.id} className={`border border-line rounded-xl p-4 ${s.isActive ? '' : 'opacity-60'}`}>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-ink cursor-pointer hover:text-royal-700 hover:underline" title="View supplier details" onClick={() => setViewing(s.id)}>{s.name}{!s.isActive && <span className="ml-2 text-[10px] uppercase text-muted">inactive</span>}</div>
              <div className="text-xs text-muted">
                {[s.contact, s.email, s.phone, s.website, s.address].filter(Boolean).join(' • ') || 'No contact details'}
              </div>
              {s.notes && <div className="text-xs text-muted mt-1 whitespace-pre-wrap line-clamp-2">{s.notes}</div>}
            </div>
            <div className="text-xs text-muted text-right shrink-0" title="Materials / POs / total spend">
              <div>{s._count?.rawMaterials ?? 0} materials</div>
              <div>{s._count?.purchaseOrders ?? 0} POs</div>
              <div className="font-bold text-royal-700">${Number(s.stats?.totalSpend || 0).toFixed(2)}</div>
              {s.stats?.lastPoAt && <div className="text-[10px]">last {new Date(s.stats.lastPoAt).toLocaleDateString('en-AU')}</div>}
            </div>
            <div className="flex gap-1.5 shrink-0">
              <Btn small color="ghost" onClick={() => setViewing(s.id)}>View</Btn>
              <Btn small color="ghost" onClick={() => setEditing(s)}>Edit</Btn>
              <Btn small color="red" onClick={() => setConfirmDel(s)}>Delete</Btn>
            </div>
          </div>
        </div>
      ))}
      {filtered.length === 0 && <div className="text-xs text-muted py-10 text-center">{mq || activeFilter !== 'all' ? 'No suppliers match your filters' : 'No suppliers yet — add the shops you buy cardstock and wire from'}</div>}
      {viewing && <SupplierDetail supplierId={viewing} token={token} onClose={() => setViewing(null)} onChanged={reload} onEdit={(s) => { setViewing(null); setEditing(s); }} />}
      {editing && <SupplierModal supplier={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { const wasEdit = !!editing.id; setEditing(null); toast(wasEdit ? 'Supplier updated' : 'Supplier created'); reload(); }} token={token} />}
      {confirmDel && <ConfirmDialog title="Delete supplier" message={`Delete ${confirmDel.name}?`} onConfirm={doDelete} onClose={() => setConfirmDel(null)} />}
      {deactivateFor && <ConfirmDialog title="Supplier is in use" confirmLabel="Deactivate instead" message={`${deactivateFor.name} has linked materials or purchase orders. Deactivate it to hide it from pickers without breaking those links?`} onConfirm={doDeactivate} onClose={() => setDeactivateFor(null)} />}
    </div>
  );
}
function SupplierModal({ supplier, onClose, onSaved, token }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    name: supplier?.name || '', contact: supplier?.contact || '', email: supplier?.email || '',
    phone: supplier?.phone || '', website: supplier?.website || '', address: supplier?.address || '',
    notes: supplier?.notes || '', isActive: supplier ? !!supplier.isActive : true,
  }));
  const [busy, setBusy] = useState(false);
  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-muted mb-1';
  async function save() {
    if (!form.name.trim()) return toast('Name is required', 'error');
    setBusy(true);
    try {
      const body = { ...form, name: form.name.trim() };
      if (supplier) await adminApi.suppliers.update(supplier.id, body, token);
      else await adminApi.suppliers.create(body, token);
      onSaved();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return <Modal title={supplier ? 'Edit supplier' : 'New supplier'} onClose={onClose}>
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label}>Name *</label><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Canson AU" /></div>
        <div><label className={label}>Contact person</label><input className={input} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></div>
        <div><label className={label}>Email</label><input type="email" className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div><label className={label}>Phone</label><input className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div><label className={label}>Website</label><input className={input} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://…" /></div>
        <div><label className={label}>Address</label><input className={input} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
      </div>
      <div><label className={label}>Notes</label><textarea rows={3} className={input} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Delivery times, account number, min order…" /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active (show in pickers)</label>
    </div>
    <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : supplier ? 'Save changes' : 'Create'}</Btn></div>
  </Modal>;
}

function Users({ data, reload, token, user }) {
  const toast = useToast();
  const [busyId, setBusyId] = useState('');
  const [editing, setEditing] = useState(null); // null | {} | user (create vs edit)
  const [confirmDel, setConfirmDel] = useState(null);
  const [resetting, setResetting] = useState(null);
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
  async function doDelete() {
    try { await adminApi.users.remove(confirmDel.id, token); toast(`${confirmDel.name} deleted`); reload(); }
    catch (e) { toast(e.message, 'error'); }
  }
  return (
    <div>
      <div className="flex justify-between items-center mb-3"><div className="text-xs text-muted">{users.length} accounts — change a role to update access</div><Btn onClick={() => setEditing({})}>+ New user</Btn></div>
      <div className="grid sm:grid-cols-2 gap-2">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-2 border border-line rounded-xl px-3 py-2 text-sm">
            <span className="font-medium text-ink flex-1 min-w-0 truncate">{u.name}</span>
            <span className="text-xs text-muted truncate max-w-[140px]" title={u.email}>{u.email}</span>
            <select value={u.role} disabled={busyId === u.id} onChange={(e) => setRole(u, e.target.value)}
              className="border border-line-strong rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-royal-500">
              <option value="customer">customer</option><option value="staff">staff</option><option value="maker">maker</option><option value="admin">admin</option><option value="developer">developer</option>
            </select>
            <Btn small color="ghost" onClick={() => setEditing(u)}>Edit</Btn>
            <Btn small color="ghost" title="Reset password" onClick={() => setResetting(u)}>🔑</Btn>
            {u.id !== user?.id && <Btn small color="red" onClick={() => setConfirmDel(u)}>Delete</Btn>}
          </div>
        ))}
        {users.length === 0 && <div className="text-xs text-muted py-8 text-center">No users</div>}
      </div>
      {editing && <UserModal user={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { const wasEdit = !!editing.id; setEditing(null); toast(wasEdit ? 'User updated' : 'User created'); reload(); }} token={token} />}
      {resetting && <ResetPasswordModal target={resetting} onClose={() => setResetting(null)} onSaved={() => { setResetting(null); reload(); }} token={token} />}
      {confirmDel && <ConfirmDialog title="Delete user" message={`Delete ${confirmDel.name} (${confirmDel.email})? Orders and bookings keep their history by email. Accounts with POS sessions cannot be deleted.`} confirmLabel="Delete" onConfirm={doDelete} onClose={() => setConfirmDel(null)} />}
    </div>
  );
}
function ResetPasswordModal({ target, onClose, onSaved, token }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  async function save() {
    if (password.length < 6) return toast('Password must be at least 6 characters', 'error');
    setBusy(true);
    try {
      await adminApi.users.resetPassword(target.id, password, token);
      toast(`Password reset for ${target.name}`); onSaved();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return <Modal title={`Reset password — ${target.name}`} onClose={onClose}>
    <div>
      <label className="block text-xs font-semibold text-muted mb-1">New password (min 6 chars)</label>
      <input type="password" className={input} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
      <div className="text-xs text-muted mt-2">{target.email} will need the new password next time they sign in.</div>
    </div>
    <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Reset password'}</Btn></div>
  </Modal>;
}
function UserModal({ user, onClose, onSaved, token }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({ name: user?.name || '', email: user?.email || '', phone: user?.phone || '', password: '', role: user?.role || 'customer' }));
  const [busy, setBusy] = useState(false);
  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-muted mb-1';
  async function save() {
    if (!form.name.trim() || !form.email.trim()) return toast('Name and email are required', 'error');
    if (!user && form.password.length < 6) return toast('Password must be at least 6 characters', 'error');
    setBusy(true);
    try {
      if (user) {
        await adminApi.users.update(user.id, { name: form.name.trim(), email: form.email.trim(), phone: form.phone || null }, token);
      } else {
        await adminApi.users.create({ name: form.name.trim(), email: form.email.trim(), password: form.password, role: form.role, phone: form.phone || null }, token);
      }
      onSaved();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return <Modal title={user ? `Edit ${user.name}` : 'New user'} onClose={onClose}>
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label}>Name *</label><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label className={label}>Email *</label><input type="email" className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div><label className={label}>Phone</label><input className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        {!user && (
          <div><label className={label}>Role</label>
            <select className={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="customer">customer</option><option value="staff">staff</option><option value="maker">maker</option><option value="admin">admin</option>
            </select>
          </div>
        )}
      </div>
      {!user && <div><label className={label}>Password * (min 6 chars)</label><input type="password" className={input} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></div>}
      {user && <div className="text-xs text-muted">Role changes use the dropdown in the list. Use 🔑 in the list to reset this account's password.</div>}
    </div>
    <div className="mt-5 flex justify-end gap-2"><Btn color="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={busy}>{busy ? 'Saving…' : user ? 'Save changes' : 'Create user'}</Btn></div>
  </Modal>;
}

function Reports({ data }) {
  const board = Array.isArray(data.leaderboard) ? data.leaderboard : [];
  return <div><div className="text-xs text-muted mb-3">Loyalty leaderboard (top 10)</div>
    <div className="space-y-1.5">{board.map((b, i) => (
      <div key={i} className="flex items-center gap-3 border border-line rounded-xl px-4 py-2.5 text-sm">
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${i < 3 ? 'bg-royal-600 text-white' : 'bg-surface3 text-muted'}`}>{i + 1}</span>
        <span className="font-medium text-ink flex-1 truncate">{b.email}</span>
        <span className="text-xs text-muted">{b.tier}</span><span className="font-bold text-royal-700">{b.points} pts</span>
      </div>))}
    {board.length === 0 && <div className="text-xs text-muted py-8 text-center">No points yet</div>}
    </div></div>;
}

const COLOR_PRESETS = [
  { name: 'Bloom Rose', theme_primary: '#B85C5C', theme_primary_dark: '#4A2C2A', theme_bg: '#FFF7F0', theme_secondary: '#F4C7C3' },
  { name: 'Royal', theme_primary: '#7C3AED', theme_primary_dark: '#4C1D95', theme_bg: '#F7F5FF', theme_secondary: '#DDD6FE' },
  { name: 'Sage', theme_primary: '#6B8F71', theme_primary_dark: '#33502F', theme_bg: '#F4F7F2', theme_secondary: '#D8E6D3' },
  { name: 'Ocean', theme_primary: '#2C7A8C', theme_primary_dark: '#134E5A', theme_bg: '#F0F8FA', theme_secondary: '#CCE7EC' },
];

function Settings({ reload, token }) {
  const toast = useToast();
  const [meta, setMeta] = useState(null);
  const [values, setValues] = useState(null);
  const [saved, setSaved] = useState(null);
  const [section, setSection] = useState('business');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [testTo, setTestTo] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-muted mb-1';

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [m, all] = await Promise.all([adminApi.settings.schema(token), adminApi.settings.all(token)]);
        if (!live) return;
        setMeta(m); setValues(all); setSaved(all); setSection(m?.sections?.[0]?.id || 'business');
      } catch (e) { toast(e.message, 'error'); }
    })();
    return () => { live = false; };
  }, [token]);

  const setV = (k, v) => setValues((s) => ({ ...s, [k]: v }));
  // Canonical compare so '010' vs '10' on a number field isn't a false edit.
  const norm = (f, v) => {
    const raw = v ?? f.default ?? '';
    if (f.type === 'number' && raw !== '' && Number.isFinite(Number(raw))) return String(Number(raw));
    return String(raw ?? '');
  };
  const isDirty = (f) => Boolean(values && saved && norm(f, values[f.key]) !== norm(f, saved[f.key]));
  const dirtyFields = meta && values ? meta.settings.filter(isDirty) : [];
  const q = query.trim().toLowerCase();
  const fields = meta && values
    ? (q
        ? meta.settings.filter((f) =>
            f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q) ||
            String(f.description || '').toLowerCase().includes(q) ||
            f.section.toLowerCase().includes(q) ||
            String(values[f.key] ?? '').toLowerCase().includes(q))
        : meta.settings.filter((f) => f.section === section))
    : [];
  const sectionLabel = q
    ? `Search — ${fields.length} match${fields.length === 1 ? '' : 'es'}`
    : (meta?.sections.find((s) => s.id === section)?.label || section);
  const dirtyInSection = (id) => Boolean(meta && values && meta.settings.some((f) => f.section === id && isDirty(f)));

  // Don't let a refresh/navigation silently drop edits.
  useEffect(() => {
    if (!dirtyFields.length) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirtyFields.length]);

  // Refresh the storefront (theme vars + public settings cache) after any save.
  function refreshStorefront() {
    applyTheme({ force: true }).catch(() => {});
    invalidatePublicSettings().catch(() => {});
    reload();
  }

  async function persist(payload, scopeLabel) {
    setBusy(true); setFieldErrors({});
    try {
      await adminApi.settings.save(payload, token);
      // Round-trip verify — re-read from the DB and confirm each value stuck.
      const fresh = await adminApi.settings.all(token);
      const mismatched = Object.keys(payload).filter((k) => {
        const f = meta.settings.find((x) => x.key === k);
        return f ? norm(f, fresh[k]) !== norm(f, payload[k]) : String(fresh[k]) !== String(payload[k]);
      });
      setValues(fresh); setSaved(fresh);
      if (mismatched.length) toast(`⚠ Saved, but ${mismatched.length} value(s) did not stick: ${mismatched.join(', ')}`, 'error');
      else toast(`✓ ${Object.keys(payload).length} ${scopeLabel} saved & verified`, 'success');
      refreshStorefront();
    } catch (e) {
      if (e.details && typeof e.details === 'object') setFieldErrors(extractFieldErrors(e.details));
      toast(e.message, 'error');
    } finally { setBusy(false); }
  }

  function saveScope(scopeFields, scopeLabel) {
    const payload = {};
    for (const f of scopeFields) if (isDirty(f)) payload[f.key] = values[f.key] ?? f.default ?? '';
    if (!Object.keys(payload).length) { toast('No changes to save', 'info'); return; }
    persist(payload, scopeLabel);
  }

  // True reset: drop the stored rows so schema defaults apply again.
  async function resetScope(scopeFields, scopeLabel) {
    if (!window.confirm(`Reset ${scopeFields.length} ${scopeLabel} to their default values?`)) return;
    setBusy(true); setFieldErrors({});
    try {
      await adminApi.settings.reset(scopeFields.map((f) => f.key), token);
      const fresh = await adminApi.settings.all(token);
      setValues(fresh); setSaved(fresh);
      toast(`↺ ${scopeLabel} reset to defaults`, 'success');
      refreshStorefront();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  async function sendTest() {
    const to = testTo.trim();
    if (!to) return;
    setTestBusy(true); setTestResult(null);
    try {
      const r = await adminApi.settings.testEmail(to, token);
      setTestResult(r);
      toast(r.message, r.ok || r.skipped ? 'success' : 'error');
    } catch (e) { setTestResult({ ok: false, message: e.message }); toast(e.message, 'error'); }
    finally { setTestBusy(false); }
  }

  function renderField(f) {
    const v = values[f.key] ?? f.default ?? '';
    const err = fieldErrors[f.key];
    const hint = err || f.description;
    const cls = err ? `${input} border-red-400` : input;
    const dirty = isDirty(f);
    const wrap = (children) => (
      <div key={f.key}>
        <label className={label}>
          {f.label}{f.unit ? <span className="text-muted font-normal"> ({f.unit})</span> : null}
          {dirty && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-600">modified</span>}
        </label>
        {children}
        <div className="flex items-start gap-2 mt-1">
          <div className={`text-[11px] flex-1 ${err ? 'text-red-500' : 'text-muted'}`}>{hint || ''}</div>
          {dirty && (
            <button type="button" onClick={() => setV(f.key, f.default ?? '')} title="Revert this field to its default"
              className="text-[11px] font-semibold text-royal-700 hover:underline shrink-0">↺ default</button>
          )}
        </div>
      </div>
    );
    switch (f.type) {
      case 'textarea':
        return wrap(<textarea className={cls} rows={3} value={v} maxLength={f.max} placeholder={f.placeholder} onChange={(e) => setV(f.key, e.target.value)} />);
      case 'toggle': {
        const on = v === '1';
        return wrap(
          <button type="button" role="switch" aria-checked={on} onClick={() => setV(f.key, on ? '0' : '1')}
            className={`inline-flex items-center h-7 w-12 rounded-full p-0.5 transition-colors ${on ? 'bg-royal-600 justify-end' : 'bg-gray-300 justify-start'}`}>
            <span className="h-6 w-6 rounded-full bg-surface2 shadow border border-line block" />
          </button>
        );
      }
      case 'select':
        return wrap(<select className={cls} value={v} onChange={(e) => setV(f.key, e.target.value)}>{(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>);
      case 'color': {
        const hex = /^#[0-9a-fA-F]{6}$/.test(v) ? v : (/^#[0-9a-fA-F]{6}$/.test(f.default || '') ? f.default : '#B85C5C');
        return wrap(
          <div className="flex items-center gap-2">
            <input type="color" value={hex} onChange={(e) => setV(f.key, e.target.value)} className="w-10 h-9 rounded-lg border border-line-strong cursor-pointer" />
            <input className={cls} value={v} onChange={(e) => setV(f.key, e.target.value)} placeholder={f.default || '#RRGGBB'} />
          </div>
        );
      }
      case 'number':
        return wrap(<input type="number" className={cls} value={v} min={f.min} max={f.max} step="any" onChange={(e) => setV(f.key, e.target.value)} />);
      case 'csv': {
        const selected = new Set(String(v || '').split(',').map((s) => s.trim()).filter(Boolean));
        return wrap(
          <div className="flex flex-wrap gap-2">
            {(f.options || []).map((o) => {
              const on = selected.has(o.value);
              return (
                <button key={o.value} type="button"
                  onClick={() => { const next = new Set(selected); if (on) next.delete(o.value); else next.add(o.value); setV(f.key, Array.from(next).join(',')); }}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${on ? 'bg-royal-600 text-white border-royal-600' : 'bg-surface2 text-muted border-line-strong hover:bg-surface3'}`}>
                  {o.label}
                </button>
              );
            })}
          </div>
        );
      }
      default:
        return wrap(<input type={f.type === 'email' ? 'email' : f.type === 'url' ? 'url' : 'text'} className={cls} value={v} maxLength={f.max} placeholder={f.placeholder} onChange={(e) => setV(f.key, e.target.value)} />);
    }
  }

  if (!meta || !values) return <div className="text-sm text-muted py-10 text-center">Loading settings…</div>;

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <nav className="sm:w-52 shrink-0 space-y-1">
        <input value={query} onChange={(e) => { setQuery(e.target.value); setFieldErrors({}); }} placeholder="Search settings…"
          className="w-full border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500" />
        <div className="pt-2 space-y-1">
          {meta.sections.map((s) => (
            <button key={s.id} onClick={() => { setSection(s.id); setQuery(''); setFieldErrors({}); }}
              className={`w-full text-left px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${section === s.id && !q ? 'bg-royal-600 text-white' : 'bg-surface2 border border-line text-muted hover:bg-surface3'}`}>
              {s.label}
              {dirtyInSection(s.id) && <span className="ml-1.5 inline-block w-2 h-2 rounded-full bg-amber-400 align-middle" title="Unsaved changes" />}
            </button>
          ))}
        </div>
        {dirtyFields.length > 0 && (
          <div className="pt-3 space-y-2">
            <div className="text-xs font-semibold text-amber-700">{dirtyFields.length} unsaved change{dirtyFields.length === 1 ? '' : 's'}</div>
            <Btn onClick={() => saveScope(meta.settings, 'settings')} disabled={busy}>Save all changes</Btn>
          </div>
        )}
      </nav>
      <div className="flex-1 min-w-0">
        <Card title={sectionLabel}
          description={section === 'appearance' && !q ? 'Colours apply live to the shop (theme + browser tab colour).' : (q ? 'Results from every section.' : undefined)}>
          {section === 'appearance' && !q && (
            <div className="mb-4">
              <span className={label}>Palette presets</span>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((p) => (
                  <button key={p.name} type="button"
                    onClick={() => { const { name, ...colors } = p; void name; setValues((s) => ({ ...s, ...colors })); }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-line text-xs font-semibold hover:bg-surface3">
                    <span className="w-4 h-4 rounded-full border border-black/10" style={{ background: p.theme_primary }} />
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">{fields.map(renderField)}</div>
          {q && fields.length === 0 && <p className="text-sm text-muted py-4">No settings match “{query}”.</p>}
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <Btn onClick={() => saveScope(fields, q ? 'searched settings' : `${sectionLabel.toLowerCase()} settings`)} disabled={busy || !values}>
              {busy ? 'Saving…' : `Save ${q ? `${fields.length} result${fields.length === 1 ? '' : 's'}` : sectionLabel.toLowerCase()}`}
            </Btn>
            {!q && (
              <button type="button" onClick={() => resetScope(fields, sectionLabel)} disabled={busy}
                className="text-xs font-semibold text-muted hover:text-ink underline">Reset section to defaults</button>
            )}
            <span className="text-xs text-muted">
              {fields.length} setting{fields.length === 1 ? '' : 's'}
              {!q && dirtyInSection(section) && <span className="text-amber-600 font-semibold"> • unsaved changes</span>}
            </span>
          </div>
        </Card>
        {section === 'notifications' && !q && (
          <div className="mt-4">
            <Card title="Send a test email" description="Checks SMTP from here without placing an order — tells you straight away whether SMTP is configured.">
              <div className="flex gap-2">
                <input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" className={input} />
                <Btn onClick={sendTest} disabled={testBusy || !testTo.trim()}>{testBusy ? 'Sending…' : 'Send test'}</Btn>
              </div>
              {testResult && (
                <div className={`text-xs mt-2 rounded-xl px-3 py-2 border ${testResult.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                  {testResult.message}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
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
        <p className="text-xs text-muted mb-3">Public /notebook page reads this setting; falls back to the hardcoded notebook when unset.</p>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://notebooklm.google.com/notebook/…" className="w-full border border-line-strong rounded-xl px-3 py-2 text-sm" />
        <div className="mt-3 flex items-center gap-3"><Btn onClick={save} disabled={saving || !url}>{saving ? 'Saving…' : 'Save URL'}</Btn><a href={url} target="_blank" rel="noreferrer" className="text-xs text-royal-700 hover:underline">Open in NotebookLM →</a></div>
      </Card>
      <Card title={`Posts tagged "notebook" (${posts.length})`}>
        <div className="space-y-1">{posts.map((p) => <div key={p.id} className="text-xs border-b border-line py-1.5"><span className="font-bold text-ink">{p.title}</span> <span className="text-muted">— {p.slug}</span></div>)}{posts.length === 0 && <div className="text-xs text-muted">No posts with tag notebook</div>}</div>
      </Card>
    </div>
  );
}