import { run as abandonedCartRecovery } from './abandonedCartRecovery.js';
import { run as lowStockReorder } from './lowStockReorder.js';
import { run as newProductLaunch } from './newProductLaunch.js';
import { run as orderPaidFulfillment } from './orderPaidFulfillment.js';
import { run as reviewRequest } from './reviewRequest.js';
import { run as customOrderFulfillment } from './customOrderFulfillment.js';
import prisma from '../../lib/prisma.js';

const runners = {
  'abandoned-cart-recovery': abandonedCartRecovery,
  'new-product-launch': newProductLaunch,
  'custom-order-fulfillment': customOrderFulfillment,
  'workshop-session-lifecycle': async () => {
    const sessions = await prisma.workshopSession.findMany({ where: { startsAt: { gte: new Date() } }, take: 20 });
    return { upcoming: sessions.length, sessions };
  },
  'low-stock-reorder': lowStockReorder,
  'document-ocr-pipeline': async (input) => ({ ok: true, note: 'wire to document OCR/extraction', input }),
  'procedure-import-approve': async (input) => ({ ok: true, note: 'wire to procedure import review', input }),
  'order-paid-fulfillment': orderPaidFulfillment,
  'review-request': reviewRequest,
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
