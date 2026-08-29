#!/bin/bash
set -e
echo "=== Netlify Build — Krystal's Flower Kreations ==="
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

echo "=== Backend deps (for function bundling) + Prisma ==="
cd backend
# ci fails if lock out of sync — fall back to install to auto-sync (fixes Missing: serverless-http, react-native-web etc.)
if [ -f package-lock.json ]; then
  npm ci --prefer-offline --no-audit --omit=dev 2>&1 || npm install --omit=dev --no-audit 2>&1
else
  npm install --omit=dev --no-audit 2>&1
fi
echo ">>> Prisma generate"
npx prisma generate 2>&1

cd ../frontend
echo "=== Frontend deps ==="
if [ -f package-lock.json ]; then
  npm ci --prefer-offline --no-audit 2>&1 || npm install --no-audit 2>&1
else
  npm install --no-audit 2>&1
fi

echo "=== Vite build (VITE_API_URL is baked at build) ==="
# Netlify will set VITE_API_URL to /.netlify/functions/api via redirect; default falls back to relative /api
npm run build 2>&1

echo "=== Build complete ==="
ls -lh dist 2>&1 | head -20
