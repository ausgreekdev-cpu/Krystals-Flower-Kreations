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
      let app = null;
      // Two candidate paths (repo-root vs base=mobile views). Keep BOTH as
      // literal specifiers so esbuild bundles them; but remember every error so
      // the reported failure is the REAL one, not the fallback path's 404.
      const errs = [];
      try { app = (await import('../../backend/src/app.js')).default; }
      catch (e1) {
        errs.push(e1);
        try { app = (await import('../../../backend/src/app.js')).default; }
        catch (e2) { errs.push(e2); }
      }
      if (!app) {
        // Prefer an evaluation error (env validation, missing package, …) over a
        // bare "couldn't find app.js" from the wrong base directory.
        const evalErr = errs.find((e) => !String(e?.message || '').includes('backend/src/app.js'));
        throw evalErr || errs[0];
      }
      appHandler = serverless(app);
    } catch (err) {
      console.error('[netlify api] boot failed:', err);
      console.error(err?.stack || String(err));
      // Error MESSAGE only (no stack): names the offending file/package/variable,
      // never a secret. Full stack stays in the Netlify function log.
      const reason = String(err?.message || err || 'unknown error').slice(0, 400);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Service temporarily unavailable', code: 'boot_failed', reason }),
      };
    }
  }
  return appHandler(event, context);
}
