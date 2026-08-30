// Shared frontend API client — custom backend (mirrors mobile/core/api/customClient.ts)
// On Netlify, VITE_API_URL is empty and relative /api goes via /.netlify/functions/api redirect
const BASE = import.meta.env.VITE_API_URL || '';

export interface ApiError extends Error {
  code?: string;
  status?: number;
  details?: unknown;
  requestId?: string;
}

export async function req<T>(path: string, opts: RequestInit & { token?: string; idempotencyKey?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as any) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  // X-Request-Id for tracing
  headers['X-Request-Id'] = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText, code: 'unknown' }));
    const err = new Error(body.error || res.statusText) as ApiError;
    err.code = body.code || (res.status === 409 ? 'conflict' : res.status === 429 ? 'rate_limited' : res.status === 422 ? 'unprocessable' : 'bad_request');
    err.status = res.status;
    err.details = body.details;
    err.requestId = body.requestId || res.headers.get('X-Request-Id') || undefined;
    // Handle 429 retry hint
    if (res.status === 429) {
      const retry = res.headers.get('Retry-After');
      if (retry) (err as any).retryAfter = parseInt(retry, 10);
    }
    throw err;
  }
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
  checkout: (body: any, idempotencyKey?: string) => req<any>('/api/orders/checkout', { method: 'POST', body: JSON.stringify(body), idempotencyKey: idempotencyKey || (globalThis.crypto?.randomUUID?.()) }),
  customCreate: (body: any, token?: string, idempotencyKey?: string) => req<any>('/api/custom-orders', { method: 'POST', body: JSON.stringify(body), token, idempotencyKey: idempotencyKey || (globalThis.crypto?.randomUUID?.()) }),
  customList: (token: string) => req<any[]>('/api/custom-orders', { token }),
  customMove: (id: string, state: string, token: string) => req<any>(`/api/custom-orders/${id}/state`, { method: 'PATCH', body: JSON.stringify({ state }), token }),
  get: (orderNumber: string) => req<any>(`/api/orders/${orderNumber}`),
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
