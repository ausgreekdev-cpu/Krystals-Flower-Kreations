import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();

// Dynamic sitemap from products (for SEO, complements static frontend/public/sitemap.xml)
router.get('/sitemap.xml', asyncHandler(async (req, res) => {
  const origin = process.env.FRONTEND_URL?.split(',')[0] || 'https://krystalsflowerkreations.netlify.app';
  const products = await prisma.product.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true }, take: 500, orderBy: { updatedAt: 'desc' } });
  const urls = [
    { loc: `${origin}/`, changefreq: 'weekly', priority: '1.0' },
    { loc: `${origin}/shop`, changefreq: 'daily', priority: '0.9' },
    { loc: `${origin}/configurator`, changefreq: 'weekly', priority: '0.9' },
    { loc: `${origin}/workshops`, changefreq: 'weekly', priority: '0.8' },
    { loc: `${origin}/blog`, changefreq: 'weekly', priority: '0.6' },
    ...products.map(p => ({ loc: `${origin}/product/${p.slug}`, lastmod: p.updatedAt.toISOString().slice(0,10), changefreq: 'weekly', priority: '0.7' }))
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u=> `<url><loc>${u.loc}</loc>${u.lastmod?`<lastmod>${u.lastmod}</lastmod>`:''}<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('')}</urlset>`;
  res.header('Content-Type', 'application/xml');
  res.send(xml);
}));

export default router;
