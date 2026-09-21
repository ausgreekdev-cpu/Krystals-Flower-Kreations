import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

test('admin login issues a JWT for the seeded developer', async () => {
  const { status, body } = await api(srv.base, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }),
  });
  assert.equal(status, 200);
  assert.ok(body.token, 'returns token');
  assert.equal(body.user.role, 'developer');
  assert.equal(body.user.email, 'admin@krystal.local');
});

test('wrong password is rejected', async () => {
  const { status, body } = await api(srv.base, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@krystal.local', password: 'wrongpass123' }),
  });
  assert.equal(status, 401);
  assert.ok(body.error);
});

test('protected route rejects without token', async () => {
  const { status } = await api(srv.base, '/api/orders/my');
  assert.equal(status, 401);
});