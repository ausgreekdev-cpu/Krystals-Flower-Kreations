import 'dotenv/config';
import serverless from 'serverless-http';

let appHandler = null;

export const config = {
  path: '/api/*',
  maxDuration: 30,
};

export async function handler(event, context) {
  if (event.httpMethod === 'HEAD' || event.path === '/api/health') {
    return { statusCode: 200, body: 'OK' };
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
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        // Details are in the function log; never expose stack traces to clients
        body: JSON.stringify({ error: 'Service temporarily unavailable', code: 'boot_failed' }),
      };
    }
  }
  return appHandler(event, context);
}
