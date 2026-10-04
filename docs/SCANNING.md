# Barcode Scanning — Keyboard-Wedge Guide

How USB/Bluetooth handheld scanners (Zebra, Honeywell, Inateck, …) integrate with
the web POS and Admin inventory, and how to manage **focus state** and **input
buffering** when a device types at machine speed.

Code: `frontend/src/components/scan/` (`useWedgeScanner.ts`, `feedback.ts`,
`scanApi.ts`, `ScanModal.tsx`, `ScannerIndicator.tsx`). Backend:
`GET /api/inventory/scan/:code`.

---

## 1. Hardware modes — pick the right one

| Mode | What the browser sees | Works here? |
|---|---|---|
| **USB HID (keyboard)** | A keyboard that types very fast | ✅ primary path |
| **Bluetooth HID (paired as keyboard)** | Same as USB | ✅ |
| **Bluetooth SPP (serial port profile)** | A serial device — nothing arrives in the browser | ❌ reconfigure scanner to HID |
| Camera (no scanner) | `BarcodeDetector` API | ✅ fallback (Chrome/Edge) |

Configure the scanner's suffix to **CR (Enter)** — TAB also works; both are
accepted terminators. A scanner with *no* suffix can still work (bursts are
also ended by the next >50 ms gap) but Enter is more reliable.

---

## 2. Detection — `useWedgeScanner.ts`

A single `window` **capture-phase** `keydown` listener buffers printable keys
and fires only when the burst looks machine-generated:

| Rule | Value | Why |
|---|---|---|
| Max inter-key gap | **50 ms** | Humans type ≥ ~80 ms/key; scanners do 1–5 ms/key. A gap > 50 ms resets the buffer, so slow human typing can never accumulate into a fake scan. |
| Min length | 4 chars | Shorter than any real barcode/SKU. |
| Max length | 50 chars | Matches backend `scanCodeSchema` cap; overflow resets. |
| Terminators | `Enter`, `Tab` | Scanner suffixes. The event is `preventDefault()` + `stopPropagation()`'d so a stray `\r` never submits forms or reaches inputs. |
| Skipped | `Ctrl/Alt/Meta`, `isComposing`, `Backspace`, `Escape` | Shortcuts and IMEs must never be swallowed; Backspace/Escape clear the buffer. |

Two invariants to preserve when editing this hook:

1. **Never require focus.** The listener is on `window` in the capture phase,
   so it runs before React's root-level synthetic handlers. Scanning works with
   zero clicks — the operator just pulls the trigger.
2. **The callback is read through a ref** (`cb.current`). The hook must not
   re-subscribe on every render; state captured in the callback stays fresh
   without effect churn.

### Burst flow

```
keys: '2'  '0'  '0'  …  '1'  Enter
gap:   2ms  2ms  2ms      2ms   ─
                                 └→ buffer "200000000001" ≥4 chars → swallow Enter → onScan(code)
```

If the operator types `rose` into the search box by hand (gaps ≈ 120 ms), the
buffer resets between every key and the trailing Enter passes through to the
input normally — human interaction is untouched.

---

## 3. Focus-state policy

**Decision: the app never relies on focus for scanning.** Consequences:

- **Passive buffer, always on** — wedge-active pages mount the hook for the
  whole page lifetime (`active` prop = tab/route visible).
- **Focused inputs are handled, not avoided.** When a search box has focus the
  scanner types into it — buffer still accumulates, Enter is swallowed, and the
  parent handler **clears the search input** (`setQ('')`) on every scan so no
  characters leak into the filter.
- **Capture vs bubble matters.** Capture on `window` runs before the DOM
  target and before React's synthetic event system (React 17+ attaches at the
  root container, which sits *below* `window` in the propagation path) — so
  `stopPropagation()` at the top of the chain is what guarantees "swallow".
- **Only swallow when a real code was captured** (`≥ 4` chars). Otherwise
  Enter/Tab behave exactly as before — form submits, focus moves.
- **Auto-focus trade-off:** deliberately *not* auto-focusing an input on page
  load. Focus fights the wedge model (operators don't click first) and breaks
  multi-field flows. The manual entry field inside `ScanModal` uses `autoFocus`
  because the modal is an explicitly opened, one-shot context.

---

## 4. Input buffering — lifecycle

```
buffer = ''            on mount / after fire / on gap > 50ms / Backspace / Escape
buffer += key          on printable key (length ≤ 50)
fire(buffer)           on Enter/Tab when buffer ≥ 4  →  buffer = ''
```

- **One buffer per listener instance** — exactly one wedge hook is mounted per
  surface (POS page / Inventory tab), so buffers can't interleave.
- **No timing on the fire path** — termination is event-driven (Enter/Tab),
  not a timeout, so results appear the instant the trigger is released.
- **Reset-on-gap is the only heuristic** — it is what makes manual typing and
  wedge input coexist in the same buffer without mode switching.

---

## 5. Dedupe — `feedback.ts` → `registerScan()`

`registerScan(code)` is the **single choke point** every input path calls
first: wedge handlers (POS, Inventory, Stocktake) and the modal's
camera/manual path. Shared module state ignores an identical code within
**1.5 s** (held triggers, double-reads, camera loop re-detecting the same
label). Returns `false` for duplicates; still emits `kfk:scan` with
`accepted:false` so the indicator can show `(dup)`.

---

## 6. Feedback & status indicator

- **Audio:** WebAudio oscillator cues (no asset files) — success 880→1320 Hz
  two-tone chime, error 220 Hz square. `AudioContext` resumes lazily on first
  user gesture (browser autoplay policy).
- **Visual:** modal border flashes green/red 500 ms; POS/Inventory raise toasts.
- **`ScannerIndicator`** — floating pill (bottom-right) on POS + Inventory:
  pulsing green dot + *"Scanner listening"* + `lastCode · age · dup`.
  It subscribes to window events emitted centrally:

| Event | Emitted by | Meaning |
|---|---|---|
| `kfk:wedge` | `useWedgeScanner` | Hardware burst captured |
| `kfk:scan` | `registerScan` | Scan registered (`.accepted` false = duplicate) |
| `kfk:scan-ok` / `kfk:scan-err` | `chimeSuccess` / `beepError` | Result flash |

Because emission lives in `feedback.ts`, **no call site needed wiring** — any
new surface that calls `registerScan` + chimes reports to the pill for free.

> **Honesty note:** browsers expose **no API to detect a scanner's connection**
> (HID devices are invisible until they type). *"Listening"* means the wedge
> listener is active; the last-capture timestamp is the proof-of-life that the
> hardware path works.

---

## 7. Lookup API

`GET /api/inventory/scan/:code` (auth: admin/developer/maker/staff,
120 req/min, 5 s client timeout via `AbortController`).

Chain: `product.barcode → variant.barcode → product.sku → variant.sku →
rawMaterial.barcode|sku` → else **404** `{found:false, scanned}`.
Products are matched with `deletedAt: null` — a soft-deleted item's stale
label scans as "not found". Barcode columns are `@unique`; collisions on save
return **409** `barcode_taken`.

---

## 8. Testing without hardware

**Browser console** (dispatches a realistic burst into the live page):

```js
const code = '200000000001';
for (const ch of code) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
  // >50ms gap would reset the buffer — keep them tight
}
window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
```

**Physical trigger:** scan any product's label (seeded test labels
`200000000001`–`07`) while on Admin → Inventory or POS; expect chime + pill
flash within ~100 ms.

**Duplicate check:** pull the trigger twice inside 1.5 s → second scan shows
`(dup)` on the pill and performs no second lookup/adjust.

**Camera path:** open 📷 in Chrome/Edge (native `BarcodeDetector`); deny
permission to exercise the manual-entry fallback.

---

## 9. Known limits

- No device-disconnection events (see honesty note above) — the pill is a
  listening indicator, not a hardware monitor.
- Scanners in **SPP mode** never reach the page — set them to HID.
- Scanners sending **no terminator** rely on the 50 ms gap reset; configure a
  CR suffix for best results.
- One wedge listener per page; mounting two (e.g. modal + page) would double-
  fire. The modal deliberately does **not** mount its own hook.

---

## 10. Printable labels — Code128 (Package B)

Blank stock needs scannable labels; the app generates them client-side.

- **Where:** Admin → Products → **🖨 Labels**, and Admin → Catalog →
  Inventory → Stock → Raw materials card → **🖨 Labels**.
- **Modal** (`components/admin/LabelPrintModal.jsx`): pick items, set copies
  per item (0–99), live sheet preview, **🖨 Print** → `window.print()`.
- **Label value:** `barcode || sku` — matches the lookup chain in §7, so a
  printed product/material label scans as that item. Items with neither are
  skipped (counted in the hint line).
- **Encoding:** `jsbarcode` (MIT) renders **Code128** to inline SVG; bar width
  adapts to code length to fit 63.5 mm.
- **Sheet:** Avery **L7160**-compatible (also J8160 / MP7160 / MR105): A4
  portrait, 3 × 7 labels of 63.5 × 38.1 mm, margins 15.15 mm top/bottom,
  7.25 mm left/right, 2.5 mm column gap — geometry in `frontend/src/index.css`
  (`.label-page`). **Print at 100% scale** (no fit-to-page), portrait.
- **Print CSS:** `@media print` hides everything except `#label-sheet`;
  dashed cell borders are screen-only guides and never print.
