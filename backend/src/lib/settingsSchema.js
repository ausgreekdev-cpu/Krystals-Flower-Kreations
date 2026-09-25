import prisma from './prisma.js';

// Single source of truth for settings.
// Adding a setting = one entry here. Validation (PUT), the public filter
// (GET /api/settings), the admin form (GET /api/settings/schema) and defaults
// all derive from this list, so they can never drift apart.
//
// Types: text | textarea | number | color | url | email | toggle | select | csv
// All stored values are strings (Setting.value is String).

export const SECTIONS = [
  { id: 'business', label: 'Business' },
  { id: 'contact', label: 'Contact & Social' },
  { id: 'storefront', label: 'Storefront & SEO' },
  { id: 'payments', label: 'Payments & Pickup' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'workshops', label: 'Workshops' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'loyalty', label: 'Loyalty' },
  { id: 'pos', label: 'POS' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'advanced', label: 'Advanced' },
];

const FONT_OPTIONS = [
  { value: '', label: 'Inter (default)' },
  { value: 'Georgia, serif', label: 'Georgia (serif)' },
  { value: "'Times New Roman', serif", label: 'Times (serif)' },
  { value: 'system-ui, sans-serif', label: 'System UI' },
  { value: "'Courier New', monospace", label: 'Monospace' },
];

const COLOR_MODE_OPTIONS = [
  { value: 'system', label: 'Follow system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const PAY_METHOD_OPTIONS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'pickup', label: 'Pay on pickup' },
  { value: 'cash', label: 'Cash' },
  { value: 'manual', label: 'Manual' },
];

export const SETTINGS = [
  // ── Business ──────────────────────────────────────────────
  { key: 'business_name', section: 'business', label: 'Business name', type: 'text', default: "Krystal's Flower Kreations", public: true, max: 120 },
  { key: 'abn', section: 'business', label: 'ABN', type: 'text', default: '', public: true, max: 20 },
  { key: 'business_address', section: 'business', label: 'Business address', type: 'text', default: 'Perth WA 6000', public: true, max: 200 },
  { key: 'tax_gst_rate', section: 'business', label: 'GST rate (decimal)', type: 'number', default: '0.10', public: true, min: 0, max: 1, unit: '' },
  { key: 'labour_rate_per_hour', section: 'business', label: 'Labour rate', type: 'number', default: '55', public: true, min: 0, max: 10000, unit: '$/hr' },
  { key: 'bom_margin', section: 'business', label: 'BOM margin', type: 'number', default: '1.30', public: true, min: 1, max: 20, unit: '×' },

  // ── Contact & social ──────────────────────────────────────
  { key: 'contact_email', section: 'contact', label: 'Contact email', type: 'email', default: 'krystal@krystalsflowerkreations.com.au', public: true, max: 254 },
  { key: 'contact_phone', section: 'contact', label: 'Contact phone', type: 'text', default: '', public: true, max: 30, placeholder: '+61 8 XXXX XXXX' },
  { key: 'instagram_url', section: 'contact', label: 'Instagram URL', type: 'url', default: '', public: true },
  { key: 'facebook_url', section: 'contact', label: 'Facebook URL', type: 'url', default: '', public: true },
  { key: 'opening_hours', section: 'contact', label: 'Opening hours', type: 'text', default: '', public: true, max: 200, placeholder: 'Mon–Fri 9am–5pm' },

  // ── Storefront & SEO ──────────────────────────────────────
  { key: 'announcement_text', section: 'storefront', label: 'Announcement bar', type: 'text', default: 'Perth WA studio • Made-to-order 3-7 days • Free Perth delivery over $150', public: true, max: 200 },
  { key: 'handling_days_text', section: 'storefront', label: 'Handling time', type: 'text', default: '3-7 days', public: true, max: 60 },
  { key: 'site_meta_title', section: 'storefront', label: 'Meta title (SEO)', type: 'text', default: "Krystal's Flower Kreations — Paper Florist Perth WA", public: true, max: 70 },
  { key: 'site_meta_description', section: 'storefront', label: 'Meta description (SEO)', type: 'textarea', default: 'Handmade paper flowers, armature art, Cricut SVG templates & workshops. Perth, Western Australia.', public: true, max: 300 },
  { key: 'og_image_url', section: 'storefront', label: 'Social share image URL', type: 'url', default: '', public: true },
  { key: 'notebooklm_url', section: 'storefront', label: 'NotebookLM URL', type: 'url', default: '', public: true },
  { key: 'configurator_floor', section: 'storefront', label: 'Configurator floor price', type: 'number', default: '45', public: true, min: 0, max: 100000, unit: '$' },
  { key: 'configurator_per_stem', section: 'storefront', label: 'Configurator per-stem', type: 'number', default: '9.5', public: true, min: 0, max: 100000, unit: '$' },
  { key: 'configurator_vase', section: 'storefront', label: 'Configurator vase add-on', type: 'number', default: '22', public: true, min: 0, max: 100000, unit: '$' },
  { key: 'configurator_greenery', section: 'storefront', label: 'Configurator greenery add-on', type: 'number', default: '12', public: true, min: 0, max: 100000, unit: '$' },

  // ── Payments & pickup ─────────────────────────────────────
  { key: 'checkout_payment_methods', section: 'payments', label: 'Checkout payment methods', type: 'csv', default: 'bank_transfer,pickup', public: true, options: PAY_METHOD_OPTIONS },
  { key: 'bank_name', section: 'payments', label: 'Bank name', type: 'text', default: '', public: true, max: 80 },
  { key: 'bank_bsb', section: 'payments', label: 'BSB', type: 'text', default: '', public: true, max: 12, placeholder: '000-000' },
  { key: 'bank_account_name', section: 'payments', label: 'Account name', type: 'text', default: '', public: true, max: 120 },
  { key: 'bank_account_number', section: 'payments', label: 'Account number', type: 'text', default: '', public: true, max: 24 },
  { key: 'payment_reference_hint', section: 'payments', label: 'Payment reference hint', type: 'text', default: 'Use your order number as the payment reference.', public: true, max: 200 },
  { key: 'pickup_address', section: 'payments', label: 'Pickup address', type: 'text', default: 'Perth Studio, WA', public: true, max: 200 },
  { key: 'pickup_instructions', section: 'payments', label: 'Pickup instructions', type: 'textarea', default: 'Pay on collection — you will receive a QR ticket for pickup.', public: true, max: 500 },

  // ── Shipping ──────────────────────────────────────────────
  { key: 'shipping_free_over', section: 'shipping', label: 'Free shipping over', type: 'number', default: '150', public: true, min: 0, max: 100000, unit: '$' },
  { key: 'shipping_note', section: 'shipping', label: 'Shipping rates note', type: 'text', default: 'Metro $12, WA regional $18, national $22 — free over $150. Click & collect 6000.', public: true, max: 200 },

  // ── Workshops ─────────────────────────────────────────────
  { key: 'workshop_reminders_enabled', section: 'workshops', label: 'Send reminder emails', type: 'toggle', default: '1', public: false },
  { key: 'workshop_reminder_24h_lead', section: 'workshops', label: 'Reminder 1 lead', type: 'number', default: '24', public: false, min: 1, max: 720, unit: 'h before' },
  { key: 'workshop_reminder_2h_lead', section: 'workshops', label: 'Reminder 2 lead', type: 'number', default: '2', public: false, min: 1, max: 168, unit: 'h before' },
  { key: 'workshop_min_lead_hours', section: 'workshops', label: 'Minimum booking lead time', type: 'number', default: '0', public: true, min: 0, max: 720, unit: 'h before start' },
  { key: 'workshop_default_capacity', section: 'workshops', label: 'Default new-session capacity', type: 'number', default: '12', public: true, min: 1, max: 500, unit: 'seats' },

  // ── Notifications ─────────────────────────────────────────
  { key: 'email_from_name', section: 'notifications', label: 'Email from name', type: 'text', default: "Krystal's Flower Kreations", public: false, max: 120 },
  { key: 'email_reply_to', section: 'notifications', label: 'Email reply-to', type: 'email', default: '', public: false, max: 254 },
  { key: 'low_stock_recipient', section: 'notifications', label: 'Low-stock alert recipient', type: 'email', default: '', public: false, max: 254, placeholder: 'defaults to COMPANY_EMAIL env' },
  { key: 'low_stock_alerts_enabled', section: 'notifications', label: 'Low-stock alerts', type: 'toggle', default: '1', public: false },

  // ── Loyalty ───────────────────────────────────────────────
  { key: 'loyalty_enabled', section: 'loyalty', label: 'Loyalty program active', type: 'toggle', default: '1', public: true },
  { key: 'loyalty_blossom_threshold', section: 'loyalty', label: 'Blossom tier threshold', type: 'number', default: '100', public: true, min: 0, max: 1000000, unit: 'pts' },
  { key: 'loyalty_garden_threshold', section: 'loyalty', label: 'Garden tier threshold', type: 'number', default: '500', public: true, min: 0, max: 1000000, unit: 'pts' },
  { key: 'loyalty_earn_rate', section: 'loyalty', label: 'Earn rate', type: 'number', default: '1', public: true, min: 0, max: 1000, unit: 'pts/$' },
  { key: 'loyalty_redeem_rate', section: 'loyalty', label: 'Redeem value', type: 'number', default: '5', public: true, min: 0, max: 1000, unit: '$/100pts' },
  { key: 'loyalty_earn_cap', section: 'loyalty', label: 'Earn cap per order', type: 'number', default: '1000', public: false, min: 0, max: 100000, unit: 'pts' },

  // ── POS ───────────────────────────────────────────────────
  { key: 'pos_receipt_footer', section: 'pos', label: 'Receipt footer', type: 'textarea', default: "Thank you! — Krystal's Flower Kreations • Perth WA", public: false, max: 300 },
  { key: 'pos_till_float_default', section: 'pos', label: 'Default till float', type: 'number', default: '50', public: false, min: 0, max: 10000, unit: '$' },

  // ── Appearance ────────────────────────────────────────────
  { key: 'default_color_mode', section: 'appearance', label: 'Default colour mode', type: 'select', default: 'system', public: true, options: COLOR_MODE_OPTIONS, description: 'For first-time visitors (their own choice is remembered).' },
  { key: 'theme_primary', section: 'appearance', label: 'Primary colour', type: 'color', default: '', public: true },
  { key: 'theme_primary_dark', section: 'appearance', label: 'Dark shade (text on light)', type: 'color', default: '', public: true },
  { key: 'theme_bg', section: 'appearance', label: 'Background tint', type: 'color', default: '', public: true },
  { key: 'theme_secondary', section: 'appearance', label: 'Secondary tint', type: 'color', default: '', public: true },
  { key: 'theme_shimmer', section: 'appearance', label: 'Shimmer (frames/borders)', type: 'color', default: '', public: true },
  { key: 'theme_admin_purple', section: 'appearance', label: 'Admin accent', type: 'color', default: '', public: true },
  { key: 'theme_color', section: 'appearance', label: 'Browser chrome colour', type: 'color', default: '', public: true },
  { key: 'theme_font', section: 'appearance', label: 'Font family', type: 'select', default: '', public: true, options: FONT_OPTIONS },
  { key: 'theme_dark_bg', section: 'appearance', label: 'Dark mode background', type: 'color', default: '#0F172A', public: true },
  { key: 'theme_dark_surface', section: 'appearance', label: 'Dark mode surface/cards', type: 'color', default: '#1E293B', public: true },
  { key: 'theme_dark_text', section: 'appearance', label: 'Dark mode text', type: 'color', default: '#E2E8F0', public: true },

  // ── Advanced ──────────────────────────────────────────────
  { key: 'low_stock_default', section: 'advanced', label: 'Low-stock default threshold', type: 'number', default: '5', public: false, min: 0, max: 100000, unit: 'units' },
  { key: 'cart_retention_hours', section: 'advanced', label: 'Cart retention', type: 'number', default: '24', public: false, min: 1, max: 720, unit: 'h' },
];

export const SETTINGS_BY_KEY = Object.fromEntries(SETTINGS.map(s => [s.key, s]));
export const PUBLIC_KEYS = new Set(SETTINGS.filter(s => s.public).map(s => s.key));

export function defaultsMap(onlyPublic = false) {
  const out = {};
  for (const s of SETTINGS) {
    if (onlyPublic && !s.public) continue;
    out[s.key] = s.default;
  }
  return out;
}

// Fetch stored settings merged over schema defaults.
// onlyPublic=true returns just the storefront-safe subset.
export async function getSettings({ onlyPublic = false } = {}) {
  const rows = await prisma.setting.findMany();
  const out = defaultsMap(onlyPublic);
  for (const row of rows) {
    const entry = SETTINGS_BY_KEY[row.key];
    if (!entry) continue;
    if (onlyPublic && !entry.public) continue;
    out[row.key] = row.value;
  }
  return out;
}

// Validate + normalise a raw value for a schema entry.
// Returns { ok: true, value } (canonical string) or { ok: false, message }.
export function normalizeSetting(entry, raw) {
  const t = entry.type;
  if (t === 'toggle') {
    const v = raw === true || raw === 1 || raw === '1' || raw === 'true' ? '1' : raw === false || raw === 0 || raw === '0' || raw === 'false' ? '0' : null;
    if (v === null) return { ok: false, message: 'must be true/false or 1/0' };
    return { ok: true, value: v };
  }
  if (t === 'number') {
    if (raw === '' || raw === null || raw === undefined) return { ok: false, message: 'must be a number' };
    const n = Number(raw);
    if (!Number.isFinite(n)) return { ok: false, message: 'must be a number' };
    if (entry.min !== undefined && n < entry.min) return { ok: false, message: `must be ≥ ${entry.min}` };
    if (entry.max !== undefined && n > entry.max) return { ok: false, message: `must be ≤ ${entry.max}` };
    return { ok: true, value: String(n) };
  }
  const s = raw === null || raw === undefined ? '' : String(raw);
  if (t === 'color') {
    if (s === '') return { ok: true, value: '' };
    if (!/^#[0-9a-fA-F]{6}$/.test(s)) return { ok: false, message: 'must be a 6-digit hex colour (#RRGGBB)' };
    return { ok: true, value: s };
  }
  if (t === 'url') {
    if (s === '') return { ok: true, value: '' };
    try { new URL(s); } catch { return { ok: false, message: 'must be a valid URL (https://…)' }; }
    return { ok: true, value: s.slice(0, 500) };
  }
  if (t === 'email') {
    if (s === '') return { ok: true, value: '' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || s.length > 254) return { ok: false, message: 'must be a valid email' };
    return { ok: true, value: s };
  }
  if (t === 'select') {
    const allowed = (entry.options || []).map(o => o.value);
    if (!allowed.includes(s)) return { ok: false, message: `must be one of: ${allowed.map(a => a === '' ? '(default)' : a).join(', ')}` };
    return { ok: true, value: s };
  }
  if (t === 'csv') {
    const allowed = (entry.options || []).map(o => o.value);
    const parts = s.split(',').map(p => p.trim()).filter(Boolean);
    if (!parts.length) return { ok: false, message: 'select at least one option' };
    for (const p of parts) if (!allowed.includes(p)) return { ok: false, message: `unknown option "${p}"` };
    return { ok: true, value: parts.join(',') };
  }
  const max = entry.max || (t === 'textarea' ? 5000 : 500);
  if (s.length > max) return { ok: false, message: `must be ≤ ${max} characters` };
  return { ok: true, value: s };
}

// Validate a full PUT body against the schema.
// Returns { ok, errors: { key: message }, values: { key: canonicalString } }.
export function validateSettingsBody(body) {
  const errors = {};
  const values = {};
  for (const [key, raw] of Object.entries(body || {})) {
    const entry = SETTINGS_BY_KEY[key];
    if (!entry) { errors[key] = 'unknown setting'; continue; }
    const res = normalizeSetting(entry, raw);
    if (!res.ok) errors[key] = res.message;
    else values[key] = res.value;
  }
  return { ok: Object.keys(errors).length === 0, errors, values };
}

// Metadata for the admin form (labels/types/defaults — never stored secrets).
export function schemaMetadata() {
  return {
    sections: SECTIONS,
    settings: SETTINGS.map(({ key, section, label, type, default: def, options, min, max, unit, placeholder, description, public: isPublic }) =>
      ({ key, section, label, type, default: def, ...(options ? { options } : {}), ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}), ...(unit ? { unit } : {}), ...(placeholder ? { placeholder } : {}), ...(description ? { description } : {}), public: isPublic })),
  };
}

// Human-readable payment instructions for checkout responses and confirmation
// emails. Falls back to the legacy copy when bank/pickup settings are unset.
export function paymentInstructionsFor(method, s = {}) {
  if (method === 'bank_transfer') {
    const lines = [];
    if (s.bank_name) lines.push(s.bank_name);
    if (s.bank_bsb) lines.push(`BSB: ${s.bank_bsb}`);
    if (s.bank_account_number) lines.push(`Account: ${s.bank_account_number}${s.bank_account_name ? ` (${s.bank_account_name})` : ''}`);
    if (s.payment_reference_hint) lines.push(s.payment_reference_hint);
    if (!lines.length) return 'Bank transfer details will be emailed. Order held pending payment.';
    return ['Bank transfer — order held pending payment.', ...lines, 'We will confirm once received.'].join('\n');
  }
  if (method === 'pickup') {
    const where = s.pickup_address || 'Perth Studio';
    const how = s.pickup_instructions || 'You will receive a QR ticket.';
    return `Pickup from ${where} — pay on collection.\n${how}`;
  }
  if (method === 'cash') return 'Order placed — pay cash on collection/delivery. We\'ll confirm once received.';
  return 'Order placed — manual payment.';
}
