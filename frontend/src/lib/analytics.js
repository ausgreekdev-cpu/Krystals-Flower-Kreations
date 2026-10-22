// GA4 analytics — no-op until a measurement id is set in Admin → Storefront
// (settings key ga_measurement_id). Injects gtag.js once, tracks SPA page
// views and the funnel events the launch checklist calls for:
// view_item · add_to_cart · begin_checkout · purchase.
// Respects Do Not Track and never loads in dev without an id.

let loaded = false;

function dnt() {
  return window.doNotTrack === '1' || navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true;
}

export function initAnalytics(id) {
  const mid = String(id || '').trim();
  if (loaded || !/^G-[A-Z0-9]{4,}$/.test(mid) || dnt()) return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', mid, { send_page_view: false, transport_type: 'beacon' });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(mid)}`;
  document.head.appendChild(script);
}

export function trackEvent(name, params) {
  if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
}

export function trackPageView(path, title) {
  trackEvent('page_view', { page_path: path, page_title: title });
}

// GA4 ecommerce item from a product/order line shape (products use
// price/activePrice, order lines use unitPrice — both tolerated).
export function gaItem(item, quantity = 1) {
  if (!item) return null;
  return {
    item_id: item.sku || item.id || item.slug,
    item_name: item.title || item.name,
    price: Number(item.price ?? item.activePrice ?? item.unitPrice ?? item.priceSnapshot ?? 0) || 0,
    quantity: Number(quantity) || 1,
  };
}
