import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';
import { deleteObjectByUrl } from '../src/services/storage.js';

// Product photo uploads: client limits, sequencing, alt/reorder/delete endpoints.
const T = (token) => ({ Authorization: `Bearer ${token}` });
const ALT_PREFIX = 'up-test-'; // cleanup marker — rows left by a crashed run are healed in before()

let srv, token, product;
let fileCounter = 0;

async function pngFile(name) {
  const buf = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 20, g: 120, b: 200 } } }).png().toBuffer();
  return new Blob([buf], { type: 'image/png' });
}

async function uploadFiles(productId, entries) {
  const fd = new FormData();
  for (const { name, blob } of entries) fd.append('images', blob, name);
  const res = await fetch(`${srv.base}/api/products/${productId}/images`, { method: 'POST', headers: T(token), body: fd });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function getProductImages() {
  const r = await api(srv.base, `/api/products/${product.slug}`);
  return r.body.images;
}

async function cleanUploadRows() {
  // Storage keys embed the product id (products/<id>-<time>-<rand>.jpg) — the
  // seeded placeholder url doesn't, so this only ever matches rows this suite created.
  const rows = await prisma.productImage.findMany({ where: { productId: product?.id, url: { contains: `products/${product?.id}-` } } });
  for (const row of rows) await deleteObjectByUrl(row.url).catch(() => {});
  await prisma.productImage.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
}

before(async () => {
  srv = await startServer();
  const login = await api(srv.base, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }) });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  token = login.body.token;
  const list = await api(srv.base, '/api/products?limit=100&all=1', { headers: T(token) });
  product = list.body.products.find((p) => p.slug === 'eucalyptus-paper-rose-bouquet-blush') || list.body.products[0];
  assert.ok(product, 'a seeded product exists');
  await cleanUploadRows();
});

after(async () => {
  await cleanUploadRows();
  await srv.close();
});

test('oversized file → 413 file_too_large', async () => {
  const big = new Blob([Buffer.alloc(6 * 1024 * 1024)], { type: 'image/png' });
  const r = await uploadFiles(product.id, [{ name: 'big.png', blob: big }]);
  assert.equal(r.status, 413);
  assert.equal(r.body.code, 'file_too_large');
});

test('disallowed MIME → 415 unsupported_media_type', async () => {
  const r = await uploadFiles(product.id, [{ name: 'notes.txt', blob: new Blob([Buffer.from('hello')], { type: 'text/plain' }) }]);
  assert.equal(r.status, 415);
  assert.equal(r.body.code, 'unsupported_media_type');
});

test('happy path: upload creates a row with sequential sortOrder', async () => {
  const before = await getProductImages();
  const expectedSort = (before.reduce((m, i) => Math.max(m, i.sortOrder), -1)) + 1;
  const r = await uploadFiles(product.id, [{ name: `${ALT_PREFIX}1.png`, blob: await pngFile('a') }]);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.length, 1);
  assert.equal(r.body[0].sortOrder, expectedSort);
  assert.ok(r.body[0].url, 'stored url');
  const after = await getProductImages();
  assert.equal(after.length, before.length + 1);
});

test('second upload continues the sequence (no sortOrder 0 ties)', async () => {
  const before = await getProductImages();
  const expectedSort = before.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1;
  const r = await uploadFiles(product.id, [{ name: `${ALT_PREFIX}2.png`, blob: await pngFile('b') }]);
  assert.equal(r.status, 201);
  assert.equal(r.body[0].sortOrder, expectedSort);
});

test('PATCH image alt text', async () => {
  const rows = await getProductImages();
  const target = rows.find((i) => i.alt?.startsWith(ALT_PREFIX));
  assert.ok(target, 'uploaded image present');
  const r = await api(srv.base, `/api/products/${product.id}/images/${target.id}`, { method: 'PATCH', headers: T(token), body: JSON.stringify({ alt: 'Blush roses close-up' }) });
  assert.equal(r.status, 200);
  assert.equal(r.body.alt, 'Blush roses close-up');
  const after = await getProductImages();
  assert.equal(after.find((i) => i.id === target.id).alt, 'Blush roses close-up');
});

test('PATCH rejects unknown fields (strict schema)', async () => {
  const rows = await getProductImages();
  const r = await api(srv.base, `/api/products/${product.id}/images/${rows[0].id}`, { method: 'PATCH', headers: T(token), body: JSON.stringify({ sortOrder: 99 }) });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'validation_failed');
});

test('PATCH image belonging to another product → 403', async () => {
  const list = await api(srv.base, '/api/products?limit=100&all=1', { headers: T(token) });
  const other = list.body.products.find((p) => p.id !== product.id && p.images?.length);
  assert.ok(other, 'another product with an image exists');
  const r = await api(srv.base, `/api/products/${product.id}/images/${other.images[0].id}`, { method: 'PATCH', headers: T(token), body: JSON.stringify({ alt: 'nope' }) });
  assert.equal(r.status, 403);
});

test('PUT order reverses the gallery', async () => {
  const before = await getProductImages();
  assert.ok(before.length >= 2, 'at least two images to reorder');
  const reversed = before.map((i) => i.id).reverse();
  const r = await api(srv.base, `/api/products/${product.id}/images/order`, { method: 'PUT', headers: T(token), body: JSON.stringify({ order: reversed }) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const after = await getProductImages();
  assert.deepEqual(after.map((i) => i.id), reversed);
  // restore ascending createdAt order for later assertions
  await api(srv.base, `/api/products/${product.id}/images/order`, { method: 'PUT', headers: T(token), body: JSON.stringify({ order: before.map((i) => i.id) }) });
});

test('PUT order rejects incomplete or foreign id lists', async () => {
  const rows = await getProductImages();
  const missing = await api(srv.base, `/api/products/${product.id}/images/order`, { method: 'PUT', headers: T(token), body: JSON.stringify({ order: rows.map((i) => i.id).slice(1) }) });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.code, 'invalid_order');
  const list = await api(srv.base, '/api/products?limit=100&all=1', { headers: T(token) });
  const other = list.body.products.find((p) => p.id !== product.id && p.images?.length);
  const foreign = await api(srv.base, `/api/products/${product.id}/images/order`, { method: 'PUT', headers: T(token), body: JSON.stringify({ order: [...rows.map((i) => i.id).slice(1), other.images[0].id] }) });
  assert.equal(foreign.status, 400);
  assert.equal(foreign.body.code, 'invalid_order');
});

test('image cap: filling to 12 works, one more → 409 image_limit', async () => {
  let rows = await getProductImages();
  const remaining = 12 - rows.length;
  for (let left = remaining; left > 0; ) {
    const n = Math.min(5, left);
    const entries = [];
    for (let i = 0; i < n; i++) entries.push({ name: `${ALT_PREFIX}cap-${fileCounter++}.png`, blob: await pngFile('c') });
    const r = await uploadFiles(product.id, entries);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    left -= n;
  }
  rows = await getProductImages();
  assert.equal(rows.length, 12, 'filled to cap');
  const overflow = await uploadFiles(product.id, [{ name: `${ALT_PREFIX}over.png`, blob: await pngFile('d') }]);
  assert.equal(overflow.status, 409);
  assert.equal(overflow.body.code, 'image_limit');
});

test('DELETE removes the image', async () => {
  const rows = await getProductImages();
  const target = rows.find((i) => i.alt?.startsWith(ALT_PREFIX));
  assert.ok(target, 'an uploaded image to delete');
  const r = await api(srv.base, `/api/products/${product.id}/images/${target.id}`, { method: 'DELETE', headers: T(token) });
  assert.equal(r.status, 200);
  assert.equal((await getProductImages()).some((i) => i.id === target.id), false);
});
