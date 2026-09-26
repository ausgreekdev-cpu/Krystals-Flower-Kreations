import 'dotenv/config';
import serverless from 'serverless-http';

let appHandler = null;

export const config = {
  path: '/api/*',
  maxDuration: 30,
};

export async function handler(event, context) {
  // HEAD needs no body; keep it cheap. /api/health now hits Express + DB probe.
  if (event.httpMethod === 'HEAD') {
    return { statusCode: 200, body: '' };
  }
  if (!appHandler) {
    try {
      let app;
      try { app = (await import('../../backend/src/app.js')).default; }
      catch { app = (await import('../../../backend/src/app.js')).default; }
      appHandler = serverless(app);
    } catch (err) {
      console.error('[netlify api] boot failed:', err);
      console.error(err?.stack || String(err));
      // Env-validation messages name the offending variable but never its value —
      // safe (and far more actionable) than a bare boot_failed. Anything else
      // stays opaque here; the full stack is always in the function log.
      const msg = String(err?.message || '');
      const safeReason = msg.startsWith('Environment misconfigured') || msg.includes('JWT_SECRET')
        ? msg
        : 'module_import_failed';
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        // Details are in the function log; never expose stack traces to clients
        body: JSON.stringify({ error: 'Service temporarily unavailable', code: 'boot_failed', reason: safeReason }),
      };
    }
  }
  return appHandler(event, context);
}
