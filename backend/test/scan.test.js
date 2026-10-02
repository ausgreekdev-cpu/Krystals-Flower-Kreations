import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';

let srv;
let token;
const uniq = Date.now().toString(36);
const created = [];

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
  // Free test barcodes (unique constraints) even if assertions failed mid-run.
  for (const id of created) {
    await prisma.product.update({ where: { id }, data: { barcode: null } }).catch(() => {});
    await prisma.product.delete({ where: { id } }).catch(() => {});
  }
  await srv.close();
});

const auth = () => ({ Authorization: `Bearer ${token}` });

async function createProduct(overrides = {}) {
  const res = await api(srv.base, '/api/products', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({
      title: `Scan test ${uniq}`,
      slug: `scan-test-${uniq}-${created.length}`,
      price: 12.5,
      type: 'physical',
      stockMode: 'tracked',
      ...overrides,
    }),
  });
  if (res.body?.id) created.push(res.body.id);
  return res;
}

test('scan lookup requires auth', async () => {
  const res = await api(srv.base, `/api/inventory/scan/anything-${uniq}`);
  assert.ok([401, 403].includes(res.status), `expected 401/403, got ${res.status}`);
});

test('lookup by barcode returns product with stock shape', async () => {
  const barcode = `BCT${uniq}${created.length}`;
  const createdRes = await createProduct({ barcode });
  assert.equal(createdRes.status, 201, JSON.stringify(createdRes.body));
  assert.equal(createdRes.body.barcode, barcode, 'barcode round-trips on create');

  const res = await api(srv.base, `/api/inventory/scan/${barcode}`, { headers: auth() });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.found, true);
  assert.equal(res.body.kind, 'product');
  assert.equal(res.body.item.id, createdRes.body.id);
  assert.equal(res.body.item.barcode, barcode);
  assert.equal(typeof res.body.item.price, 'number');
  assert.ok(Array.isArray(res.body.stock), 'stock array present');
  assert.equal(typeof res.body.totalOnHand, 'number');
});

test('lookup falls back to SKU', async () => {
  const sku = `SKU${uniq}X`;
  const createdRes = await createProduct({ sku });
  assert.equal(createdRes.status, 201, JSON.stringify(createdRes.body));

  const res = await api(srv.base, `/api/inventory/scan/${sku}`, { headers: auth() });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.found, true);
  assert.equal(res.body.item.sku, sku);
});

test('unknown code returns 404 found:false', async () => {
  const code = `ZZZ${uniq}`;
  const res = await api(srv.base, `/api/inventory/scan/${code}`, { headers: auth() });
  assert.equal(res.status, 404);
  assert.equal(res.body.found, false);
  assert.equal(res.body.scanned, code);
  assert.equal(res.body.code, 'not_found');
});

test('soft-deleted product is not scannable (barcode + sku)', async () => {
  const barcode = `BCDEL${uniq}`;
  const sku = `SKUDel${uniq}`;
  const p = await createProduct({ barcode, sku });
  assert.equal(p.status, 201, JSON.stringify(p.body));

  // live → both paths resolve
  assert.equal((await api(srv.base, `/api/inventory/scan/${barcode}`, { headers: auth() })).status, 200);
  assert.equal((await api(srv.base, `/api/inventory/scan/${sku}`, { headers: auth() })).status, 200);

  await prisma.product.update({ where: { id: p.body.id }, data: { deletedAt: new Date() } });

  // soft-deleted → stale label behaves like an unknown code
  const afterBc = await api(srv.base, `/api/inventory/scan/${barcode}`, { headers: auth() });
  assert.equal(afterBc.status, 404, JSON.stringify(afterBc.body));
  assert.equal(afterBc.body.found, false);
  const afterSku = await api(srv.base, `/api/inventory/scan/${sku}`, { headers: auth() });
  assert.equal(afterSku.status, 404, JSON.stringify(afterSku.body));

  await prisma.product.delete({ where: { id: p.body.id } }); // free barcode/sku
});

test('duplicate barcode rejected on create and patch (409 barcode_taken)', async () => {
  const barcode = `BCDUP${uniq}`;
  const a = await createProduct({ barcode });
  assert.equal(a.status, 201, JSON.stringify(a.body));

  const b = await api(srv.base, '/api/products', {
    method: 'POST',
    headers: auth(),
    body: JSON.stringify({ title: `Scan dup ${uniq}`, slug: `scan-dup-${uniq}`, price: 9, barcode }),
  });
  assert.equal(b.status, 409, JSON.stringify(b.body));
  assert.equal(b.body.code, 'barcode_taken');

  const c = await createProduct({ barcode: `BCOTHER${uniq}` });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  const patch = await api(srv.base, `/api/products/${c.body.id}`, {
    method: 'PATCH',
    headers: auth(),
    body: JSON.stringify({ barcode }),
  });
  assert.equal(patch.status, 409, JSON.stringify(patch.body));
  assert.equal(patch.body.code, 'barcode_taken');
});

test('raw material barcode lookup', async () => {
  const material = await prisma.rawMaterial.findFirst();
  assert.ok(material, 'seeded material needed');
  const barcode = `BCRM${uniq}`;
  await prisma.rawMaterial.update({ where: { id: material.id }, data: { barcode } });
  try {
    const res = await api(srv.base, `/api/inventory/scan/${barcode}`, { headers: auth() });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.found, true);
    assert.equal(res.body.kind, 'raw_material');
    assert.equal(res.body.item.id, material.id);
    assert.equal(typeof res.body.totalOnHand, 'number');
  } finally {
    await prisma.rawMaterial.update({ where: { id: material.id }, data: { barcode: null } });
  }
});
