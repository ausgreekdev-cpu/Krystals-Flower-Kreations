// Supabase Edge Function — Meta Catalog custom sync (no Shopify)
// Deploy: supabase functions deploy meta-sync --no-verify-jwt
// Env: META_CATALOG_ID, META_ACCESS_TOKEN, FRONTEND_URL

const GRAPH = 'https://graph.facebook.com/v19.0';

Deno.serve(async (req) => {
  const { product } = await req.json().catch(() => ({ product: null }));
  const catalogId = Deno.env.get('META_CATALOG_ID');
  const token = Deno.env.get('META_ACCESS_TOKEN');
  if (!catalogId || !token) return new Response(JSON.stringify({ status: 'disabled', reason: 'Meta not configured' }), { headers: { 'Content-Type': 'application/json' } });

  const payload = {
    name: product.title,
    description: product.description?.slice(0, 5000) || product.title,
    price: `${Number(product.price).toFixed(2)} AUD`,
    currency: 'AUD',
    availability: product.isActive ? 'in stock' : 'out of stock',
    condition: 'new',
    retailer_id: product.sku || product.id,
    image_url: product.images?.[0]?.url || product.ogImageUrl || '',
    url: `${Deno.env.get('FRONTEND_URL')}/product/${product.slug}`,
    brand: "Krystal's Flower Kreations",
  };

  // Uncomment when live:
  // const res = await fetch(`${GRAPH}/${catalogId}/products?access_token=${token}`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  // const data = await res.json();

  return new Response(JSON.stringify({ status: 'pending', payload, note: 'Stub — enable fetch when credentials live' }), { headers: { 'Content-Type': 'application/json' } });
});
