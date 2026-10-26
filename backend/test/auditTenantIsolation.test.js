// Security audit: tenant isolation & client data exposure
// Branch: audit/tenant-isolation — these tests live on the audit branch only.
// No production code is fixed here; each test asserts the SECURE behaviour and
// therefore FAILS today, demonstrating a finding.
//
// Context verified against the code: this is a SINGLE-TENANT system. There is no
// tenant_id / client_id / project_id column anywhere in prisma/schema.prisma or
// the source, and no Row Level Security exists. Access control is role-based +
// user ownership (userId / email derived from the verified JWT). The findings
// below are therefore client-to-client (customer A vs customer B) exposure and
// capability leaks, not cross-tenant RLS bypasses.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';
import { signToken } from '../src/lib/auth.js';
import { putObject, deleteObjectByUrl } from '../src/services/storage.js';
import { __clearRateLimits } from '../src/middleware/rate-limit.js';

let srv;
let trackedProductId;
const created = { users: [], procedures: [], assets: [], carts: [], refs: [] };

async function seedTrackedProduct() {
  const { body } = await api(srv.base, '/api/products');
  const p = body.products.find((x) => x.stockMode === 'tracked');
  assert.ok(p, 'a seeded tracked product exists');
  trackedProductId = p.id;
}

before(async () => {
  await __clearRateLimits();
  srv = await startServer();
  await seedTrackedProduct();
});

after(async () => {
  for (const id of created.carts) {
    await prisma.cartItem.deleteMany({ where: { cartId: id } }).catch(() => {});
    await prisma.cart.delete({ where: { id } }).catch(() => {});
  }
  for (const ref of created.refs) await deleteObjectByUrl(ref).catch(() => {});
  for (const id of created.assets) await prisma.mediaAsset.delete({ where: { id } }).catch(() => {});
  for (const id of created.procedures) await prisma.procedureDocument.delete({ where: { id } }).catch(() => {});
  for (const id of created.users) await prisma.user.delete({ where: { id } }).catch(() => {});
  await srv.close();
});

// ── AUDIT-01 ────────────────────────────────────────────────────────────────
// Guest carts are never bound to userId (POST /api/cart/add creates sessionId
// only, even for logged-in users). cartId (x-cart-id header / cartId cookie)
// is the sole capability, yet DELETE /api/cart/:cartId has NO authorization:
// any caller who knows a cartId wipes the cart and its captured email.
//
// Secure behaviour: DELETE without a token must be rejected (401/403).
// Current behaviour: 200 ok. → this test FAILS.
test('[AUDIT-01] DELETE /api/cart/:cartId is rejected without authentication', async () => {
  const res = await api(srv.base, '/api/cart/add', {
    method: 'POST',
    body: JSON.stringify({ productId: trackedProductId, quantity: 1 }),
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const cartId = res.body.cartId;
  created.carts.push(cartId);

  // Put PII (abandoned-cart recovery email) on the cart — no auth either.
  await api(srv.base, '/api/cart/email', {
    method: 'POST',
    body: JSON.stringify({ cartId, email: 'victim-audit@example.com' }),
  });

  // --- NO auth token whatsoever ---
  const { status: d, body: del } = await api(srv.base, `/api/cart/${cartId}`, {
    method: 'DELETE',
  });
  // Secure: 401/403. Actual: 200 → any cartId holder can destroy a cart + its email.
  assert.ok(d === 401 || d === 403, `DELETE returned ${d} with no auth (body: ${JSON.stringify(del)})`);
});

// ── AUDIT-02 ────────────────────────────────────────────────────────────────
// Procedure detail: published = public; draft/archived need only optionalAuth
// (ANY logged-in user, including a customer). This is DOCUMENTED intended
// behaviour (AGENTS.md: "draft detail read = any authenticated"), so it is a
// product/design decision rather than a code defect. No author/ownership check,
// so a customer CAN read a staff draft including contentMarkdown and
// metadata.notes (internal / edit / hazard notes).
//
// This test asserts the documented behaviour (customer reads draft → 200) and
// surfaces the exposure for product review: internal notes should not be placed
// in drafts customers can reach unless that is explicitly accepted.
test('[AUDIT-02] documented behaviour: an authenticated customer can read a draft procedure', async () => {
  const staff = await prisma.user.create({
    data: { email: `staff-audit-${Date.now()}@test.com`, password: 'x', role: 'staff', name: 'Audit Staff' },
  });
  const customer = await prisma.user.create({
    data: { email: `cust-audit-${Date.now()}@test.com`, password: 'x', role: 'customer', name: 'Audit Customer' },
  });
  created.users.push(staff.id, customer.id);

  const custToken = signToken(customer);

  const proc = await prisma.procedureDocument.create({
    data: {
      title: `Audit Draft ${Date.now()}`,
      category: 'FLOWER',
      contentMarkdown: 'INTERNAL: do not share with customers — food-safe adhesive only.',
      metadata: { notes: 'INTERNAL: hazard — keep away from children; QC rejected batch #44' },
      status: 'draft',
      authorId: staff.id,
    },
  });
  created.procedures.push(proc.id);

  const res = await api(srv.base, `/api/procedures/${proc.id}`, {
    headers: { Authorization: `Bearer ${custToken}` },
  });
  // Documented behaviour: any authenticated viewer reads drafts (200).
  assert.equal(res.status, 200, `customer read a draft with status ${res.status}`);
  assert.equal(res.body.contentMarkdown, 'INTERNAL: do not share with customers — food-safe adhesive only.');
  assert.equal(res.body.metadata.notes, 'INTERNAL: hazard — keep away from children; QC rejected batch #44');
});

// ── AUDIT-03 ────────────────────────────────────────────────────────────────
// Staff asset file serve: Content-Disposition filename is built from asset.title
// with only non-printable stripped — `"` and `\` are kept, so a staff-set title
// breaks the quoted filename (editor-only, low severity, but not neutralised).
//
// Secure behaviour: the raw double-quote must not appear unescaped in the
// header (it would terminate `filename="..."` early).
// Current behaviour: `evil"` is reflected verbatim. → this test FAILS.
test('[AUDIT-03] staff media Content-Disposition neutralises quotes in the title', async () => {
  const staff = await prisma.user.create({
    data: { email: `staffmedia-${Date.now()}@test.com`, password: 'x', role: 'staff', name: 'Audit Media' },
  });
  created.users.push(staff.id);
  const token = signToken(staff);
  const auth = () => ({ Authorization: `Bearer ${token}` });

  const buf = Buffer.from('fake image bytes');
  const ref = await putObject(`archive/${Date.now()}.jpg`, buf, 'image/jpeg', { bucket: 'staff-media' });
  created.refs.push(ref);

  const title = `evil"title\\x.jpg`; // quote AND backslash
  const asset = await prisma.mediaAsset.create({
    data: {
      title,
      mime: 'image/jpeg',
      sizeBytes: buf.length,
      storageRef: ref,
      sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      visibility: 'STAFF',
      uploadedById: staff.id,
    },
  });
  created.assets.push(asset.id);

  const { headers } = await api(srv.base, `/api/media/${asset.id}/file`, { headers: auth() });
  const cd = headers.get('content-disposition') || '';
  // Secure: no raw `"` that can break out of filename="...".
  assert.ok(!cd.includes('evil"'), `quote not neutralised in Content-Disposition: ${cd}`);
});
