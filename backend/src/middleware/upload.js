import multer from 'multer';

// Raster images only — every upload is re-encoded to JPEG by sharp, and the
// content is verified by decoding (the client-supplied mimetype is just a hint).
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 }, // 5MB per file, max 5 files (matches products upload.array('images', 5))
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error('Only JPEG, PNG, WebP, GIF or AVIF images are allowed'), { status: 415, code: 'unsupported_media_type' }));
  },
});

// Procedure media — diagrams, crease-pattern SVGs, PDF/ZIP/STL spec packs and
// short demo videos. Bigger cap (25MB) than product photos; the client-supplied
// mimetype is only a hint, so callers MUST also pass the buffer through
// docMimeLooksReal() before storing (mirrors the sharp-decode rule for images).
export const ALLOWED_DOC_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'image/svg+xml',
  'application/pdf', 'application/zip', 'model/stl',
  'video/mp4', 'video/quicktime',
]);

export const uploadDocs = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 8 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_DOC_MIME.has(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error('Only images, SVG, PDF, ZIP, STL or MP4/MOV files are allowed'), { status: 415, code: 'unsupported_media_type' }));
  },
});

// Cheap magic-byte sniff for non-raster docs (the rest of the trust is the
// sandbox: files are served as static objects, never executed).
export function docMimeLooksReal(buffer, mimetype) {
  if (!buffer || buffer.length < 8) return false;
  const head8 = buffer.subarray(0, 8);
  const ascii = (start, end) => buffer.subarray(start, Math.min(end, buffer.length)).toString('latin1');
  switch (mimetype) {
    case 'application/pdf': return ascii(0, 5) === '%PDF-';
    case 'application/zip': return head8[0] === 0x50 && head8[1] === 0x4b; // PK
    case 'image/svg+xml': {
      const t = buffer.subarray(0, 512).toString('utf8').trimStart().toLowerCase();
      return t.startsWith('<svg') || t.startsWith('<?xml');
    }
    case 'video/mp4':
    case 'video/quicktime': return ascii(4, 8) === 'ftyp' || ['moov', 'mdat', 'free'].includes(ascii(0, 4));
    case 'model/stl': return buffer.length > 84; // ASCII ("solid…") or binary (80-byte header + count)
    case 'image/gif': return ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a';
    default: return true; // jpeg/png/webp handled by sharp decode
  }
}

export default upload;
