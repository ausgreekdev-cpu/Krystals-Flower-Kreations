import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

test('GET /api/health returns ok', async () => {
  const { status, body } = await api(srv.base, '/api/health');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.ok(body.name.includes('Krystal'));
  assert.ok(body.requestId);
});

test('unknown /api route returns structured 404', async () => {
  const { status, body } = await api(srv.base, '/api/nope');
  assert.equal(status, 404);
  assert.equal(body.code, 'not_found');
  assert.equal(body.path, '/api/nope');
});