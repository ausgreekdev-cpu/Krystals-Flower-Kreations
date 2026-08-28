// Zustand store — Custom Flower Configurator
// Real-time price + craft ETA from BOM cost + labour

import { create } from 'zustand';

export interface ConfiguratorSpecState {
  paperColor: string;
  paperTexture: string;
  weight: string;
  stemCount: number;
  armatureHeightMm: number;
  templateId: string;
  addGreenery: boolean;
  vaseIncluded: boolean;
  notes: string;
}

interface ConfiguratorStore {
  spec: ConfiguratorSpecState;
  unitPrice: number;
  totalPrice: number;
  estimatedMinutes: number;
  isCalculating: boolean;
  // actions
  setSpec: (patch: Partial<ConfiguratorSpecState>) => void;
  setPricing: (p: { unitPrice: number; totalPrice: number; estimatedMinutes: number }) => void;
  reset: () => void;
}

const DEFAULT_SPEC: ConfiguratorSpecState = {
  paperColor: 'Blush',
  paperTexture: 'textured',
  weight: '65lb',
  stemCount: 7,
  armatureHeightMm: 350,
  templateId: 'wattle-sprig',
  addGreenery: true,
  vaseIncluded: false,
  notes: '',
};

export const useConfiguratorStore = create<ConfiguratorStore>((set) => ({
  spec: DEFAULT_SPEC,
  unitPrice: 89,
  totalPrice: 89,
  estimatedMinutes: 45,
  isCalculating: false,
  setSpec: (patch) => set((s) => ({ spec: { ...s.spec, ...patch } })),
  setPricing: (p) => set({ unitPrice: p.unitPrice, totalPrice: p.totalPrice, estimatedMinutes: p.estimatedMinutes }),
  reset: () => set({ spec: DEFAULT_SPEC, unitPrice: 89, totalPrice: 89, estimatedMinutes: 45 }),
}));

// Helper: local price estimator (fallback when API offline, Perth AUD GST-inclusive)
export function estimateLocalPrice(spec: ConfiguratorSpecState): { unitPrice: number; totalPrice: number; estimatedMinutes: number } {
  const base = 45; // base bouquet
  const perStem = spec.stemCount * 9.5;
  const armature = spec.armatureHeightMm > 350 ? 18 : 8;
  const greenery = spec.addGreenery ? 12 : 0;
  const vase = spec.vaseIncluded ? 22 : 0;
  const weightAdj = spec.weight === '110lb' ? 8 : spec.weight === '80lb' ? 4 : 0;
  const unitPrice = Math.round((base + perStem + armature + greenery + vase + weightAdj) * 100) / 100;
  const estimatedMinutes = Math.round(22 + spec.stemCount * 6 + (spec.armatureHeightMm / 60));
  return { unitPrice, totalPrice: unitPrice, estimatedMinutes };
}
