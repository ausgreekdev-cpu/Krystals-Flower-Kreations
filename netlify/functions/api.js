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
      const { default: app } = await import('../../backend/src/app.js');
      appHandler = serverless(app);
    } catch (err) {
      console.error('[netlify api] boot failed:', err);
      console.error(err?.stack || String(err));
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'boot_failed', message: String(err?.message || err), stack: String(err?.stack || '').slice(0, 2000) }),
      };
    }
  }
  return appHandler(event, context);
}
