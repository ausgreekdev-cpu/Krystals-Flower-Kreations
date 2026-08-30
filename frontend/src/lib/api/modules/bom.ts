import { req } from '../customClient';
export const bomApi = {
  materials: (token: string) => req<any[]>('/api/bom/materials', { token } as any),
  upsertMaterial: (body: any, token: string) => req('/api/bom/materials', { method: 'POST', body: JSON.stringify(body), token } as any),
  recipes: (token: string) => req<any[]>('/api/bom/recipes', { token } as any),
  lowStock: (token: string) => req<any[]>('/api/bom/low-stock', { token } as any),
  live: (params: { productId?: string; variantId?: string; qty?: number }) => req<any>(`/api/bom/live?${new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null).map(([k,v])=> [k,String(v)]) as any).toString()}`),
};