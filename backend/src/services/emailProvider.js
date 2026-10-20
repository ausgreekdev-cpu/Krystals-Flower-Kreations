// Outbound email transport selection.
//
// Production runs on Netlify Functions, so hand-rolled SMTP is the wrong default:
// every send opens a TLS connection from a cold container, and the SMTP_* vars
// on the site were never real (they still hold the literal "..." placeholders).
// HTTPS APIs avoid both problems, so a provider key wins over SMTP, which stays
// only as a local-dev / relay fallback.
//
// Deliberately no SDKs: three small fetch calls keep the serverless bundle lean
// and avoid another dependency to pin in netlify.toml external_node_modules.
// Deliberately no top-level nodemailer import either — the SMTP branch is loaded
// lazily so HTTP-only deployments never pay for it.
import { createRequire } from 'node:module';

// import.meta.url is emptied in Netlify's CJS bundle, so createRequire()
// must be built from a resolvable path — fall back to CWD there (same guard
// pattern as storage.js / app.js).
const require = (() => {
  try { return createRequire(import.meta.url); }
  catch { return createRequire(`${process.cwd()}/package.json`); }
})();
const TIMEOUT_MS = 15_000;

// Netlify's dashboard still carries `SMTP_HOST=...` style placeholders from the
// original setup. Treat those as unset rather than dialling a host named "...".
const PLACEHOLDER = /^(\.{2,}|-+|x+|<.*>|your[-_ ].*)$/i;
const env = (key) => {
  const raw = String(process.env[key] ?? '').trim();
  if (!raw || PLACEHOLDER.test(raw)) return '';
  return raw;
};

export const SKIP_REASON = 'Email provider not configured';
export const DEFAULT_SENDER = 'orders@krystalsflowercreations.com.au';

// "Name <email@host>" -> { email, name } for APIs that want an object.
function parseAddress(value) {
  const str = String(value || '').trim();
  const match = /^(.*?)\s*<([^>]+)>\s*$/.exec(str);
  if (match) return { email: match[2].trim(), ...(match[1].trim() ? { name: match[1].trim() } : {}) };
  return { email: str };
}

function sendgridContent({ text, html }) {
  const content = [];
  if (text) content.push({ type: 'text/plain', value: text });
  if (html) content.push({ type: 'text/html', value: html });
  return content.length ? content : [{ type: 'text/plain', value: '' }];
}

const HTTP_PROVIDERS = [
  {
    name: 'resend',
    key: 'RESEND_API_KEY',
    endpoint: 'https://api.resend.com/emails',
    headers: (key) => ({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }),
    body: ({ from, to, subject, text, html, replyTo }) => ({
      from,
      to: [to],
      subject,
      ...(text ? { text } : {}),
      ...(html ? { html } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
    id: (json) => json?.id || null,
    error: (json) => json?.message || json?.name,
  },
  {
    name: 'postmark',
    key: 'POSTMARK_SERVER_TOKEN',
    endpoint: 'https://api.postmarkapp.com/email',
    headers: (key) => ({ 'X-Postmark-Server-Token': key, Accept: 'application/json', 'Content-Type': 'application/json' }),
    body: ({ from, to, subject, text, html, replyTo }) => ({
      From: from,
      To: to,
      Subject: subject,
      ...(text ? { TextBody: text } : {}),
      ...(html ? { HtmlBody: html } : {}),
      MessageStream: env('POSTMARK_MESSAGE_STREAM') || 'outbound',
      ...(replyTo ? { ReplyTo: replyTo } : {}),
    }),
    id: (json) => json?.MessageID || null,
    error: (json) => json?.Message,
  },
  {
    name: 'sendgrid',
    key: 'SENDGRID_API_KEY',
    endpoint: 'https://api.sendgrid.com/v3/mail/send',
    headers: (key) => ({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }),
    body: ({ from, to, subject, text, html, replyTo }) => ({
      personalizations: [{ to: [{ email: to }] }],
      from: parseAddress(from),
      subject,
      content: sendgridContent({ text, html }),
      ...(replyTo ? { reply_to: parseAddress(replyTo) } : {}),
    }),
    // SendGrid answers 202 with an empty body and the id in a header.
    id: (json, res) => json?.id || res?.headers?.get?.('x-message-id') || null,
    error: (json) => json?.errors?.[0]?.message,
  },
];

let smtpCache = null;
function smtpTransport() {
  const host = env('SMTP_HOST');
  const user = env('SMTP_USER');
  const pass = env('SMTP_PASS');
  if (!host || !user || !pass) return null;
  const port = parseInt(env('SMTP_PORT') || '587', 10);
  const secure = env('SMTP_SECURE') === 'true';
  const signature = `${host}:${port}:${secure}:${user}`;
  if (smtpCache?.signature === signature) return smtpCache.transport;
  // Lazily required: HTTP deployments never load nodemailer.
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  smtpCache = { signature, transport };
  return transport;
}

async function postJson(provider, apiKey, message) {
  let response;
  try {
    response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: provider.headers(apiKey),
      body: JSON.stringify(provider.body(message)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // Timeouts and DNS/socket errors are worth retrying later.
    return { ok: false, error: err?.message || 'network error', permanent: false };
  }

  const raw = await response.text().catch(() => '');
  let json = null;
  if (raw) { try { json = JSON.parse(raw); } catch { /* non-JSON error body */ } }

  if (response.ok) return { ok: true, messageId: provider.id(json, response) };

  const detail = provider.error(json) || raw.slice(0, 300) || `HTTP ${response.status}`;
  // 4xx means the request itself is wrong (bad key, unverified domain, bad from)
  // — retrying the same payload five times an hour only delays a clear failure.
  // 429 and 5xx are transient and stay on the retry path.
  const permanent = response.status >= 400 && response.status < 500 && response.status !== 429;
  return { ok: false, error: `${provider.name} ${response.status}: ${detail}`, permanent };
}

async function sendViaSmtp(transport, message) {
  try {
    const info = await transport.sendMail({
      from: message.from,
      replyTo: message.replyTo,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    return { ok: false, error: err?.message || 'smtp send failed', permanent: false };
  }
}

/**
 * Resolve the transport to use right now. Read per call (not at import) so tests
 * and a Netlify env change take effect without a module reload.
 * @returns {{name:string, apiKey?:string, send:Function}|null}
 */
export function resolveTransport() {
  for (const provider of HTTP_PROVIDERS) {
    const apiKey = env(provider.key);
    if (!apiKey) continue;
    return {
      name: provider.name,
      apiKey,
      send: (message) => postJson(provider, apiKey, message),
    };
  }
  const transport = smtpTransport();
  if (transport) {
    return { name: 'smtp', send: (message) => sendViaSmtp(transport, message) };
  }
  return null;
}

/** Sender address: EMAIL_FROM wins; otherwise the SMTP login (SMTP only) or the shop's own domain. */
export function senderAddress(fromName, transportName) {
  const explicit = env('EMAIL_FROM');
  if (explicit) return explicit;
  const smtpUser = env('SMTP_USER');
  if (transportName === 'smtp' && smtpUser.includes('@')) return `${fromName} <${smtpUser}>`;
  return `${fromName} <${DEFAULT_SENDER}>`;
}

/**
 * What the admin "send a test email" panel and boot warnings report.
 * `smtpConfigured` is kept as the field name the admin UI already reads.
 */
export function emailProviderStatus() {
  const transport = resolveTransport();
  return {
    provider: transport?.name || null,
    configured: Boolean(transport),
    smtpConfigured: Boolean(transport),
    from: transport ? senderAddress('Krystals Flower Kreations', transport.name) : null,
    missing: transport ? [] : ['RESEND_API_KEY', 'POSTMARK_SERVER_TOKEN', 'SENDGRID_API_KEY', 'SMTP_HOST+SMTP_USER+SMTP_PASS'],
  };
}
