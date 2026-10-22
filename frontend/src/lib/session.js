import { getUser } from './api/customClient';

export const STAFF_ROLES = ['staff', 'maker', 'admin', 'developer'];

// Staff who are signed in bypass maintenance mode server-side, so don't cover
// their screen with the takeover.
export function currentStaffRole() {
  try {
    const t = localStorage.getItem('token');
    if (!t) return null;
    const payload = JSON.parse(atob(String(t).split('.')[1]));
    return STAFF_ROLES.includes(payload.role) ? payload.role : null;
  } catch { return null; }
}

export function currentUser() {
  return getUser();
}

// Sliding session: renew the stored token while it is still valid (the API
// returns 401 token_expired once it lapses — then it's a fresh login). Called
// once per SPA load from SiteLayout; fire-and-forget.
export async function renewSession() {
  const t = localStorage.getItem('token');
  if (!t) return false;
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data?.token) {
      localStorage.setItem('token', data.token);
      if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
      return true;
    }
  } catch { /* network failure keeps the current token until it expires */ }
  return false;
}
