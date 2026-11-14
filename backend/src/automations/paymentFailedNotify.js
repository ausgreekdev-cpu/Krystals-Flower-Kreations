import { enqueueEmail } from '../services/email.js';

const a = {
  name: 'payment-failed-notify',
  description: 'Notify admin on payment failure.',
  trigger: 'event:payment.failed',
  async run(ctx) {
    const order = ctx?.order;
    if (!order?.customerEmail) return { ok: true, skipped: true };
    await enqueueEmail({ to: order.customerEmail, subject: 'Payment failed', text: `Order ${order.orderNumber || order.id} payment failed.` });
    return { ok: true, queued: true };
  },
};
export default a;
