import { run as abandonedCartRecovery } from './abandonedCartRecovery.js';
import { run as orderPaidFulfillment } from './orderPaidFulfillment.js';
import prisma from '../../lib/prisma.js';

const runners = {
  'abandoned-cart-recovery': abandonedCartRecovery,
  'new-product-launch': async (input) => ({ ok: true, note: 'wire to product launch flow', input }),
  'custom-order-fulfillment': async (input) => ({ ok: true, note: 'wire to custom order flow', input }),
  'workshop-session-lifecycle': async () => {
    const sessions = await prisma.workshopSession.findMany({ where: { startsAt: { gte: new Date() } }, take: 20 });
    return { upcoming: sessions.length, sessions };
  },
  'low-stock-reorder': async () => ({ ok: true, note: 'wire to suggest_reorder + PO creation' }),
  'document-ocr-pipeline': async (input) => ({ ok: true, note: 'wire to document OCR/extraction', input }),
  'procedure-import-approve': async (input) => ({ ok: true, note: 'wire to procedure import review', input }),
  'order-paid-fulfillment': orderPaidFulfillment,
  'review-request': async (input) => ({ ok: true, note: 'wire to review request email', input }),
  'monthly-studio-report': async () => {
    const [orders, products, reviews] = await Promise.all([
      prisma.order.count(),
      prisma.product.count({ where: { deletedAt: null } }),
      prisma.review.count(),
    ]);
    return { orders, products, reviews, generatedAt: new Date() };
  },
};

export function getRunner(name) { return runners[name] || null; }
export { runners };
