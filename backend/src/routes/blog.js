import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { requireAuth, requireRole } from '../lib/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  const { status = 'published', tag, q } = req.query;
  const where = {};
  if (status !== 'all') where.status = status;
  if (q) where.OR = [{ title: { contains: q, mode: 'insensitive' } }, { excerpt: { contains: q, mode: 'insensitive' } }];
  if (tag) where.tags = { contains: tag, mode: 'insensitive' };
  const posts = await prisma.post.findMany({ where, orderBy: { publishedAt: 'desc' }, include: { products: { include: { product: { include: { images: true } } } } } });
  res.json(posts);
});

router.get('/:slug', async (req, res) => {
  const post = await prisma.post.findUnique({ where: { slug: req.params.slug }, include: { products: { include: { product: { include: { images: true } } } } } });
  if (!post) return res.status(404).json({ error: 'Not found' });
  // bump view
  await prisma.post.update({ where: { id: post.id }, data: { viewCount: { increment: 1 } } }).catch(()=>{});
  res.json(post);
});

const schema = z.object({
  title: z.string().min(3),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  excerpt: z.string().optional().nullable(),
  content: z.string().optional().nullable(),
  coverImageUrl: z.string().url().optional().nullable(),
  status: z.enum(['draft','review','published','archived']).default('draft'),
  tags: z.string().optional().nullable(),
  productIds: z.array(z.string()).optional(),
});

router.post('/', requireAuth, requireRole('admin','developer','maker'), async (req, res) => {
  const data = schema.parse(req.body);
  const { productIds, ...rest } = data;
  const post = await prisma.post.create({
    data: {
      ...rest,
      authorId: req.user.id,
      publishedAt: data.status === 'published' ? new Date() : null,
      products: productIds ? { create: productIds.map(pid => ({ productId: pid })) } : undefined,
    }
  });
  res.status(201).json(post);
});

router.patch('/:id', requireAuth, requireRole('admin','developer','maker'), async (req, res) => {
  const data = req.body;
  const post = await prisma.post.update({ where: { id: req.params.id }, data: { ...data, publishedAt: data.status === 'published' ? new Date() : undefined } });
  res.json(post);
});

router.delete('/:id', requireAuth, requireRole('admin','developer'), async (req, res) => {
  await prisma.post.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
