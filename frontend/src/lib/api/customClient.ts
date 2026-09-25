// Shared frontend API client — custom backend (mirrors mobile/core/api/customClient.ts)
// On Netlify, VITE_API_URL is empty and relative /api goes via /.netlify/functions/api redirect
const BASE = import.meta.env.VITE_API_URL || '';

export interface ApiError extends Error {
  code?: string;
  status?: number;
  details?: unknown;
  requestId?: string;
}

// ---- Session (staff/customer JWT) ----
export function getToken(): string { return localStorage.getItem('token') || ''; }
export function getUser(): any { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; } }
export function setSession(token: string, user: any) { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)); }
export function clearSession() { localStorage.removeItem('token'); localStorage.removeItem('user'); }

export async function req<T>(path: string, opts: RequestInit & { token?: string; idempotencyKey?: string } = {}): Promise<T> {
  // Let the browser set multipart/form-data + boundary for FormData bodies
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const headers: Record<string, string> = { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...(opts.headers as any) };
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
    // Expired/invalid session on an authenticated call → back to login
    if (res.status === 401 && opts.token && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      clearSession();
      window.location.assign(`/login?expired=1&next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
    // Handle 429 retry hint
    if (res.status === 429) {
      const retry = res.headers.get('Retry-After');
      if (retry) (err as any).retryAfter = parseInt(retry, 10);
    }
    throw err;
  }
  return res.json();
}

// Resize to max 1600px JPEG in the browser. Falls back to the original file if
// the browser can't decode it (server will then validate/reject it).
async function downscaleImage(file: File, max = 1600, quality = 0.85): Promise<Blob> {
  if (typeof createImageBitmap === 'undefined' || !file.type.startsWith('image/')) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024 && file.type === 'image/jpeg') { bmp.close?.(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
    return blob || file;
  } catch { return file; }
}

export const authApi = {
  login: (email: string, password: string) => req<{ token: string; user: any }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: (token: string) => req<{ user: any }>('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } }),
};

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
    // One request per image, downscaled in the browser first — keeps each request
    // well under Netlify's ~6 MB function payload limit (phone photos are often 5–12 MB).
    uploadImages: async (id: string, files: FileList, token: string) => {
      const created: any[] = [];
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append('images', await downscaleImage(f), f.name.replace(/\.[^.]+$/, '') + '.jpg');
        created.push(...(await req<any[]>(`/api/products/${id}/images`, { method: 'POST', body: fd, token })));
      }
      return created;
    },
    deleteImage: (productId: string, imageId: string, token: string) => req<any>(`/api/products/${productId}/images/${imageId}`, { method: 'DELETE', token }),
  },
  inventory: {
    levels: (token: string) => req<any[]>('/api/inventory/levels', { token }),
    adjust: (body: any, token: string) => req<any>('/api/inventory/adjust', { method: 'POST', body: JSON.stringify(body), token }),
    set: (body: any, token: string) => req<any>('/api/inventory/set', { method: 'POST', body: JSON.stringify(body), token }),
    threshold: (levelId: string, lowStockThreshold: number | null, token: string) => req<any>('/api/inventory/threshold', { method: 'POST', body: JSON.stringify({ levelId, lowStockThreshold }), token }),
    lowStock: (token: string) => req<any[]>('/api/inventory/low-stock', { token }),
    movements: (token: string, params = {}) => { const q = new URLSearchParams(params).toString(); return req<any>(`/api/inventory/movements${q ? `?${q}` : ''}`, { token }); },
    locations: (token: string) => req<any[]>('/api/inventory/locations', { token }),
    createLocation: (body: any, token: string) => req<any>('/api/inventory/locations', { method: 'POST', body: JSON.stringify(body), token }),
    updateLocation: (id: string, body: any, token: string) => req<any>(`/api/inventory/locations/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    deleteLocation: (id: string, token: string) => req<any>(`/api/inventory/locations/${id}`, { method: 'DELETE', token }),
    reconciliation: (token: string) => req<any[]>('/api/inventory/reconciliation', { token }),
    stocktake: (body: any, token: string) => req<any>('/api/inventory/stocktake', { method: 'POST', body: JSON.stringify(body), token }),
    stocktakes: (token: string) => req<any[]>('/api/inventory/stocktakes', { token }),
    stocktakeDetail: (id: string, token: string) => req<any>(`/api/inventory/stocktakes/${id}`, { token }),
    transfer: (body: any, token: string) => req<any>('/api/inventory/transfer', { method: 'POST', body: JSON.stringify(body), token }),
    lots: (token: string) => req<any[]>('/api/inventory/lots', { token }),
    createLot: (body: any, token: string) => req<any>('/api/inventory/lots', { method: 'POST', body: JSON.stringify(body), token }),
    expiring: (token: string) => req<any[]>('/api/inventory/expiring', { token }),
  },
  purchaseOrders: {
    list: (token: string) => req<any[]>('/api/purchase-orders', { token }),
    get: (id: string, token: string) => req<any>(`/api/purchase-orders/${id}`, { token }),
    create: (body: any, token: string) => req<any>('/api/purchase-orders', { method: 'POST', body: JSON.stringify(body), token }),
    receive: (id: string, token: string) => req<any>(`/api/purchase-orders/${id}/receive`, { method: 'POST', token }),
    remove: (id: string, token: string) => req<any>(`/api/purchase-orders/${id}`, { method: 'DELETE', token }),
  },
  materials: {
    list: (token: string) => req<any[]>('/api/materials', { token }),
    lowStock: (token: string) => req<any[]>('/api/materials/low-stock', { token }),
    adjust: (id: string, qty: number, reason: string, token: string) => req<any>(`/api/materials/${id}/adjust`, { method: 'POST', body: JSON.stringify({ qty, reason }), token }),
    set: (id: string, onHand: number, reason: string, token: string) => req<any>(`/api/materials/${id}/set`, { method: 'POST', body: JSON.stringify({ onHand, reason }), token }),
    create: (body: any, token: string) => req<any>('/api/materials', { method: 'POST', body: JSON.stringify(body), token }),
    update: (id: string, body: any, token: string) => req<any>(`/api/materials/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    remove: (id: string, token: string) => req<any>(`/api/materials/${id}`, { method: 'DELETE', token }),
  },
  variants: {
    list: (productId: string, token: string) => req<any[]>(`/api/variants/products/${productId}/variants`, { token }),
    create: (productId: string, body: any, token: string) => req<any>(`/api/variants/products/${productId}/variants`, { method: 'POST', body: JSON.stringify(body), token }),
    update: (id: string, body: any, token: string) => req<any>(`/api/variants/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    remove: (id: string, token: string) => req<any>(`/api/variants/${id}`, { method: 'DELETE', token }),
  },
  customers: {
    list: (token: string, q = '') => req<any[]>(`/api/users/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`, { token }),
    get: (id: string, token: string) => req<any>(`/api/users/${id}`, { token }),
    setLoyalty: (email: string, body: any, token: string) => req<any>('/api/loyalty/set', { method: 'POST', body: JSON.stringify({ email, ...body }), token }),
  },
  shipping: {
    list: (token: string) => req<any[]>('/api/shipping/zones', { token }),
    createZone: (body: any, token: string) => req<any>('/api/shipping/zones', { method: 'POST', body: JSON.stringify(body), token }),
    updateZone: (id: string, body: any, token: string) => req<any>(`/api/shipping/zones/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    deleteZone: (id: string, token: string) => req<any>(`/api/shipping/zones/${id}`, { method: 'DELETE', token }),
    addRate: (zoneId: string, body: any, token: string) => req<any>(`/api/shipping/zones/${zoneId}/rates`, { method: 'POST', body: JSON.stringify(body), token }),
    updateRate: (id: string, body: any, token: string) => req<any>(`/api/shipping/rates/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    deleteRate: (id: string, token: string) => req<any>(`/api/shipping/rates/${id}`, { method: 'DELETE', token }),
  },
  workshops: {
    list: () => req<any[]>('/api/workshops'),
    create: (body: any, token: string) => req<any>('/api/workshops', { method: 'POST', body: JSON.stringify(body), token }),
    addSession: (workshopId: string, body: any, token: string) => req<any>(`/api/workshops/${workshopId}/sessions`, { method: 'POST', body: JSON.stringify(body), token }),
  },
  reviews: {
    pending: (token: string) => req<any[]>('/api/reviews/pending', { token }),
    approve: (id: string, token: string) => req<any>(`/api/reviews/${id}/approve`, { method: 'POST', token }),
    reject: (id: string, token: string) => req<any>(`/api/reviews/${id}/reject`, { method: 'POST', token }),
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
    sessions: (token: string) => req<any[]>('/api/pos/sessions', { token }),
    sales: (token: string) => req<any[]>('/api/pos/sessions/sales', { token }),
  },
  settings: {
    get: () => req<any>('/api/settings'),
    all: (token: string) => req<any>('/api/settings/all', { token }),
    schema: (token: string) => req<any>('/api/settings/schema', { token }),
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
  bom: {
    recipes: (token: string) => req<any[]>('/api/bom/recipes', { token }),
    getRecipe: (id: string, token: string) => req<any>(`/api/bom/recipes/${id}`, { token }),
    createRecipe: (body: any, token: string) => req<any>('/api/bom/recipes', { method: 'POST', body: JSON.stringify(body), token }),
    updateRecipe: (id: string, body: any, token: string) => req<any>(`/api/bom/recipes/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    deleteRecipe: (id: string, token: string) => req<any>(`/api/bom/recipes/${id}`, { method: 'DELETE', token }),
    estimate: (id: string, qty: number, token: string) => req<any>(`/api/bom/recipes/${id}/estimate?qty=${qty}`, { token }),
  },
  collections: {
    list: (token: string) => req<any[]>(`/api/collections?all=1`, { token }),
    create: (body: any, token: string) => req<any>('/api/collections', { method: 'POST', body: JSON.stringify(body), token }),
    update: (id: string, body: any, token: string) => req<any>(`/api/collections/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    remove: (id: string, token: string) => req<any>(`/api/collections/${id}`, { method: 'DELETE', token }),
    addProduct: (id: string, productId: string, sortOrder: number, token: string) => req<any>(`/api/collections/${id}/products`, { method: 'POST', body: JSON.stringify({ productId, sortOrder }), token }),
    removeProduct: (id: string, productId: string, token: string) => req<any>(`/api/collections/${id}/products/${productId}`, { method: 'DELETE', token }),
  },
  meta: {
    status: (token: string) => req<any>('/api/meta/status', { token }),
    sync: (productId: string, token: string) => req<any>(`/api/meta/sync/${productId}`, { method: 'POST', token }),
    syncAll: (token: string) => req<any>('/api/meta/sync-all', { method: 'POST', token }),
  },
  bookings: {
    list: (token: string) => req<any[]>('/api/bookings', { token }),
  },
};
