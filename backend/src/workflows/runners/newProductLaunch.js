import prisma from '../../lib/prisma.js';

export async function run(input) {
  const productId = input?.productId;
  if (!productId) return { ok: true, note: 'no productId provided; nothing to do' };
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, title: true, slug: true } });
  if (!product) return { ok: false, error: 'product not found' };
  return { ok: true, product, note: 'wire to SEO copy + social draft + notify' };
}
