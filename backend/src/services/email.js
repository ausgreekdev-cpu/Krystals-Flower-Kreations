import prisma from '../lib/prisma.js';
import { getSettings, paymentInstructionsFor } from '../lib/settingsSchema.js';
import { resolveTransport, senderAddress, emailProviderStatus, SKIP_REASON } from './emailProvider.js';

const MAX_ATTEMPTS = 5;

export { emailProviderStatus };

export async function sendEmail({ to, subject, text, html }) {
  const s = await getSettings().catch(() => ({}));
  const transport = resolveTransport();
  if (!transport) {
    console.log(JSON.stringify({ level: 'warn', msg: 'email_skipped_not_configured', to, subject }));
    return { skipped: true, reason: SKIP_REASON };
  }
  // From name + reply-to come from settings (env EMAIL_FROM still wins for from).
  const fromName = s.email_from_name || "Krystals Flower Creations";
  const res = await transport.send({
    from: senderAddress(fromName, transport.name),
    replyTo: s.email_reply_to || undefined,
    to,
    subject,
    text,
    html,
  });
  if (res.ok) {
    console.log(`[email] ${transport.name} sent to ${to} — ${res.messageId || 'no message id'}`);
  } else {
    console.error(`[email] ${transport.name} failed to ${to}: ${res.error}`);
  }
  return res;
}

// Persist an email to the queue (await this in the route BEFORE responding so the
// record is durable even if the serverless function freezes immediately after).
export async function enqueueEmail({ to, subject, text, html, template, payload }) {
  return prisma.emailQueue.create({
    data: {
      to,
      subject,
      text: text || null,
      html: html || null,
      template: template || null,
      payload: payload === undefined ? undefined : payload,
      status: 'pending',
      attempts: 0,
    },
  });
}

// Attempt to send one queued row and update its status. On transient failure it
// stays pending (with attempts bumped) for the scheduled drain to retry.
export async function sendFromQueue(row) {
  const res = await sendEmail({ to: row.to, subject: row.subject, text: row.text, html: row.html });
  if (res.ok) {
    await prisma.emailQueue.update({ where: { id: row.id }, data: { status: 'sent', sentAt: new Date(), lastError: null } });
    return { sent: true };
  }
  const attempts = row.attempts + 1;
  if (res.skipped) {
    await prisma.emailQueue.update({ where: { id: row.id }, data: { status: 'failed', attempts, lastError: res.reason || SKIP_REASON } });
    return { skipped: true };
  }
  // A 4xx from the provider (bad key, unverified sender) will never succeed on
  // retry — park it as failed so it shows up in the queue instead of looping.
  if (res.permanent || attempts >= MAX_ATTEMPTS) {
    await prisma.emailQueue.update({ where: { id: row.id }, data: { status: 'failed', attempts, lastError: (res.error || 'send failed').slice(0, 500) } });
    return { failed: true };
  }
  await prisma.emailQueue.update({ where: { id: row.id }, data: { attempts, lastError: (res.error || 'send failed').slice(0, 500) } });
  return { retry: true };
}

// Drain pending queued emails (called by the hourly scheduled job).
export async function drainEmailQueue(limit = 50) {
  const pending = await prisma.emailQueue.findMany({
    where: { status: 'pending', attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  let sent = 0;
  for (const row of pending) {
    const r = await sendFromQueue(row).catch((e) => ({ error: e.message }));
    if (r?.sent) sent++;
  }
  return { drained: pending.length, sent };
}

// Shared sign-off: business identity + admin-configured email signature.
// The ABN lands on every outbound email — order confirmations double as the
// tax invoice, and AU GST-registered suppliers must show an ABN there.
const hasRealAbn = (v) => String(v || '').replace(/\D/g, '').length >= 8;
async function signatureBlock(s = {}) {
  const lines = [`— ${s.business_name || "Krystals Flower Creations"}, Perth WA`];
  if (s.business_address) lines.push(s.business_address);
  if (hasRealAbn(s.abn)) lines.push(`ABN ${String(s.abn).trim()}`);
  if (s.email_signature) lines.push(String(s.email_signature).trim());
  return lines.join('\n');
}

export async function sendOrderConfirmation(order) {
  const subject = `Order ${order.orderNumber} — Krystals Flower Creations`;
  const s = await getSettings().catch(() => ({}));
  // Include the actual payment details for the chosen method (bank/pickup come
  // from settings — previously the email promised details that never appeared).
  const paymentBlock = ['bank_transfer', 'pickup'].includes(order.paymentMethod)
    ? `\n\nPayment:\n${paymentInstructionsFor(order.paymentMethod, s)}\n` : '';
  // Florist enrichment — best-effort: care instructions + occasions per line
  let careBlock = '';
  try {
    const ids = [...new Set((order.lines || []).map(l => l.productId).filter(Boolean))];
    if (ids.length) {
      const prods = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, careInstructions: true, occasions: true } });
      const byId = new Map(prods.map(p => [p.id, p]));
      const rows = (order.lines || []).map(l => {
        const pr = byId.get(l.productId);
        if (!pr) return null;
        const bits = [];
        if (pr.careInstructions) bits.push(`Care: ${pr.careInstructions}`);
        if ((pr.occasions || []).length) bits.push(`Perfect for: ${pr.occasions.join(', ')}`);
        return bits.length ? `  • ${l.title}: ${bits.join(' — ')}` : null;
      }).filter(Boolean);
      if (rows.length) careBlock = `\n\nCare & occasions:\n${rows.join('\n')}\n`;
    }
  } catch { /* enrichment must never block the confirmation */ }
  // Digital downloads — absolute links to the tokenized /api/dl route
  // (tokens minted at checkout finalize; 30-day expiry).
  const digitalLines = (order.lines || []).filter((l) => l.isDigital && l.downloadUrl);
  let downloadBlock = '';
  if (digitalLines.length) {
    const origin = (process.env.FRONTEND_URL || 'https://krystalsflowercreations.com.au').replace(/\/+$/, '');
    const rows = digitalLines.map((l) => `  • ${l.title}: ${origin}${l.downloadUrl}`);
    downloadBlock = `\n\nYour instant downloads (links valid for 30 days):\n${rows.join('\n')}\n\nKeep these safe — anyone with the link can download the file.`;
  }
  const readyLine = downloadBlock
    ? 'Physical items will be made and dispatched separately.'
    : "We will notify you when it's ready for pickup/dispatch.";
  const footer = s.invoice_footer ? `\n${String(s.invoice_footer).trim()}\n` : '';
  const text = `Hi ${order.shippingName || 'there'},\n\nThank you for your order ${order.orderNumber} from Krystals Flower Creations (Perth WA).\nTotal: $${Number(order.total).toFixed(2)} (GST incl.)\nStatus: ${order.status}\n${paymentBlock}${careBlock}${downloadBlock}\n${readyLine}\n${footer}\n${await signatureBlock(s)}`;
  const row = await enqueueEmail({ to: order.email, subject, text, template: 'order_confirmation', payload: { orderNumber: order.orderNumber } });
  sendFromQueue(row).catch(()=>{});
  return row;
}

// Studio notification for every new checkout (settings: admin_order_alert_*).
export async function sendAdminOrderAlert(order) {
  const s = await getSettings().catch(() => ({}));
  if (s.admin_order_alert_enabled !== '1') return null;
  const to = s.admin_order_alert_recipient || s.contact_email || process.env.COMPANY_EMAIL;
  if (!to) return null;
  const lines = (order.lines || []).map(l => `  ${l.quantity} × ${l.title} — $${Number(l.lineTotal).toFixed(2)}`).join('\n');
  const subject = `New order ${order.orderNumber} — $${Number(order.total).toFixed(2)}`;
  const text = `New order ${order.orderNumber}\n\n${order.shippingName}\n${order.shippingAddress}, ${order.shippingSuburb} ${order.shippingState} ${order.shippingPostcode}\nEmail: ${order.email}\nPayment: ${order.paymentMethod}\n\n${lines || ''}\n\nSubtotal $${Number(order.subtotal).toFixed(2)} • Discount $${Number(order.discountTotal).toFixed(2)} • Shipping $${Number(order.shippingCost).toFixed(2)} • TOTAL $${Number(order.total).toFixed(2)}\n\n${order.customerNote ? `Customer note: ${order.customerNote}\n\n` : ''}${await signatureBlock(s)}`;
  const row = await enqueueEmail({ to, subject, text, template: 'admin_order_alert', payload: { orderNumber: order.orderNumber } });
  sendFromQueue(row).catch(()=>{});
  return row;
}

// Customer notification when staff change an order status
// (settings: customer_status_emails_enabled).
export async function sendStatusUpdate(order, fromStatus, toStatus) {
  const s = await getSettings().catch(() => ({}));
  if (s.customer_status_emails_enabled !== '1') return null;
  if (!order.email || fromStatus === toStatus) return null;
  const subject = `Order ${order.orderNumber} — ${toStatus.replace(/_/g, ' ')}`;
  const text = `Hi ${order.shippingName || 'there'},\n\nYour order ${order.orderNumber} is now: ${toStatus.replace(/_/g, ' ')}.\nTotal: $${Number(order.total).toFixed(2)}\n\n${await signatureBlock(s)}`;
  const row = await enqueueEmail({ to: order.email, subject, text, template: 'order_status_update', payload: { orderNumber: order.orderNumber, from: fromStatus, to: toStatus } });
  sendFromQueue(row).catch(()=>{});
  return row;
}

// Single abandoned-cart reminder (settings: abandoned_cart_emails_enabled +
// abandoned_cart_reminder_hours). Items must be included on the cart row
// (caller passes cart with items). One email per cart — deduped by
// Cart.reminderSentAt stamped by the recovery job, not here.
export async function sendCartReminder(cart) {
  if (!cart?.email) return null;
  const s = await getSettings().catch(() => ({}));
  const origin = (process.env.FRONTEND_URL || 'https://krystalsflowercreations.com.au').replace(/\/+$/, '');
  const items = Array.isArray(cart.items) ? cart.items : [];
  if (!items.length) return null;
  const lines = items.map((it) => {
    const title = it.product?.title || it.title || 'Item';
    const variant = it.variant?.title ? ` — ${it.variant.title}` : '';
    const lineTotal = Number(it.priceSnapshot || 0) * Number(it.quantity || 1);
    return `  ${it.quantity} × ${title}${variant} — $${lineTotal.toFixed(2)}`;
  }).join('\n');
  const subtotal = items.reduce((a, it) => a + Number(it.priceSnapshot || 0) * Number(it.quantity || 1), 0);
  const restoreUrl = `${origin}/cart?restore=${cart.id}`;
  const retention = Number(s.cart_retention_hours) || 24;
  const subject = 'Your cart at Krystals Flower Creations';
  const text = `Hi there,\n\nYou left a few blooms sitting in your cart at Krystals Flower Creations (Perth WA):\n\n${lines}\n\nSubtotal: $${subtotal.toFixed(2)} (GST incl.)\n\nPick up right where you left off:\n${restoreUrl}\n\nYour cart is saved for about ${retention} hours.\n\nIf you didn't start this cart, just ignore this email — we won't send another.\n\n${await signatureBlock(s)}`;
  const row = await enqueueEmail({ to: cart.email, subject, text, template: 'cart_reminder', payload: { cartId: cart.id } });
  sendFromQueue(row).catch(()=>{});
  return row;
}

// Confirmation for a submitted custom order (configurator). Custom orders
// previously emailed nothing at all — the customer only saw an on-screen
// order number, so a reload lost every reference to their $100+ design.
export async function sendCustomOrderConfirmation(order) {
  if (!order?.customerEmail) return null;
  const s = await getSettings().catch(() => ({}));
  const spec = order.spec && typeof order.spec === 'object' ? order.spec : {};
  const bits = [];
  if (spec.paperColor) bits.push(`Colour: ${spec.paperColor}`);
  if (spec.paperTexture) bits.push(`Paper: ${spec.paperTexture} ${spec.weight || ''}`.trim());
  if (spec.stemCount) bits.push(`Stems: ${spec.stemCount}`);
  if (spec.heightMm) bits.push(`Height: ~${spec.heightMm} mm`);
  if (spec.addGreenery) bits.push('Greenery included');
  if (spec.vaseIncluded) bits.push('Vase included');
  if (spec.domeIncluded) bits.push('Glass dome included');
  if (spec.ledIncluded) bits.push('Fairy lights included');
  const specBlock = bits.length ? `\n\nYour design:\n${bits.map(b => `  • ${b}`).join('\n')}` : '';
  const subject = `Custom design received — ${order.orderNumber}`;
  const text = `Hi ${order.customerName || 'there'},\n\nThanks for designing with us! We've received your custom bouquet request ${order.orderNumber}.\nEstimate: $${Number(order.totalPrice).toFixed(2)} (GST incl.)${specBlock}\n\nThe studio will review your design and be in touch from Perth within 1–2 business days with a proof and next steps.\n\nKeep this email — it has your order number.\n\n${await signatureBlock(s)}`;
  const row = await enqueueEmail({ to: order.customerEmail, subject, text, template: 'custom_order_confirmation', payload: { orderNumber: order.orderNumber } });
  sendFromQueue(row).catch(()=>{});
  return row;
}

// Self-service password reset. Deliberately NOT gated by
// customer_status_emails_enabled — that toggle is about order notifications, and
// switching it off must never lock customers out of their own account.
export async function sendPasswordReset(user, { resetUrl, ttlMinutes = 60 } = {}) {
  if (!user?.email || !resetUrl) return null;
  const s = await getSettings().catch(() => ({}));
  const subject = 'Reset your Krystals Flower Creations password';
  const text = `Hi ${user.name || 'there'},\n\nSomeone (hopefully you) asked to reset the password for the Krystals Flower Creations account using this email address.\n\nChoose a new password here:\n${resetUrl}\n\nThis link works once and expires in ${ttlMinutes} minutes.\nIf you didn't ask for this, you can ignore this email — your password hasn't changed.\n\n${await signatureBlock(s)}`;
  const row = await enqueueEmail({
    to: user.email,
    subject,
    text,
    template: 'password_reset',
    payload: { userId: user.id, ttlMinutes },
  });
  // Awaited, unlike the order mail: the link expires in 60 minutes, so letting a
  // fire-and-forget send get frozen with the Netlify invocation would mean the
  // hourly drain can deliver it already-expired. The queue row is the safety net
  // if this attempt fails.
  await sendFromQueue(row).catch(() => {});
  return row;
}

export async function sendWorkshopConfirmation(booking, workshop, session, { reminder = false } = {}) {
  const s = await getSettings().catch(() => ({}));
  const when = new Date(session.startsAt).toLocaleString('en-AU', { timeZone: 'Australia/Perth' });
  const subject = reminder ? `Reminder: ${workshop.title} on ${when}` : `Workshop booked: ${workshop.title}`;
  const intro = reminder ? `Just a reminder — you're booked for ${workshop.title}` : `You're booked for ${workshop.title}`;
  const text = `Hi ${booking.name},\n\n${intro} on ${when} at ${workshop.location}.\nQuantity: ${booking.quantity} • Status: ${booking.status}\n${booking.ticket ? `QR: ${booking.ticket.qrPayload}\n` : ''}\nSee you at the studio!\n— ${s.business_name || "Krystals Flower Creations"}`;
  const row = await enqueueEmail({ to: booking.email, subject, text, template: reminder ? 'workshop_reminder' : 'workshop_confirmation', payload: { workshop: workshop.title } });
  sendFromQueue(row).catch(()=>{});
  return row;
}
