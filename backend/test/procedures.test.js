import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';
import sharp from 'sharp';

let srv;
let adminToken;
let makerToken;
let customerToken;
let makerId;
let runId;

// Shared fixtures created up-front so later tests can rely on them.
let draftId;   // D1 — maker draft
let pubId;     // P1 — published with metadata

const T = (token) => ({ Authorization: `Bearer ${token}` });

async function login(email, password = 'admin123') {
  const r = await api(srv.base, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.body)}`);
  return r.body.token;
}

async function createDoc(token, overrides = {}) {
  const r = await api(srv.base, '/api/procedures', {
    method: 'POST',
    headers: T(token),
    body: JSON.stringify({
      title: `Doc ${runId} ${Math.random().toString(36).slice(2, 8)}`,
      category: 'PAPER_FLOWER',
      contentMarkdown: '# Seed content\n\nBody.',
      ...overrides,
    }),
  });
  assert.equal(r.status, 201, `createDoc: ${JSON.stringify(r.body)}`);
  return r.body;
}

async function uploadFiles(token, docId, files) {
  const fd = new FormData();
  for (const f of files) fd.append('files', new Blob([f.buf], { type: f.mime }), f.name);
  const res = await fetch(`${srv.base}/api/procedures/${docId}/media`, {
    method: 'POST',
    headers: T(token),
    body: fd,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

before(async () => {
  srv = await startServer();
  runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  adminToken = await login('admin@krystal.local');

  // Maker (Editor+) — created through the admin Users API, then logged in.
  const makerEmail = `maker-${runId}@test.com`;
  const created = await api(srv.base, '/api/users', {
    method: 'POST',
    headers: T(adminToken),
    body: JSON.stringify({ name: 'Proc Maker', email: makerEmail, password: 'makerpass1', role: 'maker' }),
  });
  assert.equal(created.status, 201, `maker create: ${JSON.stringify(created.body)}`);
  makerId = created.body.id;
  makerToken = await login(makerEmail, 'makerpass1');

  // Customer (Viewer) — self-registered.
  const reg = await api(srv.base, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Proc Customer', email: `cust-${runId}@test.com`, password: 'custpass1' }),
  });
  assert.equal(reg.status, 201, `register: ${JSON.stringify(reg.body)}`);
  customerToken = reg.body.token;

  // Fixtures: one draft + one published with metadata.
  draftId = (await createDoc(makerToken, {
    title: `Draft fixture ${runId}`,
    status: 'draft',
    metadata: { difficulty: 'BEGINNER', estimatedTimeMinutes: 20 },
  })).id;
  pubId = (await createDoc(makerToken, {
    title: `Published fixture ${runId}`,
    status: 'published',
    metadata: { difficulty: 'INTERMEDIATE', estimatedTimeMinutes: 45 },
  })).id;
});
after(async () => { await srv.close(); });

test('list: published by default (draft hidden), envelope shape', async () => {
  const r = await api(srv.base, '/api/procedures');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.procedures), 'envelope.procedures');
  assert.equal(typeof r.body.total, 'number');
  assert.equal(r.body.page, 1);
  assert.ok(r.body.pages >= 1);
  const ids = r.body.procedures.map((p) => p.id);
  assert.ok(ids.includes(pubId), 'published visible');
  assert.ok(!ids.includes(draftId), 'draft hidden by default');
  const pub = r.body.procedures.find((p) => p.id === pubId);
  assert.ok(pub.author, 'author included');
  assert.ok(Array.isArray(pub.media), 'thumbnail media included');
});

test('list: draft/archived/all require Editor role', async () => {
  const admin = await api(srv.base, '/api/procedures?status=all', { headers: T(adminToken) });
  assert.equal(admin.status, 200);
  assert.ok(admin.body.procedures.some((p) => p.id === draftId), 'admin sees drafts');

  const cust = await api(srv.base, '/api/procedures?status=all', { headers: T(customerToken) });
  assert.equal(cust.status, 403);

  const anon = await api(srv.base, '/api/procedures?status=all');
  assert.equal(anon.status, 403);

  const bad = await api(srv.base, '/api/procedures?status=nope');
  assert.equal(bad.status, 400);
});

test('list: category, q, sku, difficulty (jsonb) filters + pagination', async () => {
  const f1 = await createDoc(makerToken, {
    title: `Filter probe ${runId}`,
    category: 'ORIGAMI',
    status: 'published',
    sku: `SKU-${runId}`,
    metadata: { difficulty: 'BEGINNER' },
  });

  const byCatQ = await api(srv.base, `/api/procedures?category=ORIGAMI&q=${encodeURIComponent(`Filter probe ${runId}`)}`);
  assert.equal(byCatQ.status, 200);
  assert.equal(byCatQ.body.total, 1, 'category+q narrow to one');
  assert.equal(byCatQ.body.procedures[0].id, f1.id);

  const bySku = await api(srv.base, `/api/procedures?sku=SKU-${runId}`);
  assert.equal(bySku.body.total, 1, 'exact sku match');

  const byDiff = await api(srv.base, `/api/procedures?difficulty=BEGINNER&q=${encodeURIComponent(`Filter probe ${runId}`)}`);
  assert.equal(byDiff.body.total, 1, 'jsonb path filter matches');

  const badCat = await api(srv.base, '/api/procedures?category=NOPE');
  assert.equal(badCat.status, 400);
  const badDiff = await api(srv.base, '/api/procedures?difficulty=IMPOSSIBLE');
  assert.equal(badDiff.status, 400);

  const paged = await api(srv.base, '/api/procedures?limit=1');
  assert.equal(paged.body.procedures.length, 1, 'limit=1');
  assert.equal(paged.body.limit, 1);
  assert.ok(paged.body.pages >= 5, `pages reflect total (got ${paged.body.pages})`);
});

test('detail: access matrix, includes, 400/404', async () => {
  const anonDraft = await api(srv.base, `/api/procedures/${draftId}`);
  assert.equal(anonDraft.status, 401, 'anon cannot read draft');

  const custDraft = await api(srv.base, `/api/procedures/${draftId}`, { headers: T(customerToken) });
  assert.equal(custDraft.status, 200, 'authenticated viewer reads draft');
  assert.equal(custDraft.body.version, 'v1.0');
  assert.ok(custDraft.body.revisions.length >= 1, 'initial revision present');
  assert.equal(custDraft.body.revisions[0].contentMarkdown, undefined, 'list rows exclude bodies');

  const anonPub = await api(srv.base, `/api/procedures/${pubId}`);
  assert.equal(anonPub.status, 200, 'published is public');
  assert.equal(anonPub.body.metadata.difficulty, 'INTERMEDIATE');
  assert.ok(Array.isArray(anonPub.body.media), 'media included');

  const badId = await api(srv.base, '/api/procedures/not-a-uuid');
  assert.equal(badId.status, 400);
  const missing = await api(srv.base, '/api/procedures/00000000-0000-4000-8000-00000000ffff');
  assert.equal(missing.status, 404);
});

test('revisions endpoint: Editor+ only, full bodies', async () => {
  const anon = await api(srv.base, `/api/procedures/${draftId}/revisions`);
  assert.equal(anon.status, 401);
  const cust = await api(srv.base, `/api/procedures/${draftId}/revisions`, { headers: T(customerToken) });
  assert.equal(cust.status, 403);
  const maker = await api(srv.base, `/api/procedures/${draftId}/revisions`, { headers: T(makerToken) });
  assert.equal(maker.status, 200);
  assert.ok(Array.isArray(maker.body));
  assert.ok(maker.body[0].contentMarkdown.includes('Seed content'), 'bodies included');
});

test('create: RBAC, validation, duplicate sku 409, initial revision', async () => {
  const anon = await api(srv.base, '/api/procedures', {
    method: 'POST', body: JSON.stringify({ title: 'Nope here', category: 'ORIGAMI', contentMarkdown: 'x' }),
  });
  assert.equal(anon.status, 401);

  const cust = await api(srv.base, '/api/procedures', {
    method: 'POST', headers: T(customerToken),
    body: JSON.stringify({ title: 'Nope here', category: 'ORIGAMI', contentMarkdown: 'x' }),
  });
  assert.equal(cust.status, 403);

  const bad = await api(srv.base, '/api/procedures', {
    method: 'POST', headers: T(makerToken),
    body: JSON.stringify({ title: 'Bad category doc', category: 'SPACE', contentMarkdown: 'x' }),
  });
  assert.equal(bad.status, 400);

  const dupSku = `DUP-${runId}`;
  const first = await createDoc(makerToken, { sku: dupSku });
  assert.equal(first.authorId, makerId, 'authorId from token');
  assert.equal(first.version, 'v1.0');
  assert.equal(first.status, 'draft', 'status defaults to draft');
  const revCount = await prisma.procedureRevision.count({ where: { documentId: first.id } });
  assert.equal(revCount, 1, 'initial revision created');

  const second = await api(srv.base, '/api/procedures', {
    method: 'POST', headers: T(makerToken),
    body: JSON.stringify({ title: 'Duplicate sku doc', category: 'ORIGAMI', contentMarkdown: 'y', sku: dupSku }),
  });
  assert.equal(second.status, 409, 'unique sku conflict');
});

test('update: auto minor version bump + revision snapshot + RBAC', async () => {
  const doc = await createDoc(makerToken, { title: `Bump target ${runId}` });

  const cust = await api(srv.base, `/api/procedures/${doc.id}`, {
    method: 'PUT', headers: T(customerToken),
    body: JSON.stringify({ title: 'Customer edit attempt' }),
  });
  assert.equal(cust.status, 403);

  const empty = await api(srv.base, `/api/procedures/${doc.id}`, {
    method: 'PUT', headers: T(makerToken), body: JSON.stringify({}),
  });
  assert.equal(empty.status, 400, 'empty update rejected');

  const upd = await api(srv.base, `/api/procedures/${doc.id}`, {
    method: 'PUT', headers: T(makerToken),
    body: JSON.stringify({ contentMarkdown: '# Updated body', revisionNote: 'test bump', metadata: { difficulty: 'ADVANCED' } }),
  });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  assert.equal(upd.body.version, 'v1.1', 'minor version bumped');
  assert.equal(upd.body.metadata.difficulty, 'ADVANCED');

  const revs = await api(srv.base, `/api/procedures/${doc.id}/revisions`, { headers: T(makerToken) });
  assert.equal(revs.body.length, 2, 'revision appended');
  assert.equal(revs.body[0].note, 'test bump');
  assert.equal(revs.body[0].version, 'v1.1');
});

test('soft delete: Admin only, gone from detail + lists', async () => {
  const doc = await createDoc(makerToken, { title: `Delete target ${runId}`, status: 'published' });

  const maker = await api(srv.base, `/api/procedures/${doc.id}`, { method: 'DELETE', headers: T(makerToken) });
  assert.equal(maker.status, 403, 'makers cannot delete');

  const admin = await api(srv.base, `/api/procedures/${doc.id}`, { method: 'DELETE', headers: T(adminToken) });
  assert.equal(admin.status, 200, JSON.stringify(admin.body));
  assert.equal(admin.body.deleted, true);

  const detail = await api(srv.base, `/api/procedures/${doc.id}`);
  assert.equal(detail.status, 404);

  const staffList = await api(srv.base, '/api/procedures?status=all', { headers: T(adminToken) });
  assert.ok(!staffList.body.procedures.some((p) => p.id === doc.id), 'soft-deleted excluded');

  const again = await api(srv.base, `/api/procedures/${doc.id}`, { method: 'DELETE', headers: T(adminToken) });
  assert.equal(again.status, 404, 'repeat delete → 404');
});

test('media: type inference, magic/decode validation, reorder, delete, RBAC', async () => {
  const doc = await createDoc(makerToken, { title: `Media target ${runId}` });

  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ff0000' } }).png().toBuffer();
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');

  const up = await uploadFiles(makerToken, doc.id, [
    { buf: png, mime: 'image/png', name: 'pic.png' },
    { buf: svg, mime: 'image/svg+xml', name: 'diagram.svg' },
    { buf: pdf, mime: 'application/pdf', name: 'drawing.pdf' },
  ]);
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.equal(up.body.length, 3);
  const types = up.body.map((m) => m.mediaType).sort();
  assert.deepEqual(types, ['CAD_FILE', 'IMAGE', 'SVG_DIAGRAM']);
  assert.ok(up.body.every((m) => m.url.includes('/uploads/procedures/')), 'local driver keys');
  const pngRow = up.body.find((m) => m.mediaType === 'IMAGE');
  assert.equal(pngRow.displayOrder, 0);

  const textFile = await uploadFiles(makerToken, doc.id, [
    { buf: Buffer.from('plain text sneaking in'), mime: 'text/plain', name: 'notes.txt' },
  ]);
  assert.equal(textFile.status, 415, 'disallowed type rejected');

  const corruptPng = await uploadFiles(makerToken, doc.id, [
    { buf: Buffer.from('this is definitely not a png file body'), mime: 'image/png', name: 'fake.png' },
  ]);
  assert.equal(corruptPng.status, 415, 'sharp decode rejects fake png');

  const cust = await uploadFiles(customerToken, doc.id, [{ buf: png, mime: 'image/png', name: 'x.png' }]);
  assert.equal(cust.status, 403, 'viewers cannot upload');

  const reorder = await api(srv.base, `/api/procedures/${doc.id}/media/${pngRow.id}`, {
    method: 'PATCH', headers: T(makerToken), body: JSON.stringify({ displayOrder: 7 }),
  });
  assert.equal(reorder.status, 200);
  assert.equal(reorder.body.displayOrder, 7);

  const wrongDoc = await api(srv.base, `/api/procedures/${pubId}/media/${pngRow.id}`, {
    method: 'PATCH', headers: T(makerToken), body: JSON.stringify({ displayOrder: 1 }),
  });
  assert.equal(wrongDoc.status, 404, 'media must belong to path document');

  const del = await api(srv.base, `/api/procedures/${doc.id}/media/${pngRow.id}`, {
    method: 'DELETE', headers: T(makerToken),
  });
  assert.equal(del.status, 200);
  const row = await prisma.documentMedia.findUnique({ where: { id: pngRow.id } });
  assert.equal(row, null, 'row removed');
});
