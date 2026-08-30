import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { rateLimit } from '../middleware/rate-limit.js';

const router = Router();
const requireAuth = authenticate;

router.get('/', asyncHandler(async (req, res) => {
  const status = String(req.query.status || 'published').slice(0,20);
  const tag = req.query.tag ? String(req.query.tag).slice(0,50) : undefined;
  const q = req.query.q ? String(req.query.q).slice(0,200) : undefined;
  const where = {};
  if (status !== 'all' && ['draft','review','published','archived'].includes(status)) where.status = status;
  else if (status !== 'all') return res.status(400).json({ error: 'Invalid status', code: 'validation_failed' });
  if (q) where.OR = [{ title: { contains: q, mode: 'insensitive' } }, { excerpt: { contains: q, mode: 'insensitive' } }];
  if (tag) where.tags = { contains: tag, mode: 'insensitive' };
  const posts = await prisma.post.findMany({ where, orderBy: { publishedAt: 'desc' }, include: { products: { include: { product: { include: { images: true } } } } } });
  res.json(posts);
}));

router.get('/:slug', asyncHandler(async (req, res) => {
  const slug = String(req.params.slug).slice(0,200);
  if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: 'Invalid slug', code: 'validation_failed' });
  const post = await prisma.post.findUnique({ where: { slug }, include: { products: { include: { product: { include: { images: true } } } } } });
  if (!post) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  // bump view async (don't block)
  prisma.post.update({ where: { id: post.id }, data: { viewCount: { increment: 1 } } }).catch(()=>{});
  res.json(post);
}));

const schema = z.object({
  title: z.string().min(3).max(200),
  slug: z.string().min(2).max(200).regex(/^[a-z0-9-]+$/),
  excerpt: z.string().max(500).optional().nullable(),
  content: z.string().max(100000).optional().nullable(),
  coverImageUrl: z.string().url().max(500).optional().nullable(),
  status: z.enum(['draft','review','published','archived']).default('draft'),
  tags: z.string().max(200).optional().nullable(),
  productIds: z.array(z.string().min(8).max(100)).max(20).optional(),
}).strict();
const patchSchema = schema.partial().strict();

router.post('/', requireAuth, requireRole('admin','developer','maker'), validate(schema), asyncHandler(async (req, res) => {
  const data = req.validated;
  const { productIds, ...rest } = data;
  const post = await prisma.post.create({
    data: {
      ...rest,
      title: rest.title.slice(0,200),
      slug: rest.slug,
      excerpt: rest.excerpt?.slice(0,500),
      content: rest.content?.slice(0,100000),
      authorId: req.user.id,
      publishedAt: data.status === 'published' ? new Date() : null,
      products: productIds ? { create: productIds.map(pid => ({ productId: pid })) } : undefined,
    }
  });
  res.status(201).json(post);
}));

router.patch('/:id', requireAuth, requireRole('admin','developer','maker'), validate(patchSchema), asyncHandler(async (req, res) => {
  const data = req.validated;
  const post = await prisma.post.update({ where: { id: req.params.id }, data: { ...data, title: data.title?.slice(0,200), excerpt: data.excerpt?.slice(0,500), publishedAt: data.status === 'published' ? new Date() : undefined } });
  res.json(post);
}));

router.delete('/:id', requireAuth, requireRole('admin','developer'), asyncHandler(async (req, res) => {
  await prisma.post.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
}));

export default router;
