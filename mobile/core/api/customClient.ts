// Custom backend client — Krystal's Flower Kreations (no Shopify)
// Talks to Express + Prisma at process.env.EXPO_PUBLIC_API_URL
// Covers catalog/cart/orders/BOM/Kanban/workshops/POS/meta

const BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

type Opts = RequestInit & { token?: string; idempotencyKey?: string };

export interface ApiError extends Error {
  code?: string;
  status?: number;
  details?: unknown;
  requestId?: string;
  retryAfter?: number;
}

async function req<T>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as any),
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  headers['X-Request-Id'] = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText, code: 'unknown' }));
    const err = new Error(body.error || `API ${res.status}`) as ApiError;
    err.code = body.code || (res.status === 409 ? 'conflict' : res.status === 429 ? 'rate_limited' : res.status === 422 ? 'unprocessable' : 'bad_request');
    err.status = res.status;
    err.details = body.details;
    err.requestId = body.requestId || res.headers.get('X-Request-Id') || undefined;
    if (res.status === 429) {
      const retry = res.headers.get('Retry-After');
      if (retry) err.retryAfter = parseInt(retry, 10);
    }
    throw err;
  }
  return res.json();
}

// ── Catalog ────────────────────────────────
export const catalogApi = {
  list: (q = '') => req<{ products: any[]; nextCursor: string | null }>(`/api/products${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getBySlug: (slug: string) => req<any>(`/api/products/${slug}`),
  collections: () => req<any[]>(`/api/collections`),
};

// ── Cart ─────────────────────────────────
export const cartApi = {
  get: (cartId?: string) => req<any>(`/api/cart`, { headers: cartId ? { 'x-cart-id': cartId } : undefined }),
  add: (body: { productId: string; variantId?: string | null; quantity: number; cartId?: string | null }) =>
    req<{ cartId: string; cart: any }>('/api/cart/add', { method: 'POST', body: JSON.stringify(body) }),
  update: (body: { itemId: string; quantity: number }) =>
    req('/api/cart/update', { method: 'POST', body: JSON.stringify(body) }),
};

// ── Orders & Custom Art Kanban ───────────
export const ordersApi = {
  checkout: (body: any, idempotencyKey?: string) => req<any>('/api/orders/checkout', { method: 'POST', body: JSON.stringify(body), idempotencyKey: idempotencyKey || (globalThis.crypto?.randomUUID?.()) }),
  get: (orderNumber: string) => req<any>(`/api/orders/${orderNumber}`),
  // Custom art (BOM-aware)
  customCreate: (body: any, token?: string, idempotencyKey?: string) => req<any>('/api/custom-orders', { method: 'POST', body: JSON.stringify(body), token, idempotencyKey: idempotencyKey || (globalThis.crypto?.randomUUID?.()) }),
  customList: (token: string) => req<any[]>('/api/custom-orders', { token }),
  customMove: (id: string, state: string, token: string) =>
    req<any>(`/api/custom-orders/${id}/state`, { method: 'PATCH', body: JSON.stringify({ state }), token }),
};

// ── BOM / Raw Materials (admin) ──────────
export const bomApi = {
  materials: (token: string) => req<any[]>('/api/bom/materials', { token }),
  upsertMaterial: (body: any, token: string) => req('/api/bom/materials', { method: 'POST', body: JSON.stringify(body), token }),
  recipes: (token: string) => req<any[]>('/api/bom/recipes', { token }),
  upsertRecipe: (body: any, token: string) => req('/api/bom/recipes', { method: 'POST', body: JSON.stringify(body), token }),
  lowStock: (token: string) => req<any[]>('/api/bom/low-stock', { token }),
};

// ── Workshops & Tickets ──────────────────
export const workshopsApi = {
  list: () => req<any[]>('/api/workshops'),
  get: (slug: string) => req<any>(`/api/workshops/${slug}`),
  book: (sessionId: string, body: any) => req<any>(`/api/workshops/sessions/${sessionId}/book`, { method: 'POST', body: JSON.stringify(body) }),
  checkIn: (qrPayload: string, token: string) => req<any>('/api/tickets/check-in', { method: 'POST', body: JSON.stringify({ qrPayload }), token }),
};

// ── Blog & POS ───────────────────────────
export const blogApi = {
  list: () => req<any[]>('/api/posts'),
  get: (slug: string) => req<any>(`/api/posts/${slug}`),
};

export const posApi = {
  open: (body: any, token: string) => req<any>('/api/pos/session/open', { method: 'POST', body: JSON.stringify(body), token }),
  current: (token: string) => req<any>('/api/pos/session/current', { token }),
  sale: (body: any, token: string) => req<any>('/api/pos/sale', { method: 'POST', body: JSON.stringify(body), token }),
  close: (id: string, body: any, token: string) => req<any>(`/api/pos/session/${id}/close`, { method: 'POST', body: JSON.stringify(body), token }),
};

export const metaApi = {
  status: (token: string) => req<any>('/api/meta/status', { token }),
  sync: (productId: string, token: string) => req<any>(`/api/meta/sync/${productId}`, { method: 'POST', token }),
  syncAll: (token: string) => req<any>('/api/meta/sync-all', { method: 'POST', token }),
};
