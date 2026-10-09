// Server-side fetch of public external resources (media files + text content)
// for the Procedures module. hardened against SSRF: private/loopback/link-local
// destinations are rejected by resolved address, redirects are re-validated
// hop-by-hop, and the body is size-capped while streaming.
import { lookup } from 'node:dns/promises';

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 15000;

export class ExternalFetchError extends Error {
  constructor(message, status = 422, code = 'external_fetch_failed') {
    super(message);
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}

// Literal-address check (also used for every resolved DNS answer).
export function isPrivateAddress(ip) {
  const v = String(ip || '').toLowerCase();
  if (!v) return true;
  // IPv4-mapped / -compatible IPv6 (::ffff:127.0.0.1)
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return isPrivateAddress(mapped[1]);
  if (v === '::' || v === '::1') return true;
  if (v.startsWith('fc') || v.startsWith('fd')) return true; // fc00::/7 unique local
  if (/^fe[89ab]/.test(v)) return true; // fe80::/10 link-local
  if (v.startsWith('ff')) return true; // multicast
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v);
  if (!v4) return false; // public IPv6 (2000::/3 etc.) — allow
  const [a, b, c] = v4.slice(1).map(Number);
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

async function assertPublicUrl(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl)); } catch {
    throw new ExternalFetchError('Not a valid URL', 400, 'invalid_url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ExternalFetchError('Only http(s) URLs are allowed', 400, 'invalid_url');
  }
  if (url.username || url.password) {
    throw new ExternalFetchError('URLs with embedded credentials are not allowed', 400, 'invalid_url');
  }
  const host = url.hostname.replace(/^\[|\]$/g, ''); // [::1] → ::1
  if (isPrivateAddress(host)) {
    throw new ExternalFetchError('This address is not reachable from here', 400, 'blocked_host');
  }
  // Resolve and screen every answer (literal IPs return themselves, no network).
  let addrs;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new ExternalFetchError('Could not resolve host', 422, 'dns_failed');
  }
  if (!addrs?.length || addrs.some((x) => isPrivateAddress(x.address))) {
    throw new ExternalFetchError('This address is not reachable from here', 400, 'blocked_host');
  }
  return url;
}

async function readCappedBody(res, maxBytes) {
  const reader = res.body?.getReader?.();
  if (!reader) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new ExternalFetchError(`Body exceeds ${Math.floor(maxBytes / 1024 / 1024)}MB limit`, 413, 'too_large');
    return buf;
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* already closed */ }
      throw new ExternalFetchError(`Body exceeds ${Math.floor(maxBytes / 1024 / 1024)}MB limit`, 413, 'too_large');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/**
 * Fetch a public http(s) resource with SSRF + size + redirect guards.
 * Returns { buffer, contentType, finalUrl }. Throws ExternalFetchError.
 */
export async function fetchExternal(rawUrl, { maxBytes = 25 * 1024 * 1024, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let url = await assertPublicUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: '*/*', 'user-agent': 'KrystalProcedures/1.0' },
      });
    } catch (e) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
        throw new ExternalFetchError('The remote server timed out', 422, 'fetch_timeout');
      }
      throw new ExternalFetchError('Could not reach the remote server', 422, 'fetch_failed');
    }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      try { res.body?.cancel?.(); } catch { /* ignore */ }
      if (!location) throw new ExternalFetchError('Redirect without a Location header', 422, 'fetch_failed');
      // Re-screen every hop (open-redirect SSRF).
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!res.ok) {
      try { res.body?.cancel?.(); } catch { /* ignore */ }
      throw new ExternalFetchError(`Remote server responded ${res.status}`, 422, 'fetch_failed');
    }
    const buffer = await readCappedBody(res, maxBytes);
    if (!buffer.length) throw new ExternalFetchError('Remote file is empty', 422, 'fetch_failed');
    return { buffer, contentType: (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(), finalUrl: url.toString() };
  }
  throw new ExternalFetchError('Too many redirects', 422, 'too_many_redirects');
}
