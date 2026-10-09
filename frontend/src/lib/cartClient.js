import { cartApi } from './api/customClient';

// Single source of truth for the guest cart: cartId storage, change events,
// API calls, and the client-side totals preview (settings-driven; the server
// still reprices everything at checkout).

const CART_EVENT = 'cart:updated';

export function getCartId() { return localStorage.getItem('cartId'); }
export function setCartId(id) { if (id) localStorage.setItem('cartId', id); }
export function clearCartId() { localStorage.removeItem('cartId'); }

export function dispatchCartChanged() { window.dispatchEvent(new CustomEvent(CART_EVENT)); }
export function subscribeCart(fn) { window.addEventListener(CART_EVENT, fn); return () => window.removeEventListener(CART_EVENT, fn); }

// Normalised cart payload: the GET route returns the cart row (with items) or
// { cart: null, items: [] } — callers only ever see a cart object or null.
export async function fetchCart() {
  const cartId = getCartId();
  if (!cartId) return null;
  const data = await cartApi.get(cartId);
  if (data && data.cart !== undefined) return data.cart; // envelope: { cart: null, items: [] }
  return data && Array.isArray(data.items) ? data : null;
}

export function cartItems(cart) { return Array.isArray(cart?.items) ? cart.items : []; }

export async function addToCart({ productId, variantId = null, quantity = 1 }) {
  const res = await cartApi.add({ productId, variantId, quantity, cartId: getCartId() });
  if (res.cartId) setCartId(res.cartId);
  dispatchCartChanged();
  return res;
}

export async function updateCartItem(itemId, quantity) {
  const cartId = getCartId();
  if (!cartId) return;
  await cartApi.update({ itemId, cartId, quantity });
  dispatchCartChanged();
}

// bestEffort=true: the server clear is attempted but its failure never blocks
// the caller (used after payment — a stray cart must not break success UX).
// Default: a failed server clear keeps the local cartId so state stays truthful.
export async function clearCart({ bestEffort = false } = {}) {
  const cartId = getCartId();
  if (cartId) {
    if (bestEffort) await cartApi.clear(cartId).catch(() => {});
    else await cartApi.clear(cartId);
  }
  clearCartId();
  dispatchCartChanged();
}

// Client preview only — GST incl. split, loyalty estimate and free-shipping
// threshold all follow the public settings (server values win at checkout).
export function computeCartTotals(items = [], settings = {}) {
  const list = Array.isArray(items) ? items : [];
  const subtotal = list.reduce((sum, it) => sum + Number(it.priceSnapshot || 0) * Number(it.quantity || 0), 0);
  const num = (v, fallback) => {
    if (v === undefined || v === null || v === '') return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const gstRate = num(settings.tax_gst_rate, 0.10);
  const gst = subtotal * gstRate / (1 + gstRate);
  const loyaltyEnabled = String(settings.loyalty_enabled ?? '1') !== '0';
  const youEarn = Math.floor(subtotal * num(settings.loyalty_earn_rate, 1));
  const freeOver = num(settings.shipping_free_over, 150);
  return { subtotal, gst, youEarn, loyaltyEnabled, freeOver };
}
