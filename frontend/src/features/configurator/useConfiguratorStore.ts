import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export interface ConfiguratorSpecState {
  paperColor: string; paperTexture: string; weight: string; stemCount: number; armatureHeightMm: number; templateId: string; addGreenery: boolean; vaseIncluded: boolean; domeIncluded: boolean; ledIncluded: boolean; palette: string | null; notes: string;
}
export const DEFAULT_SPEC: ConfiguratorSpecState = { paperColor: 'Blush', paperTexture: 'textured', weight: '65lb', stemCount: 7, armatureHeightMm: 350, templateId: 'wattle-sprig', addGreenery: true, vaseIncluded: false, domeIncluded: false, ledIncluded: false, palette: null, notes: '' };
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
// NOTE: the server re-prices at order creation (customOrders.js) — it takes
// max(floor + stems×per_stem, BOM cost × margin) + add-ons, so the final total
// can differ from this estimate when a BOM recipe exists. The armature/weight
// surcharges below are quote-side only (the server does not bill them).
export function estimateLocalPrice(spec: ConfiguratorSpecState, s: Record<string, string | undefined> = {}){
  const num = (v: string | undefined, d: number) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
  const base = num(s.configurator_floor, 45);
  const perStem = spec.stemCount * num(s.configurator_per_stem, 9.5);
  const armature = spec.armatureHeightMm > 350 ? 18 : 8;
  const greenery = spec.addGreenery ? num(s.configurator_greenery, 12) : 0;
  const vase = spec.vaseIncluded ? num(s.configurator_vase, 22) : 0;
  const dome = spec.domeIncluded ? num(s.configurator_dome, 45) : 0;
  const led = spec.ledIncluded ? num(s.configurator_led, 18) : 0;
  const weightAdj = spec.weight === '110lb' ? 8 : spec.weight === '80lb' ? 4 : 0;
  const unitPrice = Math.round((base + perStem + armature + greenery + vase + dome + led + weightAdj) * 100) / 100;
  const estimatedMinutes = Math.round(22 + spec.stemCount * 6 + (spec.armatureHeightMm / 60) + (spec.domeIncluded ? 10 : 0) + (spec.ledIncluded ? 3 : 0));
  return { unitPrice, totalPrice: unitPrice, estimatedMinutes };
}
