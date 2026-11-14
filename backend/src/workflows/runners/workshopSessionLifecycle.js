import prisma from '../../lib/prisma.js';

export async function run() {
  const sessions = await prisma.workshopSession.findMany({ where: { startsAt: { gte: new Date() } }, take: 20 });
  return { upcoming: sessions.length, sessions };
}
