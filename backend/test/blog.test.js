import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';

let srv;
let token;
before(async () => {
  srv = await startServer();
  const login = await api(srv.base, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }),
  });
  assert.equal(login.status, 200, 'seeded developer login');
  token = login.body.token;
});
after(async () => { await srv.close(); });

test('create post with meta fields + comma tags string, then public GET returns them', async () => {
  const slug = `blog-meta-${Date.now().toString(36)}`;
  const { status, body } = await api(srv.base, '/api/posts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: 'Blog meta test post',
      slug,
      excerpt: 'An excerpt for the meta test',
      content: '## Section\n\n**bold** and *italic* body',
      status: 'published',
      tags: 'testing,seo,meta',
      metaTitle: 'Meta title for the blog test',
      metaDescription: 'Meta description for the blog test, kept short.',
    }),
  });
  assert.equal(status, 201, JSON.stringify(body));
  assert.equal(body.tags, 'testing,seo,meta', 'tags round-trip as a string');
  assert.equal(body.metaTitle, 'Meta title for the blog test');
  assert.equal(body.metaDescription, 'Meta description for the blog test, kept short.');
  try {
    const pub = await api(srv.base, `/api/posts/${slug}`);
    assert.equal(pub.status, 200);
    assert.equal(pub.body.metaTitle, 'Meta title for the blog test');
    assert.equal(pub.body.metaDescription, 'Meta description for the blog test, kept short.');
    assert.ok(Array.isArray(pub.body.products), 'products relation included publicly');

    const list = await api(srv.base, '/api/posts?status=all', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body) && list.body.some((p) => p.slug === slug), 'appears in staff list');
  } finally {
    const post = await prisma.post.findUnique({ where: { slug } });
    if (post) await prisma.post.delete({ where: { id: post.id } });
  }
});

test('PATCH with productIds replaces the related products', async () => {
  const slug = `blog-rel-${Date.now().toString(36)}`;
  const product = await prisma.product.findFirst();
  assert.ok(product, 'seeded catalog needed');
  const created = await api(srv.base, '/api/posts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: 'Blog relation test', slug, content: 'body', status: 'draft', tags: 'testing' }),
  });
  assert.equal(created.status, 201);
  try {
    const patched = await api(srv.base, `/api/posts/${created.body.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ productIds: [product.id], tags: 'testing,related' }),
    });
    assert.equal(patched.status, 200, JSON.stringify(patched.body));

    const pub = await api(srv.base, `/api/posts/${slug}`);
    assert.equal(pub.status, 200);
    assert.equal(pub.body.products.length, 1, 'one related product after PATCH');
    assert.equal(pub.body.products[0].productId, product.id);
    assert.equal(pub.body.tags, 'testing,related');
  } finally {
    const post = await prisma.post.findUnique({ where: { slug } });
    if (post) await prisma.post.delete({ where: { id: post.id } });
  }
});
