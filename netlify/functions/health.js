export async function handler(event, context) {
  let db = false;
  try {
    let prisma;
    try { prisma = (await import("../../backend/src/lib/prisma.js")).default; }
    catch { prisma = (await import("../../../backend/src/lib/prisma.js")).default; }
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {}

  return {
    statusCode: db ? 200 : 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    body: JSON.stringify({
      status: db ? 'healthy' : 'unhealthy',
      db,
      name: "Krystal's Flower Kreations",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
    }),
  };
}
