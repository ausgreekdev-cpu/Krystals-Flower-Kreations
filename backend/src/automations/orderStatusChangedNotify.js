import { enqueueEmail } from '../services/email.js';

const a = {
  name: 'order-status-changed-notify',
  description: 'Notify customer on order status change.',
  trigger: 'event:order.status',
  async run(ctx) {
    const { order, toStatus } = ctx || {};
    if (!order?.customerEmail) return { ok: true, skipped: true };
    await enqueueEmail({ to: order.customerEmail, subject: `Order ${order.orderNumber || order.id} updated`, text: `Status changed to ${toStatus || order.status}.` });
    return { ok: true, queued: true };
  },
};
export default a;
