import nodemailer from 'nodemailer';
import prisma from '../lib/prisma.js';
import { getSettings, paymentInstructionsFor } from '../lib/settingsSchema.js';

const MAX_ATTEMPTS = 5;

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });
}

export async function sendEmail({ to, subject, text, html }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[email] SMTP not configured — would send to ${to}: ${subject}`);
    return { skipped: true, reason: 'SMTP not configured' };
  }
  try {
    // From name + reply-to come from settings (env EMAIL_FROM still wins for from).
    const s = await getSettings().catch(() => ({}));
    const fromName = s.email_from_name || "Krystal's Flower Kreations";
    const from = process.env.EMAIL_FROM || `${fromName} <${process.env.SMTP_USER}>`;
    const replyTo = s.email_reply_to || undefined;
    const info = await transporter.sendMail({ from, replyTo, to, subject, text, html: html || text });
    console.log(`[email] Sent to ${to} — ${info.messageId}`);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[email] Failed to ${to}:`, err.message);
    return { ok: false, error: err.message };
  }
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
    await prisma.emailQueue.update({ where: { id: row.id }, data: { status: 'failed', attempts, lastError: 'SMTP not configured' } });
    return { skipped: true };
  }
  if (attempts >= MAX_ATTEMPTS) {
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
async function signatureBlock(s = {}) {
  const lines = [`— ${s.business_name || "Krystal's Flower Kreations"}, Perth WA`];
  if (s.business_address) lines.push(s.business_address);
  if (s.email_signature) lines.push(String(s.email_signature).trim());
  return lines.join('\n');
}

export async function sendOrderConfirmation(order) {
  const subject = `Order ${order.orderNumber} — Krystal's Flower Kreations`;
  const s = await getSettings().catch(() => ({}));
  // Include the actual payment details for the chosen method (bank/pickup come
  // from settings — previously the email promised details that never appeared).
  const paymentBlock = ['bank_transfer', 'pickup'].includes(order.paymentMethod)
    ? `\n\nPayment:\n${paymentInstructionsFor(order.paymentMethod, s)}\n` : '';
  const footer = s.invoice_footer ? `\n${String(s.invoice_footer).trim()}\n` : '';
  const text = `Hi ${order.shippingName || 'there'},\n\nThank you for your order ${order.orderNumber} from Krystal's Flower Kreations (Perth WA).\nTotal: $${Number(order.total).toFixed(2)} (GST incl.)\nStatus: ${order.status}\n${paymentBlock}\nWe will notify you when it's ready for pickup/dispatch.\n${footer}\n${await signatureBlock(s)}`;
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

export async function sendWorkshopConfirmation(booking, workshop, session, { reminder = false } = {}) {
  const s = await getSettings().catch(() => ({}));
  const when = new Date(session.startsAt).toLocaleString('en-AU', { timeZone: 'Australia/Perth' });
  const subject = reminder ? `Reminder: ${workshop.title} on ${when}` : `Workshop booked: ${workshop.title}`;
  const intro = reminder ? `Just a reminder — you're booked for ${workshop.title}` : `You're booked for ${workshop.title}`;
  const text = `Hi ${booking.name},\n\n${intro} on ${when} at ${workshop.location}.\nQuantity: ${booking.quantity} • Status: ${booking.status}\n${booking.ticket ? `QR: ${booking.ticket.qrPayload}\n` : ''}\nSee you at the studio!\n— ${s.business_name || "Krystal's Flower Kreations"}`;
  const row = await enqueueEmail({ to: booking.email, subject, text, template: reminder ? 'workshop_reminder' : 'workshop_confirmation', payload: { workshop: workshop.title } });
  sendFromQueue(row).catch(()=>{});
  return row;
}
