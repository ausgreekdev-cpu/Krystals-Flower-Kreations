import multer from 'multer';

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/svg+xml',
  'application/pdf',
]);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 3 }, // 5MB per file, max 3 files (was 50MB)
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error('File type not allowed'));
  },
});

export default upload;
