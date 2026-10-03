import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';

let srv;

before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

test('GET /api/stocks lists the mock tickers', async () => {
  const { status, body } = await api(srv.base, '/api/stocks');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body), 'returns a raw array');
  assert.ok(body.length >= 1, 'at least one ticker');
  const s = body[0];
  for (const field of ['ticker', 'company_name', 'current_price', 'currency', 'sector', 'description']) {
    assert.ok(field in s, `list entry has ${field}`);
  }
  assert.equal(typeof s.current_price, 'number', 'price is a plain number, not a Decimal string');
});

test('GET /api/stocks/:ticker is case-insensitive and returns full detail', async () => {
  const { status, body } = await api(srv.base, '/api/stocks/kfk');
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.ticker, 'KFK', 'param is normalised to upper case');
  assert.equal(typeof body.current_price, 'number');
  assert.equal(typeof body.change, 'number');
  assert.equal(typeof body.change_percent, 'number');
  assert.ok(body.description && body.description.length > 10, 'description present');
  assert.equal(body.currency, 'AUD');
});

test('unknown ticker returns 404 not_found', async () => {
  const { status, body } = await api(srv.base, '/api/stocks/ZZZZZ');
  assert.equal(status, 404);
  assert.equal(body.code, 'not_found');
  assert.equal(body.error, 'Not found');
});

test('malformed ticker returns 400 validation_failed', async () => {
  const { status, body } = await api(srv.base, '/api/stocks/AB-12');
  assert.equal(status, 400);
  assert.equal(body.code, 'validation_failed');
});
