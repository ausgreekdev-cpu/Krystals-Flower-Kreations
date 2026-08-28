# POS — Studio + Market Stall

Backend: `POST /api/pos/session/open`, `/sale`, `/session/:id/close`. Offline queue pattern mirrors LUX `fieldStore.js` — queue in IndexedDB on mobile/web POS, flush when online.

## Hardware (Perth AU)

- Tablet: iPad or Android (market) + Bluetooth receipt printer (e.g., Epson TM-M30, Star Micronics)
- Card reader: **Stripe Reader M2** (Stripe Terminal SDK) or Square Reader (if Square for markets)
- Cash drawer optional; barcode scanner via tablet camera (`expo-barcode-scanner` in mobile)

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
