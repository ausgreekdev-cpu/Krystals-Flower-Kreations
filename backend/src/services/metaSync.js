// Meta Graph API — Facebook Catalog + Instagram Shopping sync (custom, no Shopify)
// Docs: https://developers.facebook.com/docs/marketing-api/catalog
// Requires: META_CATALOG_ID, META_ACCESS_TOKEN, FRONTEND_URL

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

export async function handleMetaWebhook(body) {
  // Store incoming webhook for review (IG comments, catalog diagnostics)
  // Verify X-Hub-Signature-256 with META_APP_SECRET
  return { received: true, at: new Date().toISOString() };
}
