// Meta Graph API — Facebook Catalog + Instagram Shopping sync (custom, no Shopify)
// Docs: https://developers.facebook.com/docs/marketing-api/catalog
// Requires: META_CATALOG_ID, META_ACCESS_TOKEN, FRONTEND_URL

import { createHmac, timingSafeEqual } from 'crypto';
import { isProductionLike } from '../lib/auth.js';

const GRAPH = 'https://graph.facebook.com/v19.0';

export async function pushProductToCatalog(product) {
  const token = process.env.META_ACCESS_TOKEN;
  const catalogId = process.env.META_CATALOG_ID;
  if (!token || !catalogId) {
    return { status: 'disabled', reason: 'Meta not configured — set META_CATALOG_ID + META_ACCESS_TOKEN' };
  }
  const payload = {
    name: product.title,
    description: product.description?.slice(0, 5000) || product.title,
    price: `${Number(product.price).toFixed(2)} AUD`,
    currency: 'AUD',
    availability: product.isActive ? 'in stock' : 'out of stock',
    condition: 'new',
    retailer_id: product.sku || product.id,
    image_url: product.images?.[0]?.url || product.ogImageUrl || '',
    url: `${process.env.FRONTEND_URL}/product/${product.slug}`,
    brand: "Krystal's Flower Kreations",
  };
  try {
    const res = await fetch(`${GRAPH}/${catalogId}/products?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { status: 'error', payload, error: data.error?.message || res.statusText, data };
    return { status: 'synced', payload, data, note: 'Pushed to Meta Catalog → Instagram Shopping' };
  } catch (e) {
    return { status: 'error', payload, error: e.message };
  }
}

export async function handleMetaWebhook(body, headers = {}, rawBody = null) {
  // Verify X-Hub-Signature-256 over the RAW request bytes (Meta signs the exact
  // payload; re-serialised JSON would not match) with a constant-time compare.
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    if (isProductionLike()) throw Object.assign(new Error('Meta webhook not configured (META_APP_SECRET missing)'), { status: 503, code: 'not_configured' });
    return { received: true, verified: false, at: new Date().toISOString() };
  }
  const sig = String(headers['x-hub-signature-256'] || '');
  const payload = rawBody ?? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw Object.assign(new Error('Invalid X-Hub-Signature-256'), { status: 401, code: 'invalid_signature' });
  }
  // Store incoming webhook for review (IG comments, catalog diagnostics)
  return { received: true, verified: true, at: new Date().toISOString() };
}
