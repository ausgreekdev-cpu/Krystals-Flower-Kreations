# API Reference — New Endpoints

This document covers all API endpoints added during the roadmap and pipeline implementation phases.

## Authentication

All endpoints require `Authorization: Bearer <token>` header unless noted. Roles: `admin`, `developer`, `maker`, `staff`.

---

## Procedures

### Link/Unlink Procedure to Product

```
PUT /api/procedures/:id/product
```

**Body:** `{ "productId": "uuid" }` or `{ "productId": null }` (to unlink)

**Response:** `{ ok: true, linked: boolean, productId?, productTitle? }`

**Roles:** Editor+

---

## BOM (Bill of Materials)

### Recipe Revisions

```
GET /api/bom/recipes/:id/revisions
```

**Response:** Array of `{ id, recipeId, version, labourMinutesPerUnit, cricutMinutesPerUnit, lines, editorId, note, createdAt }`

**Roles:** Editor+

### Material Substitutes

```
GET /api/bom/materials/:id/substitutes
```

**Response:** Array of substitute materials scored by unit/weight/colour/size/brand/name overlap, sorted by score descending.

**Roles:** Editor+

---

## Orders

### QC Checkpoint

```
PATCH /api/orders/:id/qc
```

**Body:** `{ "qcStatus": "pending"|"passed"|"failed"|null, "qcNotes": "string", "qcPhotoUrl": "string" }`

**Response:** Updated order with QC fields.

**Roles:** Editor+

**Side effect:** Transitioning to `shipped` is blocked if `qcStatus === 'failed'`.

---

## Inventory

### Rebalance Suggestions

```
GET /api/inventory/rebalance
```

**Response:** Array of `{ productId, variantId, productName, fromLocationId, fromLocation, toLocationId, toLocation, qty, fromOnHand, toOnHand }`

Suggests transfers from surplus locations to low-stock locations for the same product/variant.

**Roles:** Editor+

---

## Production Runs

### List Production Runs

```
GET /api/production-runs?status=planned|in_progress|completed|cancelled
```

**Response:** Array of `{ id, productId, product, status, notes, consolidatedBOM, orders, createdAt, updatedAt }`

### Create Production Run

```
POST /api/production-runs
```

**Body:** `{ "productId": "string" }`

**Response:** `{ id, productId, status: "planned", notes, consolidatedBOM, createdAt }`

**Side effect:** Groups all unassigned paid/making orders for the product, links them to the run.

### Update Production Run Status

```
PATCH /api/production-runs/:id
```

**Body:** `{ "status": "planned"|"in_progress"|"completed"|"cancelled" }`

**Response:** Updated production run.

---

## Procurement

### List Draft Materials

```
GET /api/procurement/drafts
```

**Response:** Array of draft raw materials with `suggestedSupplierMatch` (existing supplier match).

### Approve Draft Material

```
POST /api/procurement/:id/approve
```

**Body:** `{ "supplierId": "string", "supplierName": "string", "createSupplier": boolean }`

**Response:** Updated raw material (status → `active`, supplier linked).

**Side effect:** Creates supplier profile if `createSupplier: true` and no match exists.

### Reject Draft Material

```
POST /api/procurement/:id/reject
```

**Response:** `{ ok: true, deleted: true }`

**Side effect:** Hard-deletes the draft material.

### Trigger Replenishment

```
POST /api/procurement/replenish
```

**Response:** `{ created: number, purchaseOrders: [...] }`

**Side effect:** Creates draft POs for all low-stock materials, grouped by supplier.

---

## 3D Models

### List 3D Models

```
GET /api/models-3d
```

**Response:** Array of `{ id, templateId, title, mime, sizeBytes, storageRef, uploadedById, createdAt }`

### Upload 3D Model

```
POST /api/models-3d
```

**Body:** `multipart/form-data` with `file` (GLB), `templateId` (enum), `title` (optional)

**Response:** `{ model: {...} }` or `{ model: {...}, replaced: true }`

**Validation:** File must have `glTF` magic header (first 4 bytes).

### Stream 3D Model

```
GET /api/models-3d/:templateId/file
```

**Response:** GLB binary stream (`model/gltf-binary`).

### Delete 3D Model

```
DELETE /api/models-3d/:id
```

**Response:** `{ ok: true }`

---

## Admin

### Dashboard KPIs

```
GET /api/admin/kpis
```

**Response:**
```json
{
  "lowStock": 3,
  "pendingQc": 2,
  "pendingProcurement": 5,
  "activeRuns": 2,
  "openOrders": 12,
  "activeProducts": 45
}
```

---

## Procedures

### Link/Unlink Procedure to Product

```
PUT /api/procedures/:id/product
```

**Body:** `{ "productId": "cuid" }` or `{ "productId": null }`

**Response:** `{ ok: true, linked: boolean, productId?, productTitle? }`

---

## Notifications

### Supported Events

The `notify(event, payload)` dispatcher supports:

| Event | Payload | Handler |
|-------|---------|---------|
| `order.created` | `{ order }` | Admin order alert email |
| `order.status_changed` | `{ order, fromStatus, toStatus }` | Customer status update email |
| `booking.created` | `{ booking, workshop, session }` | Admin booking alert email |
| `custom_order.created` | `{ order }` | Admin custom order alert email |

---

## Services (Internal)

### `replenishment.js`
- `replenishLowStock(userId)` — groups low-stock materials by supplier, creates draft POs
- `checkAndReplenish(materialId, userId)` — single-material hook

### `costRecalc.js`
- `recalculateRecipeCosts(rawMaterialId, userId)` — recomputes BOM recipe pricing, flags products via audit

### `productionRuns.js`
- `createProductionRun(productId, userId)` — groups unassigned orders, creates run
- `listProductionRuns(status)` — list runs
- `updateProductionRunStatus(runId, status, userId)` — transition status

### `notifications.js`
- `notify(event, payload)` — centralized dispatcher
- `NOTIFICATION_EVENTS` — array of supported events

### `bomPricing.js`
- `suggestSubstitutes(prisma, material, limit)` — scores and returns in-stock alternatives
- `findRecipeFor(prisma, { productId, variantId, templateId })` — finds BOM recipe
- `costForRecipe(recipe, qtyStems)` — computes cost + retail price

### `orderBom.js`
- `consumeOrderMaterials(order)` — decrements raw material stock, writes StockMovement + audit
- `generateOrderBOM(order)` — generates BOM snapshot at checkout
- `buildBOMSnapshot(lines)` — pure snapshot builder