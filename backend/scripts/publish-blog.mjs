#!/usr/bin/env node
// Publish backend/content/blog/*.md to the live site through the admin API
// (never writes to the production DB directly).
//
// Usage (from backend/):
//   ADMIN_PASSWORD=... node scripts/publish-blog.mjs            # upsert all posts
//   ADMIN_PASSWORD=... node scripts/publish-blog.mjs --dry-run  # show the plan only
// Optional env:
//   ADMIN_EMAIL   (default krystal@flowerkreations.com.au)
//   SITE          (default https://krystalsflowercreations.com.au)
import 'dotenv/config';
import { readPosts } from './lib/readPosts.mjs';

const SITE = (process.env.SITE || 'https://krystalsflowercreations.com.au').replace(/\/+$/, '');
const EMAIL = process.env.ADMIN_EMAIL || 'krystal@flowerkreations.com.au';
const PASSWORD = process.env.ADMIN_PASSWORD;
const DRY_RUN = process.argv.includes('--dry-run');

async function req(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(SITE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function main() {
  if (!PASSWORD) {
    console.error('ADMIN_PASSWORD is required (optional: ADMIN_EMAIL, SITE).');
    process.exit(1);
  }

  const { token } = await req('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  console.log(`Logged in to ${SITE} as ${EMAIL}`);

  const { products } = await req('/api/products?limit=100');
  const idBySlug = new Map((products || []).map((p) => [p.slug, p.id]));
  const existing = await req('/api/posts?status=all', { token });
  const postBySlug = new Map((existing || []).map((p) => [p.slug, p]));

  const posts = readPosts();
  let created = 0;
  let updated = 0;

  for (const p of posts) {
    const productIds = p.productSlugs
      .map((s) => { const id = idBySlug.get(s); if (!id) console.warn(`  ! ${p.slug}: unknown product slug "${s}" (skipped)`); return id; })
      .filter(Boolean);

    const payload = {
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt,
      content: p.body,
      tags: p.tags,
      metaTitle: p.metaTitle,
      metaDescription: p.metaDescription,
      coverImageUrl: p.cover.startsWith('http') ? p.cover : `${SITE}${p.cover}`,
      productIds,
    };

    const current = postBySlug.get(p.slug);
    if (current) {
      // Only send status when it changes — sending status:"published" resets publishedAt.
      if (current.status !== p.status) payload.status = p.status;
      if (DRY_RUN) { console.log(`~ ${p.slug} (update${productIds.length ? `, ${productIds.length} product(s)` : ''})`); updated++; continue; }
      await req(`/api/posts/${current.id}`, { method: 'PATCH', token, body: payload });
      console.log(`updated  ${p.slug}`);
      updated++;
    } else {
      payload.status = p.status;
      if (DRY_RUN) { console.log(`+ ${p.slug} (create${productIds.length ? `, ${productIds.length} product(s)` : ''})`); created++; continue; }
      await req('/api/posts', { method: 'POST', token, body: payload });
      console.log(`created  ${p.slug}`);
      created++;
    }
  }

  console.log(DRY_RUN ? `Dry run: ${created} would be created, ${updated} updated.` : `Done: ${created} created, ${updated} updated.`);
}

main().catch((e) => { console.error(`\nFAILED: ${e.message}`); process.exit(1); });
