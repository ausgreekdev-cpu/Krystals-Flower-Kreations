import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import { loyaltyConfig } from '../services/loyaltyService.js';

const router = Router();

// Local tier calc — reads config via loyaltyConfig so admin settings take effect.
async function tierFor(points){
  const cfg = await loyaltyConfig();
  if(points >= cfg.garden) return 'garden';
  if(points >= cfg.blossom) return 'blossom';
  return 'seedling';
}

// Get or create my loyalty account
router.get('/me', authenticate, asyncHandler(async (req,res)=>{
  const email = req.user.email;
  let acc = await prisma.loyaltyAccount.findUnique({ where: { email }, include: { transactions: { orderBy:{createdAt:'desc'}, take:20 } } });
  if(!acc){
    acc = await prisma.loyaltyAccount.create({ data: { email, userId: req.user.id, points: 0, tier: 'seedling' }, include:{ transactions:true } });
  }
  res.json(acc);
}));

const STAFF = ['staff','maker','admin','developer'];
const earnSchema = z.object({
  email: z.string().email().max(254),
  points: z.coerce.number().int().min(1).max(500),
  reason: z.string().min(2).max(100),
  orderId: z.string().max(100).optional().nullable(),
}).strict();

// Award points — staff only. (Customers previously could self-award unlimited
// points; points for reviews/purchases are granted server-side on approval/payment.)
router.post('/earn', authenticate, validate(earnSchema), asyncHandler(async (req,res)=>{
  if (!STAFF.includes(req.user.role)) return res.status(403).json({ error:'Forbidden', code:'forbidden' });
  const { points: pts, reason, orderId } = req.validated;
  const email = req.validated.email.trim().toLowerCase();
  let acc = await prisma.loyaltyAccount.findUnique({ where:{ email } });
  if(!acc) acc = await prisma.loyaltyAccount.create({ data:{ email, points:0, tier:'seedling' } });
  const updated = await prisma.loyaltyAccount.update({ where:{ id: acc.id }, data:{ points: { increment: pts }, tier: await tierFor(acc.points + pts) } });
  await prisma.loyaltyTransaction.create({ data:{ accountId: acc.id, pointsDelta: pts, reason, orderId: orderId || null } });
  res.json(updated);
}));

router.post('/set', authenticate, asyncHandler(async (req,res)=>{
  if (!['staff','maker','admin','developer'].includes(req.user.role)) return res.status(403).json({ error:'Forbidden', code:'forbidden' });
  const { email, delta, set, reason } = req.body;
  if (!email) return res.status(400).json({ error:'email required', code:'validation_failed' });
  let acc = await prisma.loyaltyAccount.findUnique({ where:{ email } });
  if (!acc) acc = await prisma.loyaltyAccount.create({ data:{ email, points:0, tier:'seedling' } });
  const target = set !== undefined ? Math.max(0, Math.floor(Number(set)||0)) : acc.points + Math.floor(Number(delta)||0);
  const finalPoints = Math.max(0, target);
  const updated = await prisma.loyaltyAccount.update({ where:{ id: acc.id }, data:{ points: finalPoints, tier: await tierFor(finalPoints) } });
  await prisma.loyaltyTransaction.create({ data:{ accountId: acc.id, pointsDelta: finalPoints - acc.points, reason: String(reason || 'admin adjustment').slice(0,100) } });
  res.json(updated);
}));

router.post('/redeem', authenticate, asyncHandler(async (req,res)=>{
  const cfg = await loyaltyConfig();
  if (!cfg.enabled) return res.status(403).json({ error:'Loyalty program is currently disabled', code:'loyalty_disabled' });
  const { points, reason } = req.body;
  const pts = Math.max(1, Math.min(1000, parseInt(points,10) || 0));
  // Admin-configured floor (settings: loyalty_min_redeem_points)
  if (cfg.minRedeem > 0 && pts < cfg.minRedeem) {
    return res.status(422).json({ error:`Minimum redeem is ${cfg.minRedeem} points`, code:'below_minimum_redeem', details:{ minimum: cfg.minRedeem } });
  }
  const email = req.user.email;
  const acc = await prisma.loyaltyAccount.findUnique({ where:{ email } });
  if(!acc || acc.points < pts) return res.status(422).json({ error:`Insufficient points: have ${acc?.points||0}`, code:'insufficient_points' });
  // Conditional decrement — concurrent redeems can't push the balance negative
  const dec = await prisma.loyaltyAccount.updateMany({ where:{ id: acc.id, points: { gte: pts } }, data:{ points: { decrement: pts } } });
  if (dec.count === 0) return res.status(422).json({ error:'Insufficient points', code:'insufficient_points' });
  const after = await prisma.loyaltyAccount.findUnique({ where:{ id: acc.id } });
  const updated = await prisma.loyaltyAccount.update({ where:{ id: acc.id }, data:{ tier: await tierFor(after.points) } });
  await prisma.loyaltyTransaction.create({ data:{ accountId: acc.id, pointsDelta: -pts, reason: String(reason || 'redeem').slice(0,100) } });
  res.json(updated);
}));

// Leaderboard (public, top 10)
router.get('/leaderboard', asyncHandler(async (req,res)=>{
  const top = await prisma.loyaltyAccount.findMany({ orderBy:{ points:'desc' }, take:10, select:{ email:true, points:true, tier:true } });
  res.json(top.map(a=> ({ email: a.email.replace(/(?<=.).(?=.*@)/g,'*'), points: a.points, tier: a.tier })));
}));

export default router;
