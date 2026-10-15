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
// digital-assets is PRIVATE (no public URL) — purchased Cricut SVGs live here
// and are only reachable through the tokenized /api/dl/:token route.
// business-documents is PRIVATE too — stocktakes/supplier exports may hold PII
// and cost data; served only via the authed /api/documents/:id/file route.
const PRIVATE_BUCKETS = new Set(['digital-assets', 'business-documents']);
export function isPrivateBucket(bucket) { return PRIVATE_BUCKETS.has(bucket); }

function bucketSpec(bucket) {
  if (bucket === 'procedure-media') {
    return {
      id: bucket, name: bucket, public: true, file_size_limit: 25 * 1024 * 1024,
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf', 'application/zip', 'model/stl', 'video/mp4', 'video/quicktime'],
    };
  }
  if (bucket === 'digital-assets') {
    return {
      id: bucket, name: bucket, public: false, file_size_limit: 5 * 1024 * 1024,
      allowed_mime_types: ['image/svg+xml'],
    };
  }
  if (bucket === 'business-documents') {
    return {
      id: bucket, name: bucket, public: false, file_size_limit: 25 * 1024 * 1024,
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf', 'application/zip', 'model/stl', 'video/mp4', 'video/quicktime', 'text/csv', 'text/plain', 'text/markdown', 'application/json', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
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
      if (!/already exists|Duplicate/i.test(text)) {
        // storage-api versions differ: some answer 400 (not 409) with a
        // BucketAlreadyExists JSON body that our regex misses — probe the
        // bucket directly before giving up, and keep Supabase's message.
        const probe = await fetch(`${cfg.url}/storage/v1/bucket/${bucket}`, {
          headers: { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key },
        }).catch(() => null);
        if (probe && probe.ok) return true;
        throw Object.assign(new Error(`Storage bucket setup failed (${res.status}): ${text.slice(0, 200)}`), { status: 503, code: 'storage_unavailable', expose: true });
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
 * Store a file and return its public URL (or a `bucket/key` ref for private buckets).
 * @param {string} key  e.g. "products/<id>-<rand>.jpg"
 * @param {{ bucket?: string }} [opts] override bucket (default: SUPABASE_STORAGE_BUCKET)
 */
export async function putObject(key, buffer, contentType = 'image/jpeg', opts = {}) {
  if (!SAFE_KEY.test(key) || key.includes('..')) throw Object.assign(new Error('Invalid storage key'), { status: 400, code: 'validation_failed' });
  const cfg = supabaseConfig();
  const bucket = (cfg ? (opts.bucket || cfg.bucket) : opts.bucket) || 'product-images';
  if (!SAFE_BUCKET.test(bucket)) throw Object.assign(new Error('Invalid storage bucket'), { status: 400, code: 'validation_failed' });
  const isPrivate = isPrivateBucket(bucket);
  if (cfg) {
    await ensureBucket(cfg, bucket);
    const res = await fetch(`${cfg.url}/storage/v1/object/${bucket}/${key}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key, 'Content-Type': contentType, 'Cache-Control': 'max-age=2592000', 'x-upsert': 'false' },
      body: buffer,
    });
    if (!res.ok) {
      throw Object.assign(new Error(`Image storage upload failed (${res.status})`), { status: 502, code: 'storage_failed', expose: true });
    }
    // Private buckets have no public URL — return the storage key ref instead.
    return isPrivate ? `${bucket}/${key}` : `${cfg.url}/storage/v1/object/public/${bucket}/${key}`;
  }
  // Local disk: private buckets live OUTSIDE the statically-served uploads dir
  // so they are never reachable at /uploads/<key>.
  const root = isPrivate ? path.join(path.dirname(LOCAL_ROOT), 'uploads-private') : LOCAL_ROOT;
  const file = path.join(root, key);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buffer);
  } catch (e) {
    throw Object.assign(new Error('Image storage is not writable on this host — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'), { status: 503, code: 'storage_unavailable', expose: true, cause: e });
  }
  return isPrivate ? `${bucket}/${key}` : `/uploads/${key}`;
}

/**
 * Fetch a stored object's bytes by its `bucket/key` ref (as returned by
 * putObject for private buckets). Throws 404-style errors when missing.
 */
export async function getObject(ref) {
  const slash = String(ref || '').indexOf('/');
  if (slash <= 0) throw Object.assign(new Error('Invalid storage ref'), { status: 400, code: 'validation_failed' });
  const bucket = ref.slice(0, slash);
  const key = ref.slice(slash + 1);
  if (!SAFE_BUCKET.test(bucket) || !SAFE_KEY.test(key) || key.includes('..')) {
    throw Object.assign(new Error('Invalid storage ref'), { status: 400, code: 'validation_failed' });
  }
  const cfg = supabaseConfig();
  if (cfg) {
    const res = await fetch(`${cfg.url}/storage/v1/object/${bucket}/${key}`, {
      headers: { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key },
    });
    if (res.status === 404) throw Object.assign(new Error('File not found'), { status: 404, code: 'not_found', expose: true });
    if (!res.ok) throw Object.assign(new Error(`Storage read failed (${res.status})`), { status: 502, code: 'storage_failed', expose: true });
    return Buffer.from(await res.arrayBuffer());
  }
  const root = isPrivateBucket(bucket) ? path.join(path.dirname(LOCAL_ROOT), 'uploads-private') : LOCAL_ROOT;
  const file = path.join(root, key);
  if (!fs.existsSync(file)) throw Object.assign(new Error('File not found'), { status: 404, code: 'not_found', expose: true });
  return fs.readFileSync(file);
}

/** Delete a previously stored object given its public URL or private `bucket/key` ref. Best-effort. */
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
    return;
  }
  // Private-bucket ref: "digital-assets/<key>"
  const slash = url.indexOf('/');
  if (slash > 0) {
    const bucket = url.slice(0, slash);
    const key = url.slice(slash + 1);
    if (!isPrivateBucket(bucket) || !SAFE_KEY.test(key) || key.includes('..')) return;
    if (cfg) {
      await fetch(`${cfg.url}/storage/v1/object/${bucket}/${key}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key },
      }).catch(() => {});
      return;
    }
    const file = path.join(path.dirname(LOCAL_ROOT), 'uploads-private', key);
    try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
  }
}
