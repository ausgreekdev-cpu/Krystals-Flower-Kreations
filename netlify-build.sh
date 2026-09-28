#!/bin/bash
set -e
echo "=== Netlify Build — Krystal's Flower Kreations ==="
# The Netlify site env sets NODE_ENV=production (required at function runtime).
# npm treats it as `omit=dev`, which would skip vite/tailwind/prisma CLI and fail
# the build with "vite: not found". Unset it for the build process only — the
# function runtime env is set by Netlify independently of this shell.
unset NODE_ENV
echo "Node: $(node --version) | NPM: $(npm --version)"
echo "PWD: $(pwd) | base: $PWD"
# Auto-detect repo root: if backend/frontend not in pwd, we were run from base=mobile
if [ ! -d backend ] && [ -d ../backend ]; then
  echo "Detected base=mobile — switching to repo root"
  cd ..
  echo "Now PWD: $(pwd)"
fi
echo "=== Clean previous dist ==="
rm -rf frontend/dist

echo "=== Workspace deps (backend + frontend, single root lock) ==="
# One install at the workspace root. The root package-lock.json is the only lock
# for backend/frontend (member dirs must not have their own — a second lock forks
# a divergent node_modules). Mobile is skipped: Expo never runs on Netlify.
# --include=dev keeps prisma CLI + vite regardless of NODE_ENV.
if [ -f package-lock.json ]; then
  npm ci --workspace=backend --workspace=frontend --include=dev --prefer-offline --no-audit 2>&1 \
    || npm install --workspace=backend --workspace=frontend --include=dev --no-audit 2>&1
else
  npm install --workspace=backend --workspace=frontend --include=dev --no-audit 2>&1
fi

echo ">>> Prisma generate"
(cd backend && npx prisma generate 2>&1)

# Boot smoke check: import the Express app exactly as netlify/functions/api.js does,
# with the site's real build-time env (no backend/.env on Netlify). Fails the DEPLOY
# with the real reason (e.g. "Environment misconfigured: JWT_SECRET ...") instead of
# shipping a function that 500s boot_failed on every request.
echo ">>> API boot smoke check"
(cd backend && NODE_ENV=production node --input-type=module -e "
import('./src/app.js')
  .then(() => console.log('boot smoke OK'))
  .catch((e) => { console.error('BOOT SMOKE FAILED: ' + e.message); process.exit(1); });
")

# Bundle smoke: esbuild-convert the function to CJS exactly like Netlify's bundler
# does, then invoke it. Catches failures the raw-source check above cannot see —
# e.g. import.meta emptied in CJS output (fileURLToPath(undefined) at boot) or
# module-scope throws that only appear after bundling. Fails the DEPLOY loudly.
echo ">>> API bundle smoke check (CJS, mirrors Netlify bundling)"
rm -rf .netlify-smoke
npx --no-install esbuild netlify/functions/api.js \
  --bundle --platform=node --target=node18 --format=cjs --packages=external \
  --outfile=.netlify-smoke/api.cjs
(cd backend && NODE_ENV=production node -e "
const handler = require('../.netlify-smoke/api.cjs').handler;
handler({ httpMethod: 'GET', path: '/api/health', headers: {}, multiValueHeaders: {}, isBase64Encoded: false, requestContext: {}, rawBody: '' }, {})
  .then((r) => {
    const body = String(r.body || '');
    if (r.statusCode === 500 && body.includes('boot_failed')) {
      console.error('BOOT SMOKE FAILED: ' + body);
      process.exit(1);
    }
    console.log('bundle boot smoke OK (status ' + r.statusCode + ')');
    process.exit(0);
  })
  .catch((e) => { console.error('BOOT SMOKE FAILED: ' + e.message); process.exit(1); });
")
rm -rf .netlify-smoke

# Fail fast with a clear message if devDependencies were skipped (NODE_ENV=production etc.)
if ! npx --no-install vite --version >/dev/null 2>&1; then
  echo "ERROR: vite not found after install — devDependencies were skipped." >&2
  exit 1
fi

echo "=== Vite build (VITE_API_URL is baked at build) ==="
# Netlify will set VITE_API_URL to /.netlify/functions/api via redirect; default falls back to relative /api
npm run build --workspace=frontend 2>&1

echo "=== Build complete ==="
ls -lh frontend/dist 2>&1 | head -20
