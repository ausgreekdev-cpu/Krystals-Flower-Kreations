// PayPal Orders v2 — plain fetch, no SDK package (keeps package.json /
// netlify.toml untouched and avoids bundler/CJS issues on Netlify).
//
// Modes (env PAYPAL_MODE):
//   off      — disabled (default outside tests until configured)
//   mock     — deterministic no-network mode (default when NODE_ENV=test)
//   sandbox  — https://api-m.sandbox.paypal.com (buyer/test credentials)
//   live     — https://api-m.paypal.com
//
// Credentials: PAYPAL_CLIENT_SECRET always from env (never settings/DB).
// Client id from env PAYPAL_CLIENT_ID, falling back to the public
// `paypal_client_id` setting (Admin → Settings → Payments).
import { getSettings } from '../lib/settingsSchema.js';

const BASE = { sandbox: 'https://api-m.sandbox.paypal.com', live: 'https://api-m.paypal.com' };

export function paypalMode() {
  const m = String(process.env.PAYPAL_MODE || '').toLowerCase().trim();
  if (m === 'disabled') return 'off';
  if (m === 'off' || m === 'mock' || m === 'sandbox' || m === 'live') return m;
  if (process.env.NODE_ENV === 'test') return 'mock';
  return 'off';
}

// expose=true so intentional 5xx messages (not_configured etc.) reach the
// client even in production (see error-handler.js).
function ppError(status, code, message) {
  return Object.assign(new Error(message), { status, code, expose: true });
}

async function credentials() {
  const secret = String(process.env.PAYPAL_CLIENT_SECRET || '').trim();
  let clientId = String(process.env.PAYPAL_CLIENT_ID || '').trim();
  if (!clientId) {
    try {
      const s = await getSettings({ onlyPublic: true });
      clientId = String(s.paypal_client_id || '').trim();
    } catch { /* settings unavailable — treated as unconfigured below */ }
  }
  return { clientId, secret };
}

let tokenCache = { token: null, expiresAt: 0 };

async function getAccessToken() {
  const mode = paypalMode();
  if (mode === 'mock') return 'MOCK-TOKEN';
  if (mode === 'off') throw ppError(503, 'paypal_disabled', 'PayPal payments are not enabled');
  const { clientId, secret } = await credentials();
  if (!clientId || !secret) {
    throw ppError(503, 'paypal_not_configured', 'PayPal is not configured yet — set the Client ID in Admin → Settings → Payments and PAYPAL_CLIENT_SECRET in the environment');
  }
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 30_000) return tokenCache.token;
  const res = await fetch(`${BASE[mode]}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw ppError(502, 'paypal_auth_failed', `PayPal authentication failed (${res.status})`);
  const json = await res.json();
  tokenCache = { token: json.access_token, expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000 };
  return tokenCache.token;
}

// Throws 503 (paypal_disabled / paypal_not_configured) when PayPal can't
// take money right now — called before any order state is written so a
// misconfigured store never reserves stock for a payment it can't collect.
export async function assertPayPalReady() {
  await getAccessToken();
}

// Create a PayPal order for a pending store order. Amount is server-derived
// from the order — the client never sends an amount.
export async function createPayPalOrder({ order }) {
  const mode = paypalMode();
  // Deterministic id per store order: retries/idempotency reuse the same id.
  if (mode === 'mock') return { id: `MOCK-PP-${order.orderNumber}` };
  const token = await getAccessToken();
  const res = await fetch(`${BASE[mode]}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: order.id,
        custom_id: order.orderNumber,
        description: `Krystal's Flower Kreation order ${order.orderNumber}`,
        amount: { currency_code: order.currency || 'AUD', value: Number(order.total).toFixed(2) },
      }],
    }),
  });
  if (!res.ok) {
    console.error(JSON.stringify({ level: 'error', msg: 'paypal_create_failed', status: res.status, orderNumber: order.orderNumber }));
    throw ppError(502, 'paypal_create_failed', `Could not start PayPal checkout (${res.status})`);
  }
  const json = await res.json();
  if (!json.id) throw ppError(502, 'paypal_create_failed', 'PayPal returned no order id');
  return { id: json.id, status: json.status };
}

async function getPayPalOrder(id, token) {
  const mode = paypalMode();
  const res = await fetch(`${BASE[mode]}/v2/checkout/orders/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw ppError(502, 'paypal_order_lookup_failed', `PayPal order lookup failed (${res.status})`);
  return res.json();
}

function extractCapture(json) {
  return json?.purchase_units?.[0]?.payments?.captures?.[0] || null;
}

// Capture an approved PayPal order. Returns { status, captureId, amount, raw }.
// amount is the captured value as PayPal reported it (string, e.g. "42.00").
export async function capturePayPalOrder(paypalOrderId) {
  const mode = paypalMode();
  if (mode === 'mock') {
    return { status: 'COMPLETED', captureId: `MOCK-CAP-${paypalOrderId}`, amount: null, raw: { mock: true } };
  }
  const token = await getAccessToken();
  const res = await fetch(`${BASE[mode]}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (res.status === 422) {
    const json = await res.json().catch(() => ({}));
    const issue = (json?.details || []).map((d) => d.issue).filter(Boolean).join(', ');
    // Retried capture after a network hiccup — recover the original capture.
    if (issue.includes('ORDER_ALREADY_CAPTURED')) {
      const got = await getPayPalOrder(paypalOrderId, token);
      const cap = extractCapture(got);
      if (cap) return { status: got.status, captureId: cap.id, amount: cap.amount?.value, raw: got };
    }
    console.error(JSON.stringify({ level: 'error', msg: 'paypal_capture_rejected', issue, paypalOrderId }));
    throw ppError(502, 'paypal_capture_failed', `PayPal capture rejected (${issue || 422})`);
  }
  if (!res.ok) {
    console.error(JSON.stringify({ level: 'error', msg: 'paypal_capture_failed', status: res.status, paypalOrderId }));
    throw ppError(502, 'paypal_capture_failed', `PayPal capture failed (${res.status})`);
  }
  const json = await res.json().catch(() => ({}));
  const cap = extractCapture(json);
  if (json.status !== 'COMPLETED' || !cap) {
    // Funds not finalised (e.g. PENDING/echeck) — do not mark the order paid.
    console.error(JSON.stringify({ level: 'error', msg: 'paypal_capture_incomplete', status: json.status, paypalOrderId }));
    throw ppError(502, 'paypal_capture_incomplete', `PayPal capture not completed (status ${json.status || 'unknown'})`);
  }
  return { status: json.status, captureId: cap.id, amount: cap.amount?.value, raw: json };
}

// Full refund of a capture (omit amount → PayPal refunds the remaining
// captured balance). Returns PayPal's refund object.
export async function refundPayPalCapture(captureId) {
  const mode = paypalMode();
  if (mode === 'mock') return { id: `MOCK-REF-${Date.now().toString(36)}`, status: 'COMPLETED' };
  const token = await getAccessToken();
  const res = await fetch(`${BASE[mode]}/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) {
    console.error(JSON.stringify({ level: 'error', msg: 'paypal_refund_failed', status: res.status, captureId }));
    throw ppError(502, 'paypal_refund_failed', `PayPal refund failed (${res.status})`);
  }
  const json = await res.json().catch(() => ({}));
  if (!json.id) throw ppError(502, 'paypal_refund_failed', 'PayPal returned no refund id');
  return json;
}
