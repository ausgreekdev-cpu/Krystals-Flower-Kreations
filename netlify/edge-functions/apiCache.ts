// apiCache — CDN edge cache for public GET API reads.
//
// The API runs on a Netlify function with the database in ap-southeast-2 while
// functions execute in the US — uncached reads measure 2-7s (several Prisma
// round trips per request). This function caches anonymous GET responses at
// the CDN edge so repeat hits (shoppers, crawlers, the meta/markdown edge
// enrich fetches) are served in milliseconds.
//
// ── What is cached ────────────────────────────────────────────────────────
// Anonymous GET/HEAD on the registered public-read paths only (netlify.toml
// `cache = "manual"` blocks). Anything with an Authorization header or a
// cookie bypasses the cache entirely; non-200s and other methods are never
// cached (no cache headers on those responses). Cart/checkout/auth/orders
// are not registered here at all.
//
// ── Freshness ─────────────────────────────────────────────────────────────
// Netlify-CDN-Cache-Control: s-maxage=60, stale-while-revalidate=600 — data
// is at most a minute stale at the edge, and Netlify atomic deploys void the
// cache immediately. The function-level Cache-Control (max-age=30) still
// governs browsers. Staff must never be served cached public payloads:
// ?all=1 uses a different URL (own cache key) and authed requests bypass.
//
// Errors never take the API down: the handler is fully try/caught and falls
// back to the un-cached origin response.

type EdgeContext = { next(): Promise<Response> };

const SKIP_HEADERS = ['authorization', 'cookie', 'x-cart-id'];

export default async function apiCache(request: Request, context: EdgeContext): Promise<Response | undefined> {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') return;
    if (SKIP_HEADERS.some((h) => request.headers.get(h))) return;

    const origin = await context.next();
    if (!origin.ok) return origin;

    const res = new Response(origin.body, origin);
    res.headers.set('Netlify-CDN-Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
    res.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
    return res;
  } catch {
    return context.next().catch(() =>
      new Response(JSON.stringify({ error: 'Temporary failure', code: 'upstream_error' }), {
        status: 502,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      }),
    );
  }
}
