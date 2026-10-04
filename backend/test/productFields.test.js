import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';

let srv;
let token;
let productId;
const createdFieldIds = [];
const uniq = Date.now().toString(36);

const auth = () => ({ Authorization: `Bearer ${token}` });

async function createField(label, type) {
  const res = await api(srv.base, '/api/products/fields', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ label, type }),
  });
  if (res.body?.id) createdFieldIds.push(res.body.id);
  return res;
}

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
  if (productId) await prisma.product.delete({ where: { id: productId } }).catch(() => {});
  // Key-based cleanup too — a failed assertion mid-test must not leave rows that
  // make the next run pass for the wrong reason (unique keys are burned otherwise).
  await prisma.productField.deleteMany({
    where: { key: { in: ['material', 'stem_count', 'material_again'] } },
  }).catch(() => {});
  await srv.close();
});

test('admin defines custom fields; public list reflects them; dups and guests rejected', async () => {
  const material = await createField('Material', 'text');
  assert.equal(material.status, 201, JSON.stringify(material.body));
  assert.equal(material.body.key, 'material', 'key auto-slugs from the label');
  assert.equal(material.body.type, 'text');

  const count = await createField('Stem count', 'number');
  assert.equal(count.status, 201, JSON.stringify(count.body));
  assert.equal(count.body.key, 'stem_count');

  const dup = await api(srv.base, '/api/products/fields', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ label: 'Material', type: 'text' }), // auto-slugs to the same key "material"
  });
  assert.equal(dup.status, 409, JSON.stringify(dup.body));
  assert.equal(dup.body.code, 'conflict');

  const guest = await api(srv.base, '/api/products/fields', {
    method: 'POST',
    body: JSON.stringify({ label: 'Sneaky', type: 'text' }),
  });
  assert.ok([401, 403].includes(guest.status), `expected 401/403, got ${guest.status}`);

  const pub = await api(srv.base, '/api/products/fields');
  assert.equal(pub.status, 200);
  const keys = pub.body.map((f) => f.key);
  assert.ok(keys.includes('material') && keys.includes('stem_count'), 'public list includes active defs');
  assert.ok(!pub.body.some((f) => f.id === undefined), 'no auth needed for the public list');
});

test('product create/update stores custom field values, returned publicly', async () => {
  const create = await api(srv.base, '/api/products', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({
      title: `Custom fields test ${uniq}`,
      slug: `cf-test-${uniq}`,
      price: 33,
      type: 'physical',
      customFields: { material: 'Recycled card', stem_count: 12 },
    }),
  });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  productId = create.body.id;
  assert.deepEqual(create.body.customFields, { material: 'Recycled card', stem_count: 12 }, 'values round-trip on create');

  const pub = await api(srv.base, `/api/products/cf-test-${uniq}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.body.customFields.material, 'Recycled card');
  assert.equal(pub.body.customFields.stem_count, 12);

  const patch = await api(srv.base, `/api/products/${productId}`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify({ customFields: { material: 'Kraft paper' } }),
  });
  assert.equal(patch.status, 200, JSON.stringify(patch.body));
  assert.deepEqual(patch.body.customFields, { material: 'Kraft paper' }, 'customFields replace wholesale so cleared values clear');

  const after = await api(srv.base, `/api/products/cf-test-${uniq}`);
  assert.equal(after.body.customFields.material, 'Kraft paper');
  assert.equal(after.body.customFields.stem_count, undefined, 'value absent after replacement');
});

test('values are validated against definitions (unknown key and wrong type → 400)', async () => {
  const unknown = await api(srv.base, `/api/products/${productId}`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify({ customFields: { not_a_field: 'x' } }),
  });
  assert.equal(unknown.status, 400, JSON.stringify(unknown.body));
  assert.equal(unknown.body.code, 'validation_failed');
  assert.match(unknown.body.error, /Unknown custom field/);

  const wrongType = await api(srv.base, `/api/products/${productId}`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify({ customFields: { stem_count: 'twelve' } }),
  });
  assert.equal(wrongType.status, 400, JSON.stringify(wrongType.body));
  assert.match(wrongType.body.error, /expects number/);
});

test('deleting a definition hides it publicly but keeps stored values', async () => {
  await api(srv.base, `/api/products/${productId}`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify({ customFields: { material: 'Recycled card' } }),
  });

  const material = (await api(srv.base, '/api/products/fields')).body.find((f) => f.key === 'material');
  assert.ok(material, 'material def exists before delete');
  const del = await api(srv.base, `/api/products/fields/${material.id}`, { method: 'DELETE', headers: auth() });
  assert.equal(del.status, 200, JSON.stringify(del.body));

  const pubList = await api(srv.base, '/api/products/fields');
  assert.ok(!pubList.body.some((f) => f.key === 'material'), 'soft-deleted def excluded from public list');

  const product = await api(srv.base, `/api/products/cf-test-${uniq}`);
  assert.equal(product.body.customFields.material, 'Recycled card', 'stored value survives definition deletion');

  const again = await api(srv.base, `/api/products/fields/${material.id}`, { method: 'DELETE', headers: auth() });
  assert.equal(again.status, 404, 'double delete → 404');
});
