# Krystal's Flower Kreations — Product Feature Audit & Competitive Gap Analysis

## Phase 1: Complete Feature Inventory

### Core E-Commerce

| # | Feature | Entry Point | Explanation |
|---|---------|------------|-------------|
| 1 | Product catalog (variants, collections, images) | `backend/src/routes/products.js`, `productVariants.js`, `frontend/src/pages/Shop.jsx` | Browse, filter, and view products with responsive image variants, collections, and custom fields |
| 2 | Cart & checkout (GST-inclusive, multi-shipping) | `backend/src/routes/cart.js`, `orders.js`, `frontend/src/pages/Cart.jsx`, `Checkout.jsx` | Full checkout with Perth metro/WA/national shipping, click & collect, bank transfer, cash, invoice |
| 3 | Digital Cricut templates | `backend/src/routes/products.js` (svgUrl), `frontend/src/pages/Product.jsx` | Token-gated SVG delivery for purchased digital templates via `/api/dl/:token` |
| 4 | Custom bouquet configurator | `frontend/src/features/configurator/Configurator.jsx`, `backend/src/routes/configuratorPricing.js` | Visual drag-and-drop bouquet builder with 4 templates, live pricing, production sheets, cut files, shareable URLs |
| 5 | Customer accounts & reviews | `backend/src/routes/account.js`, `reviews.js`, `frontend/src/pages/Account.jsx` | Order history, tracking, digital re-downloads, product reviews with approval |
| 6 | Discounts & loyalty | `backend/src/routes/discounts.js`, `loyalty.js` | Discount codes, loyalty points (1pt/$1), tier system, bonus rules |
| 7 | Meta (FB/IG) catalog sync | `backend/src/services/metaSync.js`, `backend/src/routes/meta.js` | Graph API catalog sync to Facebook & Instagram Shopping |
| 8 | Blog | `backend/src/routes/blog.js`, `frontend/src/pages/Blog.jsx` | Tutorials, Cricut tips, origami folds, SVG previews, SEO |

### Studio Operations

| # | Feature | Entry Point | Explanation |
|---|---------|------------|-------------|
| 9 | Workshops | `backend/src/routes/workshops.js`, `workshopSessions.js`, `frontend/src/pages/Workshops.jsx` | Calendar, capacity, waitlist, kits, QR check-in, reminders |
| 10 | Bookings | `backend/src/routes/bookings.js` | Booking management with session capacity, waitlist, reminders |
| 11 | POS | `backend/src/routes/pos.js`, `posSales.js`, `posSessions.js`, `frontend/src/pages/Admin.jsx` (POS tab) | Counter + market stall, offline queue, till reconciliation |
| 12 | Inventory (multi-location) | `backend/src/routes/inventory.js`, `frontend/src/pages/Admin.jsx` | Multi-location levels, transfers, stocktakes, movements, lots, low-stock alerts |
| 13 | Raw materials & BOM recipes | `backend/src/routes/bom.js`, `rawMaterials.js` | Material profiles, BOM recipes with lines, labour/cricut minutes, waste factors |
| 14 | Suppliers & purchase orders | `backend/src/routes/suppliers.js`, `purchaseOrders.js` | Supplier directory, PO creation, receiving, stats |
| 15 | Paper stocks (configurator) | `backend/src/routes/paperStocks.js` | Sellable paper catalogue with colour/type/texture/weight, CSV import |
| 16 | Shipping & settings | `backend/src/routes/shippingAdmin.js`, `settings.js` | Zone-based shipping, 12-section schema-driven settings (88 keys) |
| 17 | Users & RBAC | `backend/src/routes/users.js`, `backend/src/lib/auth.js` | Role-based access (admin/developer/maker/staff/customer), JWT with refresh |

### Manufacturing Pipeline

| # | Feature | Entry Point | Explanation |
|---|---------|------------|-------------|
| 18 | Procedure documents | `backend/src/routes/procedures.js` | Manufacturing SOPs with two-axis taxonomy (category + subcategory), media, revisions |
| 19 | Procedure import pipeline | `backend/src/routes/procedureImports.js`, `backend/src/services/procedureAnalyzer.js` | LLM/rules analysis of documents → pending proposals → approve → creates materials/recipe/product/procedure |
| 20 | BOM versioning | `backend/src/routes/bom.js` (revisions endpoint) | Recipe revision history with labour/cricut/lines snapshots |
| 21 | Cost recalculation | `backend/src/services/costRecalc.js` | Recomputes recipe pricing when material costs change, flags products |
| 22 | Stock consumption on checkout | `backend/src/services/orderBom.js` (`consumeOrderMaterials`) | Decrements raw material stock, writes StockMovement + audit |
| 23 | Stock replenishment | `backend/src/services/replenishment.js` | Auto-creates draft POs for low-stock materials, grouped by supplier |
| 24 | Material substitution | `backend/src/services/bomPricing.js` (`suggestSubstitutes`) | Scores in-stock alternatives by unit/weight/colour/size/brand |
| 25 | Batch production runs | `backend/src/services/productionRuns.js` | Groups orders by product, consolidated BOM, status transitions |
| 26 | Order fulfillment workflow | `backend/src/routes/orderFulfillment.js` | Single endpoint: BOM check → stock → snapshot → run → QC → status → notify |
| 27 | Procurement auto-workflow | `backend/src/routes/procurementAuto.js` | Low-stock scan → draft POs by supplier → notify |
| 28 | QC checkpoints | `backend/src/routes/orders.js` (PATCH /:id/qc) | Quality check before shipment, blocks shipping on failure |
| 29 | Order auto-progress | `backend/src/services/productionRuns.js` | Orders move paid→making→ready when production runs transition |

### Document Centre

| # | Feature | Entry Point | Explanation |
|---|---------|------------|-------------|
| 30 | Document upload & storage | `backend/src/routes/documents.js` | Private-bucket storage with dedup (sha256), auto-categorise, thumbnails |
| 31 | OCR (Tesseract.js) | `backend/src/services/ocr.js`, `backend/src/routes/documents.js` | Auto-OCR on upload, word boxes, searchable PDF export |
| 32 | Document enrichment (LLM) | `backend/src/services/documentEnricher.js` | Auto-enrich metadata from extracted text (category, tags, title) |
| 33 | Document scanning (prepareImage) | `backend/src/routes/documents.js` | Preserves original bytes, re-encodes only oversized |
| 34 | Assemble scanned pages | `backend/src/routes/documents.js` (POST /assemble) | Multi-page scan → single PDF with per-page OCR |

### Platform & Infrastructure

| # | Feature | Entry Point | Explanation |
|---|---------|------------|-------------|
| 35 | In-app agent system | `backend/src/routes/agents.js`, `frontend/src/pages/Admin.jsx` (Agents tab) | DB-backed agent registry with CRUD, LLM runner, run history |
| 36 | In-app skills | `backend/src/routes/skills.js` | Reusable instruction sets (markdown) with triggers |
| 37 | In-app workflows | `backend/src/routes/workflows.js` | Multi-step automations with step builder and run history |
| 38 | In-app automations | `backend/src/routes/automations.js` | Cron/event/manual triggered actions |
| 39 | Event bus | `backend/src/services/eventBus.js` | Pub/sub with priority, fire-and-forget or awaited, monitoring |
| 40 | Side-effect runner | `backend/src/services/sideEffects.js` | Retry with exponential backoff, dead-letter to audit log |
| 41 | Studio health dashboard | `backend/src/routes/studioHealth.js`, `frontend/src/pages/Admin.jsx` | Aggregates orders, revenue, inventory, operations, alerts, recent orders |
| 42 | Admin KPI widgets | `backend/src/routes/adminKpis.js` | Low stock, pending QC, procurement drafts, active runs, open orders |
| 43 | CSV data export | `backend/src/routes/export.js` | Export inventory, materials, orders, suppliers as CSV |
| 44 | Request metrics | `backend/src/services/metrics.js`, `backend/src/routes/metrics.js` | Request counts, error rates, latency p50/p95/p99 |
| 45 | Correlation IDs | `backend/src/middleware/correlation-id.js` | X-Request-ID on every request for tracing |
| 46 | Data archival | `backend/src/routes/archive.js` | Soft-archive old orders, stock movements, audit logs |
| 47 | 3D model upload | `backend/src/routes/model3d.js` | GLB upload with magic header validation, static serving |
| 48 | OpenAPI spec | `backend/src/lib/openapiSpec.js`, `backend/src/routes/docs.js` | Swagger UI at /api/docs, 60+ endpoints documented |
| 49 | Notifications | `backend/src/services/notifications.js` | Centralized notify() dispatcher (order, booking, custom order, status) |
| 50 | Studio console | `frontend/src/pages/Admin.jsx` (Studio tab) | Unified skills/workflows/automations with CRUD, toggle, run, export |
| 51 | Agent console | `frontend/src/pages/Admin.jsx` (Agents tab) | Agent list, run, view, create, edit, delete |
| 52 | Botanical Studio theme | `frontend/src/botanical.css`, `frontend/tailwind.botanical.config.js` | Warm paper, serif headings, soft radius, terracotta/sage accents |
| 53 | Accessibility | `scripts/axe-scan.mjs` | 48/48 axe-core pass, WCAG AA compliant |
| 54 | Mobile app | `mobile/` (Expo) | Home, Shop, Workshops, Blog, Account screens |

---

## Phase 2: Market Research & Feature Scoring Matrix

### Competitor Landscape

| Competitor | Category | Strengths | Weaknesses |
|-----------|----------|-----------|------------|
| **Lama Maker** | Maker ERP | BOM versioning, multi-level BOMs, cost rollup, production batches, multi-channel sales | Desktop-only, no web storefront, no workshops, no configurator |
| **MakeFlow** | Studio management | Smart pricing calculator, Kanban production board, AI invoice extraction, file storage | No BOM versioning, no multi-location inventory, no POS |
| **MakerFusion** | Craft business | Inventory reorder alerts, recipe storage, COGS auto-calc, multi-channel sync | No production runs, no QC, no procedure pipeline |
| **StockCraft** | Manufacturing ERP | Hierarchical BOMs, MRP, reorder points, production workflows, market management | Factory-focused, no storefront, no workshops, no Cricut |
| **Keepsel** | Cricut inventory | Vinyl/blank tracking, project recipes, work orders, low-stock alerts | Cricut-only, no BOM, no workshops, no procedures |
| **FlowerBuddy** | Floral ERP | AI recipes, multi-site ops, client CRM, QuickBooks sync, contracts | Floral-specific (not paper), expensive ($150/mo), no Cricut |
| **Katana MRP** | Manufacturing | Real-time inventory, multi-level BOMs, Shopify sync, reorder alerts | Enterprise pricing, no workshops, no configurator, no procedures |
| **Cronk** | Personalization | AI artwork automation, multi-channel sync, nesting, label gen | Personalization-only, no BOM, no workshops |
| **Craftomatic** | Sales tracking | Multi-channel sales, profit tracking, packing/shipping | No BOM, no production, no procedures, no workshops |
| **Ardent Seller** | Workshop management | Kit assembly, equipment tracking, COGS per workshop, multi-location | No storefront, no BOM, no inventory depth |
| **Kagenda** | Booking software | Online booking, deposits, reminders, capacity, gift vouchers | Booking-only, no inventory, no BOM, no storefront |
| **Ateliem** | Hobby studio | Class management, attendance, stock tracking, payments | No BOM, no production runs, no configurator |
| **Magpie** | Maker shop | One stock count, batch recipes, workshop RSVPs, staff scheduling | No BOM versioning, no MRP, no procedures |

### Scoring Matrix (0-100)

| Rank | Feature | Demand | Client Value | Dev Value | Implementability | Reliability | Efficiency | Overall |
|------|---------|--------|-------------|-----------|-----------------|-------------|-----------|---------|
| 1 | Product catalog + variants | 95 | 90 | 80 | 90 | 90 | 85 | 88.3 |
| 2 | Cart & checkout (GST) | 95 | 95 | 75 | 85 | 85 | 80 | 85.8 |
| 3 | Inventory (multi-location) | 90 | 90 | 85 | 80 | 85 | 75 | 84.2 |
| 4 | BOM recipes + costing | 85 | 90 | 90 | 85 | 80 | 80 | 83.3 |
| 5 | Workshops + bookings | 80 | 85 | 75 | 80 | 85 | 75 | 80.0 |
| 6 | Procedure import pipeline | 70 | 85 | 95 | 70 | 75 | 70 | 77.5 |
| 7 | Custom bouquet configurator | 85 | 90 | 70 | 65 | 70 | 75 | 75.8 |
| 8 | Document centre + OCR | 65 | 75 | 80 | 75 | 75 | 70 | 73.3 |
| 9 | Stock consumption on checkout | 80 | 85 | 80 | 85 | 75 | 80 | 79.2 |
| 10 | Raw materials & suppliers | 85 | 80 | 85 | 90 | 90 | 80 | 85.0 |
| 11 | POS | 75 | 80 | 70 | 80 | 75 | 70 | 75.0 |
| 12 | Discounts & loyalty | 70 | 70 | 65 | 85 | 80 | 75 | 74.2 |
| 13 | Blog + SEO | 60 | 55 | 50 | 90 | 85 | 80 | 70.0 |
| 14 | Settings (schema-driven) | 50 | 60 | 95 | 90 | 90 | 85 | 78.3 |
| 15 | Dark/light theme | 60 | 55 | 70 | 90 | 90 | 85 | 75.0 |
| 16 | Meta catalog sync | 50 | 60 | 60 | 70 | 60 | 65 | 60.8 |
| 17 | Paper stocks (configurator) | 75 | 80 | 75 | 85 | 80 | 75 | 78.3 |
| 18 | Shipping admin | 60 | 65 | 60 | 85 | 80 | 75 | 70.8 |
| 19 | QC checkpoints | 60 | 70 | 75 | 85 | 70 | 75 | 72.5 |
| 20 | Procurement workflow | 65 | 75 | 80 | 80 | 70 | 75 | 74.2 |
| 21 | Production runs (batch) | 60 | 70 | 80 | 75 | 70 | 70 | 70.8 |
| 22 | Replenishment (auto PO) | 70 | 75 | 80 | 80 | 70 | 75 | 75.0 |
| 23 | Material substitution | 55 | 65 | 75 | 85 | 70 | 75 | 70.8 |
| 24 | Cost recalculation | 60 | 70 | 80 | 85 | 70 | 80 | 74.2 |
| 25 | Recipe versioning | 50 | 60 | 85 | 80 | 75 | 80 | 71.7 |
| 26 | In-app agent system | 40 | 50 | 90 | 75 | 60 | 65 | 62.5 |
| 27 | In-app skills | 35 | 45 | 85 | 85 | 70 | 75 | 65.8 |
| 28 | In-app workflows | 40 | 50 | 85 | 80 | 70 | 70 | 65.8 |
| 29 | In-app automations | 45 | 55 | 85 | 80 | 70 | 70 | 66.7 |
| 30 | Event bus | 30 | 40 | 90 | 85 | 70 | 80 | 65.8 |
| 31 | Side-effect runner | 30 | 40 | 85 | 85 | 70 | 80 | 65.0 |
| 32 | Studio health dashboard | 55 | 65 | 75 | 85 | 75 | 80 | 72.5 |
| 33 | Admin KPI widgets | 50 | 60 | 70 | 90 | 80 | 85 | 72.5 |
| 34 | CSV data export | 65 | 70 | 60 | 90 | 85 | 80 | 75.0 |
| 35 | Request metrics | 40 | 50 | 85 | 90 | 80 | 85 | 71.7 |
| 36 | Correlation IDs | 30 | 40 | 85 | 95 | 85 | 90 | 70.8 |
| 37 | Data archival | 45 | 50 | 70 | 85 | 70 | 80 | 65.8 |
| 38 | 3D model upload (GLB) | 70 | 75 | 70 | 80 | 75 | 75 | 74.2 |
| 39 | OpenAPI/Swagger docs | 50 | 55 | 90 | 90 | 85 | 85 | 75.8 |
| 40 | Notifications (email) | 75 | 80 | 70 | 85 | 75 | 75 | 76.7 |
| 41 | Botanical Studio theme | 50 | 55 | 60 | 90 | 90 | 85 | 71.7 |
| 42 | Accessibility (WCAG AA) | 40 | 50 | 60 | 85 | 90 | 85 | 68.3 |
| 43 | Mobile app (Expo) | 70 | 75 | 60 | 50 | 50 | 60 | 60.8 |
| 44 | Meta catalog sync | 45 | 50 | 55 | 70 | 60 | 65 | 57.5 |

### Scoring Justifications (selected)

**#1 Product catalog + variants (88.3):** Table-stakes for any e-commerce. Demand 95 (every buyer expects a catalog). Client value 90 (core revenue driver). Dev value 80 (reusable ProductImage, variants). Implementability 90 (clean Prisma schema, well-tested). Reliability 90 (extensive test coverage). Efficiency 85 (responsive variants, lazy loading). *Competitor ref: Shopify product pages, Etsy listings.*

**#4 BOM recipes + costing (83.3):** Differentiator for makers. Demand 85 (makers need cost tracking). Client value 90 (protects margins). Dev value 90 (bomPricing.js is a clean, reusable service). Implementability 85 (well-structured, but recipe versioning is new). Reliability 80 (tested but edge cases around multi-variant recipes). Efficiency 80 (costForRecipe is fast, single query). *Competitor ref: Lama Maker BoM, StockCraft BOM management, Katana multi-level BOMs.*

**#6 Procedure import pipeline (77.5):** Unique differentiator. Demand 70 (niche but growing — makers want to digitize SOPs). Client value 85 (saves hours of manual data entry). Dev value 95 (clean service layer, LLM + rules fallback, matchMaterials, priceProposal). Implementability 70 (complex multi-step, many DB writes). Reliability 75 (tested but approve flow has many moving parts). Efficiency 70 (LLM calls are slow, rules fallback is fast). *Competitor ref: No direct competitor — this is a moat. Closest: MakeFlow's "Ask Chippy" AI assistant.*

**#7 Custom bouquet configurator (75.8):** Strong differentiator. Demand 85 (custom products drive conversion). Client value 90 (customers design their own). Dev value 70 (complex state management, many components). Implementability 65 (large component, many edge cases). Reliability 70 (works but limited test coverage). Efficiency 75 (live quote debounced, but image loading is heavy). *Competitor ref: No paper-florist configurator exists. Closest: Shopify product customizers (generic).*

**#26 In-app agent system (62.5):** Developer-focused. Demand 40 (niche — developers/admins). Client value 50 (indirect — enables automation). Dev value 90 (reusable agent framework, LLM integration). Implementability 75 (clean CRUD, but runner is basic). Reliability 60 (no tests for agent runs, LLM calls can fail). Efficiency 65 (LLM calls are slow). *Competitor ref: MakeFlow's "Ask Chippy" AI assistant, Cronk's AI artwork automation.*

**#43 Mobile app (60.8):** High demand but low maturity. Demand 70 (mobile commerce is expected). Client value 75 (convenience). Dev value 60 (Expo, separate codebase, limited feature parity). Implementability 50 (separate build pipeline, EAS builds). Reliability 50 (minimal test coverage, not integrated with new features). Efficiency 60 (basic screens, no offline support). *Competitor ref: Shopify mobile app, Etsy seller app.*

---

## Phase 3: Actionable Roadmap

### 1. What Needs Improvement (Existing Features)

#### A. Inventory multi-location — N+1 queries in low-stock scan
- **What:** The low-stock endpoint (`GET /api/inventory/low-stock`) does 4 separate queries (materials, levels, variants, papers) and filters in JS. For large catalogs this is slow.
- **Where:** `backend/src/routes/inventory.js` (low-stock handler), `frontend/src/pages/Admin.jsx` (inventory tab)
- **Why:** Demand 90, Efficiency 75. Competitors (Katana, StockCraft) provide real-time inventory dashboards. Slow scans reduce admin productivity. **Fix:** Single query with joins, cache with 60s TTL, add pagination.

#### B. BOM recipe versioning — no diff view
- **What:** BOMRecipeRevision stores snapshots but there's no way to diff two versions. Admins can't see what changed.
- **Where:** `backend/src/routes/bom.js` (revisions endpoint), `frontend/src/pages/Admin.jsx` (recipes tab)
- **Why:** Dev value 85, but client value limited without a diff view. Craftplan and Lama Maker offer version comparison. **Fix:** Add `GET /api/bom/recipes/:id/revisions/diff?from=v1.0&to=v1.1` returning changed lines.

#### C. Order fulfillment — stock consumed at payment, not at fulfillment
- **What:** Stock is consumed when order moves to `paid`, but physical stock isn't actually used until production begins. If an order is cancelled after payment but before production, stock is already gone.
- **Where:** `backend/src/routes/orders.js` (PATCH /:id/status), `backend/src/services/orderBom.js` (consumeOrderMaterials)
- **Why:** Reliability 75. Katana tracks stock at production start, not payment. **Fix:** Move stock consumption to `making` status transition, add reservation system for paid orders.

#### D. Procedure import — LLM analysis has no timeout/retry
- **What:** `analyzeAndPlan` calls the LLM with no timeout. A slow provider blocks the request indefinitely.
- **Where:** `backend/src/services/procedureAnalyzer.js`
- **Why:** Reliability 75. Production LLM calls should have 30s timeout + 1 retry. **Fix:** Add AbortSignal.timeout(30000) and retry on 429/503.

#### E. Document OCR — auto-OCR blocks upload response
- **What:** Auto-OCR runs synchronously during upload (15s timeout). Large images can delay the upload response.
- **Where:** `backend/src/routes/documents.js` (upload handler, auto-OCR block)
- **Why:** Efficiency 70. Should be async (queue + webhook) like enrichment. **Fix:** Move OCR to a background job, return upload immediately, poll for OCR completion.

#### F. Configurator — no offline support
- **What:** Configurator requires network for live quote. No offline price estimation beyond the initial estimateLocalPrice fallback.
- **Where:** `frontend/src/features/configurator/Configurator.jsx`
- **Why:** Efficiency 75. Mobile users expect offline capability. **Fix:** Cache pricing config in service worker, compute estimates client-side.

### 2. What Is Missing (Table-Stakes & Market Gaps)

#### G. Multi-channel sales sync (Shopify, Etsy, Faire)
- **What:** No integration with external sales channels. Orders only come from the storefront.
- **Where:** New service `backend/src/services/channelSync.js`, new routes `backend/src/routes/channels.js`, admin tab
- **Why:** Demand 80. Craftomatic, MakerFusion, Cronk all sync with Etsy/Shopify. Makers selling on multiple platforms need unified inventory. **Competitor ref:** Craftomatic (Etsy+Faire+Shopify+Square), MakerFusion (Etsy CSV + Shopify), Cronk (Etsy+Shopify+Amazon+ShipStation).

#### H. Shipping label generation
- **What:** No shipping label printing. Admin must use external tools (AusPost, Sendle).
- **Where:** New service `backend/src/services/shippingLabels.js`, extend `shippingAdmin.js`
- **Why:** Demand 70. Craftomatic supports USPS First Class. Australian market needs AusPost/StarTrack/Sendle integration. **Competitor ref:** Craftomatic (USPS labels), Magpie (Stripe shipping).

#### I. QuickBooks/Xero accounting sync
- **What:** No accounting integration. Financial data is trapped in the platform.
- **Where:** New service `backend/src/services/accounting.js`, new routes
- **Why:** Demand 65. FlowerBuddy offers QuickBooks sync. Makers need tax reporting. **Competitor ref:** FlowerBuddy (QuickBooks), Katana (QuickBooks Online).

#### J. Customer-facing order tracking page
- **What:** No public tracking page. Customers get email updates but no self-service tracking.
- **Where:** `frontend/src/pages/OrderTracking.jsx`, `backend/src/routes/orders.js` (public tracking endpoint)
- **Why:** Demand 75. Standard e-commerce expectation. **Competitor ref:** Shopify, Etsy, all major platforms.

#### K. Product reviews with photos
- **What:** Reviews exist but don't support photo uploads.
- **Where:** `backend/src/routes/reviews.js`, `frontend/src/components/ReviewForm.jsx`
- **Why:** Demand 65. Etsy and Shopify both support photo reviews. Increases trust. **Competitor ref:** Etsy (photo reviews), Shopify (review apps).

#### L. Wishlist / saved items
- **What:** No wishlist functionality. Customers can't save products for later.
- **Where:** New `Wishlist` model, `backend/src/routes/wishlist.js`, `frontend/src/pages/Wishlist.jsx`
- **Why:** Demand 60. Standard e-commerce feature. **Competitor ref:** Shopify, Etsy.

#### M. Gift cards / vouchers
- **What:** No gift card system. Kagenda mentions gift vouchers for workshops.
- **Where:** New `GiftCard` model, `backend/src/routes/giftCards.js`, checkout integration
- **Why:** Demand 55. Revenue driver for workshops and products. **Competitor ref:** Kagenda (gift vouchers), Shopify (gift cards).

#### N. Batch email / newsletter
- **What:** No email marketing. Only transactional emails.
- **Where:** New `Campaign` model, `backend/src/routes/campaigns.js`, email service extension
- **Why:** Demand 60. Makers need to announce new products/workshops. **Competitor ref:** Shopify Email, Mailchimp integration.

### 3. What Needs to Be More Competitive (Differentiators & Moats)

#### O. AI-powered design assistant (configurator)
- **What:** The configurator has static presets. Add an AI assistant that suggests paper combinations, colour palettes, and flower arrangements based on occasion/budget.
- **Where:** `backend/src/services/llm.js` (new function), `frontend/src/features/configurator/Configurator.jsx` (AI suggestion panel)
- **Why:** Creates a moat — no competitor has AI-assisted paper flower design. MakeFlow has "Ask Chippy" but it's generic. **Competitor ref:** MakeFlow (Ask Chippy AI), FlowerBuddy (AI recipes/descriptions).

#### P. Real-time production dashboard
- **What:** Live view of all production runs, order statuses, and material consumption. WebSocket or SSE-based.
- **Where:** New `backend/src/services/realtime.js` (SSE), `frontend/src/pages/Admin.jsx` (new "Live" tab)
- **Why:** Competitors (Katana) offer real-time inventory. Makers need live visibility. **Competitor ref:** Katana (real-time inventory), On Hand Solution (live market tracker).

#### Q. Multi-tenant / white-label
- **What:** The platform is single-tenant. Allow other paper florists to use it with their own branding.
- **Where:** `backend/src/lib/tenant.js`, `frontend/src/lib/theme.js` (already supports runtime theming)
- **Why:** Creates a SaaS revenue stream. **Competitor ref:** Shopify (multi-tenant), Craftomatic (SaaS).

#### R. Workshop kit auto-assembly
- **What:** When a workshop is booked, automatically deduct kit materials from inventory and generate a picking list.
- **Where:** `backend/src/routes/bookings.js`, `backend/src/services/orderBom.js` (extend to workshop kits)
- **Why:** Ardent Seller offers kit assembly. Automating this saves 15-30 min per workshop. **Competitor ref:** Ardent Seller (kit assembly with auto-deduction).

#### S. Customer-facing 3D preview
- **What:** The AR viewer exists but requires staff role. Make it public for customers to see their bouquet in AR before ordering.
- **Where:** `frontend/src/components/ARViewer.jsx`, `frontend/src/features/configurator/Configurator.jsx`
- **Why:** Increases conversion — customers who see their design in AR are more likely to buy. **Competitor ref:** No paper-florist offers AR preview. This is a unique moat.

#### T. Automated social media posting
- **What:** Auto-post new products/workshops to Instagram/Facebook with generated images.
- **Where:** `backend/src/services/metaSync.js` (extend), new `backend/src/services/socialPoster.js`
- **Why:** Saves marketing time. **Competitor ref:** CraftersUp (multi-channel sync), Meta catalog (already integrated).

---

## Summary

| Category | Count | Top Priority |
|----------|-------|-------------|
| Needs Improvement | 6 items (A-F) | D (LLM timeout), E (async OCR) |
| Missing (Table-Stakes) | 8 items (G-N) | G (multi-channel), J (order tracking) |
| Competitive Differentiators | 6 items (O-T) | O (AI design assistant), S (public AR) |

**Highest-ROI quick wins:** Fix LLM timeout (D), async OCR (E), and order tracking page (J) — all are small effort, high impact.

**Biggest moats:** AI design assistant (O), public AR preview (S), procedure→recipe pipeline (already built, unique in market). No competitor combines paper-florist manufacturing (BOM, procedures, QC) with e-commerce and workshops. The closest are Katana (manufacturing only) and FlowerBuddy (floral only, no Cricut/paper). The combination is the defensible advantage.