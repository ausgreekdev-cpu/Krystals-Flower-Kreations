// Meta Graph API — Facebook Catalog + Instagram Shopping sync (custom, no Shopify)
// Docs: https://developers.facebook.com/docs/marketing-api/catalog
// Requires: META_CATALOG_ID, META_ACCESS_TOKEN, FRONTEND_URL

import { createHmac } from 'crypto';

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

export async function handleMetaWebhook(body, headers = {}) {
  // Verify X-Hub-Signature-256 with META_APP_SECRET (Meta signs with the app secret)
  const secret = process.env.META_APP_SECRET;
  if (secret) {
    const sig = headers['x-hub-signature-256'] || headers['X-Hub-Signature-256'] || '';
    const expected = `sha256=${createHmac('sha256', secret).update(typeof body === 'string' ? body : JSON.stringify(body)).digest('hex')}`;
    if (!sig || sig !== expected) {
      const err = new Error('Invalid X-Hub-Signature-256');
      err.status = 401;
      throw err;
    }
  }
  // Store incoming webhook for review (IG comments, catalog diagnostics)
  return { received: true, at: new Date().toISOString() };
}
