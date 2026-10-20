import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi, setSession } from '../lib/api/customClient';

// One component, two steps of the same flow (Login keeps the royal auth
// styling, so these screens mirror it rather than the storefront kit).
//   /forgot-password  → ask for the email, always answer generically
//   /reset-password?token=… → spend the single-use token, then sign in
const SHELL = 'min-h-[70vh] bg-surface3 flex items-center justify-center p-4';
const CARD = 'w-full max-w-sm bg-surface2 border border-line rounded-2xl shadow-sm p-6 space-y-4';
const FIELD = 'mt-1 w-full border border-line-strong rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-royal-600';

export default function PasswordReset({ mode = 'request' }) {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  const tooMany = (e) => e?.status === 429
    ? 'Too many attempts — wait a few minutes and try again.'
    : null;

  async function requestReset(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await authApi.forgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch (e2) {
      setErr(tooMany(e2) || e2?.message || 'Could not send the reset email');
    } finally { setBusy(false); }
  }

  async function applyReset(e) {
    e.preventDefault();
    if (password !== confirm) { setErr('Those passwords do not match.'); return; }
    setBusy(true); setErr('');
    try {
      const res = await authApi.resetPassword(token, password);
      setSession(res.token, res.user);
      window.location.assign('/account');
    } catch (e2) {
      setErr(tooMany(e2) || e2?.message || 'Could not reset your password');
    } finally { setBusy(false); }
  }

  const header = (
    <div className="flex items-center gap-2">
      <span className="w-9 h-9 rounded-xl bg-royal-600 flex items-center justify-center text-white font-black" aria-hidden="true">K</span>
      <div>
        <h1 className="font-black text-ink leading-tight">
          {mode === 'consume' ? 'Choose a new password' : 'Forgot your password?'}
        </h1>
        <p className="text-[11px] text-muted">Krystals Flower Creations</p>
      </div>
    </div>
  );

  // ── Consume a reset link ─────────────────────────────────────────────────
  if (mode === 'consume') {
    if (!token) {
      return (
        <div className={SHELL}>
          <div className={CARD}>
            {header}
            <div role="alert" className="p-3 rounded-xl bg-danger-50 border border-danger-200 text-sm text-danger-800">
              This link is missing its token — it may have been cut short by your email app. Request a fresh one.
            </div>
            <Link to="/forgot-password" className="block text-center text-sm font-bold text-royal-700 dark:text-royal-300 hover:underline">
              Send a new reset link
            </Link>
            <Link to="/login" className="block text-center text-xs text-muted hover:underline">← Back to sign in</Link>
          </div>
        </div>
      );
    }
    return (
      <div className={SHELL}>
        <form onSubmit={applyReset} className={CARD}>
          {header}
          <p className="text-sm text-muted">Pick something at least 8 characters long. This link works once.</p>
          {err && <div role="alert" className="p-3 rounded-xl bg-danger-50 border border-danger-200 text-sm text-danger-800">{err}</div>}
          <label className="block text-sm">
            <span className="text-ink font-semibold">New password</span>
            <input type="password" required minLength={8} maxLength={128} autoComplete="new-password" autoFocus
              value={password} onChange={(e) => setPassword(e.target.value)} className={FIELD} />
          </label>
          <label className="block text-sm">
            <span className="text-ink font-semibold">Confirm new password</span>
            <input type="password" required minLength={8} maxLength={128} autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} className={FIELD} />
          </label>
          <button type="submit" disabled={busy}
            className="w-full bg-royal-600 hover:bg-royal-700 disabled:opacity-60 text-white font-bold rounded-xl py-2.5">
            {busy ? 'Saving…' : 'Save password & sign in'}
          </button>
          <Link to="/forgot-password" className="block text-center text-xs text-muted hover:underline">Need a new link?</Link>
        </form>
      </div>
    );
  }

  // ── Ask for the email ───────────────────────────────────────────────────
  return (
    <div className={SHELL}>
      <form onSubmit={requestReset} className={CARD}>
        {header}
        {sent ? (
          <>
            <div role="status" className="p-3 rounded-xl bg-success-50 border border-success-200 text-sm text-success-800">
              If that email has an account, a reset link is on its way. It expires in 60 minutes.
            </div>
            <p className="text-xs text-muted">
              Nothing after a few minutes? Check spam, then try again — the most recent link is the one that works.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">Enter the email you shop with and we'll send a one-time reset link.</p>
            {err && <div role="alert" className="p-3 rounded-xl bg-danger-50 border border-danger-200 text-sm text-danger-800">{err}</div>}
            <label className="block text-sm">
              <span className="text-ink font-semibold">Email</span>
              <input type="email" required autoComplete="email" autoFocus
                value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} />
            </label>
            <button type="submit" disabled={busy}
              className="w-full bg-royal-600 hover:bg-royal-700 disabled:opacity-60 text-white font-bold rounded-xl py-2.5">
              {busy ? 'Sending…' : 'Email me a reset link'}
            </button>
          </>
        )}
        <Link to="/login" className="block text-center text-xs text-muted hover:underline">← Back to sign in</Link>
      </form>
    </div>
  );
}
