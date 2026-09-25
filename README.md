# Krystal's Flower Kreations

Custom paper florist & armature art workshop — Cricut + origami flower creations.
Perth, Western Australia.

**Custom (no Shopify) web + mobile + backend platform** — mobile-first shop, Facebook & Instagram catalog sync, blog, POS, inventory & workshop management.

> Separate codebase from LUX (the traffic-management app). No shared DB or tenant.

## Stack

| Layer | Tech |
|-------|------|
| Mobile | Expo SDK 52+ (React Native) + Expo Router |
| Web Storefront | Vite + React 18 + React Router + Tailwind CSS |
| Backend | Node.js + Express + Prisma (Postgres) + Zod + JWT |
| DB | PostgreSQL 16 — Supabase (prod, ap-southeast-2) / Docker or embedded (local) |
| Payments | **Stripe disabled** — cash / bank transfer / pickup / manual (`stripe=null`) |
| Storage | Supabase Storage (prod) / local disk `backend/uploads` (dev) |
| POS | Web POS in the admin console + offline queue |

## Features

- **Online Shop** — products, variants, collections, made-to-order, digital Cricut templates, cart, checkout (GST-inclusive), shipping (Perth metro / WA / national + click & collect)
- **Meta Integrated** — Graph API catalog sync → Facebook & Instagram Shopping (off until `META_*` tokens set)
- **Blog** — tutorials, Cricut tips, origami folds, SVG previews, SEO
- **Workshops** — calendar, capacity, waitlist, kits, QR check-in, reminders (deduped)
- **POS** — counter + market stall, offline queue, till reconciliation
- **Inventory & Admin** — multi-location, PO, stocktake, transfers, movements, low-stock alerts, BOM recipes, customers, discounts, loyalty, audit log

## Quick Start

```bash
# 1. Database (Docker)
docker compose up -d db

# 2. Backend
cd backend
cp .env.example .env
npm install
npx prisma db push            # migrations dir is gitignored — db push is the source of truth
npm run seed                  # seeds admin@krystal.local / admin123 + catalog (idempotent)
npm run dev                   # http://localhost:3001
npm test                      # integration test suite

# 3. Web Storefront
cd ../frontend
npm install
npm run dev                   # http://localhost:5173
npm run build                 # production build

# 4. Mobile (optional)
cd ../mobile
npm install
npx expo start
```

Root shortcuts: `npm run db:up` / `npm run db:push` / `npm run db:seed` / `npm run dev` (backend+frontend together).

### Admin console

- URL: `http://localhost:5173/admin` (or `/login`)
- Seeded staff logins (password `admin123`):
  - `admin@krystal.local` — role `developer`
  - `krystal@flowerkreations.com.au` — role `admin`

## Project Structure

```
├── backend/               Express API + Prisma
│   ├── prisma/schema.prisma
│   ├── prisma/seed.js
│   ├── src/routes/        products, cart, orders, inventory, pos, workshops, blog, users, settings, discounts, shipping, purchase-orders, loyalty, meta, …
│   ├── src/services/      storage, email, shipping, bomPricing, loyaltyService, metaSync, stripe (stub)
│   ├── src/middleware/    auth, validate, rate-limit, upload, error-handler, async-handler
│   ├── src/lib/           prisma, auth, config, audit
│   └── test/              node:test integration suite (41 tests)
├── frontend/              Vite React storefront + admin console
├── mobile/                Expo app (Home, Shop, Workshops, Blog, Account)
├── netlify/               functions/api.js (serverless-http) + scheduled.js (hourly cron) + health.js
├── netlify.toml           redirects + external_node_modules
├── .env.netlify.template  full prod env reference
└── docker-compose.yml     Postgres 16 (local dev)
```

## Deployment

- **Backend + Web**: Netlify Functions (`netlify/functions/api.js`) + static `frontend/dist`
- **DB**: Supabase Postgres — runtime uses the transaction pooler (`:6543?pgbouncer=true`), schema changes use the session pooler via `DIRECT_URL` (`:5432`)
- **Uploads**: Supabase Storage bucket `product-images`
- **Email**: queued in Postgres (`EmailQueue`) and drained by the hourly `scheduled.js` function — needs SMTP env vars to actually send
- **Mobile**: EAS Build → TestFlight / Play Internal

## Environment

- Local: `backend/.env` (gitignored) — copy from `backend/.env.example`
- Production reference: `backend/.env.supabase` (gitignored) and `.env.netlify.template`
- Required in prod: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET` (32+ chars), `FRONTEND_URL`
- Uploads: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`
- Optional: `SMTP_*` (email), `META_*` (Meta shop), `COMPANY_EMAIL` (low-stock alerts)

## License

Private — Krystal's Flower Kreations, Perth WA
