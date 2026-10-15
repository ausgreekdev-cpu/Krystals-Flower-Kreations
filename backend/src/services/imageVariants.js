// Responsive image variants (Phase: frontend performance).
//
// Product photos are stored once as an 800px-inside JPEG master (the fallback
// for old browsers) plus WebP/AVIF copies at the widths the storefront
// actually renders (400px grid cards, 800px hero/gallery). Frontend serves
// them through <picture srcset sizes> — AVIF ≈ 60-70% smaller than JPEG,
// WebP ≈ 40-50%, which is the main lever on mobile LCP for regional users.
//
// Variants are generated from the master (not the original) so a single
// resize pass defines final geometry; sources smaller than a target width are
// skipped (sharp would not upscale) — `variants` is then null for tiny
// images and callers fall back to the master.
import sharp from 'sharp';

export const VARIANT_WIDTHS = [400, 800];

const AVIF = { quality: 50, effort: 2 }; // effort 2 keeps admin uploads well under function timeouts
const WEBP = { quality: 80 };

/**
 * Encode width variants of a master buffer.
 * @param {Buffer} masterBuf the stored JPEG master
 * @returns {Promise<Array<{buf: Buffer, width: number, ext: string, contentType: string}>>}
 */
export async function buildVariants(masterBuf) {
  const meta = await sharp(masterBuf).metadata();
  const masterWidth = meta.width || 0;
  const widths = VARIANT_WIDTHS.filter((w) => w <= masterWidth);
  const out = [];
  for (const w of widths) {
    const base = sharp(masterBuf).resize({ width: w, fit: 'inside', withoutEnlargement: true });
    const [webpBuf, avifBuf] = await Promise.all([
      base.clone().webp(WEBP).toBuffer(),
      base.clone().avif(AVIF).toBuffer(),
    ]);
    out.push({ buf: webpBuf, width: w, ext: 'webp', contentType: 'image/webp' });
    out.push({ buf: avifBuf, width: w, ext: 'avif', contentType: 'image/avif' });
  }
  return out;
}

/** Master geometry after encoding — for ProductImage.width/height (CLS). */
export async function masterDimensions(masterBuf) {
  const meta = await sharp(masterBuf).metadata();
  return { width: meta.width ?? null, height: meta.height ?? null };
}
