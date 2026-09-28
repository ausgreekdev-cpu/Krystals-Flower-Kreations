import { Link, Outlet, useLocation } from 'react-router-dom';
import { clearSession, getUser } from '../../lib/api/customClient';
import { currentStaffRole } from '../../lib/session';

const TITLES = { '/pos': 'Point of Sale', '/kanban': 'Custom Order Board' };

// Slim chrome for full-screen staff tools: always a way home, plus sibling tools.
export default function StaffBar() {
  const { pathname } = useLocation();
  const role = currentStaffRole();
  const user = getUser();
  const title = TITLES[pathname] || 'Studio Tool';
  function signOut() {
    clearSession();
    window.location.assign('/');
  }
  const linkCls = (active) => active ? 'text-white font-bold underline' : 'text-white/70 hover:text-white';
  return (
    <div className="min-h-screen bg-surface3 flex flex-col">
      <header className="bg-black text-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3 text-sm">
          <Link to="/" className="font-black hover:text-bloom-200 flex items-center gap-1.5" aria-label="Home">
            <span aria-hidden="true">🏠</span> Home
          </Link>
          <span className="text-white/40" aria-hidden="true">/</span>
          <span className="font-bold">{title}</span>
          <nav className="ml-auto flex items-center gap-3 text-xs">
            {role && <Link to="/pos" className={linkCls(pathname === '/pos')}>POS</Link>}
            {role && <Link to="/kanban" className={linkCls(pathname === '/kanban')}>Kanban</Link>}
            {role && <Link to="/admin" className={linkCls(pathname === '/admin')}>Admin</Link>}
            {user?.email && <span className="text-white/50 hidden sm:inline max-w-[10rem] truncate">{user.email}</span>}
            {role ? (
              <button onClick={signOut} className="text-white/70 hover:text-white underline">Sign out</button>
            ) : (
              <Link to="/login" className="bg-bloom-500 px-3 py-1 rounded-full font-bold">Sign in</Link>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1"><Outlet /></main>
    </div>
  );
}
