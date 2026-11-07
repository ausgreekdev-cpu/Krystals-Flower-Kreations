import { Router } from 'express';
import { z } from 'zod';
import { getSettings } from '../lib/settingsSchema.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const quoteSchema = z.object({
  address: z.string().min(3).max(300),
  subtotal: z.number().finite().nonnegative().optional().default(0),
}).strict();

const STUDIO_ORIGIN = process.env.STUDIO_ORIGIN || 'Ballajura WA 6066, Australia';

function calcFee(km) {
  // Perth metro tiers (km from Ballajura studio)
  if (km <= 15) return 10;
  if (km <= 25) return 15;
  if (km <= 40) return 22;
  return null; // outside delivery zone
}

router.post('/quote', validate(quoteSchema), asyncHandler(async (req, res) => {
  const { address, subtotal } = req.validated;
  const settings = await getSettings({ onlyPublic: true }).catch(() => ({}));
  const freeOver = Number(settings.shipping_free_over) || 150;

  if (subtotal >= freeOver) {
    return res.json({ fee: 0, free: true, distanceKm: null, durationText: null, reason: `Free Perth delivery over $${freeOver}` });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    // Fallback: postcode-based flat rate (no live distance)
    return res.json({ fee: 15, free: false, distanceKm: null, durationText: null, reason: 'Live distance unavailable; flat rate applied' });
  }

  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
  url.searchParams.set('origins', STUDIO_ORIGIN);
  url.searchParams.set('destinations', address);
  url.searchParams.set('units', 'metric');
  url.searchParams.set('key', apiKey);

  const dm = await fetch(url.toString()).then(r => r.json()).catch(() => null);
  const el = dm?.rows?.[0]?.elements?.[0];
  if (!el || el.status !== 'OK') {
    return res.status(400).json({ error: 'Could not calculate distance', details: el?.status || 'unknown' });
  }
  const km = el.distance.value / 1000;
  const fee = calcFee(km);
  if (fee === null) {
    return res.json({ fee: null, free: false, distanceKm: Math.round(km * 10) / 10, durationText: el.duration?.text, reason: 'Outside delivery zone' });
  }
  return res.json({ fee, free: false, distanceKm: Math.round(km * 10) / 10, durationText: el.duration?.text });
}));

export default router;
