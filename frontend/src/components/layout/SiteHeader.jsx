import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { clearSession } from '../../lib/api/customClient';
import { subscribe, nextColorMode, getColorMode } from '../../lib/colorMode';
import { usePublicSettings } from '../../lib/publicSettings';
import { currentStaffRole, currentUser } from '../../lib/session';

const MODE_ICONS = { system: '🖥️', light: '☀️', dark: '🌙' };
const MODE_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };
const MODES_NEXT = { system: 'light', light: 'dark', dark: 'system' };

const FALLBACK_EMAIL = 'krystal@krystalsflowerkreations.com.au';
const FALLBACK_BUSINESS = "Krystal's Flower Kreations";

function LogoMark({ src }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) return <img src={src} alt="" className="w-8 h-8 rounded-full object-cover" onError={() => setFailed(true)} />;
  return <span className="w-8 h-8 rounded-full bg-bloom-500 text-white grid place-items-center text-sm">✿</span>;
}

function navClass({ isActive }) {
  return `py-2 hover:text-highlight ${isActive ? 'text-highlight font-bold' : ''}`;
}

export default function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchRowOpen, setSearchRowOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [q, setQ] = useState('');
  const [colorMode, setColorModeState] = useState(() => getColorMode() || 'system');
  const s = usePublicSettings();
  const nav = useNavigate();
  const location = useLocation();
  const staffRole = currentStaffRole();
  const user = currentUser();
  const signedIn = Boolean(localStorage.getItem('token'));

  useEffect(() => {
    const off = subscribe((mode) => setColorModeState(mode));
    function refresh() {
      const id = localStorage.getItem('cartId');
      if (!id) { setCartCount(0); return; }
      fetch(`/api/cart`, { headers: { 'x-cart-id': id } }).then(r => r.json()).then(d => setCartCount(d?.cart?.items?.length || d?.items?.length || 0)).catch(() => {});
    }
    refresh();
    window.addEventListener('cart:updated', refresh);
    window.addEventListener('storage', refresh);
    return () => { off(); window.removeEventListener('cart:updated', refresh); window.removeEventListener('storage', refresh); };
  }, []);

  // Close the mobile menu / search row whenever the route changes.
  useEffect(() => { setMobileOpen(false); setSearchRowOpen(false); }, [location.pathname]);

  const toggleColorMode = () => { const next = nextColorMode(); setColorModeState(next); };
  function onSearch(e) {
    e.preventDefault();
    setSearchRowOpen(false);
    if (q.trim()) nav(`/shop?q=${encodeURIComponent(q.trim())}`);
    else nav('/shop');
  }
  function signOut() {
    clearSession();
    window.location.assign('/');
  }

  const phone = s.contact_phone || import.meta.env.VITE_PHONE || '+61 410 732 634';
  const email = s.contact_email || FALLBACK_EMAIL;
  const businessName = s.business_name || FALLBACK_BUSINESS;
  const showAnnouncement = Boolean(s.announcement_text) && s.announcement_enabled !== '0';
  const showModeToggle = s.show_color_mode_toggle !== '0';
  const customerItems = (
    <>
      <NavLink to="/" end className={navClass}>Home</NavLink>
      <NavLink to="/shop" className={navClass}>Shop</NavLink>
      <NavLink to="/configurator" className={navClass}>Configurator</NavLink>
      <NavLink to="/workshops" className={navClass}>Workshops</NavLink>
      <NavLink to="/blog" className={navClass}>Journal</NavLink>
      <NavLink to="/notebook" className={navClass}>Notebook</NavLink>
      <NavLink to="/loyalty" className={navClass}>Bloom Points</NavLink>
    </>
  );

  return (
    <div>
      {/* Top bar for desktop */}
      <div className="hidden md:block bg-bloom-700 text-white text-xs">
        <div className="max-w-7xl mx-auto px-4 py-1.5 flex justify-between gap-4">
          {showAnnouncement ? (
            s.announcement_link
              ? <a href={s.announcement_link} className="hover:underline truncate">{s.announcement_text}</a>
              : <span className="truncate">{s.announcement_text}</span>
          ) : <span />}
          <span className="flex gap-4 shrink-0"><a href={`tel:${phone}`} className="hover:underline">{phone}</a><a href={`mailto:${email}`} className="hover:underline">{email}</a></span>
        </div>
      </div>
      <header className="bg-surface2/95 backdrop-blur border-b sticky top-0 z-20">
        {/* [logo] [search centred] [nav/actions] — explicit columns keep actions right when the centre is hidden */}
        <div className="max-w-7xl mx-auto px-4 py-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 md:gap-4">
          <Link to="/" className="col-start-1 font-black text-ink text-xl tracking-tight flex items-center gap-2 shrink-0" aria-label={`${businessName} — home`}>
            <LogoMark src={s.logo_url} />
            <span className="hidden sm:inline">{businessName}</span><span className="sm:hidden">{businessName.split(' ')[0]}</span>
          </Link>
          {/* Centred desktop search — visible from md up (was lg, leaving 768–1023px without one) */}
          <div className="col-start-2 hidden md:flex justify-center min-w-0">
            <form onSubmit={onSearch} className="flex w-full max-w-sm lg:max-w-md min-w-0">
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search — rose, banksia, Cricut…" aria-label="Search products" className="w-full min-w-0 border rounded-l-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bloom-500/20" />
              <button type="submit" className="bg-bloom-500 text-white px-4 rounded-r-xl text-sm font-bold hover:bg-bloom-700 shrink-0">Search</button>
            </form>
          </div>
          {/* Right: nav at xl, hamburger below xl, search icon below md */}
          <div className="col-start-3 flex items-center justify-end gap-2 min-w-0">
            <button onClick={() => setSearchRowOpen(!searchRowOpen)} className="md:hidden p-2 rounded-lg border hover:bg-surface3" aria-label="Search" aria-expanded={searchRowOpen}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5" aria-hidden="true"><circle cx="9" cy="9" r="6" /><path d="M14 14l4 4" strokeLinecap="round" /></svg>
            </button>
            <button onClick={() => setMobileOpen(!mobileOpen)} className="xl:hidden p-2 rounded-lg border hover:bg-surface3" aria-label="Menu" aria-expanded={mobileOpen}>
              <span className="block w-5 h-0.5 bg-bloom-700 mb-1"></span><span className="block w-5 h-0.5 bg-bloom-700 mb-1"></span><span className="block w-5 h-0.5 bg-bloom-700"></span>
            </button>
            <nav className="hidden xl:flex gap-4 text-sm font-medium items-center">
              {customerItems}
              {staffRole && <NavLink to="/pos" className={navClass}>POS</NavLink>}
              {staffRole && <NavLink to="/kanban" className={navClass}>Kanban</NavLink>}
              {staffRole && <NavLink to="/admin" className={navClass}>Admin</NavLink>}
              <NavLink to="/cart" className={({ isActive }) => `relative hover:text-highlight py-2 flex items-center gap-1 ${isActive ? 'text-highlight font-bold' : ''}`}>
                Cart {cartCount > 0 && <span className="bg-bloom-500 text-white text-[10px] leading-none px-1.5 py-0.5 rounded-full">{cartCount}</span>}
              </NavLink>
              {!signedIn && <NavLink to="/login" className={navClass}>Sign in</NavLink>}
              {signedIn && (
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted max-w-[10rem] truncate" title={user?.email || ''}>{user?.name || user?.email || 'Signed in'}</span>
                  <button onClick={signOut} className="text-xs underline text-muted hover:text-highlight py-2">Sign out</button>
                </span>
              )}
              {showModeToggle && (
                <button onClick={toggleColorMode} title={`Colour mode: ${MODE_LABELS[colorMode]} — click for ${MODE_LABELS[MODES_NEXT[colorMode]]}`}
                  aria-label={`Colour mode: ${MODE_LABELS[colorMode]}. Click to change.`} className="py-2 px-1.5 rounded-lg hover:bg-surface3" >
                  {MODE_ICONS[colorMode]}
                </button>
              )}
            </nav>
          </div>
        </div>
        {/* Mobile / tablet search row — one tap from the header icon, no hamburger needed */}
        {searchRowOpen && (
          <div className="md:hidden border-t bg-surface2 px-4 py-3">
            <form onSubmit={onSearch} className="flex">
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search — rose, banksia, Cricut…" aria-label="Search products" className="flex-1 min-w-0 border rounded-l-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bloom-500/20" />
              <button type="submit" className="bg-bloom-500 text-white px-3 rounded-r-xl text-sm font-bold">Go</button>
            </form>
          </div>
        )}
        {/* Mobile / tablet dropdown */}
        {mobileOpen && (
          <div className="xl:hidden border-t bg-surface2 px-4 py-3 space-y-2">
            <form onSubmit={onSearch} className="flex"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" className="flex-1 border rounded-l-xl px-3 py-2 text-sm" /><button type="submit" className="bg-bloom-500 text-white px-3 rounded-r-xl text-sm">Go</button></form>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Link to="/" className="bg-bloom-500 text-white rounded-xl p-3 font-bold">🏠 Home</Link>
              <NavLink to="/shop" className={({ isActive }) => `rounded-xl p-3 font-bold ${isActive ? 'bg-bloom-500 text-white' : 'bg-surface border'}`}>Shop</NavLink>
              <NavLink to="/configurator" className={({ isActive }) => `rounded-xl p-3 ${isActive ? 'bg-bloom-500 text-white' : 'bg-surface2 border'}`}>Configurator</NavLink>
              <NavLink to="/workshops" className={({ isActive }) => `rounded-xl p-3 ${isActive ? 'bg-bloom-500 text-white' : 'bg-surface2 border'}`}>Workshops</NavLink>
              <NavLink to="/blog" className={({ isActive }) => `rounded-xl p-3 ${isActive ? 'bg-bloom-500 text-white' : 'bg-surface2 border'}`}>Journal</NavLink>
              <NavLink to="/notebook" className={({ isActive }) => `rounded-xl p-3 ${isActive ? 'bg-bloom-500 text-white' : 'bg-surface2 border'}`}>Notebook</NavLink>
              <NavLink to="/loyalty" className={({ isActive }) => `rounded-xl p-3 ${isActive ? 'bg-bloom-500 text-white' : 'bg-surface2 border'}`}>Bloom Points</NavLink>
              <NavLink to="/cart" className={({ isActive }) => `rounded-xl p-3 relative ${isActive ? 'bg-bloom-500 text-white' : 'bg-surface2 border'}`}>Cart {cartCount > 0 && <span className="absolute top-2 right-2 bg-bloom-500 text-white text-[10px] px-1.5 rounded-full">{cartCount}</span>}</NavLink>
              {staffRole && <NavLink to="/pos" className={({ isActive }) => `rounded-xl p-3 ${isActive ? 'bg-bloom-500 text-white' : 'bg-surface2 border'}`}>POS</NavLink>}
              {staffRole && <NavLink to="/kanban" className={({ isActive }) => `rounded-xl p-3 ${isActive ? 'bg-bloom-500 text-white' : 'bg-surface2 border'}`}>Kanban</NavLink>}
              {staffRole && <NavLink to="/admin" className={({ isActive }) => `rounded-xl p-3 ${isActive ? 'bg-bloom-500 text-white' : 'bg-surface2 border'}`}>Admin</NavLink>}
              {!signedIn && <Link to="/login" className="bg-surface2 border rounded-xl p-3 font-bold">Sign in</Link>}
              {signedIn && <button onClick={signOut} className="bg-surface2 border rounded-xl p-3 text-left">Sign out — {user?.email || ''}</button>}
              {showModeToggle && <button onClick={toggleColorMode} className="bg-surface2 border rounded-xl p-3 text-left">Colour mode — {MODE_ICONS[colorMode]} {MODE_LABELS[colorMode]}</button>}
            </div>
          </div>
        )}
      </header>
    </div>
  );
}
