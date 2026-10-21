// Axe accessibility sweep — 48 scans.
//   9 public routes × {light,dark} × {desktop,mobile}  (36)
//   admin Overview/Documents/Media tabs × {light,dark} × {desktop,mobile}  (12)
// Usage: node scripts/axe-scan.mjs   (needs vite+backend dev servers running
// on :5173/:3001 and playwright-core + axe-core installed in /tmp/opencode)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { chromium } from '/tmp/opencode/node_modules/playwright-core/index.mjs';

const SITE = process.env.SITE || 'http://127.0.0.1:5173';
const EMAIL = process.env.EMAIL || 'admin@krystal.local';
const PASS = process.env.PASS || 'admin123';
const AXE = readFileSync('/tmp/opencode/node_modules/axe-core/axe.min.js', 'utf8');
const ROUTES = ['/', '/shop', '/product/eucalyptus-paper-rose-bouquet-blush', '/cart', '/checkout', '/configurator', '/blog', '/workshops', '/not-a-real-page'];
const VIEWPORTS = { desktop: { width: 1280, height: 900 }, mobile: { width: 390, height: 844 } };

const runAxe = async (page, label) => {
  await page.addScriptTag({ content: AXE });
  const res = await page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  });
  return { label, res };
};

// The playwright browser cache is versioned (chromium-XXXX) and gets
// rebuilt by the sandbox — discover it instead of hardcoding the version.
const chromePath = process.env.CHROME_PATH || (() => {
  const base = '/var/cache/ms-playwright';
  const dirs = readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse();
  for (const d of dirs) {
    const p = `${base}/${d}/chrome-linux64/chrome`;
    if (existsSync(p)) return p;
  }
  throw new Error(`no chromium build found under ${base}`);
})();
const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });
let fails = 0;
try {
  for (const route of ROUTES) {
    for (const theme of ['light', 'dark']) {
      for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
        const page = await browser.newPage({ viewport, colorScheme: theme });
        await page.goto(`${SITE}${route}`, { waitUntil: 'networkidle' });
        const { label, res } = await runAxe(page, `${route} ${theme} ${vpName}`);
        if (res.length) { fails++; console.log(`FAIL ${label}`, JSON.stringify(res)); }
        else console.log(`ok   ${label}`);
        await page.close();
      }
    }
  }
  // Admin surfaces (logged in): the media/documents tabs host the scanner,
  // OCR drawer and media library UI.
  for (const theme of ['light', 'dark']) {
    for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
      const page = await browser.newPage({ viewport, colorScheme: theme });
      await page.goto(`${SITE}/login`, { waitUntil: 'networkidle' });
      await page.fill('input[type="email"]', EMAIL);
      await page.fill('input[type="password"]', PASS);
      await page.keyboard.press('Enter');
      await page.waitForURL(/admin/, { timeout: 20000 }).catch(() => {});
      for (const tab of ['Overview', 'Documents', 'Media']) {
        await page.locator('button', { hasText: tab }).first().click().catch(() => {});
        await page.waitForTimeout(700);
        const { label, res } = await runAxe(page, `admin:${tab} ${theme} ${vpName}`);
        if (res.length) { fails++; console.log(`FAIL ${label}`, JSON.stringify(res)); }
        else console.log(`ok   ${label}`);
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
}
console.log(fails === 0 ? '48/48 clean scans' : `${fails} scans with violations`);
process.exit(fails === 0 ? 0 : 1);
