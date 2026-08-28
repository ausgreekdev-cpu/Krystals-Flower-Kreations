import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';

const router = Router();
router.use(requireAuth, requireRole('admin','developer','maker','staff'));

router.get('/levels', async (req, res) => {
  const levels = await prisma.inventoryLevel.findMany({ include: { product: { include: { images: true } }, variant: true, location: true } });
  res.json(levels);
});

router.post('/adjust', async (req, res) => {
  const { productId, variantId, locationId, quantity, reason } = req.body;
  const level = await prisma.inventoryLevel.upsert({
    where: { productId_variantId_locationId: { productId, variantId: variantId || null, locationId } },
    create: { productId, variantId: variantId || null, locationId, onHand: quantity },
    update: { onHand: { increment: quantity } },
  });
  await prisma.stockMovement.create({ data: { productId, variantId: variantId || null, locationId, type: quantity >= 0 ? 'in' : 'out', quantity, reason, userId: req.user.id } });
  res.json(level);
});

router.get('/locations', async (req, res) => {
  const locs = await prisma.inventoryLocation.findMany();
  res.json(locs);
});

router.post('/locations', async (req, res) => {
  const loc = await prisma.inventoryLocation.create({ data: req.body });
  res.status(201).json(loc);
});

export default router;
