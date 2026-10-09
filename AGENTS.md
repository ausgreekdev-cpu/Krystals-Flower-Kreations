# AGENTS.md — Krystal's Flower Kreations (operational notes)

Guidance for agents/tooling working in this repo. Concise, action-oriented.

## Repos — never mix

- **Krystal** (this repo): `/home/aiuser/Downloads/Krystals-Flower-Kreations`, `git@github.com:ausgreekdev-cpu/Krystals-Flower-Kreations.git`, branch `main`
- **LUX**: `/home/aiuser/Downloads/LUX`, `git@github.com:ausgreekdev-cpu/LUX-Traffic-Management.git` — separate project, do not touch.
- Bash calls without `workdir` default to the current dir; always set `workdir` for the repo you mean.

## Stack

Vite React web (`frontend/`) + Express/Prisma 5 Postgres (`backend/`) + Expo mobile (`mobile/`). Stripe **disabled** (`stripe=null`); online payments: **PayPal** (`paypal` in payment enum `paypal|cash|bank_transfer|pickup|manual`, service `backend/src/services/paypal.js`, modes via `PAYPAL_MODE`), plus manual `cash|bank_transfer|pickup|manual`.

## Commands

```bash
# backend (workdir = backend)
npm test            # integration suite (142 tests), needs DATABASE_URL set — runs files serially (--test-concurrency=1)
npm run seed        # idempotent seed (loads backend/.env itself)
npm run dev         # :3001

# prisma — prefer the root shortcuts (Prisma CLI only loads .env from cwd, so
# running it at the repo root fails with "Environment variable not found")
npm run db:push     # = cd backend && npx prisma db push (migrations dir is gitignored)
npm run db:seed     # = npm run seed --workspace=backend

# frontend
npm run lint        # from backend/ or frontend/ — both have flat eslint.config.js; run root `npm run lint` for both
npm run build       # Vite build + PWA
```

## Databases

- **Local dev**: Postgres at `postgresql://krystal:krystal_dev_password@localhost:5432/krystals_flower_kreations?schema=public` (via `docker compose up -d db`, or the sandbox's embedded postgres at `~/.cache/opencode/pg-embed/start.js` — NOT under `/tmp`, which sandbox recycles wipe).
- **Prod (Supabase)**: project `tyyqnlfzhgxvnqmicgfr`, ap-southeast-2.
  - Runtime `DATABASE_URL`: `postgresql://postgres.tyyqnlfzhgxvnqmicgfr:!Krystalsflowercreations123@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`
  - DDL `DIRECT_URL`: same host but `:5432` and **no** `pgbouncer=true` — the 6543 pooler can't run DDL (hangs `db push`).
  - Schema source of truth is Prisma (`prisma/schema.prisma`); `prisma/migrations/` is **gitignored** — always `db push`.
  - `supabase/migrations/*.sql` were **removed** (stale snake_case + a booking-breaking trigger). Do not reintroduce.
- `JWT_SECRET=ngLDIUTJ4f8Q6VxVlTDvEVvI2UXfEjxDqVSXGFObEcIXhWsQHo02DGuI8CwJU5Z+`

## Env files (all gitignored except template)

- `backend/.env` — local dev (complete)
- `backend/.env.supabase` — prod reference (complete; copy these into Netlify dashboard)
- `.env.netlify.template` — tracked template
- `.gitignore` covers `.env`, `.env.supabase`, `prisma/migrations/`

## Auth / roles

- Login endpoint `POST /api/auth/login`; admin UI at `/admin` (guarded, redirects to `/login`).
- Seeded users (password `admin123`): `admin@krystal.local` (developer), `krystal@flowerkreations.com.au` (admin), `krystalflowercreations@gmail.com` (admin).
- Role ranks: customer 1 < staff/maker 2 < admin 3 < developer 4. Only developers can grant/modify the developer role.

## Gotchas

- **Prisma CLI ignores inline `DATABASE_URL`** — the CLI loads `backend/.env` and that value WINS over the shell env (a bogus inline URL still connects to localhost). To push to prod: temporarily point `backend/.env`'s `DATABASE_URL`/`DIRECT_URL` at the supabase values from `.env.supabase`, run `npx prisma db push`, then **restore `.env` immediately**. (`npx prisma db pull --print` output can lie for the same reason — verify prod state with `information_schema`/`pg_indexes` via a PrismaClient script, which does honor an explicit `datasources.url`.)
- **Booking-creating tests** (`hardening`, `security`, `settingsBehaviour`) must call `cleanupTestBookings()` from `test/helpers.js` in both `before()` and `after()` — otherwise `bookedCount` accumulates until every session is full and capacity assertions fail on repeat runs.
- **Restart the API after route edits** — `node --watch` or a stale server causes false 404s. Kill by pid (`kill <pid>`, not `pkill -f`, which can kill the shell wrapper).
- Avoid shell variable `UID` (readonly in bash).
- **Zod**: `z.enum().strict()` is invalid; `.refine()` result has no `.partial()` (validate the base schema then refine).
- **Prisma**: upsert rejects `null` in nullable `@@unique` members → use `findFirst` + create/update. `StockMovement` has no `variant` relation.
- **PgBouncer (prod :6543)**: interactive `prisma.$transaction(async tx => …)` is incompatible. Use the batch (array) form or sequential ops. Never `.catch(()=>{})` inside a transaction (Postgres aborts the whole tx regardless).
- **Money** is `Decimal(10,2)` for commerce; wrap `Number()` around Decimal values before arithmetic.
- **Soft deletes**: Product/Discount/Collection use `deletedAt` (filter `deletedAt: null` in lists) — never hard-delete these.
- **Audit**: write admin/money actions via `lib/audit.js` (AuditLog table).
- **Email**: queue via `services/email.js` (`enqueueEmail` awaited in routes, `drainEmailQueue` in the hourly job). No SMTP yet → rows mark `failed`/`SMTP not configured`.
- **Installs / locks**: the root `package-lock.json` is the only lock for backend+frontend (mobile keeps its own for standalone Expo). Never create `backend/package-lock.json`/`frontend/package-lock.json` (e.g. `npm install --prefix …` does) — a second lock forks a divergent tree. Install from the repo root (`npm ci --workspace=backend --workspace=frontend --include=dev`); member-dir installs are OK since npm walks up.
- **Adding a setting**: one entry in `backend/src/lib/settingsSchema.js` (SECTIONS/SETTINGS). Validation, public filter, defaults and the admin form (`GET /api/settings/schema`) all derive from it — never hand-edit the admin form. Endpoints: public `GET /api/settings`, admin `GET /api/settings/all|schema`, `PUT /api/settings` (validated upsert), `POST /api/settings/reset` `{keys}` (drops overrides → defaults), `POST /api/settings/test-email` `{to}` (reports `smtpConfigured`). Storefront reads them through `frontend/src/lib/publicSettings.js` (`usePublicSettings()`); after a save the admin form re-applies the theme (`applyTheme({force:true})`) and invalidates that cache. Settings are **global DB state**: tests that flip them must restore defaults in their `after()` hook so they can't leak into other suites.
- **Settings enforcement points**: `checkout_payment_methods` + `min_order_amount` + `terms_required` + `enable_order_notes` (orders checkout), `shipping_free_over` (services/shipping.js), `maintenance_mode` (app.js gate — 503 on public GETs, staff JWT bypass, `/api/{health,settings,auth}` always open), `workshop_bookings_enabled`/`workshop_waitlist_enabled` (book route), `loyalty_signup_bonus`/`loyalty_min_redeem_points` (auth register / loyalty redeem), `admin_order_alert_*` + `customer_status_emails_enabled` + `email_signature` + `invoice_footer` (services/email.js).
- **Dark mode**: `html.dark` flips semantic Tailwind tokens (`bg-surface/surface2/surface3`, `text-ink`, `text-muted`, `border-line/line-strong`, `text-highlight`) defined in `frontend/src/index.css` + `tailwind.config.js`. New UI must use these tokens, not `bg-white`/`text-gray-*` (which don't flip). Colour mode state: `frontend/src/lib/colorMode.js` (`kfk_color_mode` in localStorage; no-flash script in `index.html`).
- **Cart stock enforcement**: `POST /api/cart/add|update` (backend/src/routes/cart.js) stock-check tracked products — variant `inventoryQuantity`, else the default-location `InventoryLevel`; overstock → 422 `out_of_stock`. Line qty clamped 0–99. `GET /api/products/:slug` returns `availableQty` (use it for page stock display, not variant-only fields). Storefront cart state and totals live in `frontend/src/lib/cartClient.js` (`fetchCart`/`addToCart`/`updateCartItem`/`computeCartTotals` — totals derive from public settings: GST/loyalty/shipping_free_over). Don't hand-roll totals or clear the cart with bare localStorage logic.
- **Configurator pricing**: floor (`configurator_floor` + `configurator_per_stem`×stems) prices the BOUQUET only; add-ons (vase/greenery/dome/led — `configurator_*` settings) always bill on top of the floor. Custom-order spec includes `domeIncluded`/`ledIncluded`/`palette`. Seed sets `bom_margin='1.30'` (a stale `0.30` in a DB makes every order clamp to the floor — reset the key if seen).
- **Product florist fields**: `flowerType`, `colourFamily`, `stemLengthMm`, `occasions[]`, `careInstructions` (Prisma `@@map("products")` — raw SQL must use snake_case table + quoted camelCase columns). Public list filters: `?flowerType=rose|lily|…`, `?colourFamily=`, `?occasion=` (has-filter). Admin ProductModal edits them; Product page renders a florist info box when present.

## Storefront UI kit

- `frontend/src/components/ui/Btn.jsx` — shared button/link. Pick a `variant` (primary/outline/soft/danger/dangerOutline) AND a `size` (lg/md/sm/pill/pillLg/inline/icon/bare); `to` renders a router `<Link>`. **Never pass shape utilities (py/px/rounded/border/text-size) via `className`** — Tailwind resolves conflicting utilities by CSS order, not string order, so sizes would silently break; `className` is only for spacing/layout extras (mt-*, w-full, hidden sm:block…).
- `frontend/src/components/ui/Field.jsx` — `Input`/`Select`/`TextArea` with built-in sr-only `<label>` (pass `label` + placeholder text; `labelVisible` is reserved for the Phase 3.2 a11y pass). Size `sm` adds `text-sm`.
- `frontend/src/components/ProductCard.jsx` — Shop catalogue card (`p`, `showCricut` props).
- Migrated pages (use the kit): Shop, Cart, Product, Checkout, Workshops. **Not** migrated — leave raw markup: Admin, POS, Login (separate royal auth design system), SiteHeader, Configurator.

## Uploads / storage

- `services/storage.js`: Supabase Storage (prod, bucket `product-images`) or local disk (dev). Requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (service_role key is server-side only — never expose to the frontend).
- Browser downscales images before upload; one file per request (Netlify ~6 MB payload limit).
- SVG/PDF rejected; images decoded by sharp then re-encoded to JPEG.

## Procedures (specs & guides module)

- Routes `backend/src/routes/procedures.js` mounted at `/api/procedures` (after suppliers in app.js). Tables/enums pushed to prod; re-`db push` only if schema changes again.
- RBAC: Editor = maker/staff/admin/developer (create/edit/upload/import); delete = admin/developer only; draft detail read = any authenticated; published = public. List filter `?status=draft|archived|all` staff-gated; list is envelope `{procedures,total,page,pages,limit}` (default limit 20, `orderBy updatedAt desc`).
- `authenticate` never calls next() on failure → procedures uses a response-free `optionalAuth(req)` helper (checks `Bearer ` header first) instead of awaiting `authenticate` inline (blog's pattern hangs).
- Uploads: `uploadDocs` (25MB ×8, middleware/upload.js) + MIME sniff (`docMimeLooksReal`); sharp for raster. Bucket `procedure-media` via `putObject(key, buf, mime, { bucket })`; local driver writes `backend/uploads` and vite dev proxies **both** `/api` and `/uploads` to :3001.
- **External source** (`services/external-fetch.js`): SSRF-hardened `fetchExternal` — http(s)-only, no embedded credentials, private/loopback/link-local/metadata ranges blocked by resolved DNS answer, redirects re-screened per hop (≤3), streamed size cap, `AbortSignal.timeout`. `POST /:id/media/url` (Editor+, 25MB) reuses the sniff→sharp→store pipeline (octet-stream falls back to URL-extension). `POST /import-content` (Editor+, 2MB, text only; HTML/binary → 4xx) returns `{contentMarkdown, suggestedTitle, …}` for the editor import row. Both rate-limited 30/min (`procedures_external`).
- Seed = 3 docs behind `SKIP_DEMO` guard (prod tab starts empty by design), fixed UUIDs, initial revisions created server-side. Version bumps are `x.y+1` string increments with an automatic revision snapshot on PUT.
- Admin UI is inline in `frontend/src/pages/Admin.jsx` (house convention — Procedures/ProcedureModal/ProcedureDetail as local components, no separate files). Self-fetching (component loads its own data; the top-level `load(tab)` branch no-ops harmlessly). FileList is live — snapshot `Array.from(e.target.files)` BEFORE clearing `input.value` or the upload silently sends nothing.
- Importing from a URL that returns HTML surfaces the server's "unsupported_content_type" message; external-fetch test helper in `test/procedures.test.js` (`mockExternal`) stubs non-test-server URLs — success paths must use `https://example.com/...` since DNS resolution is real.

## Netlify

- Site exists with **Base directory `mobile`** (works via `mobile/frontend` + `mobile/netlify` symlinks, but publishing/bundling that way is fragile — recommended: clear Base directory to repo root).
- Site env sets `NODE_ENV=production` → `netlify-build.sh` unsets it for the build, else npm skips devDependencies (`vite: not found`, exit 127). Install runs once at the root (`--workspace=backend --workspace=frontend --include=dev`).
- `netlify/functions/api.js` wraps Express via `serverless-http`; `scheduled.js` runs hourly (`0 * * * *`) for cart cleanup, rate-limit purge, reminders, low-stock, and email drain; `health.js` probes the DB.
- `netlify.toml` external_node_modules must stay in sync with backend deps.
