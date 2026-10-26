import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { verifyDownloadToken } from '../lib/auth.js';
import { getObject } from '../services/storage.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { rateLimit } from '../middleware/rate-limit.js';

const router = Router();

// Token-gated delivery of purchased digital templates (SVGs).
// The token is a purpose-scoped JWT minted per OrderLine at purchase — the
// same link lands in the confirmation email and works for 30 days. Payment
// status is re-checked on every hit so unpaid/cancelled orders can't download.
// Files live in the private `digital-assets` storage bucket and are never
// exposed as public URLs.

const dlLimit = rateLimit('download', 60, 1);

router.get('/:token', dlLimit, asyncHandler(async (req, res) => {
  let payload;
  try {
    payload = verifyDownloadToken(String(req.params.token));
  } catch {
    // Expired or malformed tokens get a 404 — don't leak which.
    return res.status(404).json({ error: 'This download link is invalid or has expired', code: 'invalid_download_token' });
  }

  const line = await prisma.orderLine.findUnique({
    where: { id: payload.lineId },
    include: { product: true, order: true },
  });
  if (!line || !line.product || !line.order) {
    return res.status(404).json({ error: 'This download link is invalid or has expired', code: 'invalid_download_token' });
  }

  // Gate: only paid orders may download. Staff marking the order paid
  // (bank transfer etc.) unlocks the emailed link. Cancelled/refunded orders
  // lose access too — paymentStatus flips off 'paid' on refund, but a paid
  // order can still be cancelled directly from 'paid'.
  if (line.order.paymentStatus !== 'paid' || line.order.status === 'cancelled' || line.order.status === 'refunded') {
    return res.status(402).json({
      error: 'Payment is required before this download becomes available',
      code: 'payment_required',
    });
  }

  const ref = line.product.svgUrl;
  if (!ref) {
    return res.status(404).json({ error: 'The file for this item is not available yet', code: 'file_unavailable' });
  }

  let buffer;
  try {
    buffer = await getObject(ref);
  } catch (e) {
    if (e?.status === 404) {
      return res.status(404).json({ error: 'The file for this item is not available yet', code: 'file_unavailable' });
    }
    throw e;
  }

  const filename = `${line.product.slug || line.product.id || 'template'}.svg`;
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(buffer);
}));

export default router;
