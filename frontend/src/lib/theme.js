// Applies runtime-editable brand theme (colours + font) from /api/settings.
// Reads the public settings endpoint and maps keys to CSS variables on :root.
const THEME_MAP = [
  { key: 'theme_primary', var: '--bloom-500' },
  { key: 'theme_primary_dark', var: '--bloom-700' },
  { key: 'theme_bg', var: '--bloom-50' },
  { key: 'theme_admin_purple', var: '--royal-600' },
  { key: 'theme_color', var: '--theme-color' },
];

function hexToRgbTriplet(hex) {
  let h = String(hex || '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return `${parseInt(h.slice(0, 2), 16)} ${parseInt(h.slice(2, 4), 16)} ${parseInt(h.slice(4, 6), 16)}`;
}

export async function applyTheme() {
  const root = document.documentElement;
  try {
    const res = await fetch('/api/settings', { cache: 'no-store' });
    if (!res.ok) return;
    const s = await res.json();
    for (const { key, var: v } of THEME_MAP) {
      const triplet = hexToRgbTriplet(s[key]);
      if (triplet) root.style.setProperty(v, triplet);
    }
    // Font family
    if (s.theme_font) root.style.setProperty('--font-sans', `${s.theme_font}, system-ui, sans-serif`);
    // Browser chrome colour
    const meta = document.querySelector('meta[name="theme-color"]');
    if (s.theme_color && meta) meta.setAttribute('content', s.theme_color);
  } catch { /* offline/branding missing — keep defaults */ }
}