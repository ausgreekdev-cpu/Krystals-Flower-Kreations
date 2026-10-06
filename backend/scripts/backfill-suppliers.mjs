import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';

const env = fs.readFileSync(new URL('../.env.supabase', import.meta.url), 'utf8');
const pick = (k) => new RegExp('^' + k + '=(.*)$', 'm').exec(env)?.[1]?.trim()?.replace(/^"|"$/g, '');
const prisma = new PrismaClient({ datasources: { db: { url: pick('DIRECT_URL') || pick('DATABASE_URL') } } });

async function main() {
  const matNames = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT supplier FROM raw_materials WHERE supplier IS NOT NULL AND trim(supplier) <> ''`
  );
  const poNames = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT supplier FROM purchase_orders WHERE supplier IS NOT NULL AND trim(supplier) <> ''`
  );
  const names = new Set(
    [...matNames, ...poNames].map((r) => String(r.supplier).trim()).filter(Boolean)
  );
  console.log('distinct supplier names:', [...names].sort());

  const existing = await prisma.supplier.findMany({ select: { id: true, name: true } });
  const byLower = new Map(existing.map((s) => [s.name.toLowerCase(), s.id]));
  const created = [];
  for (const n of names) {
    if (byLower.has(n.toLowerCase())) continue;
    const s = await prisma.supplier.create({ data: { name: n.slice(0, 120) } });
    byLower.set(n.toLowerCase(), s.id);
    created.push(n);
  }
  console.log('created suppliers:', created);

  // Link materials (quoted camelCase columns, snake_case table)
  const mats = await prisma.$queryRawUnsafe(
    `SELECT id, supplier FROM raw_materials WHERE supplier IS NOT NULL AND trim(supplier) <> '' AND "supplierId" IS NULL`
  );
  let lm = 0;
  for (const r of mats) {
    const sid = byLower.get(String(r.supplier).trim().toLowerCase());
    if (!sid) continue;
    await prisma.$executeRawUnsafe(
      `UPDATE raw_materials SET "supplierId" = $1 WHERE id = $2`, sid, r.id
    );
    lm++;
  }

  const pos = await prisma.$queryRawUnsafe(
    `SELECT id, supplier FROM purchase_orders WHERE supplier IS NOT NULL AND trim(supplier) <> '' AND "supplierId" IS NULL`
  );
  let lp = 0;
  for (const r of pos) {
    const sid = byLower.get(String(r.supplier).trim().toLowerCase());
    if (!sid) continue;
    await prisma.$executeRawUnsafe(
      `UPDATE purchase_orders SET "supplierId" = $1 WHERE id = $2`, sid, r.id
    );
    lp++;
  }

  const counts = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM suppliers`);
  const linkedM = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM raw_materials WHERE "supplierId" IS NOT NULL`
  );
  const linkedP = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM purchase_orders WHERE "supplierId" IS NOT NULL`
  );
  console.log({ materialsLinked: lm, purchaseOrdersLinked: lp, suppliersTotal: Number(counts[0].n), materialsWithSupplier: Number(linkedM[0].n), poWithSupplier: Number(linkedP[0].n) });
}

main().finally(() => prisma.$disconnect());
