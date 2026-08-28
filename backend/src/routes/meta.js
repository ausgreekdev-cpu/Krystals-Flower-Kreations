import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { pushProductToCatalog, handleMetaWebhook } from '../services/metaSync.js';

const router = Router();

router.get('/status', requireAuth, requireRole('admin','developer'), async (req, res) => {
  const configured = !!(process.env.META_CATALOG_ID && process.env.META_ACCESS_TOKEN);
  const pending = await prisma.metaCatalogItem.count({ where: { status: 'pending' } });
  const synced = await prisma.metaCatalogItem.count({ where: { status: 'synced' } });
  const logs = await prisma.metaSyncLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
  res.json({ configured, pending, synced, logs });
});

router.post('/sync/:productId', requireAuth, requireRole('admin','developer','maker'), async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.productId }, include: { images: true } });
  if (!product) return res.status(404).json({ error: 'Not found' });
  const result = await pushProductToCatalog(product);
  const status = result.status === 'disabled' ? 'disabled' : 'pending';
  await prisma.metaCatalogItem.upsert({
    where: { productId: product.id },
    create: { productId: product.id, status, lastError: result.reason || null, rawJson: JSON.stringify(result) },
    update: { status, lastError: result.reason || null, rawJson: JSON.stringify(result), lastSyncedAt: new Date() },
  });
  await prisma.metaSyncLog.create({ data: { action: 'push', productId: product.id, status, message: result.reason || result.note, rawJson: JSON.stringify(result) } });
  res.json(result);
});

router.post('/sync-all', requireAuth, requireRole('admin','developer'), async (req, res) => {
  const products = await prisma.product.findMany({ where: { isActive: true }, include: { images: true } });
  for (const p of products) {
    const result = await pushProductToCatalog(p);
    await prisma.metaCatalogItem.upsert({
      where: { productId: p.id },
      create: { productId: p.id, status: 'pending', rawJson: JSON.stringify(result) },
      update: { rawJson: JSON.stringify(result), lastSyncedAt: new Date() },
    });
  }
  res.json({ queued: products.length });
});

// Public webhook for Meta (verify token)
router.get('/webhook', (req, res) => {
  const verify = process.env.META_VERIFY_TOKEN || 'krystal_verify';
  if (req.query['hub.verify_token'] === verify) return res.send(req.query['hub.challenge']);
  res.status(403).send('Forbidden');
});

router.post('/webhook', async (req, res) => {
  const result = await handleMetaWebhook(req.body);
  await prisma.metaSyncLog.create({ data: { action: 'webhook', status: 'success', rawJson: JSON.stringify(req.body) } });
  res.json(result);
});

export default router;
