// Catalog API — split from monolith (was frontend/src/lib/api/customClient.ts)
import { req } from '../customClient';
export const catalogApi = {
  list: (q = '') => req<{ products: any[]; nextCursor: string | null }>(`/api/products${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getBySlug: (slug: string) => req<any>(`/api/products/${slug}`),
  collections: () => req<any[]>(`/api/collections`),
};
