import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export interface ConfiguratorSpecState {
  paperColor: string; paperTexture: string; weight: string; stemCount: number; heightMm: number; templateId: string; addGreenery: boolean; vaseIncluded: boolean; domeIncluded: boolean; ledIncluded: boolean; palette: string | null; paperStockId: string | null; notes: string;
}
export const DEFAULT_SPEC: ConfiguratorSpecState = { paperColor: 'Blush', paperTexture: 'textured', weight: '65lb', stemCount: 7, heightMm: 350, templateId: 'wattle-sprig', addGreenery: true, vaseIncluded: false, domeIncluded: false, ledIncluded: false, palette: null, paperStockId: null, notes: '' };
// Only the spec persists — prices are always derived live (estimateLocalPrice).
export const useConfiguratorStore = create<{ spec: ConfiguratorSpecState; setSpec: (p: Partial<ConfiguratorSpecState>)=>void }>()(persist((set)=>({
  spec: DEFAULT_SPEC,
  setSpec: (patch)=> set(s=> ({ spec: { ...s.spec, ...patch } }))
}), {
  // Draft recovery: the design survives reload/navigation.
  name: 'kfk_cfg_spec',
  partialize: (s) => ({ spec: s.spec }),
}));
// Local price estimate. Prices come from the storefront settings
// (configurator_floor / per_stem / vase / greenery) so admin edits show up here.
// Quote = server formula (decided 2026-10-16): floor + stems×per_stem +
// add-ons — the exact lower branch of customOrders.js `max(floor + stems×per_stem,
// BOM cost × margin) + add-ons`. A materials-heavy bouquet can still be
// charged above the quote via the BOM×margin branch (the order-create
// response shows the authoritative total) — the frame/paper-weight
// surcharges the old formula invented are gone; the server never billed them.
// Sellable paper premium (per stem) is added on top of the floor — each uploaded
// paper has its own pricePremiumPerStem but is not a product.
export function estimateLocalPrice(spec: ConfiguratorSpecState, s: Record<string, string | undefined> = {}, paperPremiumPerStem = 0){
  const num = (v: string | undefined, d: number) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
  const base = num(s.configurator_floor, 45);
  const perStem = spec.stemCount * num(s.configurator_per_stem, 9.5);
  const paperPremium = (Number(paperPremiumPerStem) || 0) * spec.stemCount;
  const weightSurcharge = spec.weight === '80lb' ? num(s.configurator_weight_80lb, 0) : spec.weight === '110lb' ? num(s.configurator_weight_110lb, 0) : 0;
  const heightExtra = Math.max(0, Number(spec.heightMm) - 400);
  const heightSurcharge = Math.floor(heightExtra / 100) * num(s.configurator_height_per_100mm, 0);
  const greenery = spec.addGreenery ? num(s.configurator_greenery, 12) : 0;
  const vase = spec.vaseIncluded ? num(s.configurator_vase, 22) : 0;
  const dome = spec.domeIncluded ? num(s.configurator_dome, 45) : 0;
  const led = spec.ledIncluded ? num(s.configurator_led, 18) : 0;
  const unitPrice = Math.round((base + perStem + paperPremium + weightSurcharge + heightSurcharge + greenery + vase + dome + led) * 100) / 100;
  const estimatedMinutes = Math.round(22 + spec.stemCount * 6 + (spec.heightMm / 60) + (spec.domeIncluded ? 10 : 0) + (spec.ledIncluded ? 3 : 0));
  return { unitPrice, totalPrice: unitPrice, estimatedMinutes };
}

// ── Shareable design URLs ───────────────────────────────────────────────────
// /configurator?s=<base64url JSON> restores a design (wins over localStorage).
// v1 payload = the spec fields only; everything is clamped back into range so
// a hand-edited or truncated link can never crash the configurator.
const SHARE_VERSION = 1;
const clamp = (v: number, min: number, max: number, dflt: number) =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : dflt;

export function specToShareParam(spec: ConfiguratorSpecState): string {
  const payload = { v: SHARE_VERSION, ...spec };
  const json = JSON.stringify(payload);
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function specFromShareParam(param: string | null): Partial<ConfiguratorSpecState> | null {
  if (!param) return null;
  try {
    const b64 = param.replace(/-/g, '+').replace(/_/g, '/');
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    const raw = JSON.parse(json);
    if (raw?.v !== SHARE_VERSION) return null;
    const out: Partial<ConfiguratorSpecState> = {};
    if (typeof raw.paperColor === 'string' && raw.paperColor.length <= 40) out.paperColor = raw.paperColor;
    if (typeof raw.paperTexture === 'string') out.paperTexture = raw.paperTexture;
    if (typeof raw.weight === 'string') out.weight = raw.weight;
    if (raw.stemCount !== undefined) out.stemCount = clamp(Number(raw.stemCount), 1, 99, 7);
    if (raw.heightMm !== undefined) out.heightMm = clamp(Number(raw.heightMm), 150, 600, 350);
    if (typeof raw.templateId === 'string' && raw.templateId.length <= 40) out.templateId = raw.templateId;
    for (const flag of ['addGreenery', 'vaseIncluded', 'domeIncluded', 'ledIncluded'] as const) {
      if (typeof raw[flag] === 'boolean') out[flag] = raw[flag];
    }
    if (typeof raw.palette === 'string' && raw.palette.length <= 40) out.palette = raw.palette;
    if (typeof raw.paperStockId === 'string' && raw.paperStockId.length <= 100) out.paperStockId = raw.paperStockId;
    if (typeof raw.notes === 'string') out.notes = raw.notes.slice(0, 2000);
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}
