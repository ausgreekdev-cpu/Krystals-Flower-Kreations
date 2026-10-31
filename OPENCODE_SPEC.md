# ROLE & OBJECTIVE
You are an autonomous Senior Full-Stack & React Native (Expo) Architect operating inside OpenCode. Your objective is to implement the full production backlog for the **Krystal’s Flower Kreations** companion mobile app and its supporting backend API updates.

## SYSTEM & REPO CONSTRAINTS
- **App Display Name:** Krystal’s Flower Kreations
- **Android Package Name:** `au.com.krystalsflowerkreations.app`
- **Primary Domain (Deep Links):** `krystalsflowercreations.com.au`
- **Architecture:** Single Expo (React Native + TypeScript) application in `mobile/` using Expo Router with strict role-based access control (`customer`, `staff`, `admin`), paired with our existing backend API and database.
- **Tax & Currency:** All pricing in AUD ($). Explicit 10% Australian GST calculation (`subtotal * 0.10` or inclusive `total / 11` depending on existing product schema—verify existing backend convention first).
- **Execution Rule:** Work methodically phase-by-phase. Always inspect existing files before creating new ones, reuse existing UI components/theme tokens, and run `npx tsc --noEmit` and tests at the end of every phase to ensure zero regressions.

---

## EXECUTION PHASES

### PHASE 0: Codebase Audit & Discovery (DO THIS FIRST)
1. Inspect the repository root, backend API structure, database schema, and `mobile/` directory.
2. Identify the current Expo SDK version, router file tree (`mobile/app/`), state management (Zustand/Context/TanStack Query), and backend framework.
3. Output a concise summary of existing files vs. missing components for Phases 1–5, then immediately proceed to Phase 1 unless a critical blocker requires clarification.

---

### PHASE 1: Repo Config, Backend API & Auth Role Gating (Backlog 0, 1, 4, 8)
#### 1A. Backend & API Updates
1. **Auth & Role Payload:** Ensure the user model and auth login/session endpoints return `role: 'customer' | 'staff' | 'admin'`.
2. **Middleware & Security:**
   - Add strict role-checking middleware (`requireRole(['staff', 'admin'])`) to all staff/POS/inventory routes.
   - Add rate limiting to mobile authentication endpoints.
   - Create an `AuditLog` mechanism (or extend existing logging) recording `userId`, `role`, `action`, `entityId`, `metadata`, and `timestamp` for all mobile staff mutations (POS orders, stock adjustments, order status changes, workshop check-ins).
3. **Mobile Endpoints:**
   - `POST /api/mobile/push-token`: Register/update Expo push token tied to the authenticated user and device.
   - `GET /api/mobile/home-summary`: Return featured products, active announcements, and upcoming workshop highlights in a single payload.
   - `GET /api/mobile/staff-dashboard`: Return today's POS summary, pending order count, low-stock alert count, and today's workshop attendance summary.
4. **POS Idempotency:** Update POS order creation and stock movement endpoints to accept an `Idempotency-Key` header (or `idempotencyKey` payload field) so duplicate offline-queued retries return the original successful response without double-charging or double-deducting stock.

#### 1B. Expo Config & EAS Setup (`mobile/`)
1. Update `mobile/app.json` (or `app.config.ts`):
   - `name`: `"Krystal’s Flower Kreations"`
   - `slug`: `"krystals-flower-kreations"`
   - `android.package`: `"au.com.krystalsflowerkreations.app"`
   - Configure permissions: `CAMERA` (for QR/barcode scanning), `RECEIVE_BOOT_COMPLETED`, `VIBRATE`, internet/network state.
   - Configure adaptive icon, splash screen, and Android `intentFilters` for `https://krystalsflowercreations.com.au/product/*`, `/workshop/*`, and `/account/orders/*`.
2. Create/update `mobile/eas.json` with `development`, `preview` (internal APK/AAB distribution), and `production` (Android App Bundle `.aab` with remote credentials/keystore signing) profiles.

#### 1C. Mobile Auth & Expo Router Guards
1. Implement an Auth Provider using `expo-secure-store` to persist `{ token, refreshToken, user: { id, name, email, role } }`.
2. Structure `mobile/app/` using Expo Router layout groups:
   - `app/(auth)/login.tsx`
   - `app/(customer)/_layout.tsx` -> Tabs: `home`, `shop`, `workshops`, `blog`, `account`
   - `app/(staff)/_layout.tsx` -> Tabs: `pos`, `orders`, `inventory`, `workshops`, `more`
3. Implement root navigation guards:
   - Unauthenticated users redirect to `/(auth)/login`.
   - On login, `customer` routes to `/(customer)/home`; `staff` and `admin` route to `/(staff)/pos`.
   - Add a persistent "Switch to Customer View / Switch to Staff Mode" toggle in `/(staff)/more` and `/(customer)/account` visible ONLY when `user.role === 'staff' || user.role === 'admin'`.

---

### PHASE 2: Customer Features (Backlog 2)
Implement the `(customer)` screens connected to live API endpoints with offline caching fallback:
1. **Home (`/(customer)/home`):** Consume `GET /api/mobile/home-summary` to render Featured Products carousel, Studio Announcements banner, and Upcoming Workshop highlights.
2. **Shop (`/(customer)/shop`):**
   - Product catalog with category filters, search bar, and pagination.
   - Product Detail screen (`product/[slug].tsx`): variant selector, custom made-to-order input options (e.g., color palette, bespoke flower notes), price breakdown.
   - Cart & Checkout flow: add/update/remove items, accurate 10% GST line item calculation, delivery method toggle (Standard Shipping vs. Studio Click & Collect), and order submission.
3. **Workshops (`/(customer)/workshops`):**
   - Interactive calendar/list view showing session capacity, remaining seats, and instant "Join Waitlist" button when full.
   - Booking confirmation flow.
   - "My Ticket" view generating/displaying a scannable QR code (`bookingId` + verification hash) and live check-in status for booked workshops.
4. **Blog & SVG Preview (`/(customer)/blog`):**
   - Article list and rich-text detail reader.
   - Interactive SVG/Cricut template previewer using `react-native-svg` (with pinch-to-zoom/pan or layer visibility toggle) for posts containing downloadable SVG/papercraft assets.
5. **Account (`/(customer)/account`):**
   - Profile & shipping address management, Order History list with live status tracker, Loyalty Points/Discount balance card, and Push Notification granular toggles.

---

### PHASE 3: Staff Features & Offline Sync Engine (Backlog 3, 5)
#### 3A. Offline Sync & Cache Engine (`mobile/src/services/offlineSync.ts`)
1. Cache product catalog and workshop rosters locally (via `expo-sqlite` or `@react-native-async-storage/async-storage`) for instant offline read access.
2. Build a persistent **Offline Mutation Queue** for POS sales, stock movements, and workshop QR check-ins:
   - Each queued item stores `{ id (UUID v4 idempotencyKey), endpoint, method, payload, createdAt, status: 'pending' | 'syncing' | 'failed', errorReason }`.
   - Monitor network connectivity via `@react-native-community/netinfo`. Automatically flush the queue FIFO when online.
   - Handle 409 Conflict / duplicate idempotency responses gracefully (mark as synced if already processed by server, or surface a manual conflict resolution modal if stock is insufficient).
   - Render a global `SyncStatusBanner` across `(staff)` screens showing queued item count, sync progress, and a manual "Retry Sync" button.

#### 3B. Staff Screens (`/(staff)/*`)
1. **POS (`/(staff)/pos`):**
   - Fast product search + camera barcode/QR scanner (`expo-camera`).
   - Cart builder with custom item/discount support, automatic 10% GST calculation, and total summary.
   - Payment method selector: `Cash`, `Bank Transfer / PayID`, `Click & Collect Pickup`, `Manual / EFTPOS Terminal`.
   - Works seamlessly online or queued offline; generates a digital receipt / order confirmation screen.
2. **Orders (`/(staff)/orders`):**
   - Filterable list (`All`, `Pending`, `Processing`, `Ready for Pickup`, `Completed`, `Refunded`).
   - Order detail view with 1-tap status progression, fulfillment checklist, and Refund/Adjustment audit notes.
3. **Inventory (`/(staff)/inventory`):**
   - Stock lookup by studio/storage location, Low-Stock Alert filter badge, quick Stock Movement logger (`+` / `-` with reason code: damaged, workshop use, restock), and Purchase Order (PO) receive / rapid stocktake mode.
4. **Workshops (`/(staff)/workshops`):**
   - Session roster & live attendance checklist.
   - Built-in QR Check-In scanner to validate customer workshop tickets.
   - Waitlist manager (promote waitlisted customer & trigger push/email notification).
5. **More / Admin Shortcuts (`/(staff)/more`):**
   - Read-only system status summary, Offline Queue inspector, Role View Switcher (Staff <-> Customer), and authenticated deep links/WebView shortcuts to the full web admin portal for complex BOM/3D configurator management.

---

### PHASE 4: Push Notifications & Deep Linking (Backlog 6, 7)
1. **Push Notifications:**
   - Configure `expo-notifications` handler, Android notification channels (`orders`, `workshops`, `staff-alerts`), and permission prompts after login.
   - Automatically send Expo push token to `POST /api/mobile/push-token`.
   - Wire backend triggers (or service stubs with test endpoints) for:
     1. Order status updates (Customer)
     2. Workshop 24h reminders (Customer)
     3. Waitlist spot promotion (Customer)
     4. Low-stock threshold crossed (Staff/Admin)
2. **Deep Links:**
   - Verify Expo Router route matching so opening `https://krystalsflowercreations.com.au/product/:slug`, `/workshop/:id`, or `/account/orders/:id` routes directly to the corresponding screen inside the app.

---

### PHASE 5: Testing & Play Store Release Readiness (Backlog 8, 9, 10, 11)
1. **Automated Tests:**
   - Write Jest unit tests covering Cart & POS math (subtotal, 10% GST calculation, discount application, rounding edge cases, and offline queue idempotency deduplication).
   - Write integration tests verifying Auth role gating (`customer` blocked from `(staff)` routes and API endpoints; `staff` allowed).
2. **Play Store Compliance Documentation (`docs/play-store/`):**
   - Generate `STORE_LISTING.md` containing Play Store Short Description (<80 chars), Full Description (<4000 chars), keywords, and a checklist for graphic assets (512x512 icon, 1024x500 feature graphic, phone/tablet screenshots).
   - Generate `DATA_SAFETY_AND_PRIVACY.md` containing exact responses for the Google Play Data Safety questionnaire (Account info, Purchase history, App activity, Device IDs for push notifications, zero location tracking), Content Rating declaration, and a complete Privacy Policy markdown page ready to host at `krystalsflowercreations.com.au/privacy-policy`.
   - Generate `RELEASE_RUNBOOK.md` detailing exact CLI commands for `eas build --platform android --profile production`, `eas submit --platform android`, internal/closed track testing checklists, staged rollout (10% -> 50% -> 100%), and `eas update` OTA patching.

---

## DEFINITION OF DONE
Before concluding each phase:
1. Run TypeScript typechecking (`npx tsc --noEmit`) across both backend and `mobile/` and resolve all errors.
2. Run the test suite and ensure all unit/integration tests pass.
3. Summarize completed files and explicitly prompt me before advancing to the next phase.

Begin now with **PHASE 0: Codebase Audit & Discovery**.