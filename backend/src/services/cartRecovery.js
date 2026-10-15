import prisma from '../lib/prisma.js';
import { sendCartReminder } from './email.js';

// Abandoned-cart reminder job (hourly, from netlify/functions/scheduled.js —
// runs BEFORE the stale-cart cleanup so a cart is never emailed after it's
// deleted). One reminder per cart, deduped by Cart.reminderSentAt.
//
// Eligibility: an email was captured, no reminder sent yet, the cart still
// holds items, and it has been idle (no add/update) for the configured hours.
// The idle threshold is clamped to retention−1 so a reminder can never target
// a cart the cleanup pass is about to hard-delete.
export async function runAbandonedCartReminders(settings = {}) {
  if (settings.abandoned_cart_emails_enabled === '0') return { sent: 0, skipped: 'disabled' };
  const retentionHours = Number(settings.cart_retention_hours) || 24;
  const configured = Number(settings.abandoned_cart_reminder_hours) || 4;
  const idleHours = Math.max(1, Math.min(configured, retentionHours - 1));
  const idleSince = new Date(Date.now() - idleHours * 60 * 60 * 1000);

  const carts = await prisma.cart.findMany({
    where: {
      email: { not: null },
      reminderSentAt: null,
      updatedAt: { lte: idleSince },
      items: { some: {} },
    },
    include: { items: { include: { product: { select: { title: true } }, variant: { select: { title: true } } } } },
    take: 20,
  });

  let sent = 0;
  for (const cart of carts) {
    try {
      await sendCartReminder(cart);
      // Stamp AFTER the enqueue attempt — a total email-service failure leaves
      // the cart eligible for the next hourly pass (at most one extra send
      // window, bounded by retention).
      await prisma.cart.update({ where: { id: cart.id }, data: { reminderSentAt: new Date() } });
      sent++;
    } catch (e) {
      console.error(JSON.stringify({ level: 'error', msg: 'cart_reminder_failed', cartId: cart.id, err: e?.message }));
    }
  }
  return { sent, considered: carts.length, idleHours };
}
