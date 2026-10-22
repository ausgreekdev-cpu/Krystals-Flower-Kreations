import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, api } from './helpers.js';
import prisma from '../src/lib/prisma.js';
import { sendAdminOrderAlert, sendAdminBookingAlert, sendAdminCustomOrderAlert } from '../src/services/email.js';

// Studio notification emails (settings: admin_order_alert_enabled/_recipient) —
// orders, workshop bookings and custom orders all land in one inbox.

let srv;
const beforeIds = new Set();

async function newAlertRows() {
  const rows = await prisma.emailQueue.findMany({
    where: { template: { in: ['admin_order_alert', 'admin_booking_alert', 'admin_custom_order_alert'] } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return rows.filter((r) => !beforeIds.has(r.id));
}

before(async () => {
  srv = await startServer();
  const rows = await prisma.emailQueue.findMany({
    where: { template: { in: ['admin_order_alert', 'admin_booking_alert', 'admin_custom_order_alert'] } },
    select: { id: true },
  });
  rows.forEach((r) => beforeIds.add(r.id));
});

after(async () => {
  await srv.close();
  await prisma.emailQueue.deleteMany({
    where: {
      template: { in: ['admin_order_alert', 'admin_booking_alert', 'admin_custom_order_alert'] },
      to: { contains: 'krystal' },
      subject: { contains: 'TESTONLY' },
    },
  });
});

test('new-order alert is queued to the studio recipient', async () => {
  const order = {
    orderNumber: 'TESTONLY-ORD-1', shippingName: 'Test Buyer', shippingAddress: '1 Test St',
    shippingSuburb: 'Perth', shippingState: 'WA', shippingPostcode: '6000',
    email: 'buyer@test.com', paymentMethod: 'bank_transfer',
    lines: [{ quantity: 2, title: 'Test bouquet', lineTotal: 90 }],
    subtotal: 90, discountTotal: 0, shippingCost: 0, total: 90, customerNote: 'TESTONLY note',
  };
  const row = await sendAdminOrderAlert(order);
  assert.ok(row, 'alert enqueued');
  const rows = await newAlertRows();
  const mine = rows.find((r) => r.id === row.id);
  assert.ok(mine, 'row visible');
  assert.equal(mine.template, 'admin_order_alert');
  assert.equal(mine.subject, `New order ${order.orderNumber} — $90.00`);
  assert.ok(mine.text.includes('2 × Test bouquet'), 'line items listed');
  assert.ok(mine.text.includes(order.shippingName), 'customer named');
});

test('workshop booking alert is queued with session details', async () => {
  const booking = { name: 'Seat Holder', email: 'seat@test.com', phone: '0400 000 000', quantity: 2, status: 'confirmed', notes: 'TESTONLY seating' };
  const workshop = { title: 'TESTONLY Origami Masterclass', location: 'Perth Studio' };
  const session = { startsAt: new Date('2026-11-14T10:00:00Z') };
  const row = await sendAdminBookingAlert(booking, workshop, session);
  assert.ok(row, 'alert enqueued');
  assert.equal(row.template, 'admin_booking_alert');
  assert.ok(row.subject.includes(workshop.title), 'workshop in subject');
  assert.ok(row.text.includes('seat@test.com'));
  assert.ok(row.text.includes('Quantity: 2'));
});

test('custom order alert is queued with the design spec', async () => {
  const order = {
    orderNumber: 'TESTONLY-CA-1', customerName: 'Design Buyer', customerEmail: 'design@test.com',
    totalPrice: 250,
    spec: { paperColor: 'Blush', paperTexture: 'textured', stemCount: 9, heightMm: 400, palette: 'romantic-blush' },
    notes: 'TESTONLY vase',
  };
  const row = await sendAdminCustomOrderAlert(order);
  assert.ok(row, 'alert enqueued');
  assert.equal(row.template, 'admin_custom_order_alert');
  assert.ok(row.subject.includes(order.orderNumber));
  assert.ok(row.text.includes('Blush'), 'spec colour listed');
  assert.ok(row.text.includes('9 stems'), 'stem count listed');
});

test('alerts are suppressed when admin_order_alert_enabled is off', async () => {
  const prev = await prisma.setting.findUnique({ where: { key: 'admin_order_alert_enabled' } });
  await prisma.setting.upsert({
    where: { key: 'admin_order_alert_enabled' },
    update: { value: '0' },
    create: { key: 'admin_order_alert_enabled', value: '0' },
  });
  try {
    const row = await sendAdminOrderAlert({ orderNumber: 'TESTONLY-OFF', lines: [], total: 0, subtotal: 0, discountTotal: 0, shippingCost: 0 });
    assert.equal(row, null, 'no alert when disabled');
  } finally {
    if (prev) await prisma.setting.update({ where: { key: 'admin_order_alert_enabled' }, data: { value: prev.value } });
    else await prisma.setting.deleteMany({ where: { key: 'admin_order_alert_enabled' } });
  }
});
