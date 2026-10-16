import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import prisma from '../src/lib/prisma.js';
import { startServer, api } from './helpers.js';

// Media library & staff photo archive (Phase A): upload with variants/thumbs,
// sha256 dedupe, folders, visibility rules (STAFF→LIBRARY promotion is
// admin-only), soft-delete trash lifecycle + admin purge.
let srv;
let adminToken;
let staffToken;

const auth = (t) => ({ Authorization: `Bearer ${t}` });
// Random tint per call — identical bytes would trip the sha256 dedupe.
const png = (w, h, rgb) =>
  sharp({ create: { width: w, height: h, channels: 3, background: rgb || { r: Math.floor(Math.random() * 256), g: Math.floor(Math.random() * 256), b: Math.floor(Math.random() * 256) } } }).png().toBuffer();

async function upload(token, { name = 'test.png', bytes, visibility = 'LIBRARY', title, folderId, tags } = {}) {
  const fd = new FormData();
  fd.append('file', new Blob([bytes || (await png(900, 600))], { type: 'image/png' }), name);
  if (visibility) fd.append('visibility', visibility);
  if (title) fd.append('title', title);
  if (folderId) fd.append('folderId', folderId);
  if (tags) fd.append('tags', tags);
  const res = await fetch(`${srv.base}/api/media`, { method: 'POST', headers: auth(token), body: fd });
  return { status: res.status, body: await res.json().catch(() => null) };
}

before(async () => {
  srv = await startServer();
  const admin = await api(srv.base, '/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }),
  });
  assert.equal(admin.status, 200);
  adminToken = admin.body.token;
  // A real non-admin editor (staff role) for the promotion-permission check —
  // authenticate() re-reads the role from the DB on every request.
  const reg = await api(srv.base, '/api/auth/register', {
    method: 'POST', body: JSON.stringify({ name: 'Media T Editor', email: `media-editor-${Date.now()}@test.com`, password: 'secret123' }),
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  await prisma.user.update({ where: { id: reg.body.user?.id || reg.body.id }, data: { role: 'staff' } });
  staffToken = reg.body.token;
});
after(async () => {
  await prisma.mediaAsset.deleteMany({ where: { title: { startsWith: 'Media T ' } } }).catch(() => {});
  await prisma.mediaFolder.deleteMany({ where: { name: { startsWith: 'Media T ' } } }).catch(() => {});
  await srv.close();
});

test('LIBRARY upload: publicUrl + responsive variants + geometry', async () => {
  const { status, body } = await upload(adminToken, { title: 'Media T Lib', tags: 'hero,bloom' });
  assert.equal(status, 201, JSON.stringify(body).slice(0, 300));
  const a = body.asset;
  assert.equal(a.visibility, 'LIBRARY');
  assert.ok(a.publicUrl, 'public url set');
  assert.equal(a.width, 900);
  assert.equal(a.height, 600);
  assert.deepEqual(Object.keys(a.variants.webp).sort(), ['400', '800']);
  assert.deepEqual(Object.keys(a.variants.avif).sort(), ['400', '800']);
  assert.equal(a.thumbRef, null, 'library uses variants as thumbs');
  assert.deepEqual(a.tags, ['hero', 'bloom']);

  const file = await fetch(`${srv.base}/api/media/${a.id}/file`, { headers: auth(adminToken), redirect: 'manual' });
  assert.equal(file.status, 302, 'library bytes redirect to the public URL');
});

test('STAFF upload: private ref + thumb, no public url', async () => {
  const { status, body } = await upload(adminToken, { title: 'Media T Staff', visibility: 'STAFF' });
  assert.equal(status, 201, JSON.stringify(body).slice(0, 300));
  const a = body.asset;
  assert.equal(a.visibility, 'STAFF');
  assert.equal(a.publicUrl, null);
  assert.equal(a.variants, null);
  assert.ok(a.thumbRef?.startsWith('staff-media/'), `private thumb ref, got ${a.thumbRef}`);

  const file = await fetch(`${srv.base}/api/media/${a.id}/file`, { headers: auth(adminToken) });
  assert.equal(file.status, 200, 'staff bytes served through the authed route');
  assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
});

test('identical bytes dedupe within a visibility', async () => {
  const bytes = await png(300, 300, { r: 1, g: 2, b: 3 });
  const first = await upload(adminToken, { title: 'Media T Dup', bytes });
  const second = await upload(adminToken, { title: 'Media T Dup2', bytes });
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.body.deduped, true);
  assert.equal(second.body.asset.id, first.body.asset.id);
});

test('non-image uploads are rejected 415', async () => {
  const fd = new FormData();
  fd.append('file', new Blob(['not-an-image'], { type: 'image/png' }), 'fake.png');
  const res = await fetch(`${srv.base}/api/media`, { method: 'POST', headers: auth(adminToken), body: fd });
  assert.equal(res.status, 415, JSON.stringify(await res.json().catch(() => null)));
});

test('folders: create, move asset in, delete folder unfiles assets', async () => {
  const folder = await api(srv.base, '/api/media/folders', {
    method: 'POST', headers: auth(adminToken), body: JSON.stringify({ name: 'Media T Folder' }),
  });
  assert.equal(folder.status, 201, JSON.stringify(folder.body));

  const up = await upload(adminToken, { title: 'Media T Filed', folderId: folder.body.id });
  assert.equal(up.status, 201);
  assert.equal(up.body.asset.folderId, folder.body.id);

  const del = await api(srv.base, `/api/media/folders/${folder.body.id}`, { method: 'DELETE', headers: auth(adminToken) });
  assert.equal(del.status, 200);
  const after = await api(srv.base, `/api/media/${up.body.asset.id}`, { headers: auth(adminToken) });
  assert.equal(after.body.folderId, null, 'asset lands in Unfiled');
});

test('list filters: visibility + search + trash', async () => {
  const list = await api(srv.base, '/api/media?visibility=STAFF&limit=100', { headers: auth(adminToken) });
  assert.equal(list.status, 200);
  assert.ok(list.body.assets.length >= 1);
  assert.ok(list.body.assets.every((a) => a.visibility === 'STAFF'));

  const search = await api(srv.base, '/api/media?q=Media T Staff&limit=100', { headers: auth(adminToken) });
  assert.ok(search.body.assets.some((a) => a.title === 'Media T Staff'));

  const up = await upload(adminToken, { title: 'Media T Trash' });
  const soft = await api(srv.base, `/api/media/${up.body.asset.id}`, { method: 'DELETE', headers: auth(adminToken) });
  assert.equal(soft.status, 200);
  const trashed = await api(srv.base, '/api/media?trashed=1&limit=100', { headers: auth(adminToken) });
  assert.ok(trashed.body.assets.some((a) => a.id === up.body.asset.id));
  const normal = await api(srv.base, '/api/media?limit=100', { headers: auth(adminToken) });
  assert.ok(!normal.body.assets.some((a) => a.id === up.body.asset.id));

  const restored = await api(srv.base, `/api/media/${up.body.asset.id}/restore`, { method: 'POST', headers: auth(adminToken) });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.deletedAt, null);
});

test('STAFF→LIBRARY promotion: staff forbidden, admin moves bytes', async () => {
  const up = await upload(adminToken, { title: 'Media T Promo', visibility: 'STAFF' });
  assert.equal(up.status, 201);

  const forbidden = await api(srv.base, `/api/media/${up.body.asset.id}`, {
    method: 'PATCH', headers: auth(staffToken), body: JSON.stringify({ visibility: 'LIBRARY' }),
  });
  assert.equal(forbidden.status, 403, JSON.stringify(forbidden.body));

  const promoted = await api(srv.base, `/api/media/${up.body.asset.id}`, {
    method: 'PATCH', headers: auth(adminToken), body: JSON.stringify({ visibility: 'LIBRARY' }),
  });
  assert.equal(promoted.status, 200, JSON.stringify(promoted.body).slice(0, 300));
  assert.equal(promoted.body.visibility, 'LIBRARY');
  assert.ok(promoted.body.publicUrl, 'public url after promotion');
  assert.ok(promoted.body.variants?.webp, 'variants generated for the library');
});

test('purge: admin removes bytes + row; attached assets are protected', async () => {
  const up = await upload(adminToken, { title: 'Media T Purge' });
  const id = up.body.asset.id;

  // attach a provenance row — purge must refuse while it exists
  await prisma.mediaAttachment.create({ data: { assetId: id, attachableType: 'PRODUCT', attachableId: 'test-product', role: 'gallery' } });
  const blocked = await api(srv.base, `/api/media/${id}/purge`, { method: 'DELETE', headers: auth(adminToken) });
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  await prisma.mediaAttachment.deleteMany({ where: { assetId: id } });

  const purged = await api(srv.base, `/api/media/${id}/purge`, { method: 'DELETE', headers: auth(adminToken) });
  assert.equal(purged.status, 200);
  const gone = await api(srv.base, `/api/media/${id}`, { headers: auth(adminToken) });
  assert.equal(gone.status, 404);
  const file = await api(srv.base, `/api/media/${id}/file`, { headers: auth(adminToken) });
  assert.equal(file.status, 404, 'bytes gone with the row');
});

test('non-editor roles cannot reach the media API', async () => {
  const reg = await api(srv.base, '/api/auth/register', {
    method: 'POST', body: JSON.stringify({ name: 'Media T Cust', email: `media-cust-${Date.now()}@test.com`, password: 'secret123' }),
  });
  assert.equal(reg.status, 201);
  const res = await api(srv.base, '/api/media', { headers: auth(reg.body.token) });
  assert.equal(res.status, 403);
});
