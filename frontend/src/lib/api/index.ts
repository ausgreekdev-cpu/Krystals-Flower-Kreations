// Split API monolith — re-exports for backwards compat (was single customClient.ts)
// New code should import from modules: import { catalogApi } from '@/lib/api/modules/catalog'
export * from './customClient';
export * from './modules/catalog';
export * from './modules/cart';
export * from './modules/orders';
export * from './modules/workshops';
export * from './modules/bom';
