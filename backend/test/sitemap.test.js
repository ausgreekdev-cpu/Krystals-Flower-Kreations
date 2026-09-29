import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './helpers.js';
import prisma from '../src/lib/prisma.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

async function fetchSitemap() {
  const res = await fetch(`${srv.base}/api/sitemap.xml`);
  return { status: res.status, contentType: res.headers.get('content-type') || '', xml: await res.text() };
}

test('GET /api/sitemap.xml includes static pages, products and published posts', async () => {
  const origin = process.env.FRONTEND_URL?.split(',')[0] || 'https://krystalsflowercreations.com.au';
  const { status, contentType, xml } = await fetchSitemap();
  assert.equal(status, 200);
  assert.match(contentType, /xml/);
  assert.ok(xml.includes('<urlset'), 'valid urlset root');
  assert.ok(xml.includes(`<loc>${origin}/</loc>`), 'home present');
  assert.ok(xml.includes(`<loc>${origin}/shop</loc>`), 'shop present');
  assert.ok(xml.includes(`<loc>${origin}/privacy</loc>`), 'privacy present');
  assert.ok(xml.includes('/product/'), 'at least one product URL (seeded catalog)');
  assert.ok(xml.includes('/blog/'), 'at least one published post URL (seeded posts)');
});

test('draft posts are excluded from the sitemap', async () => {
  const suffix = Date.now().toString(36);
  const pubSlug = `sitemap-pub-${suffix}`;
  const draftSlug = `sitemap-draft-${suffix}`;
  await prisma.post.create({ data: { title: 'Sitemap pub', slug: pubSlug, status: 'published', publishedAt: new Date(), content: 'x' } });
  await prisma.post.create({ data: { title: 'Sitemap draft', slug: draftSlug, status: 'draft', content: 'x' } });
  try {
    const { xml } = await fetchSitemap();
    assert.ok(xml.includes(`/blog/${pubSlug}`), 'published post included');
    assert.ok(!xml.includes(draftSlug), 'draft post excluded');
  } finally {
    await prisma.post.deleteMany({ where: { slug: { in: [pubSlug, draftSlug] } } });
  }
});
