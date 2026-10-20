// Customer account area — order history + re-issued digital downloads.
//
// Same session token as everything else (no second auth model): the account
// pages read with the customer's normal Bearer JWT. Downloads are re-minted on
// every view rather than handed back from OrderLine.downloadUrl, because those
// links are 30-day JWTs — a customer returning next season would otherwise find
// files they paid for permanently unreachable.
import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, signDownloadToken } from '../lib/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();

// Checkout is guest-first: most orders carry the email but no userId (the
// buyer never signed in). Matching on both means history is complete for people
// who registered after their first order, without a backfill migration.
function ownedBy(user) {
  return { OR: [{ userId: user.id }, { email: user.email }] };
}

// Mirrors routes/downloads.js: paid, and not cancelled/refunded. Partially
// refunded orders keep access — the customer paid for part of them.
const DOWNLOADABLE = { paymentStatus: 'paid', status: { notIn: ['cancelled', 'refunded'] } };

const money = (v) => Number(v ?? 0);

function customerOrder(order) {
  const lines = (order.lines || []).map((l) => ({
    id: l.id,
    title: l.title,
    quantity: l.quantity,
    unitPrice: money(l.unitPrice),
    lineTotal: money(l.lineTotal),
    isDigital: Boolean(l.isDigital),
    variant: l.variant?.title || null,
    productSlug: l.product?.slug || null,
    image: l.product?.images?.[0]
      ? { url: l.product.images[0].url, alt: l.product.images[0].alt || l.title, variants: l.product.images[0].variants || null }
      : null,
  }));
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    currency: order.currency,
    createdAt: order.createdAt,
    shippedAt: order.shippedAt,
    // Written by staff today, shown here so customers stop emailing to ask.
    trackingNumber: order.trackingNumber || null,
    trackingUrl: order.trackingUrl || null,
    subtotal: money(order.subtotal),
    shippingCost: money(order.shippingCost),
    discountTotal: money(order.discountTotal),
    taxTotal: money(order.taxTotal),
    total: money(order.total),
    shipping: {
      name: order.shippingName || null,
      address: order.shippingAddress || null,
      suburb: order.shippingSuburb || null,
      state: order.shippingState || null,
      postcode: order.shippingPostcode || null,
      country: order.shippingCountry || 'AU',
    },
    lines,
    itemCount: lines.reduce((a, l) => a + l.quantity, 0),
    hasDownloads: lines.some((l) => l.isDigital) && order.paymentStatus === 'paid'
      && !['cancelled', 'refunded'].includes(order.status),
  };
}

// GET /api/account/orders — newest 50 orders belonging to the signed-in account.
router.get('/orders', authenticate, asyncHandler(async (req, res) => {
  const orders = await prisma.order.findMany({
    where: ownedBy(req.user),
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      lines: {
        include: {
          variant: { select: { title: true } },
          product: {
            select: {
              slug: true,
              images: { take: 1, orderBy: { sortOrder: 'asc' }, select: { url: true, alt: true, variants: true } },
            },
          },
        },
      },
    },
  });
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ orders: orders.map(customerOrder) });
}));

// GET /api/account/downloads — every digital file this account has paid for,
// with a freshly signed link. Re-minting also refreshes the stored
// OrderLine.downloadUrl so previously emailed links keep working.
router.get('/downloads', authenticate, rateLimit('account_downloads', 30, 1), asyncHandler(async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { ...ownedBy(req.user), ...DOWNLOADABLE, lines: { some: { isDigital: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      lines: { where: { isDigital: true }, include: { product: { select: { slug: true } } } },
    },
  });

  const downloads = [];
  for (const order of orders) {
    for (const line of order.lines) {
      try {
        const token = signDownloadToken(line.id);
        const url = `/api/dl/${token}`;
        if (line.downloadUrl !== url) {
          await prisma.orderLine.update({ where: { id: line.id }, data: { downloadUrl: url } });
        }
        downloads.push({
          lineId: line.id,
          orderNumber: order.orderNumber,
          orderedAt: order.createdAt,
          title: line.title,
          quantity: line.quantity,
          productSlug: line.product?.slug || null,
          url,
        });
      } catch (e) {
        // A single bad token must not blank the whole page.
        console.error(JSON.stringify({ level: 'error', msg: 'account_download_mint_failed', lineId: line.id, err: e?.message }));
      }
    }
  }

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ downloads, ordersWithDownloads: new Set(downloads.map((d) => d.orderNumber)).size });
}));

export default router;
