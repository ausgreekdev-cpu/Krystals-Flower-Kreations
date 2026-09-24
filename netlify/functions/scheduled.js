export const config = { schedule: "0 * * * *" }; // hourly
export async function handler(event, context){
  try{
    // Run inventory reservation cleanup: delete carts older than 24h
    let prisma;
    try { prisma = (await import("../../backend/src/lib/prisma.js")).default; } catch { prisma = (await import("../../../backend/src/lib/prisma.js")).default; }
    const dayAgo = new Date(Date.now() - 24*60*60*1000);
    const deleted = await prisma.cart.deleteMany({ where: { updatedAt: { lt: dayAgo } } }).catch(()=>({count:0}));
    console.log(`[scheduled] cleaned ${deleted.count||0} stale carts`);
    // Purge expired shared rate-limit counters
    let purgedRl = 0;
    try {
      let rl;
      try { rl = await import("../../backend/src/middleware/rate-limit.js"); } catch { rl = await import("../../../backend/src/middleware/rate-limit.js"); }
      purgedRl = await rl.purgeExpiredRateLimits();
    } catch (e) { console.log('[scheduled] rate-limit purge skipped', e.message); }
      // Workshop reminders: 24h and 2h before session (only for confirmed bookings) + waitlist promotion
    let reminders = 0; let lowCount = 0;
    try {
      let sendWorkshopConfirmation;
      try { sendWorkshopConfirmation = (await import("../../backend/src/services/email.js")).sendWorkshopConfirmation; }
      catch { sendWorkshopConfirmation = (await import("../../../backend/src/services/email.js")).sendWorkshopConfirmation; }
      const now = new Date();
      const in24h = new Date(now.getTime() + 24*60*60*1000);
      const in2h = new Date(now.getTime() + 2*60*60*1000);
      const upcoming = await prisma.booking.findMany({
        where: { status: 'confirmed', session: { startsAt: { gte: new Date(in24h.getTime() - 60*60*1000), lte: new Date(in24h.getTime() + 60*60*1000) } } },
        include: { session: { include: { workshop: true } }, ticket: true },
        take: 20,
      }).catch(()=>[]);
      for (const b of upcoming) {
        try { await sendWorkshopConfirmation({ ...b, ticket: b.ticket }, b.session.workshop, b.session); reminders++; } catch {}
      }
      const soon = await prisma.booking.findMany({
        where: { status: 'confirmed', session: { startsAt: { gte: new Date(in2h.getTime() - 30*60*1000), lte: new Date(in2h.getTime() + 30*60*1000) } } },
        include: { session: { include: { workshop: true } }, ticket: true },
        take: 20,
      }).catch(()=>[]);
      for (const b of soon) {
        try { await sendWorkshopConfirmation({ ...b, ticket: b.ticket }, b.session.workshop, b.session); reminders++; } catch {}
      }
      // Low-stock alert: raw materials + product levels + variants
      try {
        const defaultThreshold = Number((await prisma.setting.findUnique({ where: { key: 'low_stock_default' } }).catch(()=>null))?.value || 5);
        const [mats, levels, variants] = await Promise.all([
          prisma.rawMaterial.findMany().catch(()=>[]),
          prisma.inventoryLevel.findMany({ where: { variantId: null }, include: { product: { select: { title: true } } } }).catch(()=>[]),
          prisma.productVariant.findMany({ include: { product: { select: { title: true } } } }).catch(()=>[]),
        ]);
        const lowStock = [
          ...mats.filter(m => m.onHand <= m.lowThreshold).map(m => `${m.name} (${m.onHand}/${m.lowThreshold})`),
          ...levels.filter(l => l.onHand <= (l.lowStockThreshold ?? defaultThreshold)).map(l => `${l.product?.title || l.productId} (${l.onHand}/${l.lowStockThreshold ?? defaultThreshold})`),
          ...variants.filter(v => v.inventoryQuantity <= defaultThreshold).map(v => `${v.product?.title} — ${v.title} (${v.inventoryQuantity}/${defaultThreshold})`),
        ];
        lowCount = lowStock.length;
        if (lowStock.length>0) {
          let sendEmail;
          try { sendEmail = (await import("../../backend/src/services/email.js")).sendEmail; }
          catch { sendEmail = (await import("../../../backend/src/services/email.js")).sendEmail; }
          const names = lowStock.join(', ');
          await sendEmail({ to: process.env.COMPANY_EMAIL || 'krystal@krystalsflowerkreations.com.au', subject: `Low stock: ${lowStock.length} items`, text: `Low stock alert:\n${names}\n\nCheck Inventory at /admin?tab=inventory` }).catch(()=>{});
        }
      } catch {}
    } catch(e){ console.log('[scheduled] reminder/promotion skipped', e.message); }
    console.log(`[scheduled] cleaned ${deleted.count||0} stale carts, reminders ${reminders}, lowStock ${lowCount}, rateLimitRowsPurged ${purgedRl}`);
    return { statusCode: 200, body: JSON.stringify({ ok:true, cleaned: deleted.count||0, reminders, lowStock: lowCount, rateLimitRowsPurged: purgedRl }) };
  }catch(err){
    console.error("[scheduled] failed", err);
    return { statusCode: 500, body: JSON.stringify({ error: String(err.message) }) };
  }
}
