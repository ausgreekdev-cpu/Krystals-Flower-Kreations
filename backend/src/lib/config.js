// Boot-time environment validation — fail fast instead of on first query/sign.
import { isProductionLike } from './auth.js';
import { emailProviderStatus } from '../services/emailProvider.js';

const WEAK_SECRETS = new Set(['dev-secret-change-me', 'change-me-to-a-long-random-string', 'secret', 'changeme']);

export function validateEnv() {
  const problems = [];
  const warnings = [];

  if (!process.env.DATABASE_URL) {
    problems.push('DATABASE_URL is not set');
  }

  const secret = process.env.JWT_SECRET;
  const weakSecret = !secret || WEAK_SECRETS.has(secret) || secret.length < 32;
  if (isProductionLike() && weakSecret) {
    problems.push('JWT_SECRET must be a random value of 32+ chars (generate: openssl rand -base64 48)');
  } else if (!secret) {
    warnings.push('JWT_SECRET not set — using dev fallback (fine locally, do NOT deploy like this)');
  }

  if (isProductionLike()) {
    const mail = emailProviderStatus();
    if (!mail.configured) {
      warnings.push('No email provider configured — set RESEND_API_KEY (preferred) or POSTMARK_SERVER_TOKEN / SENDGRID_API_KEY; emails will be skipped');
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      warnings.push('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — image uploads will fail on Netlify');
    }
  }

  if (warnings.length) console.warn(JSON.stringify({ level: 'warn', msg: 'env validation warnings', warnings }));
  if (problems.length) throw new Error(`Environment misconfigured: ${problems.join('; ')}`);
}
