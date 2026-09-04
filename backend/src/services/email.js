import nodemailer from 'nodemailer';

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

export async function sendOrderConfirmation(order) {
  const subject = `Order ${order.orderNumber} — Krystal's Flower Kreations`;
  const text = `Hi ${order.shippingName || 'there'},\n\nThank you for your order ${order.orderNumber} from Krystal's Flower Kreations (Perth WA).\nTotal: $${Number(order.total).toFixed(2)} (GST incl.)\nStatus: ${order.status}\n\nWe will notify you when it's ready for pickup/dispatch.\n\n— Krystal's Flower Kreations, Perth WA\n${process.env.BUSINESS_ADDRESS || ''}`;
  return sendEmail({ to: order.email, subject, text });
}

export async function sendWorkshopConfirmation(booking, workshop, session) {
  const subject = `Workshop booked: ${workshop.title}`;
  const text = `Hi ${booking.name},\n\nYou're booked for ${workshop.title} on ${new Date(session.startsAt).toLocaleString('en-AU', { timeZone: 'Australia/Perth' })} at ${workshop.location}.\nQuantity: ${booking.quantity} • Status: ${booking.status}\n${booking.ticket ? `QR: ${booking.ticket.qrPayload}\n` : ''}\nSee you at the studio!\n— Krystal's Flower Kreations`;
  return sendEmail({ to: booking.email, subject, text });
}
