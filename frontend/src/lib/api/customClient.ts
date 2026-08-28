// Shared frontend API client — custom backend (mirrors mobile/core/api/customClient.ts)
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function req<T>(path: string, opts: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as any) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) throw new Error((await res.json().catch(() => ({ error: res.statusText }))).error);
  return res.json();
}

export const catalogApi = {
  list: (q = '') => req<{ products: any[]; nextCursor: string | null }>(`/api/products${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getBySlug: (slug: string) => req<any>(`/api/products/${slug}`),
};
export const cartApi = {
  get: (cartId?: string) => req<any>(`/api/cart`, { headers: cartId ? { 'x-cart-id': cartId } : undefined }),
  add: (body: any) => req<{ cartId: string; cart: any }>('/api/cart/add', { method: 'POST', body: JSON.stringify(body) }),
};
export const ordersApi = {
  checkout: (body: any) => req<any>('/api/orders/checkout', { method: 'POST', body: JSON.stringify(body) }),
  customCreate: (body: any, token?: string) => req<any>('/api/custom-orders', { method: 'POST', body: JSON.stringify(body), token }),
  customList: (token: string) => req<any[]>('/api/custom-orders', { token }),
  customMove: (id: string, state: string, token: string) => req<any>(`/api/custom-orders/${id}/state`, { method: 'PATCH', body: JSON.stringify({ state }), token }),
};
export const bomApi = {
  materials: (token: string) => req<any[]>('/api/bom/materials', { token }),
  upsertMaterial: (body: any, token: string) => req('/api/bom/materials', { method: 'POST', body: JSON.stringify(body), token }),
  recipes: (token: string) => req<any[]>('/api/bom/recipes', { token }),
  lowStock: (token: string) => req<any[]>('/api/bom/low-stock', { token }),
};
export const workshopsApi = {
  list: () => req<any[]>('/api/workshops'),
  book: (sessionId: string, body: any) => req<any>(`/api/workshops/sessions/${sessionId}/book`, { method: 'POST', body: JSON.stringify(body) }),
};
