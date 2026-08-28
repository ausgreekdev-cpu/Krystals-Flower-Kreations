import Stripe from 'stripe';
const secret = process.env.STRIPE_SECRET_KEY;
export const stripe = secret ? new Stripe(secret) : null;

export function assertStripe() {
  if (!stripe) throw new Error('Stripe not configured — set STRIPE_SECRET_KEY');
  return stripe;
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
