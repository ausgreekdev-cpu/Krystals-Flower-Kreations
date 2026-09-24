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

export default upload;
