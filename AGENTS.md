# AGENTS.md — Krystal's Flower Kreations (operational notes)

Guidance for agents/tooling working in this repo. Concise, action-oriented.

## Repos — never mix

- **Krystal** (this repo): `/home/aiuser/Downloads/Krystals-Flower-Kreations`, `git@github.com:ausgreekdev-cpu/Krystals-Flower-Kreations.git`, branch `main`
- **LUX**: `/home/aiuser/Downloads/LUX`, `git@github.com:ausgreekdev-cpu/LUX-Traffic-Management.git` — separate project, do not touch.
- Bash calls without `workdir` default to the current dir; always set `workdir` for the repo you mean.

## Stack

Vite React web (`frontend/`) + Express/Prisma 5 Postgres (`backend/`) + Expo mobile (`mobile/`). Stripe **disabled** (`stripe=null`; payment enum `cash|bank_transfer|pickup|manual`).

## Commands

```bash
# backend (workdir = backend)
npm test            # integration suite (49 tests), needs DATABASE_URL set
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
- Seeded users (password `admin123`): `admin@krystal.local` (developer), `krystal@flowerkreations.com.au` (admin).
- Role ranks: customer 1 < staff/maker 2 < admin 3 < developer 4. Only developers can grant/modify the developer role.

## Gotchas

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

## Uploads / storage

- `services/storage.js`: Supabase Storage (prod, bucket `product-images`) or local disk (dev). Requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (service_role key is server-side only — never expose to the frontend).
- Browser downscales images before upload; one file per request (Netlify ~6 MB payload limit).
- SVG/PDF rejected; images decoded by sharp then re-encoded to JPEG.

## Netlify

- Site exists with **Base directory `mobile`** (works via `mobile/frontend` + `mobile/netlify` symlinks, but publishing/bundling that way is fragile — recommended: clear Base directory to repo root).
- Site env sets `NODE_ENV=production` → `netlify-build.sh` unsets it for the build, else npm skips devDependencies (`vite: not found`, exit 127). Install runs once at the root (`--workspace=backend --workspace=frontend --include=dev`).
- `netlify/functions/api.js` wraps Express via `serverless-http`; `scheduled.js` runs hourly (`0 * * * *`) for cart cleanup, rate-limit purge, reminders, low-stock, and email drain; `health.js` probes the DB.
- `netlify.toml` external_node_modules must stay in sync with backend deps.
