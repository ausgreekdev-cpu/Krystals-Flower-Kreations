// Fingerprinting + dedup for Sentinel incidents.

import crypto from 'crypto';

export function fingerprintIncident({ source, title, stackTrace }) {
  const basis = `${source || ''}|${title || ''}|${normalizeStack(stackTrace || '')}`;
  return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 32);
}

function normalizeStack(stack) {
  // Strip line numbers and paths variability to group similar errors
  return String(stack)
    .split('\n')
    .map((l) => l.replace(/:\d+:\d+/g, ':0:0').replace(/\(\s*.*?\s*\)/g, '()'))
    .join('\n')
    .trim()
    .slice(0, 2000);
}

export function severityFromStatus(statusCode, errorType) {
  if (errorType === 'unhandledrejection' || errorType === 'uncaught') return 'high';
  if (statusCode >= 500) return 'high';
  if (statusCode >= 400) return 'medium';
  return 'low';
}
