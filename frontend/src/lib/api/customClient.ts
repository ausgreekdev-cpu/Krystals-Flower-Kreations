// Shared frontend API client — custom backend (mirrors mobile/core/api/customClient.ts)
// On Netlify, VITE_API_URL is empty and relative /api goes via /.netlify/functions/api redirect
export const BASE = import.meta.env.VITE_API_URL || '';

export interface ApiError extends Error {
  code?: string;
  status?: number;
  details?: unknown;
  requestId?: string;
  body?: any; // full response body (e.g. the duplicate payload on 409)
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
    err.body = body;
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
  // Self-service reset. forgot always resolves (the server never says whether
  // the address exists), reset consumes a single-use emailed token and returns
  // a ready session so the customer lands signed in.
  forgotPassword: (email: string) => req<{ ok: boolean; message: string }>('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) => req<{ ok: boolean; token: string; user: any }>('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
};

// Customer account area — order history + re-issued digital download links.
export const accountApi = {
  orders: (token: string) => req<{ orders: any[] }>('/api/account/orders', { token }),
  downloads: (token: string) => req<{ downloads: any[]; ordersWithDownloads: number }>('/api/account/downloads', { token }),
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
  // Abandoned-cart recovery: store an email against the cart (Cart page field
  // + debounced Checkout capture). Fire-and-forget from the callers.
  saveEmail: (cartId: string, email: string) => req<any>('/api/cart/email', { method: 'POST', body: JSON.stringify({ cartId, email }) }),
};
export const ordersApi = {
  checkout: (body: any, idempotencyKey?: string) => req<any>('/api/orders/checkout', { method: 'POST', body: JSON.stringify(body), idempotencyKey: idempotencyKey || (globalThis.crypto?.randomUUID?.()) }),
  paypalCreate: (body: any, idempotencyKey?: string) => req<any>('/api/orders/paypal/create', { method: 'POST', body: JSON.stringify(body), idempotencyKey: idempotencyKey || (globalThis.crypto?.randomUUID?.()) }),
  paypalCapture: (paypalOrderId: string) => req<any>('/api/orders/paypal/capture', { method: 'POST', body: JSON.stringify({ paypalOrderId }) }),
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
    paypalRefund: (id: string, token: string) => req<any>(`/api/orders/${id}/refund`, { method: 'POST', body: JSON.stringify({}), token }),
  },
  productFields: {
    list: () => req<any[]>('/api/products/fields'),
    create: (body: { label: string; type: string; key?: string }, token: string) => req<any>('/api/products/fields', { method: 'POST', body: JSON.stringify(body), token }),
    update: (id: string, body: { label?: string; position?: number }, token: string) => req<any>(`/api/products/fields/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    remove: (id: string, token: string) => req<any>(`/api/products/fields/${id}`, { method: 'DELETE', token }),
  },
  materialFields: {
    list: (token: string) => req<any[]>('/api/materials/fields', { token }),
    create: (body: { label: string; type: string; key?: string }, token: string) => req<any>('/api/materials/fields', { method: 'POST', body: JSON.stringify(body), token }),
    update: (id: string, body: { label?: string; position?: number }, token: string) => req<any>(`/api/materials/fields/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    remove: (id: string, token: string) => req<any>(`/api/materials/fields/${id}`, { method: 'DELETE', token }),
  },
  products: {
    list: (token: string) => req<any>(`/api/products?limit=100&all=1`, { token }),
    create: (body: any, token: string) => req<any>('/api/products', { method: 'POST', body: JSON.stringify(body), token }),
    update: (id: string, body: any, token: string) => req<any>(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    remove: (id: string, token: string) => req<any>(`/api/products/${id}`, { method: 'DELETE', token }),
    // One request per image, downscaled in the browser first — keeps each request
    // well under Netlify's ~6 MB function payload limit (phone photos are often 5–12 MB).
    // Per-file results: a failing file no longer aborts the rest of the batch.
    uploadImages: async (id: string, files: FileList | File[], token: string, onProgress?: (done: number, total: number) => void) => {
      const created: any[] = [];
      const failures: { name: string; error: string }[] = [];
      const list = Array.from(files);
      let done = 0;
      for (const f of list) {
        try {
          const fd = new FormData();
          fd.append('images', await downscaleImage(f), f.name.replace(/\.[^.]+$/, '') + '.jpg');
          created.push(...(await req<any[]>(`/api/products/${id}/images`, { method: 'POST', body: fd, token })));
        } catch (e: any) {
          failures.push({ name: f.name, error: e?.message || 'Upload failed' });
        } finally {
          done++;
          onProgress?.(done, list.length);
        }
      }
      return { created, failures };
    },
    deleteImage: (productId: string, imageId: string, token: string) => req<any>(`/api/products/${productId}/images/${imageId}`, { method: 'DELETE', token }),
    patchImage: (productId: string, imageId: string, body: { alt?: string }, token: string) => req<any>(`/api/products/${productId}/images/${imageId}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    reorderImages: (productId: string, order: string[], token: string) => req<any>(`/api/products/${productId}/images/order`, { method: 'PUT', body: JSON.stringify({ order }), token }),
    // Purchased digital template file — stored in the private bucket, served
    // only via the tokenized /api/dl route after payment.
    uploadSvg: (productId: string, file: File, token: string) => {
      const fd = new FormData();
      fd.append('file', file, file.name.replace(/\.[^.]+$/, '') + '.svg');
      return req<any>(`/api/products/${productId}/svg`, { method: 'POST', body: fd, token });
    },
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
    update: (id: string, body: any, token: string) => req<any>(`/api/purchase-orders/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    receive: (id: string, token: string) => req<any>(`/api/purchase-orders/${id}/receive`, { method: 'POST', token }),
    remove: (id: string, token: string) => req<any>(`/api/purchase-orders/${id}`, { method: 'DELETE', token }),
  },
  suppliers: {
    list: (token: string, q = '') => req<any[]>(`/api/suppliers${q ? `?q=${encodeURIComponent(q)}` : ''}`, { token }),
    get: (id: string, token: string) => req<any>(`/api/suppliers/${id}`, { token }),
    create: (body: any, token: string) => req<any>('/api/suppliers', { method: 'POST', body: JSON.stringify(body), token }),
    update: (id: string, body: any, token: string) => req<any>(`/api/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    remove: (id: string, token: string) => req<any>(`/api/suppliers/${id}`, { method: 'DELETE', token }),
  },
  materials: {
    list: (token: string) => req<any[]>('/api/materials', { token }),
    get: (id: string, token: string) => req<any>(`/api/materials/${id}`, { token }),
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
    list: (token?: string) => (token ? req<any[]>('/api/workshops?all=1', { token }) : req<any[]>('/api/workshops')),
    create: (body: any, token: string) => req<any>('/api/workshops', { method: 'POST', body: JSON.stringify(body), token }),
    update: (id: string, body: any, token: string) => req<any>(`/api/workshops/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    remove: (id: string, token: string) => req<any>(`/api/workshops/${id}`, { method: 'DELETE', token }),
    addSession: (workshopId: string, body: any, token: string) => req<any>(`/api/workshops/${workshopId}/sessions`, { method: 'POST', body: JSON.stringify(body), token }),
    updateSession: (sessionId: string, body: any, token: string) => req<any>(`/api/workshops/sessions/${sessionId}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    removeSession: (sessionId: string, token: string) => req<any>(`/api/workshops/sessions/${sessionId}`, { method: 'DELETE', token }),
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
  procedures: {
    list: (token: string, params: Record<string, string | number | undefined> = {}) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
      const s = q.toString();
      return req<any>(`/api/procedures${s ? `?${s}` : ''}`, { token });
    },
    get: (id: string, token: string) => req<any>(`/api/procedures/${id}`, { token }),
    revisions: (id: string, token: string) => req<any[]>(`/api/procedures/${id}/revisions`, { token }),
    create: (body: any, token: string) => req<any>('/api/procedures', { method: 'POST', body: JSON.stringify(body), token }),
    update: (id: string, body: any, token: string) => req<any>(`/api/procedures/${id}`, { method: 'PUT', body: JSON.stringify(body), token }),
    remove: (id: string, token: string) => req<any>(`/api/procedures/${id}`, { method: 'DELETE', token }),
    // One request per file — Netlify's ~6 MB function payload limit (matches
    // products.uploadImages); a failing file no longer aborts the batch.
    uploadMedia: async (id: string, files: FileList | File[], token: string, onProgress?: (done: number, total: number) => void) => {
      const created: any[] = [];
      const failures: { name: string; error: string }[] = [];
      const list = Array.from(files);
      let done = 0;
      for (const f of list) {
        try {
          const fd = new FormData();
          fd.append('files', f, f.name);
          created.push(...(await req<any[]>(`/api/procedures/${id}/media`, { method: 'POST', body: fd, token })));
        } catch (e: any) {
          failures.push({ name: f.name, error: e?.message || 'Upload failed' });
        } finally {
          done++;
          onProgress?.(done, list.length);
        }
      }
      return { created, failures };
    },
    addMediaUrl: (id: string, url: string, token: string) => req<any>(`/api/procedures/${id}/media/url`, { method: 'POST', body: JSON.stringify({ url }), token }),
    importContent: (url: string, token: string) => req<any>('/api/procedures/import-content', { method: 'POST', body: JSON.stringify({ url }), token }),
    reorderMedia: (id: string, mediaId: string, displayOrder: number, token: string) => req<any>(`/api/procedures/${id}/media/${mediaId}`, { method: 'PATCH', body: JSON.stringify({ displayOrder }), token }),
    deleteMedia: (id: string, mediaId: string, token: string) => req<any>(`/api/procedures/${id}/media/${mediaId}`, { method: 'DELETE', token }),
  },
  // Business document upload centre — private bucket, authed download only.
  documents: {
    list: (token: string, params: Record<string, string | number | undefined> = {}) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
      const s = q.toString();
      return req<any>(`/api/documents${s ? `?${s}` : ''}`, { token });
    },
    get: (id: string, token: string) => req<any>(`/api/documents/${id}`, { token }),
    // One file per request (Netlify ~6 MB payload) — the centre uploads sequentially.
    upload: (file: File, token: string, onDuplicate?: string) => {
      const fd = new FormData();
      fd.append('file', file, file.name);
      if (onDuplicate) fd.append('on_duplicate', onDuplicate);
      return req<{ document: any; deduped: boolean }>(`/api/documents`, { method: 'POST', body: fd, token });
    },
    // S3: metadata enrichment from the document text (own request budget —
    // the upload may already be busy with OCR).
    enrich: (id: string, token: string) =>
      req<{ document: any; enriched: any }>(`/api/documents/${id}/enrich`, { method: 'POST', token }),
    // S5: PDF with an invisible text layer (Ctrl-F works) from the OCR words
    searchablePdf: async (id: string, token: string) => {
      const res = await fetch(`${BASE}/api/documents/${id}/searchable.pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || res.statusText);
      }
      return res.blob();
    },
    // S4: the exact image the OCR engine sees (deskewed/prepared) + angle
    preprocessed: async (id: string, token: string) => {
      const res = await fetch(`${BASE}/api/documents/${id}/preprocessed`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || res.statusText);
      }
      return { blob: await res.blob(), angle: res.headers.get('X-Skew-Angle') || '0' };
    },
    // Multi-page scan: one document built from the captured pages (server
    // assembles the PDF and OCRs each page).
    assemble: (files: File[], title: string, token: string) => {
      const fd = new FormData();
      files.forEach((f, i) => fd.append('files', f, f.name || `page-${i + 1}.jpg`));
      fd.append('title', title);
      return req<{ document: any; deduped: boolean; pages: number }>(`/api/documents/assemble`, { method: 'POST', body: fd, token });
    },
    update: (id: string, body: any, token: string) => req<any>(`/api/documents/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    remove: (id: string, token: string) => req<any>(`/api/documents/${id}`, { method: 'DELETE', token }),
    // Auth'd fetch → blob (a plain <a href> can't carry the Bearer token)
    download: async (id: string, token: string) => {
      const res = await fetch(`${BASE}/api/documents/${id}/file`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || res.statusText);
      }
      return res.blob();
    },
    // 160px webp preview (M2) — only rows with a thumbRef call this
    thumb: async (id: string, token: string) => {
      const res = await fetch(`${BASE}/api/documents/${id}/thumb`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || res.statusText);
      }
      return res.blob();
    },
    // On-demand OCR (M4) — images via tesseract; 409 when text already exists
    ocr: (id: string, token: string, force = false) =>
      req<{ document: any; ocr: { chars: number; confidence: number } }>(
        `/api/documents/${id}/ocr${force ? '?force=1' : ''}`, { method: 'POST', token },
      ),
  },
  media: {
    folders: (token: string) => req<any[]>('/api/media/folders', { token }),
    createFolder: (token: string, body: { name: string; parentId?: string | null }) =>
      req<any>('/api/media/folders', { method: 'POST', body: JSON.stringify(body), token }),
    updateFolder: (id: string, body: any, token: string) => req<any>(`/api/media/folders/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    deleteFolder: (id: string, token: string) => req<any>(`/api/media/folders/${id}`, { method: 'DELETE', token }),
    list: (token: string, params: Record<string, string | number | boolean | undefined> = {}) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === '' || v === false) continue;
        q.set(k, v === true ? '1' : String(v));
      }
      const s = q.toString();
      return req<any>(`/api/media${s ? `?${s}` : ''}`, { token });
    },
    get: (id: string, token: string) => req<any>(`/api/media/${id}`, { token }),
    update: (id: string, body: any, token: string) => req<any>(`/api/media/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    remove: (id: string, token: string) => req<any>(`/api/media/${id}`, { method: 'DELETE', token }),
    restore: (id: string, token: string) => req<any>(`/api/media/${id}/restore`, { method: 'POST', token }),
    purge: (id: string, token: string) => req<any>(`/api/media/${id}/purge`, { method: 'DELETE', token }),
    attach: (token: string, body: { assetId: string; attachableType: string; attachableId: string; role?: string; sortOrder?: number }) =>
      req<any>('/api/media/attach', { method: 'POST', body: JSON.stringify(body), token }),
    attachments: (token: string, attachableType: string, attachableId: string) =>
      req<any[]>(`/api/media/attachments?attachableType=${encodeURIComponent(attachableType)}&attachableId=${encodeURIComponent(attachableId)}`, { token }),
    detach: (id: string, token: string) => req<any>(`/api/media/attachments/${id}`, { method: 'DELETE', token }),
    bulkUpdate: (token: string, body: any) => req<any>('/api/media/bulk/update', { method: 'POST', body: JSON.stringify(body), token }),
    bulkDelete: (token: string, ids: string[]) => req<any>('/api/media/bulk/delete', { method: 'POST', body: JSON.stringify({ ids }), token }),
    bulkRestore: (token: string, ids: string[]) => req<any>('/api/media/bulk/restore', { method: 'POST', body: JSON.stringify({ ids }), token }),
    bulkPurge: (token: string, ids: string[]) => req<any>('/api/media/bulk/purge', { method: 'POST', body: JSON.stringify({ ids }), token }),
    // Auth'd blob fetch (img src can't carry the Bearer token)
    blob: async (id: string, token: string, kind: 'thumb' | 'file' = 'thumb') => {
      const res = await fetch(`${BASE}/api/media/${id}/${kind}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error || res.statusText);
      }
      return res.blob();
    },
  },
  procedureImports: {
    analyze: (token: string, body: { documentId?: string; text?: string; sourceName?: string }) =>
      req<any>('/api/procedure-imports/analyze', { method: 'POST', body: JSON.stringify(body), token }),
    list: (token: string, status = 'pending') => req<any[]>(`/api/procedure-imports?status=${encodeURIComponent(status)}`, { token }),
    get: (id: string, token: string) => req<any>(`/api/procedure-imports/${id}`, { token }),
    update: (id: string, body: any, token: string) => req<any>(`/api/procedure-imports/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    approve: (id: string, body: any, token: string) => req<any>(`/api/procedure-imports/${id}/approve`, { method: 'POST', body: JSON.stringify(body), token }),
    reject: (id: string, note: string, token: string) => req<any>(`/api/procedure-imports/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }), token }),
    searchMaterials: (token: string, q: string) => req<any[]>(`/api/procedure-imports/materials/search?q=${encodeURIComponent(q)}`, { token }),
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
    reset: (keys: string[], token: string) => req<any>('/api/settings/reset', { method: 'POST', body: JSON.stringify({ keys }), token }),
    testEmail: (to: string, token: string) => req<any>('/api/settings/test-email', { method: 'POST', body: JSON.stringify({ to }), token }),
  },
  users: {
    list: (token: string) => req<any[]>('/api/users', { token }),
    create: (body: any, token: string) => req<any>('/api/users', { method: 'POST', body: JSON.stringify(body), token }),
    update: (id: string, body: any, token: string) => req<any>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
    remove: (id: string, token: string) => req<any>(`/api/users/${id}`, { method: 'DELETE', token }),
    resetPassword: (id: string, password: string, token: string) => req<any>(`/api/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }), token }),
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
    update: (id: string, body: { status?: string; notes?: string; refund?: boolean }, token: string) => req<any>(`/api/bookings/${id}`, { method: 'PATCH', body: JSON.stringify(body), token }),
  },
};
