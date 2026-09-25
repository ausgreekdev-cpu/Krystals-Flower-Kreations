export const config = { schedule: "0 * * * *" }; // hourly
export async function handler(event, context){
  try{
    let prisma;
    try { prisma = (await import("../../backend/src/lib/prisma.js")).default; } catch { prisma = (await import("../../../backend/src/lib/prisma.js")).default; }
    // Settings (cart retention, reminder leads/toggle, low-stock recipient)
    let getSettings;
    try { getSettings = (await import("../../backend/src/lib/settingsSchema.js")).getSettings; }
    catch { getSettings = (await import("../../../backend/src/lib/settingsSchema.js")).getSettings; }
    const S = await getSettings().catch(()=>({}));

    // Clean expired carts (retention from settings: cart_retention_hours, default 24h)
    const retentionHours = Number(S.cart_retention_hours) || 24;
    const cutoff = new Date(Date.now() - retentionHours*60*60*1000);
    const deleted = await prisma.cart.deleteMany({ where: { updatedAt: { lt: cutoff } } }).catch(()=>({count:0}));
    console.log(`[scheduled] cleaned ${deleted.count||0} stale carts (> ${retentionHours}h)`);

    // Purge expired shared rate-limit counters
    let purgedRl = 0;
    try {
      let rl;
      try { rl = await import("../../backend/src/middleware/rate-limit.js"); } catch { rl = await import("../../../backend/src/middleware/rate-limit.js"); }
      purgedRl = await rl.purgeExpiredRateLimits();
    } catch (e) { console.log('[scheduled] rate-limit purge skipped', e.message); }

    // Workshop reminders (settings: workshop_reminders_enabled + lead hours).
    // The per-booking reminder24hSentAt/reminder2hSentAt flags dedupe sends.
    let reminders = 0; let lowCount = 0;
    if (S.workshop_reminders_enabled !== '0') {
    try {
      let sendWorkshopConfirmation;
      try { sendWorkshopConfirmation = (await import("../../backend/src/services/email.js")).sendWorkshopConfirmation; }
      catch { sendWorkshopConfirmation = (await import("../../../backend/src/services/email.js")).sendWorkshopConfirmation; }
      const now = new Date();
      const lead1 = Math.max(1, Number(S.workshop_reminder_24h_lead) || 24);
      const lead2 = Math.max(1, Number(S.workshop_reminder_2h_lead) || 2);
      const inLead1 = new Date(now.getTime() + lead1*60*60*1000);
      const inLead2 = new Date(now.getTime() + lead2*60*60*1000);
      const upcoming = await prisma.booking.findMany({
        where: { status: 'confirmed', reminder24hSentAt: null, session: { startsAt: { gte: new Date(inLead1.getTime() - 30*60*1000), lte: new Date(inLead1.getTime() + 30*60*1000) } } },
        include: { session: { include: { workshop: true } }, ticket: true },
        take: 20,
      }).catch(()=>[]);
      for (const b of upcoming) {
        try { await sendWorkshopConfirmation({ ...b, ticket: b.ticket }, b.session.workshop, b.session, { reminder: true }); reminders++; } catch {}
        await prisma.booking.update({ where: { id: b.id }, data: { reminder24hSentAt: new Date() } }).catch(()=>{});
      }
      const soon = await prisma.booking.findMany({
        where: { status: 'confirmed', reminder2hSentAt: null, session: { startsAt: { gte: new Date(inLead2.getTime() - 30*60*1000), lte: new Date(inLead2.getTime() + 30*60*1000) } } },
        include: { session: { include: { workshop: true } }, ticket: true },
        take: 20,
      }).catch(()=>[]);
      for (const b of soon) {
        try { await sendWorkshopConfirmation({ ...b, ticket: b.ticket }, b.session.workshop, b.session, { reminder: true }); reminders++; } catch {}
        await prisma.booking.update({ where: { id: b.id }, data: { reminder2hSentAt: new Date() } }).catch(()=>{});
      }
    } catch(e){ console.log('[scheduled] reminder skipped', e.message); }
    } else { console.log('[scheduled] workshop reminders disabled by settings'); }

    // Low-stock alert (settings: low_stock_alerts_enabled, low_stock_recipient, low_stock_default)
    try {
      if (S.low_stock_alerts_enabled !== '0') {
      const defaultThreshold = Number(S.low_stock_default) || 5;
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
        const recipient = S.low_stock_recipient || process.env.COMPANY_EMAIL || 'krystal@krystalsflowerkreations.com.au';
        await sendEmail({ to: recipient, subject: `Low stock: ${lowStock.length} items`, text: `Low stock alert:\n${names}\n\nCheck Inventory at /admin?tab=inventory` }).catch(()=>{});
      }
      }
    } catch(e){ console.log('[scheduled] low-stock skipped', e.message); }

    // Drain any queued emails whose immediate send was frozen/lost (order + workshop confirmations).
    let emailDrained = 0;
    try {
      let drain;
      try { drain = (await import("../../backend/src/services/email.js")).drainEmailQueue; }
      catch { drain = (await import("../../../backend/src/services/email.js")).drainEmailQueue; }
      const r = await drain();
      emailDrained = r.sent || 0;
    } catch (e) { console.log('[scheduled] email drain skipped', e.message); }

    console.log(`[scheduled] cleaned ${deleted.count||0} stale carts, reminders ${reminders}, lowStock ${lowCount}, rateLimitRowsPurged ${purgedRl}, emailsSent ${emailDrained}`);
    return { statusCode: 200, body: JSON.stringify({ ok:true, cleaned: deleted.count||0, reminders, lowStock: lowCount, rateLimitRowsPurged: purgedRl, emailsSent: emailDrained }) };
  }catch(err){
    console.error("[scheduled] failed", err);
    return { statusCode: 500, body: JSON.stringify({ error: String(err.message) }) };
  }
}
