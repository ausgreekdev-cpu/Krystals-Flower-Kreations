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
  const { status, contentType, xml } = await fetchSitemap();
  assert.equal(status, 200);
  assert.match(contentType, /xml/);
  assert.ok(xml.includes('<urlset'), 'valid urlset root');
  // Origin is derived from the request host, not a hardcoded/env URL
  assert.ok(xml.includes(`<loc>${srv.base}/</loc>`), 'home present');
  assert.ok(xml.includes(`<loc>${srv.base}/shop</loc>`), 'shop present');
  assert.ok(xml.includes(`<loc>${srv.base}/privacy</loc>`), 'privacy present');
  assert.ok(xml.includes('/product/'), 'at least one product URL (seeded catalog)');
  assert.ok(xml.includes('/blog/'), 'at least one published post URL (seeded posts)');
});

test('sitemap honours x-forwarded-host and x-forwarded-proto (custom domain behind proxy)', async () => {
  const res = await fetch(`${srv.base}/api/sitemap.xml`, {
    headers: { 'x-forwarded-host': 'krystalsflowercreations.com.au', 'x-forwarded-proto': 'https' },
  });
  const xml = await res.text();
  assert.ok(xml.includes('<loc>https://krystalsflowercreations.com.au/</loc>'), 'custom domain origin');
  assert.ok(!xml.includes('netlify.app'), 'no netlify.app URLs');
  assert.ok(!xml.includes(`<loc>${srv.base}/</loc>`), 'request host not used when forwarded host present');
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
