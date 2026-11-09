import prisma from '../lib/prisma.js';
const agent = { name:'content-moderator', description:'Flag reviews with low ratings for moderation.', tools:[], systemPrompt:'Content moderator.', async run(){ const low = await prisma.review.findMany({ where: { rating: { lte: 2 } }, take: 50 }); return { flagged: low.length, items: low }; } };
export default agent;
