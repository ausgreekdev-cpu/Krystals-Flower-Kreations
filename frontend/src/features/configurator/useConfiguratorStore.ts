import { create } from 'zustand';
export interface ConfiguratorSpecState {
  paperColor: string; paperTexture: string; weight: string; stemCount: number; armatureHeightMm: number; templateId: string; addGreenery: boolean; vaseIncluded: boolean; notes: string;
}
const DEFAULT_SPEC: ConfiguratorSpecState = { paperColor: 'Blush', paperTexture: 'textured', weight: '65lb', stemCount: 7, armatureHeightMm: 350, templateId: 'wattle-sprig', addGreenery: true, vaseIncluded: false, notes: '' };
export const useConfiguratorStore = create<{ spec: ConfiguratorSpecState; unitPrice: number; totalPrice: number; estimatedMinutes: number; setSpec: (p: Partial<ConfiguratorSpecState>)=>void }>((set)=>({
  spec: DEFAULT_SPEC, unitPrice: 89, totalPrice: 89, estimatedMinutes: 45,
  setSpec: (patch)=> set(s=> ({ spec: { ...s.spec, ...patch } }))
}));
// Local price estimate. Prices come from the storefront settings
// (configurator_floor / per_stem / vase / greenery) so admin edits show up here.
export function estimateLocalPrice(spec: ConfiguratorSpecState, s: Record<string, string | undefined> = {}){
  const num = (v: string | undefined, d: number) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
  const base = num(s.configurator_floor, 45);
  const perStem = spec.stemCount * num(s.configurator_per_stem, 9.5);
  const armature = spec.armatureHeightMm > 350 ? 18 : 8;
  const greenery = spec.addGreenery ? num(s.configurator_greenery, 12) : 0;
  const vase = spec.vaseIncluded ? num(s.configurator_vase, 22) : 0;
  const weightAdj = spec.weight === '110lb' ? 8 : spec.weight === '80lb' ? 4 : 0;
  const unitPrice = Math.round((base + perStem + armature + greenery + vase + weightAdj) * 100) / 100;
  const estimatedMinutes = Math.round(22 + spec.stemCount * 6 + (spec.armatureHeightMm / 60));
  return { unitPrice, totalPrice: unitPrice, estimatedMinutes };
}
