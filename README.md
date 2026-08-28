# Krystal's Flower Kreations

Custom paper florist & armature art workshop — Cricut + origami flower creations.
Perth, Western Australia.

**Cutting-edge sales platform** — mobile-first shop, Facebook & Instagram integrated, blog, POS, inventory & workshop management.

> Separate codebase from LUX. No shared DB or tenant.

## Stack

| Layer | Tech |
|-------|------|
| Mobile | Expo SDK 52+ (React Native) + Expo Router + NativeWind |
| Web Storefront | Vite + React 18 + React Router + Tailwind CSS |
| Backend | Node.js + Express + Prisma (Postgres) + Zod + JWT |
| DB | PostgreSQL 16 (Docker locally, Supabase/Neon prod) |
| Payments | Stripe Australia + Afterpay (via Stripe) + Apple/Google Pay |
| Storage | S3-compatible (R2 / Supabase Storage / S3 ap-southeast-2) |
| POS | Electron tablet or Expo POS + Stripe Reader M2 / Square Reader |

## Features

- **Online Shop** — products, variants, collections, made-to-order, digital Cricut templates, cart, checkout (GST-inclusive), shipping (Perth metro / WA / national + click & collect)
- **Meta Integrated** — Graph API catalog sync → Facebook & Instagram Shopping, IG feed embed, share-to-story
- **Blog** — tutorials, Cricut tips, origami folds, SVG previews, SEO
- **Workshops** — calendar, capacity, waitlist, kits, QR check-in, reminders
- **POS** — counter + market stall, barcode/QR, split payments, receipts, offline queue, till reconciliation
- **Inventory & Admin** — multi-location, PO, stocktake, movements, low-stock alerts, analytics

## Quick Start

```bash
# 1. Backend
cd backend
cp .env.example .env
npm install
npx prisma migrate dev --name init
npx prisma db seed
npm run dev  # http://localhost:3001

# 2. Web Storefront
cd ../frontend
npm install
npm run dev  # http://localhost:5173

# 3. Mobile
cd ../mobile
npm install
npx expo start
```

## Project Structure

```
├── backend/            Express API + Prisma
│   ├── prisma/schema.prisma
│   ├── src/routes/     products, cart, orders, inventory, pos, workshops, blog, meta-sync
│   ├── src/services/   stripe, shipping, metaSync
│   └── src/middleware/ auth, validate, rateLimit
├── frontend/           Vite React storefront + admin
├── mobile/             Expo app (tabs: Home, Shop, Workshops, Blog, Account)
├── docs/               Setup, deployment, Meta integration
└── docker-compose.yml  Postgres + Meilisearch (optional)
```

## Deployment

- **Backend + Web**: Fly.io Sydney / Vercel / Netlify + Supabase Postgres
- **Mobile**: EAS Build → TestFlight / Play Internal
- **Domain**: krystalsflowerkreations.com.au (verify for FB catalog)

## Environment

See `backend/.env.example`, `frontend/.env.example`.

## License

Private — Krystal's Flower Kreations, Perth WA
