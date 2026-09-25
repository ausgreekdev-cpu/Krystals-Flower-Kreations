// Colour mode: system | light | dark, stored per-visitor in localStorage.
// The no-flash script in index.html applies the stored/system mode before
// first paint; this module adds listeners, the header toggle, and the
// admin-configured first-time default (default_color_mode setting).

const KEY = 'kfk_color_mode';
export const MODES = ['system', 'light', 'dark'];

let defaultOverride = null; // admin default for first-time visitors (no stored choice)
let themeSettings = null;   // last public settings payload (for browser chrome colour)
let systemQuery = null;
let inited = false;
const listeners = new Set();

function query() {
  if (!systemQuery && typeof window !== 'undefined' && window.matchMedia) systemQuery = window.matchMedia('(prefers-color-scheme: dark)');
  return systemQuery;
}

// theme.js hands over the fetched settings so the meta theme-color can track
// both the active mode and the admin's colours — keeps imports one-directional.
export function registerThemeSettings(s) {
  themeSettings = s || null;
  updateThemeColorMeta();
}

export function updateThemeColorMeta() {
  if (typeof document === 'undefined') return;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const dark = isDarkActive();
  const c = dark ? (themeSettings?.theme_dark_bg || '#0F172A') : (themeSettings?.theme_color || '#581C87');
  meta.setAttribute('content', c);
}

export function getColorMode() {
  try {
    const m = localStorage.getItem(KEY);
    if (m === 'light' || m === 'dark' || m === 'system') return m;
  } catch { /* private mode */ }
  return null; // visitor hasn't chosen yet
}

export function isDarkActive() {
  const mode = getColorMode();
  const systemDark = query()?.matches ?? false;
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  if (mode === 'system') return systemDark;
  if (defaultOverride === 'dark') return true;
  if (defaultOverride === 'light') return false;
  return systemDark;
}

export function applyColorMode() {
  const dark = isDarkActive();
  const r = document.documentElement;
  r.classList.toggle('dark', dark);
  r.style.colorScheme = dark ? 'dark' : 'light';
  updateThemeColorMeta();
  const mode = getColorMode() || 'system';
  listeners.forEach((fn) => { try { fn(mode, dark); } catch { /* listener error */ } });
}

export function setColorMode(mode) {
  try { localStorage.setItem(KEY, mode); } catch { /* private mode */ }
  applyColorMode();
}

export function nextColorMode() {
  const current = getColorMode() || 'system';
  const next = MODES[(MODES.indexOf(current) + 1) % MODES.length];
  setColorMode(next);
  return next;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Admin default_color_mode — applies only while the visitor has no stored choice.
export function applyDefaultColorMode(mode) {
  if (getColorMode() !== null) return;
  if (mode !== 'light' && mode !== 'dark') { defaultOverride = null; return; }
  defaultOverride = mode;
  applyColorMode();
}

export function initColorMode() {
  if (inited || typeof window === 'undefined') return;
  inited = true;
  const q = query();
  q?.addEventListener?.('change', () => {
    if ((getColorMode() || 'system') === 'system' && !defaultOverride) applyColorMode();
  });
  window.addEventListener('storage', (e) => { if (e.key === KEY) applyColorMode(); });
  applyColorMode();
}
