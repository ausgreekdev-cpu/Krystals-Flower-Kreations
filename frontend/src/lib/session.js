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
