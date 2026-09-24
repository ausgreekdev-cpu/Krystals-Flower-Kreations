import prisma from '../lib/prisma.js';

// AU shipping calculator — zone matched by postcode prefix
export async function calculateShipping({ postcode, subtotal, weightGrams }) {
  const zones = await prisma.shippingZone.findMany({ include: { rates: true }, where: { isActive: true } });
  if (!zones.length) {
    // Fallback: Perth studio defaults until admin configures zones
    return {
      name: 'Standard (Perth Studio)',
      price: subtotal >= 150 ? 0 : 15,
      zone: 'fallback',
      note: 'Configure Shipping Zones in admin',
    };
  }
  // Simple postcode match — expand to full table later
  const zone = zones.find(z => {
    if (!z.postcodes) return false;
    try {
      const list = JSON.parse(z.postcodes);
      return Array.isArray(list) && list.some(p => postcode.startsWith(String(p)));
    } catch { return z.postcodes.includes(postcode); }
  }) || zones[0];
  const rate = zone.rates.find(r => r.isActive && (!r.maxWeightGrams || weightGrams <= r.maxWeightGrams)) || zone.rates[0];
  const price = rate.freeOver && subtotal >= Number(rate.freeOver) ? 0 : Number(rate.price);
  return { zone: zone.name, name: rate.name, price };
}

export async function calculateGstInclusive(total) {
  let rate = Number(process.env.TAX_GST_RATE || 0.10);
  // Prefer the DB setting (admin-editable) over env
  try {
    const row = await prisma.setting.findUnique({ where: { key: 'tax_gst_rate' } });
    if (row?.value) rate = Number(row.value) || rate;
  } catch {}
  const gst = total * rate / (1 + rate);
  const exGst = total - gst;
  return { total, gst, exGst, rate };
}
