import prisma from '../lib/prisma.js';
import { getSettings } from '../lib/settingsSchema.js';

// AU shipping calculator — zone matched by postcode prefix.
// The global `shipping_free_over` setting is the single admin knob for the
// free-shipping threshold (applied on top of any zone rate `freeOver`).
export async function calculateShipping({ postcode, subtotal, weightGrams }) {
  const freeOverSetting = await getSettings({ onlyPublic: true })
    .then(s => Number(s.shipping_free_over) || 0)
    .catch(() => 0);
  const zones = await prisma.shippingZone.findMany({ include: { rates: true }, where: { isActive: true } });
  if (!zones.length) {
    // Fallback: Perth studio defaults until admin configures zones
    const freeOver = freeOverSetting || 150;
    return {
      name: 'Standard (Perth Studio)',
      price: subtotal >= freeOver ? 0 : 15,
      zone: 'fallback',
      note: 'Configure Shipping Zones in admin',
      freeOver,
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
  const zoneFree = rate.freeOver && subtotal >= Number(rate.freeOver);
  const settingFree = freeOverSetting > 0 && subtotal >= freeOverSetting;
  const price = zoneFree || settingFree ? 0 : Number(rate.price);
  return { zone: zone.name, name: rate.name, price, freeOver: freeOverSetting || rate.freeOver || 0 };
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
