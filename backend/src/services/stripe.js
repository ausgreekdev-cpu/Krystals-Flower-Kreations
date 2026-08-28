// Stripe is disabled for now (per user request). Keep module but return null so checkout falls back to manual.
// To re-enable: set STRIPE_SECRET_KEY=sk_... and STRIPE_ENABLED=true
const enabled = process.env.STRIPE_ENABLED === 'true' && !!process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('sk_test_...');
let stripe = null;
if (enabled) {
  const { default: Stripe } = await import('stripe').catch(() => ({ default: null }));
  if (Stripe) stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
}
export { stripe };

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
