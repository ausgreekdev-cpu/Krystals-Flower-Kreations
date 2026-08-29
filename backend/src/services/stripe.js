// Stripe is disabled for now (per user request). Keep module but return null so checkout falls back to manual.
// To re-enable: set STRIPE_ENABLED=true + STRIPE_SECRET_KEY=sk_live_... and restore lazy import below.
// NOTE: No top-level await — Netlify esbuild cjs bundling does not support it (build failed at stripe.js:6:30).
export const stripe = null;

export function assertStripe() {
  throw new Error('Stripe disabled — manual payments (cash / bank / pickup) active. Set STRIPE_ENABLED=true to re-enable.');
}

export async function createCheckoutSession({ order, lineItems, successUrl, cancelUrl, customerEmail }) {
  const s = assertStripe();
  return s.checkout.sessions.create({
    mode: 'payment',
    customer_email: customerEmail,
    line_items: lineItems,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { orderId: order.id, orderNumber: order.orderNumber },
    payment_method_types: ['card'],
    // Afterpay / Klarna via Stripe payment_method_types if enabled in dashboard
  });
}
