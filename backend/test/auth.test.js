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
test('refresh issues a new token for a valid session', async () => {
  const login = await api(srv.base, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }),
  });
  assert.equal(login.status, 200);
  const { status, body } = await api(srv.base, '/api/auth/refresh', {
    method: 'POST',
    headers: { Authorization: `Bearer ${login.body.token}` },
  });
  assert.equal(status, 200);
  assert.ok(body.token, 'issues a fresh token');
  assert.equal(body.user.email, 'admin@krystal.local');
  assert.equal(body.user.role, 'developer');
});

test('refresh rejects missing and invalid tokens', async () => {
  const missing = await api(srv.base, '/api/auth/refresh', { method: 'POST' });
  assert.equal(missing.status, 401);
  const bogus = await api(srv.base, '/api/auth/refresh', {
    method: 'POST',
    headers: { Authorization: 'Bearer not.a.jwt' },
  });
  assert.equal(bogus.status, 401);
});
