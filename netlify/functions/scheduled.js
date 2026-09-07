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
      // Workshop reminders: 24h and 2h before session (only for confirmed bookings) + waitlist promotion
    let reminders = 0; let promoted = 0; let lowCount = 0;
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
      // Waitlist promotion: when confirmed cancelled, promote first waitlisted
      const cancelled = await prisma.booking.findMany({ where: { status: 'cancelled' }, orderBy: { updatedAt: 'desc' }, take: 10, include: { session: true } }).catch(()=>[]);
      for (const c of cancelled) {
        const waitlisted = await prisma.booking.findFirst({ where: { sessionId: c.sessionId, status: 'waitlisted' }, orderBy: { createdAt: 'asc' } });
        if (waitlisted && c.session.bookedCount < c.session.capacity) {
          await prisma.booking.update({ where: { id: waitlisted.id }, data: { status: 'confirmed' } }).catch(()=>{});
          await prisma.workshopSession.update({ where: { id: c.sessionId }, data: { bookedCount: { increment: 1 }, waitlistCount: { decrement: 1 } } }).catch(()=>{});
          promoted++;
        }
      }
      // Low-stock alert: raw materials onHand <= lowThreshold
      try {
        const mats = await prisma.rawMaterial.findMany().catch(()=>[]);
        const lowStock = mats.filter(m => m.onHand <= m.lowThreshold);
        lowCount = lowStock.length;
        if (lowStock.length>0) {
          let sendEmail;
          try { sendEmail = (await import("../../backend/src/services/email.js")).sendEmail; }
          catch { sendEmail = (await import("../../../backend/src/services/email.js")).sendEmail; }
          const names = lowStock.map(m=> `${m.name} (${m.onHand}/${m.lowThreshold})`).join(', ');
          await sendEmail({ to: process.env.COMPANY_EMAIL || 'krystal@krystalsflowerkreations.com.au', subject: `Low stock: ${lowStock.length} materials`, text: `Low stock alert:\n${names}\n\nCheck BOM / materials at /admin?tab=inventory` }).catch(()=>{});
        }
      } catch {}
    } catch(e){ console.log('[scheduled] reminder/promotion skipped', e.message); }
    console.log(`[scheduled] cleaned ${deleted.count||0} stale carts, reminders ${reminders}, promoted ${promoted}, lowStock ${lowCount}`);
    return { statusCode: 200, body: JSON.stringify({ ok:true, cleaned: deleted.count||0, reminders, promoted, lowStock: lowCount }) };
  }catch(err){
    console.error("[scheduled] failed", err);
    return { statusCode: 500, body: JSON.stringify({ error: String(err.message) }) };
  }
}
