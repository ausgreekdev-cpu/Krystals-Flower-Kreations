// Business-identity display helpers (footer, About, JSON-LD).
// Placeholders like "XX XXX XXX XXX" must never render as a real ABN — an
// ABN counts only when it carries at least 8 digits.
export function realAbn(value) {
  const v = String(value || '').trim();
  return v.replace(/\D/g, '').length >= 8 ? v : '';
}
