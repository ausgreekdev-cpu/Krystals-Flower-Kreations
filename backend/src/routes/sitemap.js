import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();

// Dynamic sitemap from products + published posts (robots.txt → /sitemap.xml → this route)
router.get('/sitemap.xml', asyncHandler(async (req, res) => {
  // Derive origin from the request so the custom domain never emits
  // *.netlify.app URLs (FRONTEND_URL on Netlify points at the subdomain).
  const host = req.get('x-forwarded-host')?.split(',')[0].trim() || req.get('host');
  const proto = req.get('x-forwarded-proto')?.split(',')[0].trim() || req.protocol;
  const origin = host ? `${proto}://${host}` : (process.env.FRONTEND_URL?.split(',')[0] || 'https://krystalsflowercreations.com.au');
  const [products, posts, withOccasions] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true }, take: 500, orderBy: { updatedAt: 'desc' } }),
    prisma.post.findMany({ where: { status: 'published' }, select: { slug: true, publishedAt: true, updatedAt: true }, take: 200, orderBy: { publishedAt: 'desc' } }),
    prisma.product.findMany({ where: { isActive: true, occasions: { isEmpty: false } }, select: { occasions: true }, take: 500 }),
  ]);
  // Curated landing pages (Occasion.jsx KNOWN map) must always be listed —
  // product-derived slugs vanish entirely when the catalog is empty.
  const CURATED_OCCASIONS = ['wedding', 'birthday', 'mothers-day', 'anniversary', 'sympathy', 'graduation', 'housewarming'];
  const occasionSlugs = [...new Set([...CURATED_OCCASIONS, ...withOccasions.flatMap(p => p.occasions)])].slice(0, 50);
  const urls = [
    { loc: `${origin}/`, changefreq: 'weekly', priority: '1.0' },
    { loc: `${origin}/shop`, changefreq: 'daily', priority: '0.9' },
    { loc: `${origin}/configurator`, changefreq: 'weekly', priority: '0.9' },
    { loc: `${origin}/workshops`, changefreq: 'weekly', priority: '0.8' },
    { loc: `${origin}/blog`, changefreq: 'weekly', priority: '0.6' },
    { loc: `${origin}/notebook`, changefreq: 'weekly', priority: '0.7' },
    { loc: `${origin}/privacy`, changefreq: 'yearly', priority: '0.3' },
    ...occasionSlugs.map(o => ({ loc: `${origin}/occasions/${o}`, changefreq: 'weekly', priority: '0.7' })),
    ...products.map(p => ({ loc: `${origin}/product/${p.slug}`, lastmod: p.updatedAt.toISOString().slice(0,10), changefreq: 'weekly', priority: '0.7' })),
    ...posts.map(p => ({ loc: `${origin}/blog/${p.slug}`, lastmod: (p.publishedAt || p.updatedAt).toISOString().slice(0,10), changefreq: 'monthly', priority: '0.6' }))
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u=> `<url><loc>${u.loc}</loc>${u.lastmod?`<lastmod>${u.lastmod}</lastmod>`:''}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('')}</urlset>`;
  res.header('Content-Type', 'application/xml');
  res.send(xml);
}));

export default router;
