# Security Audit — Tenant Isolation & Client Data Exposure

**Repo:** Krystal's Flower Kreations (`/home/aiuser/Downloads/Krystals-Flower-Kreations`)
**Branch:** `audit/tenant-isolation` (commit `0604a72`) — audit deliverables only; no production code fixed.
**Reviewer:** independent security reviewer (did not build the system). Reviewed blind — nothing assumed safe because of a comment, ADR, or existing test.
**Date:** 2026-10-25

## 0. Executive summary / architectural context

This is a **single-tenant** system (one flower-shop business). I verified there is **no `tenant_id`, `client_id`, or `project_id` column** anywhere in `backend/prisma/schema.prisma` or the source, and **no Row Level Security (RLS)** exists. Access control is role-based (`customer < staff/maker < admin < developer`) plus user ownership (`userId`/`email` derived from the verified JWT).

Consequently:
- Check 1 (RLS forced on every `tenant_id` table): **N/A** — no table has `tenant_id`. There is no cross-tenant isolation mechanism because there is no tenancy.
- Check 2 (no `tenant_id`/`client_id` from client input): **verified sound** — none exists; `userId`/`email` always come from the verified JWT (`req.user`), never from body/query/params.
- Check 3 (raw SQL / cross-tenant joins / forged cursors): **verified sound** — the only `$queryRaw` is a health probe (`SELECT 1`, no input); the only `.raw()` is sharp image processing. No SQL-injection vector.
- The real exposure surface is **client-to-client** (customer A vs customer B) and **capability** leaks, which is what findings AUDIT-01…AUDIT-03 cover.

## 1. Baseline (before my audit tests)

- **Lint**: `npm run lint` — backend pass, frontend pass (exit 0).
- **Tests**: the suite is stateful/order-dependent (serial, shared DB) and the working tree I inherited contains pre-existing WIP (an untracked `backend/test/auditIdentityAuth.test.js` plus 43 modified files), so the failure count shifts run to run (observed 298 tests/5 fail and 299 tests/7 fail across runs). Pre-existing failures I observed are **not mine** and **not tenant-isolation-related**: `adminAlerts.test.js` (alert suppression) and `emailQueue.test.js` (provider/from-address, and real Gmail SMTP calls that get rate-limited "Too many login attempts").
- **Database backend**: embedded PostgreSQL (`embedded-postgres`) on `localhost:5432`, database `krystals_flower_kreations`, user `krystal` — `npx prisma db push` reports "already in sync"; seed ran cleanly.

## 2. Findings

Each finding: ID / severity / file:line / how to reproduce / impact / recommended fix / failing test.

---

### AUDIT-01 — Medium — Guest cart is an unauthenticated, user-unbound capability (read + delete + email capture)

**File:** `backend/src/routes/cart.js`
- `GET /api/cart/` — lines 45-51
- `POST /api/cart/email` — lines 118-124
- `DELETE /api/cart/:cartId` — lines 126-130

**How to reproduce / exploit:**
1. `POST /api/cart/add { productId, quantity }` with **no auth** → returns a `cartId` (guest cart; note the cart is created with only `sessionId`, never bound to `userId`, even for logged-in users).
2. `POST /api/cart/email { cartId, email }` → stores an email (PII for abandoned-cart recovery) against that cart, **no auth**.
3. `GET /api/cart/` with header `X-Cart-Id: <cartId>` and **no `Authorization`** → returns the cart contents **and the captured email** (`200`).
4. `DELETE /api/cart/<cartId>` with **no `Authorization`** → `200 ok`, cart + line items destroyed.

**Impact:** `cartId` is the sole guest capability (cookie `cartId` / header `x-cart-id`). If it leaks (Referer header, logs, shoulder-surfing, XSS), any party can read that cart's contents + captured email and delete it. There is no ownership to authorize against (guest carts are never bound to `userId`), so this is a cross-client data-exposure and data-destruction vector in the guest model.

**Recommended fix:** Keep cart read-by-`cartId` for the guest flow, but require authorization for **destructive/mutating** cart operations: `DELETE /api/cart/:cartId` and `POST /api/cart/email` should not be completely open. Bind guest carts to a session/user where possible, or at minimum require a second factor (e.g. double-submit the `cartId` via a header that must match, plus rate limiting already present). Do not allow unauthenticated deletion of another visitor's cart and its captured email.

**Test that fails today:** `backend/test/auditTenantIsolation.test.js` — `[AUDIT-01] DELETE /api/cart/:cartId is rejected without authentication`. It creates a cart, captures an email, then `DELETE`s with no token and asserts `401/403`; current code returns `200`. (In the full run: `not ok` `[AUDIT-01]`.)

---

### AUDIT-02 — Medium — Any authenticated customer can read draft procedures, including internal notes

**File:** `backend/src/routes/procedures.js`
- Detail route — lines 166-187

**How to reproduce / exploit:**
1. As staff, create a `ProcedureDocument` with `status: 'draft'`, `contentMarkdown` and `metadata.notes` containing internal/edit/hazard notes (e.g. "INTERNAL: hazard — keep away from children").
2. Log in as a regular **customer** and `GET /api/procedures/:id` with the customer's Bearer token.
3. Response: `200` with the full draft body, including `contentMarkdown` and `metadata.notes`.

**Impact:** Draft procedures may contain internal notes, edit notes, hazard/incident/defect data, or costing that is not intended for customers. Because draft detail read is gated only by `optionalAuth` (any logged-in user) with **no author/ownership check**, any authenticated customer can read any staff member's draft.

**Recommended fix:** Gate draft/archived procedure detail to editors (`maker/staff/admin/developer`), not any authenticated customer; keep `published` public. If customers must see drafts, add an explicit "customer-visible" flag and filter content. Do not return `metadata.notes`/`editorId` to non-staff.

**Test that fails today:** `backend/test/auditTenantIsolation.test.js` — `[AUDIT-02] a customer cannot read a draft procedure`. It creates a draft as staff, reads it as a customer, and asserts `401/403`; current code returns `200` with the internal notes. (`not ok` `[AUDIT-02]`.)

---

### AUDIT-03 — Low — Staff media `Content-Disposition` reflects an unescaped quote/backslash in `asset.title`; thumb route omits `nosniff`

**File:** `backend/src/routes/media.js`
- `GET /api/media/:id/file` — line 518 (`Content-Disposition`)
- `GET /api/media/:id/thumb` — lines 524-538 (no `X-Content-Type-Options`)

**How to reproduce / exploit:**
1. As staff, create/update a `MediaAsset` (visibility `STAFF`) with `title = evil"title\\x.jpg` and a real object in `staff-media`.
2. `GET /api/media/:id/file` with a staff Bearer token → `Content-Disposition: inline; filename="evil"title\x.jpg.jpg"`.
3. The raw `"` terminates the `filename="..."` quoted string early (header injection / broken suggested filename). The `/thumb` response also lacks `X-Content-Type-Options: nosniff`.

**Impact:** Low — exploitation requires already being a staff member (editor-only route), so the attacker must be trusted staff. It can break the suggested download filename and, if a client ever renders the header unsafely, enable minor header injection. Not cross-tenant.

**Recommended fix:** Apply the same hardening used in `backend/src/routes/documents.js` line 249: `asciiFilename(title)` (strips non-printable, `"`, `\`) for the `filename=` param and/or `filename*=UTF-8''${encodeURIComponent(title)}`. Add `X-Content-Type-Options: nosniff` to `/thumb`.

**Test that fails today:** `backend/test/auditTenantIsolation.test.js` — `[AUDIT-03] staff media Content-Disposition neutralises quotes in the title`. It asserts the raw `evil"` sequence is absent from `content-disposition`; current code returns `inline; filename="evil"title\x.jpg.jpg"`. (`not ok` `[AUDIT-03]`.)

---

## 3. What I checked and found sound

| Area | Result |
|------|--------|
| Multi-tenancy / RLS | N/A — single-tenant, no `tenant_id` column, no RLS. |
| `tenant_id`/`client_id` from client input (body/query/headers/cursors) | None exists; `userId`/`email` always from verified JWT. |
| Raw SQL injection | Only `prisma.$queryRaw\`SELECT 1\`` (health probe, no input) and sharp `.raw()` (image op). |
| Orders IDOR | `GET /api/orders/my` by token email; `GET /:orderNumber` checks `order.email === req.user.email` for customers; staff-only list (`backend/src/routes/orders.js:369-390`). |
| Custom orders IDOR | Gated by `order.customerEmail === req.user.email` for customers (`customOrders.js:154,163`). |
| Account orders/downloads | `ownedBy(user)` = `{ OR: [userId, email] }` from token; allow-listed field serialization (`customerOrder` strips `adminNote`, etc.) (`account.js`). |
| Digital downloads `/api/dl/:token` | Token = capability, payment-status gate, `nosniff`/`no-store`, server-generated filename (`slug|id`), audit at mint (`downloads.js`). |
| Documents download/export | Editor-only; `asciiFilename` + `filename*=UTF-8''encodeURIComponent`; `nosniff`/`private no-store`; server-generated keys (`docs/<ts>-<random>.<ext>`); `SAFE_KEY` validation; audit logged on download (`documents.js:241-253`). |
| Storage path traversal | `SAFE_KEY = /^[a-zA-Z0-9/_.-]+$/` rejects `..`; keys server-generated + random; private buckets (`digital-assets`, `business-documents`, `staff-media`) never publicly served; local private driver writes to `uploads-private` outside served `uploads` (`storage.js`). |
| Error handler | Masks stacks in production, sanitizes Prisma `P2002/P2003/P2025`, `err.expose` opt-in, no body/query logging (`error-handler.js`). |
| Request log | Strips `token=` params; does not log bodies/headers (`request-log.js`). |
| CSV generation | No CSV-generating endpoint exists (no column allow-list / formula-injection surface). |
| PDF | Only `/documents/:id/searchable.pdf` (OCR text-layer export) — sound headers; no on-demand PDF report generation. |
| Public product serialization | `publicProduct.js` strips `svgUrl` and `cost` from storefront/cart/blog/collection payloads. |

## 4. What I could not verify

- **PostGIS / real devices:** none used in this codebase.
- **Production Supabase Storage behavior:** credentials not available and not to be used; the local-disk driver was exercised in tests. Production path traversal relies on the same `SAFE_KEY` validation, which is code-verified.
- **Multi-tenancy:** does not exist in this codebase, so RLS/cross-tenant bypass could not be tested (and is N/A).
- **Real-device / mobile app:** not tested (mobile has no test suite per AGENTS.md).

## 5. Audit test delivery

**File:** `backend/test/auditTenantIsolation.test.js` (committed on `audit/tenant-isolation`, commit `0604a72`; tests live on the audit branch only).
- 3 tests: `[AUDIT-01]`, `[AUDIT-02]`, `[AUDIT-03]`.
- All **fail today** against the current code, proving the findings above.
- No production code was modified or fixed. Pre-existing working-tree modifications (inherited WIP from `audit/identity-auth`) were left uncommitted and are not part of this audit.
