// Krystal's Flower Kreations — Shared TypeScript domain models
// Perth WA | 100% custom build (no Shopify) | GST-inclusive AUD

export type Currency = 'AUD';

// ── 1. Product & Variant (finished goods) ──────────────────────────

export type ProductType = 'physical' | 'made_to_order' | 'digital_template' | 'workshop_ticket' | 'commission';
export type StockMode = 'tracked' | 'made_to_order' | 'digital';

export interface ProductImage {
  id: string;
  url: string;
  alt?: string | null;
  sortOrder: number;
}

export interface ProductVariant {
  id: string;
  productId: string;
  title: string; // "Blush / Medium / 250gsm"
  sku?: string | null;
  barcode?: string | null;
  option1?: string | null; // colour
  option2?: string | null; // size
  option3?: string | null; // paper stock
  price: number; // GST-inclusive
  compareAtPrice?: number | null;
  isActive: boolean;
}

export interface Product {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  type: ProductType;
  stockMode: StockMode;
  price: number;
  compareAtPrice?: number | null;
  cost?: number | null; // derived from BOM
  sku?: string | null;
  barcode?: string | null;
  weightGrams?: number | null;
  isActive: boolean;
  isFeatured: boolean;
  // Paper craft
  paperStock?: string | null;
  cricutCompatible: boolean;
  svgUrl?: string | null; // digital template
  careInstructions?: string | null;
  madeToOrderDays?: number | null;
  ogImageUrl?: string | null;
  images: ProductImage[];
  variants: ProductVariant[];
  createdAt: string;
  updatedAt: string;
}

export interface Collection {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
}

// ── 2. RawMaterial & BOM ───────────────────────────────────────────

export type RawMaterialUnit = 'sheet' | 'meter' | 'stick' | 'roll' | 'piece' | 'ml' | 'gram';

export interface RawMaterial {
  id: string;
  sku: string;
  name: string; // e.g., "65lb Canson Cardstock – Blush"
  unit: RawMaterialUnit;
  onHand: number;
  lowThreshold: number;
  costPerUnit: number;
  supplier?: string | null;
  locationId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BOMLine {
  id: string;
  recipeId: string;
  rawMaterialId: string;
  rawMaterial?: RawMaterial;
  qtyPerUnit: number; // per 1 finished product
  wasteFactor: number; // 0.05 = 5% waste
  // derived
  effectiveQty: number; // qtyPerUnit * (1 + wasteFactor)
}

export interface BOMRecipe {
  id: string;
  productId?: string | null;
  variantId?: string | null; // if null, applies to all variants of product
  product?: Product;
  variant?: ProductVariant;
  lines: BOMLine[];
  labourMinutesPerUnit: number; // hand folding/assembly
  cricutMinutesPerUnit: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryLocation {
  id: string;
  name: string; // Perth Studio, Market Van, Storage
  address?: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface InventoryLevel {
  id: string;
  productId: string;
  variantId?: string | null;
  locationId: string;
  onHand: number;
  reserved: number;
  allocated: number;
}

export interface StockMovement {
  id: string;
  productId: string;
  variantId?: string | null;
  locationId?: string | null;
  rawMaterialId?: string | null; // for BOM deductions
  type: 'in' | 'out' | 'adjustment' | 'sale' | 'bom_deduct' | 'return' | 'stocktake' | 'po' | 'workshop_kit';
  quantity: number; // negative for out
  reason?: string | null;
  reference?: string | null; // orderNumber, customArtOrder id
  userId?: string | null;
  createdAt: string;
}

// ── 3. CustomArtOrder & OrderState (Kanban) ────────────────────────

export type OrderState =
  | 'drafting_proofing'
  | 'cricut_cutting'
  | 'hand_folding_assembly'
  | 'quality_check'
  | 'dispatched_pickup_ready'
  | 'cancelled';

export const ORDER_STATE_LABEL: Record<OrderState, string> = {
  drafting_proofing: 'Drafting / Proofing',
  cricut_cutting: 'Cricut Cutting',
  hand_folding_assembly: 'Hand Folding & Assembly',
  quality_check: 'Quality Check',
  dispatched_pickup_ready: 'Dispatched / Pickup Ready',
  cancelled: 'Cancelled',
};

export const ORDER_STATE_ORDER: OrderState[] = [
  'drafting_proofing',
  'cricut_cutting',
  'hand_folding_assembly',
  'quality_check',
  'dispatched_pickup_ready',
];

export interface ConfiguratorSpec {
  paperColor: string; // e.g., "Blush", "Sage", "Ivory"
  paperTexture: string; // "textured", "smooth", "pearl"
  weight: string; // "65lb", "80lb", "110lb"
  stemCount: number; // 1-25
  armatureHeightMm: number; // 150-600
  templateId: string; // Cricut template SKU
  // optional
  addGreenery?: boolean;
  vaseIncluded?: boolean;
  notes?: string;
}

export interface CustomArtOrder {
  id: string;
  orderNumber: string; // KFK-CA-2026-0001
  customerEmail: string;
  customerName?: string | null;
  customerPhone?: string | null;
  // spec + pricing (snapshot)
  spec: ConfiguratorSpec;
  productId?: string | null; // base product if configurator started from product
  variantId?: string | null;
  state: OrderState;
  // derived at creation
  bomSnapshot: Array<{ rawMaterialId: string; effectiveQty: number; cost: number }>;
  estimatedMinutes: number; // total craft time
  totalPrice: number; // GST-inclusive AUD
  costPrice?: number | null; // materials cost
  // fulfilment
  shippingName?: string | null;
  shippingAddress?: string | null;
  shippingSuburb?: string | null;
  shippingState?: string | null;
  shippingPostcode?: string | null;
  pickupReadyAt?: string | null;
  dispatchedAt?: string | null;
  // ticket
  ticket?: Ticket | null;
  history: CustomArtOrderHistory[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomArtOrderHistory {
  id: string;
  orderId: string;
  fromState?: OrderState | null;
  toState: OrderState;
  note?: string | null;
  byUserId?: string | null;
  createdAt: string;
}

// ── 4. Workshop & Ticket ───────────────────────────────────────────

export type WorkshopLevel = 'beginner' | 'intermediate' | 'advanced';
export type WorkshopStatus = 'draft' | 'open' | 'full' | 'cancelled' | 'completed';
export type BookingStatus = 'pending' | 'confirmed' | 'waitlisted' | 'cancelled' | 'attended' | 'no_show';

export interface Workshop {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  location: string; // Perth Studio, WA
  status: WorkshopStatus;
  price: number;
  capacity: number;
  materialsIncluded?: string | null;
  durationMinutes?: number | null;
  level?: WorkshopLevel | null;
  isActive: boolean;
  sessions: WorkshopSession[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkshopSession {
  id: string;
  workshopId: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  waitlistCount: number;
  status: WorkshopStatus;
  notes?: string | null;
}

export interface WorkshopBooking {
  id: string;
  sessionId: string;
  userId?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  quantity: number;
  status: BookingStatus;
  totalPaid: number;
  kitAddOn?: boolean;
  ticket?: Ticket | null;
  session?: WorkshopSession;
  workshop?: Workshop;
  checkedInAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Ticket {
  id: string;
  bookingId?: string | null;
  customArtOrderId?: string | null;
  qrPayload: string; // e.g., KFK-T-XXXX signed payload
  qrUrl?: string | null; // image url
  checkedInAt?: string | null;
  createdAt: string;
}

// ── Cart / Order (web) ─────────────────────────────────────────────

export interface CartItem {
  id: string;
  cartId: string;
  productId: string;
  variantId?: string | null;
  product: Product;
  variant?: ProductVariant | null;
  quantity: number;
  priceSnapshot: number;
}

export interface Cart {
  id: string;
  sessionId?: string | null;
  userId?: string | null;
  currency: Currency;
  items: CartItem[];
}

// ── API helpers ────────────────────────────────────────────────────

export interface Paginated<T> {
  data: T[];
  nextCursor?: string | null;
}

export interface ApiError {
  error: string;
  details?: unknown;
}
