// On-demand OCR (M4) for business-document images via tesseract.js.
//
// - Model data: createWorker downloads eng.traineddata (~5MB uncompressed,
//   10.9MB gz from tessdata.projectnaptha.com) into cachePath ONCE per
//   filesystem — Netlify's /tmp persists across warm invocations, so only a
//   cold start pays the download. TESSDATA_CACHE overrides for local/CI.
// - Worker is created and terminated per call (admin-only, low volume; a
//   shared worker would need a mutex across concurrent requests).
// - The engine is swappable so tests never hit the network:
//   `__setOcrRecognize(fn)` injects a stub returning `{text, confidence}`.
// - Phase E: prepareForOcr() preprocesses scans (trim borders, grayscale,
//   contrast normalise, mild sharpen, upscale small pages) before tesseract —
//   the main accuracy lever for phone photos. Everything is best-effort: any
//   failure falls back to the original bytes. Deskew is deliberately not
//   attempted (tesseract tolerates mild skew; destructive rotation guesses
//   are worse than none).
import { createWorker } from 'tesseract.js';
import sharp from 'sharp';

let recognizeImpl = null;
export function __setOcrRecognize(fn) { recognizeImpl = fn; }

/**
 * Preprocess raster scans for OCR. Exported for tests.
 * @param {Buffer} buffer png/jpeg/webp/gif bytes
 * @returns {Promise<Buffer>} cleaned bytes (or the original on any failure)
 */
export async function prepareForOcr(buffer) {
  try {
    let img = sharp(buffer, { failOn: 'none' });
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return buffer;
    // 1. trim uniform scanner/photo borders (no-op on busy photos)
    img = img.trim({ background: '#ffffff', threshold: 12 });
    // 2. greyscale + contrast normalise + mild sharpen — tesseract's sweet
    // spot (this sharp build's .grayscale() is a no-op; toColourspace('b-w')
    // is the API that actually converts)
    img = img.toColourspace('b-w').normalize().sharpen();
    // 3. upscale small captures (tiny phone photos have too few px per glyph)
    const after = await img.toBuffer({ resolveWithObject: true });
    const w = after.info.width || meta.width;
    if (w < 1200) {
      img = sharp(after.data, { failOn: 'none' }).resize({ width: Math.min(1600, w * 2), kernel: 'lanczos3' });
    }
    // Re-assert greyscale at encode — a fresh sharp() pipeline re-expands to
    // sRGB on png() otherwise.
    return await img.toColourspace('b-w').png().toBuffer();
  } catch {
    return buffer;
  }
}

/**
 * @param {Buffer} buffer png/jpeg/webp/gif bytes
 * @returns {Promise<{text: string, confidence: number}>}
 */
export async function ocrImage(buffer) {
  const prepared = await prepareForOcr(buffer);
  if (recognizeImpl) return recognizeImpl(prepared);
  const worker = await createWorker('eng', 1, {
    cachePath: process.env.TESSDATA_CACHE || '/tmp/tessdata',
  });
  try {
    const { data } = await worker.recognize(prepared);
    return { text: String(data.text || '').trim(), confidence: Number(data.confidence) || 0 };
  } finally {
    await worker.terminate().catch(() => {});
  }
}
