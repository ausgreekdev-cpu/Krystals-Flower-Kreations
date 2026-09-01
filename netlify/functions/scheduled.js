export const config = { schedule: "0 * * * *" }; // hourly
export async function handler(event, context){
  try{
    let app;
    try { app = (await import("../../backend/src/app.js")).default; } catch { app = (await import("../../../backend/src/app.js")).default; }
    // Run inventory reservation cleanup: delete carts older than 24h
    let prisma;
    try { prisma = (await import("../../backend/src/lib/prisma.js")).default; } catch { prisma = (await import("../../../backend/src/lib/prisma.js")).default; }
    const dayAgo = new Date(Date.now() - 24*60*60*1000);
    const deleted = await prisma.cart.deleteMany({ where: { updatedAt: { lt: dayAgo } } }).catch(()=>({count:0}));
    console.log(`[scheduled] cleaned ${deleted.count||0} stale carts`);
    // Also clean old idempotent? No
    return { statusCode: 200, body: JSON.stringify({ ok:true, cleaned: deleted.count||0 }) };
  }catch(err){
    console.error("[scheduled] failed", err);
    return { statusCode: 500, body: JSON.stringify({ error: String(err.message) }) };
  }
}
