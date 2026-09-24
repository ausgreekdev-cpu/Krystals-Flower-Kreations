import nodemailer from 'nodemailer';
import prisma from '../lib/prisma.js';

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
    const from = process.env.EMAIL_FROM || `Krystal's Flower Kreations <${process.env.SMTP_USER}>`;
    const info = await transporter.sendMail({ from, to, subject, text, html: html || text });
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

export async function sendOrderConfirmation(order) {
  const subject = `Order ${order.orderNumber} — Krystal's Flower Kreations`;
  const text = `Hi ${order.shippingName || 'there'},\n\nThank you for your order ${order.orderNumber} from Krystal's Flower Kreations (Perth WA).\nTotal: $${Number(order.total).toFixed(2)} (GST incl.)\nStatus: ${order.status}\n\nWe will notify you when it's ready for pickup/dispatch.\n\n— Krystal's Flower Kreations, Perth WA\n${process.env.BUSINESS_ADDRESS || ''}`;
  const row = await enqueueEmail({ to: order.email, subject, text, template: 'order_confirmation', payload: { orderNumber: order.orderNumber } });
  sendFromQueue(row).catch(()=>{});
  return row;
}

export async function sendWorkshopConfirmation(booking, workshop, session) {
  const subject = `Workshop booked: ${workshop.title}`;
  const text = `Hi ${booking.name},\n\nYou're booked for ${workshop.title} on ${new Date(session.startsAt).toLocaleString('en-AU', { timeZone: 'Australia/Perth' })} at ${workshop.location}.\nQuantity: ${booking.quantity} • Status: ${booking.status}\n${booking.ticket ? `QR: ${booking.ticket.qrPayload}\n` : ''}\nSee you at the studio!\n— Krystal's Flower Kreations`;
  const row = await enqueueEmail({ to: booking.email, subject, text, template: 'workshop_confirmation', payload: { workshop: workshop.title } });
  sendFromQueue(row).catch(()=>{});
  return row;
}
