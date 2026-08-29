import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate } from '../lib/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();

function tierFor(points){
  if(points >= 500) return 'garden';
  if(points >= 100) return 'blossom';
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

// Public earn/burn (staff+ can award, otherwise self earn for review etc capped)
router.post('/earn', authenticate, asyncHandler(async (req,res)=>{
  const { email, points, reason } = req.body;
  const pts = Math.max(1, Math.min(500, parseInt(points,10) || 0));
  if(!email || !reason) return res.status(400).json({ error:'email and reason required', code:'validation_failed' });
  // only staff can award for other emails; customers can self-earn with limited reasons
  const isStaff = ['staff','maker','admin','developer'].includes(req.user.role);
  if(!isStaff && email !== req.user.email) return res.status(403).json({ error:'Forbidden', code:'forbidden' });
  if(!isStaff && !['review','referral','streak','workshop_attended'].includes(reason)) return res.status(403).json({ error:'Limited self-earn reasons', code:'forbidden' });

  let acc = await prisma.loyaltyAccount.findUnique({ where:{ email } });
  if(!acc) acc = await prisma.loyaltyAccount.create({ data:{ email, points:0, tier:'seedling' } });
  const updated = await prisma.loyaltyAccount.update({ where:{ id: acc.id }, data:{ points: { increment: pts }, tier: tierFor(acc.points + pts) } });
  await prisma.loyaltyTransaction.create({ data:{ accountId: acc.id, pointsDelta: pts, reason: String(reason).slice(0,100), orderId: req.body.orderId || null } });
  res.json(updated);
}));

router.post('/redeem', authenticate, asyncHandler(async (req,res)=>{
  const { points, reason } = req.body;
  const pts = Math.max(1, Math.min(1000, parseInt(points,10) || 0));
  const email = req.user.email;
  const acc = await prisma.loyaltyAccount.findUnique({ where:{ email } });
  if(!acc || acc.points < pts) return res.status(422).json({ error:`Insufficient points: have ${acc?.points||0}`, code:'insufficient_points' });
  const updated = await prisma.loyaltyAccount.update({ where:{ id: acc.id }, data:{ points: { decrement: pts }, tier: tierFor(acc.points - pts) } });
  await prisma.loyaltyTransaction.create({ data:{ accountId: acc.id, pointsDelta: -pts, reason: String(reason || 'redeem').slice(0,100) } });
  res.json(updated);
}));

// Leaderboard (public, top 10)
router.get('/leaderboard', asyncHandler(async (req,res)=>{
  const top = await prisma.loyaltyAccount.findMany({ orderBy:{ points:'desc' }, take:10, select:{ email:true, points:true, tier:true } });
  res.json(top.map(a=> ({ email: a.email.replace(/(?<=.).(?=.*@)/g,'*'), points: a.points, tier: a.tier })));
}));

export default router;
