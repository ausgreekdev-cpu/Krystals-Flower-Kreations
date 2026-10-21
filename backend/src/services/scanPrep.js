// Scan preparation — skew detection for crooked phone scans.
//
// Projection-profile deskew (y-projection): every ink pixel is binned at
// `y + x·tanθ`; when θ matches the page's tilt, whole text lines land on a
// single bin and the bin profile is maximally sharp (large differences
// between line rows and gap rows). Scanning candidate angles and picking the
// sharpest profile gives the correction.
//
// Only the OCR input is straightened — the stored master is never rotated.
import sharp from 'sharp';

const SEARCH_MAX = 15;      // degrees
const COARSE_STEP = 1;
const FINE_STEP = 0.25;
const MIN_STRENGTH = 1.02;  // a photo's flat profile must not trigger a rotation

function binScore(pixels, w, h, deg) {
  const t = Math.tan((deg * Math.PI) / 180);
  const span = Math.ceil(w * Math.abs(t));
  const bins = new Float64Array(h + span + 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ink = 255 - pixels[y * w + x]; // dark ink accumulates
      if (!ink) continue;
      const bin = y + x * t;
      const i = Math.round(bin) + (t < 0 ? span : 0);
      if (i >= 0 && i < bins.length) bins[i] += ink;
    }
  }
  let score = 0;
  for (let i = 1; i < bins.length; i++) {
    const d = bins[i] - bins[i - 1];
    score += d * d;
  }
  return score;
}

function scan(pixels, w, h, step, from, to) {
  let bestDeg = 0;
  let bestScore = -1;
  for (let deg = from; deg <= to + 1e-9; deg += step) {
    const s = binScore(pixels, w, h, deg);
    if (s > bestScore) { bestScore = s; bestDeg = deg; }
  }
  return { deg: Math.round(bestDeg * 100) / 100, score: bestScore };
}

/**
 * Estimate the rotation (degrees, sharp.rotate() convention: positive is
 * clockwise) that straightens the page. Returns 0 for photos, tiny images or
 * any pipeline failure.
 */
export async function estimateSkew(buffer) {
  try {
    const { data, info } = await sharp(buffer, { failOn: 'none' })
      .toColourspace('b-w')
      .resize(500, null, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const w = info.width || 0;
    const h = info.height || 0;
    if (!w || !h || w < 40 || h < 40) return { angle: 0, strength: 0 };
    const pixels = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

    const atZero = binScore(pixels, w, h, 0);
    if (!atZero) return { angle: 0, strength: 0 };
    const coarse = scan(pixels, w, h, COARSE_STEP, -SEARCH_MAX, SEARCH_MAX);
    const fine = scan(pixels, w, h, FINE_STEP, Math.max(-SEARCH_MAX, coarse.deg - 1), Math.min(SEARCH_MAX, coarse.deg + 1));
    const strength = fine.score / atZero;
    if (strength < MIN_STRENGTH) return { angle: 0, strength: Math.round(strength * 1000) / 1000 };
    return { angle: fine.deg, strength: Math.round(strength * 1000) / 1000 };
  } catch {
    return { angle: 0, strength: 0 };
  }
}
