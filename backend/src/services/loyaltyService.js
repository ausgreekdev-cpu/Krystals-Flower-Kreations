import prisma from '../lib/prisma.js';

// Loyalty business rules from settings (fallbacks match prior hardcoded values)
export async function loyaltyConfig() {
  const defs = { enabled: true, blossom: 100, garden: 500, earnRate: 1, redeemRate: 5, earnCapPerOrder: 1000 };
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { in: ['loyalty_enabled', 'loyalty_blossom_threshold', 'loyalty_garden_threshold', 'loyalty_earn_rate', 'loyalty_redeem_rate', 'loyalty_earn_cap'] } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    if (map.loyalty_enabled !== undefined) defs.enabled = map.loyalty_enabled === '1';
    if (map.loyalty_blossom_threshold) defs.blossom = Number(map.loyalty_blossom_threshold);
    if (map.loyalty_garden_threshold) defs.garden = Number(map.loyalty_garden_threshold);
    if (map.loyalty_earn_rate) defs.earnRate = Number(map.loyalty_earn_rate);
    if (map.loyalty_redeem_rate) defs.redeemRate = Number(map.loyalty_redeem_rate);
    if (map.loyalty_earn_cap) defs.earnCapPerOrder = Number(map.loyalty_earn_cap);
  } catch {}
  return defs;
}

export async function tierFor(points) {
  const cfg = await loyaltyConfig();
  if (points >= cfg.garden) return 'garden';
  if (points >= cfg.blossom) return 'blossom';
  return 'seedling';
}

export async function earnForOrder(txOrPrisma, { email, total, orderId, reason = 'purchase' }) {
  const p = txOrPrisma || prisma;
  const cfg = await loyaltyConfig();
  if (!cfg.enabled) return null; // program paused via settings — skip earning silently
  const pts = Math.floor(Number(total) * cfg.earnRate);
  if (!pts || pts <= 0) return null;
  if (pts > cfg.earnCapPerOrder) return null; // cap per order to prevent abuse
  let acc = await p.loyaltyAccount.findUnique({ where: { email } });
  if (!acc) acc = await p.loyaltyAccount.create({ data: { email, points: 0, tier: 'seedling' } });
  const newPoints = acc.points + pts;
  const tier = await tierFor(newPoints);
  await p.loyaltyAccount.update({ where: { id: acc.id }, data: { points: newPoints, tier } });
  await p.loyaltyTransaction.create({ data: { accountId: acc.id, pointsDelta: pts, reason: String(reason).slice(0, 100), orderId } });
  return { points: pts, newPoints, tier };
}
