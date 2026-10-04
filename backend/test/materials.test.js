import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';

let srv;
let token;
const uniq = Date.now().toString(36);
const skuA = `RM-TEST-A-${uniq}`;
const skuB = `RM-TEST-B-${uniq}`;
const auth = () => ({ Authorization: `Bearer ${token}` });

before(async () => {
  srv = await startServer();
  const login = await api(srv.base, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }),
  });
  assert.equal(login.status, 200, 'seeded developer login');
  token = login.body.token;
});

after(async () => {
  await prisma.rawMaterial.deleteMany({ where: { sku: { in: [skuA, skuB] } } }).catch(() => {});
  await srv.close();
});

test('material attributes round-trip through POST and GET list', async () => {
  const res = await api(srv.base, '/api/materials', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({
      sku: skuA, name: '65lb Canson Cardstock – Test', unit: 'sheet',
      brand: 'Canson', weightValue: 65, weightUnit: 'lb',
      colour: 'Blush', size: 'A4', supplier: 'Canson AU',
    }),
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.brand, 'Canson');
  assert.equal(res.body.weightValue, 65);
  assert.equal(res.body.weightUnit, 'lb');
  assert.equal(res.body.colour, 'Blush');
  assert.equal(res.body.size, 'A4');

  const list = await api(srv.base, '/api/materials', { headers: auth() });
  assert.equal(list.status, 200);
  const row = (list.body || []).find((m) => m.sku === skuA);
  assert.ok(row, 'created material appears in list');
  assert.equal(row.brand, 'Canson');
  assert.equal(row.weightValue, 65);
  assert.equal(row.size, 'A4');
});

test('PATCH updates attributes and null-clears them', async () => {
  const created = await api(srv.base, '/api/materials', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ sku: skuB, name: 'Test patch material', unit: 'sheet', brand: 'Seed', weightValue: 80, weightUnit: 'lb', colour: 'Sage', size: 'A3' }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const patch = await api(srv.base, `/api/materials/${created.body.id}`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify({ brand: 'Fabriano', weightValue: null, weightUnit: null, colour: null, size: null }),
  });
  assert.equal(patch.status, 200, JSON.stringify(patch.body));
  assert.equal(patch.body.brand, 'Fabriano');
  assert.equal(patch.body.weightValue, null);
  assert.equal(patch.body.weightUnit, null);
  assert.equal(patch.body.colour, null);
  assert.equal(patch.body.size, null);
});

test('invalid weightUnit is rejected with 400', async () => {
  const res = await api(srv.base, '/api/materials', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ sku: `RM-TEST-kg-${uniq}`, name: 'Bad unit material', weightValue: 65, weightUnit: 'kg' }),
  });
  assert.equal(res.status, 400, JSON.stringify(res.body));
  assert.equal(res.body.code, 'validation_failed');
  const gone = await prisma.rawMaterial.findUnique({ where: { sku: `RM-TEST-kg-${uniq}` } });
  assert.equal(gone, null, 'invalid payload must not create a row');
});

test('guests cannot read or write materials', async () => {
  const get = await api(srv.base, '/api/materials');
  assert.equal(get.status, 401);
  const post = await api(srv.base, '/api/materials', {
    method: 'POST',
    body: JSON.stringify({ sku: `RM-TEST-guest-${uniq}`, name: 'Guest material' }),
  });
  assert.equal(post.status, 401);
});
