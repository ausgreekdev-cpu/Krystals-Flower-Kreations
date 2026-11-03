import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { postProductToFacebook, postProductToInstagram, postWorkshopToSocial } from '../services/socialPoster.js';

const router = Router();
const ADMIN_ROLES = ['admin', 'developer'];

// Post a product to social media
router.post('/product/:id', authenticate, requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { id: String(req.params.id).slice(0, 100) },
    include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
  });
  if (!product) return res.status(404).json({ error: 'Product not found', code: 'not_found' });

  const platforms = req.body?.platforms || ['facebook', 'instagram'];
  const results = {};
  if (platforms.includes('facebook')) results.facebook = await postProductToFacebook(product);
  if (platforms.includes('instagram')) results.instagram = await postProductToInstagram(product);
  res.json({ product: product.title, results });
}));

// Post a workshop to social media
router.post('/workshop/:id', authenticate, requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  const workshop = await prisma.workshop.findUnique({ where: { id: String(req.params.id).slice(0, 100) } });
  if (!workshop) return res.status(404).json({ error: 'Workshop not found', code: 'not_found' });
  const result = await postWorkshopToSocial(workshop);
  res.json({ workshop: workshop.title, result });
}));

// Status check
router.get('/status', authenticate, requireRole(...ADMIN_ROLES), asyncHandler(async (req, res) => {
  res.json({
    configured: Boolean(process.env.META_ACCESS_TOKEN),
    pageId: Boolean(process.env.META_PAGE_ID),
    igUserId: Boolean(process.env.META_IG_USER_ID),
    catalogId: Boolean(process.env.META_CATALOG_ID),
  });
}));

export default router;