import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';

let srv;
let token;
let materialId;
let materialFieldId;
const sku = `RM-TEST-FLD-${Date.now().toString(36)}`;
const auth = () => ({ Authorization: `Bearer ${token}` });

before(async () => {
  srv = await startServer();
  const login = await api(srv.base, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }),
  });
  assert.equal(login.status, 200, 'seeded developer login');
  token = login.body.token;
  const mat = await api(srv.base, '/api/materials', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ sku, name: 'Field test material', unit: 'sheet' }),
  });
  assert.equal(mat.status, 201, JSON.stringify(mat.body));
  materialId = mat.body.id;
});

after(async () => {
  await prisma.productField.deleteMany({ where: { key: { in: ['finish'] } } }).catch(() => {});
  await prisma.rawMaterial.delete({ where: { id: materialId } }).catch(() => {});
  await prisma.rawMaterial.deleteMany({ where: { sku: { startsWith: 'RM-TEST-FLD-' } } }).catch(() => {});
  await srv.close();
});

test('material field definitions are staff-only and hidden from the product fields list', async () => {
  const guestList = await api(srv.base, '/api/materials/fields');
  assert.equal(guestList.status, 401, 'materials fields list requires auth');

  const created = await api(srv.base, '/api/materials/fields', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ label: 'Finish', type: 'text' }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.key, 'finish');
  assert.equal(created.body.entityType, 'material');
  materialFieldId = created.body.id;

  const list = await api(srv.base, '/api/materials/fields', { headers: auth() });
  assert.equal(list.status, 200);
  assert.ok((list.body || []).some((f) => f.key === 'finish'), 'material list includes finish');

  const productFields = await api(srv.base, '/api/products/fields'); // public
  assert.equal(productFields.status, 200);
  assert.ok(!(productFields.body || []).some((f) => f.key === 'finish'), 'product list must NOT include material fields');
});

test('material customFields round-trip; unknown keys and wrong types rejected', async () => {
  const ok = await api(srv.base, `/api/materials/${materialId}`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify({ customFields: { finish: 'Matte' } }),
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(ok.body.customFields, { finish: 'Matte' });

  const detail = await api(srv.base, `/api/materials/${materialId}`, { headers: auth() });
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.customFields, { finish: 'Matte' }, 'detail endpoint returns customFields');

  const unknown = await api(srv.base, `/api/materials/${materialId}`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify({ customFields: { not_a_field: 'x' } }),
  });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.code, 'validation_failed');

  const wrongType = await api(srv.base, `/api/materials/${materialId}`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify({ customFields: { finish: 42 } }),
  });
  assert.equal(wrongType.status, 400);
  assert.equal(wrongType.body.code, 'validation_failed');
});

test('field keys are unique across entities (global namespace)', async () => {
  const dup = await api(srv.base, '/api/products/fields', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ label: 'Finish', key: 'finish', type: 'text' }),
  });
  assert.equal(dup.status, 409, JSON.stringify(dup.body));
  assert.equal(dup.body.code, 'conflict');
});

test('soft-deleting a material field keeps stored values but stops rendering it', async () => {
  const del = await api(srv.base, `/api/materials/fields/${materialFieldId}`, { method: 'DELETE', headers: auth() });
  assert.equal(del.status, 200, JSON.stringify(del.body));

  const list = await api(srv.base, '/api/materials/fields', { headers: auth() });
  assert.ok(!(list.body || []).some((f) => f.id === materialFieldId), 'deleted field gone from list');

  const detail = await api(srv.base, `/api/materials/${materialId}`, { headers: auth() });
  assert.deepEqual(detail.body.customFields, { finish: 'Matte' }, 'stored value retained');

  const again = await api(srv.base, `/api/materials/fields/${materialFieldId}`, { method: 'DELETE', headers: auth() });
  assert.equal(again.status, 404, 'double delete → 404');
});

test('GET /api/materials/:id — staff 200, missing 404, guest 401', async () => {
  const ok = await api(srv.base, `/api/materials/${materialId}`, { headers: auth() });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.sku, sku);

  const missing = await api(srv.base, '/api/materials/cmz000000000000000000000', { headers: auth() });
  assert.equal(missing.status, 404);

  const guest = await api(srv.base, `/api/materials/${materialId}`);
  assert.equal(guest.status, 401);
});

test('guests cannot define material fields', async () => {
  const res = await api(srv.base, '/api/materials/fields', {
    method: 'POST',
    body: JSON.stringify({ label: 'Sneaky', type: 'text' }),
  });
  assert.equal(res.status, 401);
});

test('customer tokens cannot read material fields (staff-only list)', async () => {
  const email = `cf-cust-${Date.now().toString(36)}@example.com`;
  const reg = await api(srv.base, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Field Tester', email, password: 'secret123' }),
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  const custHeaders = { Authorization: `Bearer ${reg.body.token}` };

  const list = await api(srv.base, '/api/materials/fields', { headers: custHeaders });
  assert.equal(list.status, 403, 'customer token must not read material field defs');

  const productsStillPublic = await api(srv.base, '/api/products/fields');
  assert.equal(productsStillPublic.status, 200, 'product fields list stays public');
});

test('field definitions cannot be mutated through the wrong entity route', async () => {
  const ts = Date.now().toString(36);
  const prod = await api(srv.base, '/api/products/fields', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ label: `Cross Product ${ts}`, type: 'text' }),
  });
  assert.equal(prod.status, 201, JSON.stringify(prod.body));

  const mat = await api(srv.base, '/api/materials/fields', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ label: `Cross Material ${ts}`, type: 'text' }),
  });
  assert.equal(mat.status, 201, JSON.stringify(mat.body));

  // product def via material routes → 404
  const patchWrong = await api(srv.base, `/api/materials/fields/${prod.body.id}`, {
    method: 'PATCH', headers: auth(), body: JSON.stringify({ label: 'Hijacked' }),
  });
  assert.equal(patchWrong.status, 404, 'material PATCH must not touch product def');
  const delWrong = await api(srv.base, `/api/materials/fields/${prod.body.id}`, { method: 'DELETE', headers: auth() });
  assert.equal(delWrong.status, 404, 'material DELETE must not touch product def');

  // material def via product routes → 404
  const delWrong2 = await api(srv.base, `/api/products/fields/${mat.body.id}`, { method: 'DELETE', headers: auth() });
  assert.equal(delWrong2.status, 404, 'product DELETE must not touch material def');

  // untouched originals
  const stillThere = await api(srv.base, '/api/products/fields');
  assert.ok((stillThere.body || []).some((f) => f.id === prod.body.id && f.label === `Cross Product ${ts}`), 'product def intact');
  const matList = await api(srv.base, '/api/materials/fields', { headers: auth() });
  assert.ok((matList.body || []).some((f) => f.id === mat.body.id && f.label === `Cross Material ${ts}`), 'material def intact');

  // cleanup
  await api(srv.base, `/api/products/fields/${prod.body.id}`, { method: 'DELETE', headers: auth() });
  await api(srv.base, `/api/materials/fields/${mat.body.id}`, { method: 'DELETE', headers: auth() });
});
