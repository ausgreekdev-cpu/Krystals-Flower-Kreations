#!/usr/bin/env node
// Remap procedure documents to the two-axis taxonomy
// (category = what it is · subcategory = how it's made).
//
// Legacy → new: PAPER_FLOWER/ORIGAMI/MANUFACTURING_SPEC enum values are
// retired; this moves every row onto the new category values and fills
// subcategory. Run AFTER `prisma db push` (the enum values + subcategory
// column must exist).
//
// Usage:
//   node scripts/migrate-procedure-taxonomy.mjs [--dry-run]
//
// DATABASE_URL selects the target (prints local vs Supabase first).
import { PrismaClient } from '@prisma/client';

const DRY = process.argv.includes('--dry-run');
const url = process.env.DATABASE_URL || '';
const target = /supabase/i.test(url) ? 'SUPABASE/PROD' : 'local DATABASE_URL';
const prisma = new PrismaClient(url ? { datasources: { db: { url } } } : {});

// Seed docs — known by their stable seed ids.
const BY_ID = {
  '00000000-0000-4000-8000-000000000001': { category: 'FLOWER', subcategory: 'CREPE_PAPER' },
  '00000000-0000-4000-8000-000000000002': { category: 'DECOR', subcategory: 'ORIGAMI' },
  '00000000-0000-4000-8000-000000000003': { category: 'MANUFACTURING_SPEC', subcategory: 'DIE_CUT' },
  '00000000-0000-4000-8000-000000000004': { category: 'FLOWER', subcategory: 'ORIGAMI' },
};

// Everything else: best-effort from the legacy value + the title.
function fallback(doc) {
  const t = String(doc.title || '').toLowerCase();
  const flowerish = /flower|rose|tulip|lily|lilies|peony|bloom|petal|blossom|daffodil|orchid/.test(t);
  const category = doc.category === 'MANUFACTURING_SPEC' ? 'MANUFACTURING_SPEC'
    : doc.category === 'ORIGAMI' ? (flowerish ? 'FLOWER' : 'DECOR')
    : flowerish ? 'FLOWER' : 'BOUQUET';
  const subcategory = doc.category === 'MANUFACTURING_SPEC' ? 'DIE_CUT'
    : /die.?cut/.test(t) ? 'DIE_CUT'
    : /origami|fold/.test(t) ? 'ORIGAMI'
    : /sculptur/.test(t) ? 'SCULPTURAL'
    : /crepe/.test(t) ? 'CREPE_PAPER'
    : 'HAND_ASSEMBLY';
  return { category, subcategory };
}

const LEGACY = ['PAPER_FLOWER', 'ORIGAMI', 'MANUFACTURING_SPEC'];
const docs = await prisma.procedureDocument.findMany({ where: { deletedAt: null }, select: { id: true, title: true, category: true, subcategory: true } });
// MANUFACTURING_SPEC lives on in the new taxonomy — only treat it as stale
// when its subcategory was never filled.
const stale = docs.filter((d) => ['PAPER_FLOWER', 'ORIGAMI'].includes(d.category)
  || (d.category === 'MANUFACTURING_SPEC' && !d.subcategory));
console.log(`target: ${target} | ${stale.length} of ${docs.length} documents need remapping${DRY ? ' (dry run)' : ''}`);

for (const doc of stale) {
  const to = BY_ID[doc.id] || fallback(doc);
  console.log(`  ${doc.title.slice(0, 50).padEnd(52)} ${doc.category} -> ${to.category} / ${to.subcategory}`);
  if (!DRY) await prisma.procedureDocument.update({ where: { id: doc.id }, data: to });
}
console.log(DRY ? 'dry run — nothing written' : 'migration complete');
await prisma.$disconnect();
