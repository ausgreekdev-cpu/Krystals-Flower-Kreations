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

// import.meta.url exists in native ESM, but Netlify's esbuild bundle converts
// to CJS where import.meta is emptied ({}) — fileURLToPath(undefined) would
// throw at boot. Fall back to CWD/uploads (dev runs with cwd = backend).
const LOCAL_ROOT = (() => {
  try { return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads'); }
  catch { return path.resolve(process.cwd(), 'uploads'); }
})();

const SAFE_KEY = /^[a-zA-Z0-9/_.-]+$/;
const SAFE_BUCKET = /^[a-z0-9-]{1,63}$/;

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'product-images';
  return url && key ? { url, key, bucket } : null;
}

export function storageDriver() {
  return supabaseConfig() ? 'supabase' : 'local';
}

// Bucket create specs. product-images keeps its original 5MB/image-only rule;
// procedure-media carries the spec-pack types (PDF/SVG/ZIP/STL/video) at 25MB.
function bucketSpec(bucket) {
  if (bucket === 'procedure-media') {
    return {
      id: bucket, name: bucket, public: true, file_size_limit: 25 * 1024 * 1024,
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf', 'application/zip', 'model/stl', 'video/mp4', 'video/quicktime'],
    };
  }
  return { id: bucket, name: bucket, public: true, file_size_limit: 5 * 1024 * 1024, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] };
}

const bucketMemos = new Map(); // bucket -> Promise<true>
async function ensureBucket(cfg, bucket) {
  if (bucketMemos.has(bucket)) return bucketMemos.get(bucket);
  const p = (async () => {
    const res = await fetch(`${cfg.url}/storage/v1/bucket`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(bucketSpec(bucket)),
    });
    if (!res.ok && res.status !== 409) {
      const text = await res.text().catch(() => '');
      // Supabase returns 400 with "already exists" on some versions
      if (!/already exists|Duplicate/i.test(text)) {
        throw Object.assign(new Error(`Storage bucket setup failed (${res.status})`), { status: 503, code: 'storage_unavailable', expose: true });
      }
    }
    return true;
  })();
  bucketMemos.set(bucket, p);
  try {
    return await p;
  } catch (e) {
    bucketMemos.delete(bucket); // allow retry on the next upload
    throw e;
  }
}

/**
 * Store a file and return its public URL.
 * @param {string} key  e.g. "products/<id>-<rand>.jpg"
 * @param {{ bucket?: string }} [opts] override bucket (default: SUPABASE_STORAGE_BUCKET)
 */
export async function putObject(key, buffer, contentType = 'image/jpeg', opts = {}) {
  if (!SAFE_KEY.test(key) || key.includes('..')) throw Object.assign(new Error('Invalid storage key'), { status: 400, code: 'validation_failed' });
  const cfg = supabaseConfig();
  if (cfg) {
    const bucket = opts.bucket || cfg.bucket;
    if (!SAFE_BUCKET.test(bucket)) throw Object.assign(new Error('Invalid storage bucket'), { status: 400, code: 'validation_failed' });
    await ensureBucket(cfg, bucket);
    const res = await fetch(`${cfg.url}/storage/v1/object/${bucket}/${key}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key, 'Content-Type': contentType, 'Cache-Control': 'max-age=2592000', 'x-upsert': 'false' },
      body: buffer,
    });
    if (!res.ok) {
      throw Object.assign(new Error(`Image storage upload failed (${res.status})`), { status: 502, code: 'storage_failed', expose: true });
    }
    return `${cfg.url}/storage/v1/object/public/${bucket}/${key}`;
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
