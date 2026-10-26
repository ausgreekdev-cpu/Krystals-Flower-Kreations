// Zustand store — Custom Flower Configurator
// Real-time price + craft ETA from BOM cost + labour

import { create } from 'zustand';

export interface ConfiguratorSpecState {
  paperColor: string;
  paperTexture: string;
  weight: string;
  stemCount: number;
  heightMm: number;
  templateId: string;
  addGreenery: boolean;
  vaseIncluded: boolean;
  domeIncluded: boolean;
  ledIncluded: boolean;
  palette: string | null;
  paperStockId: string | null;
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
  heightMm: 350,
  templateId: 'wattle-sprig',
  addGreenery: true,
  vaseIncluded: false,
  domeIncluded: false,
  ledIncluded: false,
  palette: null,
  paperStockId: null,
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
// paperPremiumPerStem is the sellable-paper premium (each paper has its own price, not a product)
export function estimateLocalPrice(spec: ConfiguratorSpecState, paperPremiumPerStem = 0): { unitPrice: number; totalPrice: number; estimatedMinutes: number } {
  const base = 45; // base bouquet
  const perStem = spec.stemCount * 9.5;
  const paperPremium = (Number(paperPremiumPerStem) || 0) * spec.stemCount;
  const heightAdj = spec.heightMm > 350 ? 18 : 8;
  const greenery = spec.addGreenery ? 12 : 0;
  const vase = spec.vaseIncluded ? 22 : 0;
  const dome = spec.domeIncluded ? 45 : 0;
  const led = spec.ledIncluded ? 18 : 0;
  const unitPrice = Math.round((base + perStem + paperPremium + greenery + vase + dome + led) * 100) / 100;
  const estimatedMinutes = Math.round(22 + spec.stemCount * 6 + (spec.heightMm / 60) + (spec.domeIncluded ? 10 : 0) + (spec.ledIncluded ? 3 : 0));
  return { unitPrice, totalPrice: unitPrice, estimatedMinutes };
}
