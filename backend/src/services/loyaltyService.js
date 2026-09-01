import prisma from '../lib/prisma.js';

function tierFor(points) {
  if (points >= 500) return 'garden';
  if (points >= 100) return 'blossom';
  return 'seedling';
}

export async function earnForOrder(txOrPrisma, { email, total, orderId, reason = 'purchase' }) {
  const p = txOrPrisma || prisma;
  const pts = Math.floor(Number(total));
  if (!pts || pts <= 0) return null;
  if (pts > 1000) return null; // cap per order to prevent abuse
  let acc = await p.loyaltyAccount.findUnique({ where: { email } });
  if (!acc) acc = await p.loyaltyAccount.create({ data: { email, points: 0, tier: 'seedling' } });
  const newPoints = acc.points + pts;
  const tier = tierFor(newPoints);
  await p.loyaltyAccount.update({ where: { id: acc.id }, data: { points: newPoints, tier } });
  await p.loyaltyTransaction.create({ data: { accountId: acc.id, pointsDelta: pts, reason: String(reason).slice(0, 100), orderId } });
  return { points: pts, newPoints, tier };
}

export { tierFor };
