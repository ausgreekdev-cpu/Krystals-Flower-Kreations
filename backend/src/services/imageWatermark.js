// Image compression + watermarking for portfolio/product photos.
//
// Produces a single WebP master (compressed) with a "Krystal's Flower Creations"
// watermark overlay (bottom-right, semi-transparent). Used in the upload path
// before storing to Supabase Storage so the public asset is already optimized
// and branded.
import sharp from 'sharp';

const WATERMARK_TEXT = "Krystal's Flower Creations";
const MAX_WIDTH = 1600;
const WEBP_QUALITY = 82;

/**
 * Compress an image to WebP and overlay a watermark.
 * @param {Buffer} inputBuf raw image bytes (jpeg/png/webp/avif)
 * @returns {Promise<{ buf: Buffer, width: number, height: number, contentType: 'image/webp' }>}
 */
export async function compressAndWatermark(inputBuf) {
  const meta = await sharp(inputBuf).metadata();
  const srcW = meta.width || 0;
  const srcH = meta.height || 0;
  const scale = srcW > MAX_WIDTH ? MAX_WIDTH / srcW : 1;
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);

  // Watermark SVG sized relative to the (scaled) image
  const fontSize = Math.max(12, Math.round(w * 0.028));
  const pad = Math.round(fontSize * 0.6);
  const tw = Math.round(WATERMARK_TEXT.length * fontSize * 0.55) + pad * 2;
  const th = fontSize + pad * 2;
  const svg = `<svg width="${tw}" height="${th}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${tw}" height="${th}" rx="${Math.round(fontSize*0.3)}" fill="rgba(0,0,0,0.35)" />
    <text x="${pad}" y="${th - pad}" font-family="sans-serif" font-size="${fontSize}" font-weight="600" fill="rgba(255,255,255,0.85)">${WATERMARK_TEXT}</text>
  </svg>`;
  const wmBuf = Buffer.from(svg);

  const base = sharp(inputBuf).resize({ width: MAX_WIDTH, fit: 'inside', withoutEnlargement: true });
  const out = await base
    .composite([{ input: wmBuf, gravity: 'southeast', blend: 'over' }])
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  const outMeta = await sharp(out).metadata();
  return { buf: out, width: outMeta.width ?? w, height: outMeta.height ?? h, contentType: 'image/webp' };
}

export default { compressAndWatermark };
