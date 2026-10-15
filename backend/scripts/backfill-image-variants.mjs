// Backfill responsive variants for product images uploaded before the
// avif/webp pipeline existed.
//
//   cd backend && node scripts/backfill-image-variants.mjs [--dry-run]
//
// Reads each ProductImage without `variants`, re-fetches the stored JPEG
// master (local /uploads or the public Supabase URL), encodes 400/800w
// webp+avif copies next to the master key, and writes `variants` + width/height
// back to the row. Rows whose master can't be fetched (seed placeholders) or is
// narrower than 400px are logged and skipped.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Prisma } from '@prisma/client';
import prisma from '../src/lib/prisma.js';
import { buildVariants, masterDimensions, VARIANT_WIDTHS } from '../src/services/imageVariants.js';
import { putObject } from '../src/services/storage.js';

const dryRun = process.argv.includes('--dry-run');
const LOCAL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads');

function masterKeyFromUrl(url) {
  if (url.startsWith('/uploads/')) return url.slice('/uploads/'.length);
  const m = /\/storage\/v1\/object\/public\/[^/]+\/(.+)$/.exec(url);
  return m ? m[1] : null;
}

async function fetchMaster(url) {
  if (url.startsWith('/uploads/')) {
    const file = path.join(LOCAL_ROOT, url.slice('/uploads/'.length));
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file);
  }
  if (/^https?:\/\//.test(url)) {
    const res = await fetch(url).catch(() => null);
    if (!res?.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  return null;
}

async function main() {
  // Json columns can't compare with plain `null` — rows never store JSON null, only SQL NULL.
  const rows = await prisma.productImage.findMany({ where: { variants: { equals: Prisma.DbNull } }, select: { id: true, url: true, width: true, height: true, productId: true } });
  console.log(`images without variants: ${rows.length} (dry-run: ${dryRun})`);
  let updated = 0, skipped = 0, failed = 0;
  for (const row of rows) {
    const key = masterKeyFromUrl(row.url);
    const master = key ? await fetchMaster(row.url) : null;
    if (!key || !master) { skipped++; console.log(`skip ${row.id}: master not fetchable (${row.url.slice(0, 60)})`); continue; }
    try {
      const dims = await masterDimensions(master);
      const built = await buildVariants(master);
      if (!built.length) {
        // Smaller than the smallest variant — still record dimensions for CLS.
        if (!dryRun && dims.width) await prisma.productImage.update({ where: { id: row.id }, data: { width: dims.width, height: dims.height } });
        skipped++;
        console.log(`skip ${row.id}: source ${dims.width}px < ${Math.min(...VARIANT_WIDTHS)}w`);
        continue;
      }
      const base = key.replace(/\.jpe?g$/i, '');
      const variantUrls = [];
      const variants = {};
      for (const v of built) {
        const vkey = `${base}-${v.width}.${v.ext}`;
        if (dryRun) { variantUrls.push(null); (variants[v.ext] = variants[v.ext] || {})[String(v.width)] = null; continue; }
        const u = await putObject(vkey, v.buf, v.contentType);
        variantUrls.push(u);
        variants[v.ext] = variants[v.ext] || {};
        variants[v.ext][String(v.width)] = u;
      }
      if (!dryRun) {
        await prisma.productImage.update({ where: { id: row.id }, data: { variants, width: dims.width, height: dims.height } });
        console.log(`ok ${row.id}: ${built.length} variants (${dims.width}x${dims.height})`);
      }
      updated++;
    } catch (e) {
      failed++;
      console.error(`fail ${row.id}: ${e?.message}`);
    }
  }
  console.log(`done — updated: ${updated}${dryRun ? ' (planned)' : ''}, skipped: ${skipped}, failed: ${failed}`);
  await prisma.$disconnect();
  if (failed) process.exitCode = 1;
}

await main();
