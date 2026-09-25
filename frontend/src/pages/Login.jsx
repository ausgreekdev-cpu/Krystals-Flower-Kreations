import { useState } from 'react';
import { authApi, setSession } from '../lib/api/customClient';

const STAFF_ROLES = ['staff', 'maker', 'admin', 'developer'];

export default function Login() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get('next') || '/admin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(params.get('expired') ? 'Your session expired — please sign in again.' : '');

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const { token, user } = await authApi.login(email.trim().toLowerCase(), password);
      setSession(token, user);
      const dest = next.startsWith('/') && !next.startsWith('//') ? next : '/admin';
      if (dest.startsWith('/admin') && !STAFF_ROLES.includes(user.role)) {
        window.location.assign('/');
        return;
      }
      window.location.assign(dest);
    } catch (e2) {
      setErr(e2?.status === 401 ? 'Incorrect email or password.' : e2?.status === 429 ? 'Too many attempts — wait a few minutes and try again.' : (e2?.message || 'Sign-in failed'));
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-surface3 flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-surface2 border border-line rounded-2xl shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-xl bg-royal-600 flex items-center justify-center text-white font-black">K</span>
          <div>
            <h1 className="font-black text-ink leading-tight">Studio sign in</h1>
            <p className="text-[11px] text-muted">Krystal's Flower Kreations</p>
          </div>
        </div>
        {err && <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{err}</div>}
        <label className="block text-sm">
          <span className="text-ink font-semibold">Email</span>
          <input type="email" required autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full border border-line-strong rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-royal-600" />
        </label>
        <label className="block text-sm">
          <span className="text-ink font-semibold">Password</span>
          <input type="password" required minLength={6} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full border border-line-strong rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-royal-600" />
        </label>
        <button type="submit" disabled={busy} className="w-full bg-royal-600 hover:bg-royal-700 disabled:opacity-60 text-white font-bold rounded-xl py-2.5">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {import.meta.env.DEV && <p className="text-[11px] text-muted text-center">Dev seed: admin@krystal.local / admin123</p>}
        <a href="/" className="block text-center text-xs text-muted hover:underline">← Back to shop</a>
      </form>
    </div>
  );
}
