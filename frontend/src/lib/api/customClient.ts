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
  update: (body: any) => req<any>('/api/cart/update', { method: 'POST', body: JSON.stringify(body) }),
  clear: (cartId: string) => req<any>(`/api/cart/${cartId}`, { method: 'DELETE' }),
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

export const adminApi = {
  orders: {
    list: (token: string) => req<any[]>('/api/orders', { token }),
    get: (orderNumber: string, token: string) => req<any>(`/api/orders/${orderNumber}`, { token }),
    updateStatus: (id: string, status: string, note: string, token: string) => req<any>(`/api/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, note }), token }),
  },
  products: {
    list: (token: string) => req<any>(`/api/products?limit=100&all=1`, { token }),
    create: (body: any, token: string) => req<any>('/api/products', { method: 'POST', body: JSON.stringify(body), token }),
    update: (id: string, body: any, token: string) => req<any>(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    remove: (id: string, token: string) => req<any>(`/api/products/${id}`, { method: 'DELETE', token }),
    uploadImages: (id: string, files: FileList, token: string) => {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append('images', f));
      return req<any>(`/api/products/${id}/images`, { method: 'POST', body: fd as any, token, headers: {} as any });
    },
    deleteImage: (productId: string, imageId: string, token: string) => req<any>(`/api/products/${productId}/images/${imageId}`, { method: 'DELETE', token }),
  },
  inventory: {
    levels: (token: string) => req<any[]>('/api/inventory/levels', { token }),
    adjust: (body: any, token: string) => req<any>('/api/inventory/adjust', { method: 'POST', body: JSON.stringify(body), token }),
    locations: (token: string) => req<any[]>('/api/inventory/locations', { token }),
    createLocation: (body: any, token: string) => req<any>('/api/inventory/locations', { method: 'POST', body: JSON.stringify(body), token }),
    reconciliation: (token: string) => req<any[]>('/api/inventory/reconciliation', { token }),
  },
  materials: {
    list: (token: string) => req<any[]>('/api/materials', { token }),
    lowStock: (token: string) => req<any[]>('/api/materials/low-stock', { token }),
    adjust: (id: string, qty: number, reason: string, token: string) => req<any>(`/api/materials/${id}/adjust`, { method: 'POST', body: JSON.stringify({ qty, reason }), token }),
    create: (body: any, token: string) => req<any>('/api/materials', { method: 'POST', body: JSON.stringify(body), token }),
  },
  workshops: {
    list: () => req<any[]>('/api/workshops'),
    create: (body: any, token: string) => req<any>('/api/workshops', { method: 'POST', body: JSON.stringify(body), token }),
    addSession: (workshopId: string, body: any, token: string) => req<any>(`/api/workshops/${workshopId}/sessions`, { method: 'POST', body: JSON.stringify(body), token }),
  },
  reviews: {
    pending: (token: string) => req<any[]>('/api/reviews/pending', { token }),
    approve: (id: string, token: string) => req<any>(`/api/reviews/${id}/approve`, { method: 'POST', token }),
    remove: (id: string, token: string) => req<any>(`/api/reviews/${id}`, { method: 'DELETE', token }),
  },
  posts: {
    list: (token: string) => req<any[]>(`/api/posts?status=all`, { token }),
    create: (body: any, token: string) => req<any>('/api/posts', { method: 'POST', body: JSON.stringify(body), token }),
    update: (id: string, body: any, token: string) => req<any>(`/api/posts/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    remove: (id: string, token: string) => req<any>(`/api/posts/${id}`, { method: 'DELETE', token }),
  },
  pos: {
    current: (token: string) => req<any>('/api/pos/session/current', { token }),
    open: (body: any, token: string) => req<any>('/api/pos/session/open', { method: 'POST', body: JSON.stringify(body), token }),
    close: (id: string, closingCash: number, token: string) => req<any>(`/api/pos/session/${id}/close`, { method: 'POST', body: JSON.stringify({ closingCash }), token }),
  },
  settings: {
    get: () => req<any>('/api/settings'),
    save: (body: any, token: string) => req<any>('/api/settings', { method: 'PUT', body: JSON.stringify(body), token }),
  },
  users: {
    list: (token: string) => req<any[]>('/api/users', { token }),
  },
  loyalty: {
    leaderboard: () => req<any[]>('/api/loyalty/leaderboard'),
  },
  notebook: {
    posts: () => req<any[]>('/api/posts?tag=notebook'),
  },
  discounts: {
    list: (token: string) => req<any[]>('/api/discounts/admin', { token }),
    create: (body: any, token: string) => req<any>('/api/discounts/admin', { method: 'POST', body: JSON.stringify(body), token }),
    update: (id: string, body: any, token: string) => req<any>(`/api/discounts/admin/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    remove: (id: string, token: string) => req<any>(`/api/discounts/admin/${id}`, { method: 'DELETE', token }),
  },
  bookings: {
    list: (token: string) => req<any[]>('/api/bookings', { token }),
  },
  pos: {
    current: (token: string) => req<any>('/api/pos/session/current', { token }),
    open: (body: any, token: string) => req<any>('/api/pos/session/open', { method: 'POST', body: JSON.stringify(body), token }),
    close: (id: string, closingCash: number, token: string) => req<any>(`/api/pos/session/${id}/close`, { method: 'POST', body: JSON.stringify({ closingCash }), token }),
    sessions: (token: string) => req<any[]>('/api/pos/sessions', { token }),
    sales: (token: string) => req<any[]>('/api/pos/sessions/sales', { token }),
  },
};
