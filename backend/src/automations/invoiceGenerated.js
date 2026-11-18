import { enqueueEmail } from '../services/email.js';

const a = {
  name: 'invoice-generated',
  description: 'Generate + email invoice on paid.',
  trigger: 'event:order.paid',
  async run(ctx) {
    const { order } = ctx || {};
    if (!order?.customerEmail) return { ok: true, skipped: true };
    await enqueueEmail({ to: order.customerEmail, subject: `Invoice for order ${order.orderNumber || order.id}`, text: 'Your invoice is attached.' });
    return { ok: true, queued: true };
  },
};
export default a;
