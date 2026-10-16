// Cache policy for API responses.
//
// Public read endpoints (storefront products/posts/collections/workshops/
// settings) are safe to reuse across clients for a short window — the CDN
// edge cache (netlify/edge-functions/apiCache.ts) keys on these headers, and
// browsers reuse them for repeat navigations. Anything personalized (cart,
// orders, auth, staff `?all=1` views) must be `no-store`.
//
// TTLs stay short (30s browser / 60s edge + SWR): admin edits appear within
// a minute and Netlify atomic deploys invalidate the edge cache immediately.

export function publicCache(res, seconds = 30) {
  res.set('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=300`);
}

export function noStore(res) {
  res.set('Cache-Control', 'no-store');
}
