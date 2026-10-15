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
import { createWorker } from 'tesseract.js';

let recognizeImpl = null;
export function __setOcrRecognize(fn) { recognizeImpl = fn; }

/**
 * @param {Buffer} buffer png/jpeg/webp/gif bytes
 * @returns {Promise<{text: string, confidence: number}>}
 */
export async function ocrImage(buffer) {
  if (recognizeImpl) return recognizeImpl(buffer);
  const worker = await createWorker('eng', 1, {
    cachePath: process.env.TESSDATA_CACHE || '/tmp/tessdata',
  });
  try {
    const { data } = await worker.recognize(buffer);
    return { text: String(data.text || '').trim(), confidence: Number(data.confidence) || 0 };
  } finally {
    await worker.terminate().catch(() => {});
  }
}
