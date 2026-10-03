# POS — Studio + Market Stall

Backend: `POST /api/pos/session/open`, `/sale`, `/session/:id/close`. Offline queue pattern mirrors LUX `fieldStore.js` — queue in IndexedDB on mobile/web POS, flush when online.

## Hardware (Perth AU)

- Tablet: iPad or Android (market) + Bluetooth receipt printer (e.g., Epson TM-M30, Star Micronics)
- Card reader: **Stripe Reader M2** (Stripe Terminal SDK) or Square Reader (if Square for markets)
- Cash drawer optional; barcode scanner: USB/Bluetooth HID wand (web) or tablet camera (mobile app)

## Barcode scanning (web POS + Admin inventory)

- **USB/Bluetooth HID scanner** — types like a keyboard; detected as a scan burst (inter-key gap ≤50 ms, terminated by Enter/Tab) and fires from **anywhere on the page, no focus needed**. Identical codes are ignored for 1.5 s (shared dedupe window). See `docs/SCANNING.md` for the full focus/buffering guide.
- **📷 camera** — native `BarcodeDetector` (Chrome/Edge, feature-detected — no extra deps) with manual code-entry fallback; denied permission falls back to typing.
- Lookup `GET /api/inventory/scan/:code`: product barcode → variant barcode → product SKU → variant SKU → raw-material barcode/SKU. Soft-deleted products return `404 not_found` (stale labels behave like unknown codes).
- Unknown codes: POS shows "add it in Admin → Catalog → Products"; the Admin scanner can create the product inline with the scanned barcode prefilled.
- Seed test labels: `200000000001`–`200000000007` (editable per product in the editor's Barcode field).
- The mobile Expo app keeps its own camera scanner — separate codepath.

## Flows

1. **Open till** — staff logs in, enters opening cash, location (Perth Studio / Fremantle Markets).
2. **Sale** — scan barcode / search product, add to cart, select payment (`cash | card | afterpay | eftpos`), print/email receipt (GST + ABN).
3. **Inventory** — sale decrements `inventory_levels` (default location → studio-perth) + creates `stock_movements type=sale`.
4. **Close till** — enter closing cash → system computes expected (= opening + cash sales) + variance. Reconciliation in `pos_sessions`.

## Market Mode (offline)
- Mobile POS bundles product catalog locally (SQLite/AsyncStorage) on open.
- Queue `pos/sale` payloads when offline, show badge, auto-sync on reconnect (same as field photo queue).

## Receipts
PDF via `pdfkit` or ESC/POS. Includes: business name, ABN, GST statement ("Total includes GST of $X"), payment method, returns note for made-to-order.
