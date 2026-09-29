// Single source of truth for blog posts: backend/content/blog/*.md
// Used by prisma/seed.js (local/dev) and scripts/publish-blog.mjs (live).
//
// File format — YAML-ish frontmatter between --- lines, then markdown body:
//   ---
//   title: Post title
//   slug: my-slug
//   excerpt: One-line teaser
//   metaTitle: SEO title (<=70)
//   metaDescription: SEO description (<=200)
//   tags: tag-one,tag-two
//   cover: /og-cover.jpg
//   productSlugs: product-a,product-b
//   status: published
//   ---
//   ## First section (headings shift down one level on the site)
import { readdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const CONTENT_DIR = fileURLToPath(new URL('../../content/blog/', import.meta.url));

export function parsePostFile(source) {
  const text = source.replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error('Missing frontmatter (--- block) at top of file');
  const fm = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    title: fm.title,
    slug: fm.slug,
    excerpt: fm.excerpt || '',
    metaTitle: fm.metaTitle || null,
    metaDescription: fm.metaDescription || null,
    tags: list(fm.tags).join(','),
    cover: fm.cover || '/og-cover.jpg',
    productSlugs: list(fm.productSlugs),
    status: fm.status === 'draft' ? 'draft' : 'published',
    publishedAt: fm.publishedAt ? new Date(fm.publishedAt) : null,
    body: m[2].trim(),
  };
}

export function readPosts() {
  const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md')).sort();
  return files.map((f) => {
    const post = parsePostFile(readFileSync(path.join(CONTENT_DIR, f), 'utf8'));
    if (!post.title || !post.slug) throw new Error(`${f}: title and slug are required`);
    return post;
  });
}
