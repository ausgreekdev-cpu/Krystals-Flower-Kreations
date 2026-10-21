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
import { estimateSkew } from './scanPrep.js';

let recognizeImpl = null;
export function __setOcrRecognize(fn) { recognizeImpl = fn; }

/**
 * Preprocess raster scans for OCR. Exported for tests.
 * @param {Buffer} buffer png/jpeg/webp/gif bytes
 * @returns {Promise<Buffer>} cleaned bytes (or the original on any failure)
 */
export async function prepareForOcr(buffer) {
  return (await prepareForOcrReport(buffer)).data;
}

/**
 * Like prepareForOcr but reports the deskew correction that was applied
 * (degrees, sharp.rotate() convention; 0 = left as-is). Used by the
 * "what OCR sees" preview endpoint.
 */
export async function prepareForOcrReport(buffer) {
  try {
    let img = sharp(buffer, { failOn: 'none' });
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return { data: buffer, angle: 0 };
    // 1. trim uniform scanner/photo borders (no-op on busy photos)
    img = img.trim({ background: '#ffffff', threshold: 12 });
    // 2. deskew crooked scans (OCR input only — the stored master is never
    //    rotated). Guarded: only straighten a confident, text-like estimate.
    let angle = 0;
    const skew = await estimateSkew(buffer);
    if (Math.abs(skew.angle) >= 0.75 && skew.strength >= 1.02) {
      angle = skew.angle;
      img = img.rotate(angle, { background: '#ffffff' });
    }
    // 3. greyscale + contrast normalise + mild sharpen — tesseract's sweet
    //    spot (this sharp build's .grayscale() is a no-op; toColourspace('b-w')
    //    is the API that actually converts)
    img = img.toColourspace('b-w').normalize().sharpen();
    // 4. upscale small captures (tiny phone photos have too few px per glyph)
    const after = await img.toBuffer({ resolveWithObject: true });
    const w = after.info.width || meta.width;
    if (w < 1200) {
      img = sharp(after.data, { failOn: 'none' }).resize({ width: Math.min(1600, w * 2), kernel: 'lanczos3' });
    }
    // Re-assert greyscale at encode — a fresh sharp() pipeline re-expands to
    // sRGB on png() otherwise.
    return { data: await img.toColourspace('b-w').png().toBuffer(), angle };
  } catch {
    return { data: buffer, angle: 0 };
  }
}

/**
 * @param {Buffer} buffer png/jpeg/webp/gif bytes
 * @returns {Promise<{text: string, confidence: number}>}
 */
export async function ocrImage(buffer, { timeoutMs } = {}) {
  const run = async () => {
    const prepared = await prepareForOcr(buffer);
    if (recognizeImpl) {
      const out = await recognizeImpl(prepared);
      return {
        text: String(out?.text || '').trim(),
        confidence: Number(out?.confidence) || 0,
        width: Number(out?.width) || 0,
        height: Number(out?.height) || 0,
        words: normalizeWords(out?.words),
      };
    }
    const worker = await createWorker('eng', 1, {
      cachePath: process.env.TESSDATA_CACHE || '/tmp/tessdata',
    });
    try {
      // tesseract.js v7 nests words under blocks → paragraphs → lines → words
      // (there is no top-level data.words any more) and needs blocks: true.
      const { data } = await worker.recognize(prepared, {}, { text: true, blocks: true });
      const info = await sharp(prepared).metadata();
      return {
        text: String(data.text || '').trim(),
        confidence: Number(data.confidence) || 0,
        width: info.width || 0,
        height: info.height || 0,
        words: normalizeWords(collectWords(data.blocks)),
      };
    } finally {
      await worker.terminate().catch(() => {});
    }
  };
  if (!timeoutMs) return run();
  // Callers that must not block (the upload path) pass timeoutMs so a slow
  // scan can never outlive the function's request budget.
  return Promise.race([
    run(),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`ocr timeout after ${timeoutMs}ms`)), timeoutMs)),
  ]);
}

// Flatten tesseract's block/paragraph/line tree into the word list.
export function collectWords(blocks) {
  const out = [];
  for (const block of blocks || []) {
    for (const para of block?.paragraphs || []) {
      for (const line of para?.lines || []) {
        for (const word of line?.words || []) out.push(word);
      }
    }
  }
  return out;
}

// Word boxes power the confidence-review UI and the invisible text layer of
// exported searchable PDFs. Compact keys keep the JSON small; very low
// confidence hits (<20%) are noise and get dropped, everything the reviewer
// might want to fix is kept.
const WORD_MIN_CONFIDENCE = 20;
const WORD_MAX = 3000;

export function normalizeWords(words) {
  if (!Array.isArray(words)) return [];
  const out = [];
  for (const w of words) {
    const t = String(w?.text || '').trim();
    if (!t) continue;
    const c = Math.round(Number(w?.confidence) || 0);
    if (c < WORD_MIN_CONFIDENCE) continue;
    const b = w?.bbox || {};
    out.push({
      t,
      c,
      x0: Math.round(Number(b.x0) || 0),
      y0: Math.round(Number(b.y0) || 0),
      x1: Math.round(Number(b.x1) || 0),
      y1: Math.round(Number(b.y1) || 0),
    });
    if (out.length >= WORD_MAX) break;
  }
  return out;
}
