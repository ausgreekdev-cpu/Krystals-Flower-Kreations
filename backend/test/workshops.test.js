import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

test('GET /api/workshops lists the two seeded workshops', async () => {
  const { status, body } = await api(srv.base, '/api/workshops');
  assert.equal(status, 200);
  const arr = Array.isArray(body) ? body : body.workshops;
  assert.ok(Array.isArray(arr));
  assert.ok(arr.length >= 2);
  assert.ok(arr.some((w) => w.slug === 'cricut-blooms-101'));
  assert.ok(arr.some((w) => w.slug === 'origami-bouquet-masterclass'));
});

test('workshops carry future sessions', async () => {
  const { body } = await api(srv.base, '/api/workshops');
  const arr = Array.isArray(body) ? body : body.workshops;
  const withSessions = arr.find((w) => (w.sessions || []).length > 0);
  assert.ok(withSessions, 'at least one workshop has sessions');
  const session = withSessions.sessions[0];
  assert.ok(new Date(session.startsAt).getTime() > Date.now(), 'session is in the future');
  assert.ok(session.capacity > 0);
});