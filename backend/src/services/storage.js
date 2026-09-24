// Object storage for uploaded images.
//
// - Production (Netlify): Supabase Storage (free tier, public bucket). Netlify
//   function filesystems are read-only/ephemeral, so local disk cannot be used.
//   Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server-side only — never
//   expose the service role key to the frontend).
// - Development: local disk under backend/uploads, served by express.static.
//
// No SDK dependency — plain REST calls via fetch.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_ROOT = path.resolve(__dirname, '../../uploads');

const SAFE_KEY = /^[a-zA-Z0-9/_.-]+$/;

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'product-images';
  return url && key ? { url, key, bucket } : null;
}

export function storageDriver() {
  return supabaseConfig() ? 'supabase' : 'local';
}

let bucketReady = null;
async function ensureBucket(cfg) {
  if (bucketReady) return bucketReady;
  bucketReady = (async () => {
    const res = await fetch(`${cfg.url}/storage/v1/bucket`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cfg.bucket, name: cfg.bucket, public: true, file_size_limit: 5 * 1024 * 1024, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] }),
    });
    if (!res.ok && res.status !== 409) {
      const text = await res.text().catch(() => '');
      // Supabase returns 400 with "already exists" on some versions
      if (!/already exists|Duplicate/i.test(text)) {
        bucketReady = null;
        throw Object.assign(new Error(`Storage bucket setup failed (${res.status})`), { status: 503, code: 'storage_unavailable', expose: true });
      }
    }
    return true;
  })();
  return bucketReady;
}

/**
 * Store a file and return its public URL.
 * @param {string} key  e.g. "products/<id>-<rand>.jpg"
 */
export async function putObject(key, buffer, contentType = 'image/jpeg') {
  if (!SAFE_KEY.test(key) || key.includes('..')) throw Object.assign(new Error('Invalid storage key'), { status: 400, code: 'validation_failed' });
  const cfg = supabaseConfig();
  if (cfg) {
    await ensureBucket(cfg);
    const res = await fetch(`${cfg.url}/storage/v1/object/${cfg.bucket}/${key}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key, 'Content-Type': contentType, 'Cache-Control': 'max-age=2592000', 'x-upsert': 'false' },
      body: buffer,
    });
    if (!res.ok) {
      throw Object.assign(new Error(`Image storage upload failed (${res.status})`), { status: 502, code: 'storage_failed', expose: true });
    }
    return `${cfg.url}/storage/v1/object/public/${cfg.bucket}/${key}`;
  }
  const file = path.join(LOCAL_ROOT, key);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buffer);
  } catch (e) {
    throw Object.assign(new Error('Image storage is not writable on this host — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'), { status: 503, code: 'storage_unavailable', expose: true, cause: e });
  }
  return `/uploads/${key}`;
}

/** Delete a previously stored object given its public URL. Best-effort. */
export async function deleteObjectByUrl(url) {
  if (!url) return;
  const cfg = supabaseConfig();
  if (cfg && url.startsWith(`${cfg.url}/storage/v1/object/public/`)) {
    const rest = url.slice(`${cfg.url}/storage/v1/object/public/`.length);
    const [bucket, ...parts] = rest.split('/');
    const key = parts.join('/');
    if (!SAFE_KEY.test(key)) return;
    await fetch(`${cfg.url}/storage/v1/object/${bucket}/${key}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key },
    }).catch(() => {});
    return;
  }
  if (url.startsWith('/uploads/')) {
    const key = url.slice('/uploads/'.length);
    if (!SAFE_KEY.test(key) || key.includes('..')) return;
    const file = path.join(LOCAL_ROOT, key);
    try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
  }
}
