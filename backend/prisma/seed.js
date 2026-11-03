import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Krystals Flower Creations...');

  // Demo catalog (products + raw materials) must never be injected into the
  // live Supabase DB — it is manually seeded data owned by the studio.
  // Local dev and CI (localhost) still get the full fixture set the tests assert on.
  const SKIP_DEMO = /supabase/i.test(process.env.DATABASE_URL || '');
  if (SKIP_DEMO) console.log('[seed] Supabase target detected — skipping demo products & raw materials.');

  // Production guard: seeding a live database is a deliberate, two-key action.
  // A stray `npm run db:seed` after the db:push procedure (which points
  // backend/.env at Supabase) must never create admin accounts on prod.
  const PROD_TARGET = SKIP_DEMO || process.env.NODE_ENV === 'production';
  if (PROD_TARGET && process.env.SEED_ALLOW_PROD !== '1') {
    console.error('[seed] refusing to run against a production database — set SEED_ALLOW_PROD=1 to override.');
    process.exit(1);
  }
  const seedPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  if (PROD_TARGET && seedPassword === 'admin123') {
    console.error('[seed] refusing to seed production with the default password — set SEED_ADMIN_PASSWORD.');
    process.exit(1);
  }

  const password = await bcrypt.hash(seedPassword, 10);
  await prisma.user.upsert({
    where: { email: 'krystal@flowerkreations.com.au' },
    update: {},
    create: { email: 'krystal@flowerkreations.com.au', name: 'Krystal', role: 'admin', password },
  });
  // The .local developer fixture exists for dev/CI only — never create it on prod.
  if (!PROD_TARGET) {
    await prisma.user.upsert({
      where: { email: 'admin@krystal.local' },
      update: {},
      create: { email: 'admin@krystal.local', name: 'Admin', role: 'developer', password },
    });
  }
  await prisma.user.upsert({
    where: { email: 'krystalflowercreations@gmail.com' },
    update: {},
    create: { email: 'krystalflowercreations@gmail.com', name: 'Krystal (Gmail)', role: 'admin', password },
  });

  const studio = await prisma.inventoryLocation.upsert({
    where: { id: 'studio-perth' },
    update: {},
    create: { id: 'studio-perth', name: 'Perth Studio', address: 'Perth WA 6000', isDefault: true },
  });
  await prisma.inventoryLocation.upsert({
    where: { id: 'van-market' },
    update: {},
    create: { id: 'van-market', name: 'Market Van', isDefault: false },
  });

  const collections = [
    { title: 'Paper Bouquets', slug: 'paper-bouquets', description: 'Handcrafted paper blooms — everlasting beauty', sortOrder: 1 },
    { title: 'Sculptural Art', slug: 'sculptural-art', description: 'Sculptural wire & paper sculptures', sortOrder: 2 },
    { title: 'Cutting Templates', slug: 'cricut-templates', description: 'SVG cut files for your maker', sortOrder: 3 },
    { title: 'Origami', slug: 'origami', description: 'Folded paper creations', sortOrder: 4 },
    { title: 'Workshop Kits', slug: 'workshop-kits', description: 'Take-home kits with materials + guide', sortOrder: 5 },
  ];
  for (const c of collections) {
    await prisma.collection.upsert({ where: { slug: c.slug }, update: {}, create: c });
  }

  const products = [
    { title: 'Eucalyptus Paper Rose Bouquet — Blush', slug: 'eucalyptus-paper-rose-bouquet-blush', description: '12-stem blush paper roses with eucalyptus, 250gsm textured cardstock. Made to order 3-5 days. Machine-compatible petals.', price: 89, sku: 'KFK-ROSE-BLUSH-12', type: 'made_to_order', stockMode: 'made_to_order', madeToOrderDays: 5, paperStock: '250gsm Canson blush + sage', cricutCompatible: true, isFeatured: true, weightGrams: 450, flowerType: 'rose', colourFamily: 'blush', stemLengthMm: 400, occasions: ['birthday', 'anniversary', 'mothers-day'], careInstructions: 'Keep dry and away from direct sun; dust gently with a soft brush.' },
    { title: 'Banksia Statement Sculpture', slug: 'banksia-statement-sculpture', description: 'Sculptural banksia on wire frame, 45cm. Each piece unique — sculptural art workshop technique.', price: 195, sku: 'KFK-SCULPT-BANKSIA-L', type: 'physical', stockMode: 'tracked', isFeatured: true, weightGrams: 800, flowerType: 'banksia', colourFamily: 'mixed', stemLengthMm: 450, occasions: ['wedding', 'anniversary'], careInstructions: 'Dust gently; keep indoors away from moisture.' },
    { title: 'SVG — Wattle Sprig (Digital)', slug: 'cricut-svg-wattle-sprig', description: 'Instant download — layered SVG + PNG for cutting machines. Includes 3 sizes + assembly guide PDF. For personal use.', price: 14.95, sku: 'KFK-SVG-WATTLE-01', type: 'digital_template', stockMode: 'digital', cricutCompatible: true, weightGrams: 0, flowerType: 'wattle', colourFamily: 'mixed' },
    { title: 'Origami Crane Mobile — Pastel', slug: 'origami-crane-mobile-pastel', description: '25 hand-folded cranes on driftwood, pastel palette. Nursery-ready.', price: 65, sku: 'KFK-ORIGAMI-CRANE-MOB', type: 'physical', stockMode: 'tracked', weightGrams: 320 },
    { title: 'Paper Peony — Single Stem (Ivory)', slug: 'paper-peony-ivory-single', description: 'Single peony stem, ivory 220gsm + wire. Perfect for adding to bouquets.', price: 18, sku: 'KFK-PEONY-IVORY-1', type: 'physical', stockMode: 'tracked', weightGrams: 40, flowerType: 'peony', colourFamily: 'ivory', stemLengthMm: 300, occasions: ['wedding', 'mothers-day'], careInstructions: 'Keep dry; store upright in a vase without water.' },
    { title: 'Workshop Ticket — Blooms 101 (Perth)', slug: 'workshop-cricut-blooms-101', description: '3hr beginner workshop — Perth Studio. Make a 7-stem bouquet to take home. All materials included. Max 12. Next: see sessions.', price: 135, sku: 'KFK-WS-CRICUT-101', type: 'workshop_ticket', stockMode: 'made_to_order', weightGrams: 0 },
    { title: 'Workshop Ticket — Origami Bouquet Masterclass', slug: 'workshop-origami-bouquet-masterclass', description: '4hr intermediate — folded roses + lilies + assembly. Kit posted if you join online.', price: 165, sku: 'KFK-WS-ORIGAMI-MAST', type: 'workshop_ticket', stockMode: 'made_to_order', weightGrams: 0 },
    { title: 'Everlasting Native Bundle — Table Centre', slug: 'native-bundle-table-centre', description: 'Low centrepiece — paper natives + dried eucalyptus on sculpted base. 30cm wide.', price: 125, sku: 'KFK-NATIVE-CENTRE-30', type: 'made_to_order', stockMode: 'made_to_order', madeToOrderDays: 7, isFeatured: true, weightGrams: 600, flowerType: 'mixed', colourFamily: 'eucalyptus', stemLengthMm: 300, occasions: ['wedding', 'sympathy'], careInstructions: 'Dust gently; keep away from moisture and direct sun.' },
  ];
  // Test barcodes (UPC-A style) so the USB scanner works out of the box —
  // real-world labels are editable in Admin → Catalog → Products.
  const TEST_BARCODES = {
    'eucalyptus-paper-rose-bouquet-blush': '200000000001',
    'banksia-statement-sculpture': '200000000002',
    'cricut-svg-wattle-sprig': '200000000003',
    'origami-crane-mobile-pastel': '200000000004',
    'paper-peony-ivory-single': '200000000005',
    'workshop-cricut-blooms-101': '200000000006',
    'workshop-origami-bouquet-masterclass': '200000000007',
    'native-bundle-table-centre': '200000000008',
  };
  if (!SKIP_DEMO) for (const p of products) {
    const barcode = TEST_BARCODES[p.slug] || null;
    // Re-seed must refresh demo attrs (florist fields, paper stock…) on existing rows
    const update = { ...(barcode ? { barcode } : {}) };
    for (const k of ['flowerType', 'colourFamily', 'stemLengthMm', 'occasions', 'careInstructions', 'paperStock', 'cricutCompatible', 'madeToOrderDays']) {
      if (p[k] !== undefined) update[k] = p[k];
    }
    const prod = await prisma.product.upsert({ where: { slug: p.slug }, update, create: { ...p, barcode } });
    // Local placeholder image (no external picsum — $0, offline, no 404)
    const hasImage = await prisma.productImage.findFirst({ where: { productId: prod.id } });
    if (!hasImage) {
      await prisma.productImage.create({ data: { productId: prod.id, url: `/placeholder-bloom.svg`, alt: prod.title, sortOrder: 0 } });
    } else if (hasImage.url === '/placeholder-bloom.jpg') {
      await prisma.productImage.update({ where: { id: hasImage.id }, data: { url: '/placeholder-bloom.svg' } });
    }
    // Ensure inventory level (findFirst+create — Prisma upsert rejects null on
    // the @@unique([productId, variantId, locationId]) nullable member)
    const hasLevel = await prisma.inventoryLevel.findFirst({
      where: { productId: prod.id, variantId: null, locationId: studio.id },
    });
    if (!hasLevel) {
      await prisma.inventoryLevel.create({
        data: { productId: prod.id, variantId: null, locationId: studio.id, onHand: p.stockMode === 'tracked' ? 10 : 0 },
      });
    }
  }

  // Shipping zones (Perth WA)
  await prisma.shippingZone.upsert({ where: { id: 'perth-metro' }, update: {}, create: { id: 'perth-metro', name: 'Perth Metro (6000-6214)', postcodes: JSON.stringify(['6000','6001','6002','6003','6004','6005','6006','6007','6008','6010','6011','6012','6014','6021','6151','6152']) } });
  await prisma.shippingZone.upsert({ where: { id: 'wa-regional' }, update: {}, create: { id: 'wa-regional', name: 'WA Regional' } });
  await prisma.shippingZone.upsert({ where: { id: 'national' }, update: {}, create: { id: 'national', name: 'Australia Wide' } });
  for (const zone of await prisma.shippingZone.findMany()) {
    const hasRate = await prisma.shippingRate.findFirst({ where: { zoneId: zone.id } });
    if (!hasRate) {
      await prisma.shippingRate.create({ data: { zoneId: zone.id, name: 'Standard', price: zone.id === 'perth-metro' ? 12 : zone.id === 'wa-regional' ? 18 : 22, freeOver: 150 } });
      await prisma.shippingRate.create({ data: { zoneId: zone.id, name: 'Express', price: zone.id === 'perth-metro' ? 22 : zone.id === 'wa-regional' ? 28 : 32 } });
    }
  }

  await prisma.discount.upsert({ where: { code: 'BLOOM10' }, update: {}, create: { code: 'BLOOM10', description: '10% off first order', type: 'percent', value: 10, maxUses: 200 } });
  await prisma.discount.upsert({ where: { code: 'PERTHFREE' }, update: {}, create: { code: 'PERTHFREE', description: 'Free Perth delivery over $100', type: 'fixed', value: 12 } });

  // Workshops
  const w1 = await prisma.workshop.upsert({ where: { slug: 'cricut-blooms-101' }, update: {}, create: { title: 'Blooms 101', slug: 'cricut-blooms-101', description: 'Learn to cut, curl & assemble paper roses. Take home a 7-stem bouquet.', location: 'Perth Studio, WA', price: 135, capacity: 12, durationMinutes: 180, level: 'beginner' } });
  const w2 = await prisma.workshop.upsert({ where: { slug: 'origami-bouquet-masterclass' }, update: {}, create: { title: 'Origami Bouquet Masterclass', slug: 'origami-bouquet-masterclass', description: 'Fold roses, lilies & leaves — assemble a full bouquet. Paper kit included.', location: 'Perth Studio, WA', price: 165, capacity: 10, durationMinutes: 240, level: 'intermediate' } });
  const nextSat = new Date(); nextSat.setDate(nextSat.getDate() + (6 - nextSat.getDay() + 7) % 7); nextSat.setHours(10,0,0,0);
  for (const w of [w1, w2]) {
    // Seed runs on long-lived DBs too — only skip when a FUTURE session exists,
    // otherwise stale past sessions would block refresh forever.
    const hasFuture = await prisma.workshopSession.findFirst({ where: { workshopId: w.id, startsAt: { gt: new Date() } } });
    if (!hasFuture) {
      // tidy stale past dates (unbooked demo sessions) so the catalogue only
      // advertises upcoming workshops
      await prisma.workshopSession.deleteMany({ where: { workshopId: w.id, startsAt: { lt: new Date() }, bookedCount: 0 } }).catch(() => {});
      await prisma.workshopSession.create({ data: { workshopId: w.id, startsAt: nextSat, endsAt: new Date(nextSat.getTime() + w.durationMinutes * 60000), capacity: w.capacity } });
      const following = new Date(nextSat); following.setDate(following.getDate() + 7);
      await prisma.workshopSession.create({ data: { workshopId: w.id, startsAt: following, endsAt: new Date(following.getTime() + w.durationMinutes * 60000), capacity: w.capacity } });
    }
  }

  // ── BOM: Raw materials (Perth studio) ──────────────────────────
  const rawMaterials = [
    { sku: 'RM-CARD-65-BLUSH', name: '65lb Canson Cardstock – Blush (A4)', unit: 'sheet', onHand: 250, lowThreshold: 30, costPerUnit: 0.85, supplier: 'Canson AU' },
    { sku: 'RM-CARD-65-SAGE', name: '65lb Canson Cardstock – Sage (A4)', unit: 'sheet', onHand: 200, lowThreshold: 30, costPerUnit: 0.85, supplier: 'Canson AU' },
    { sku: 'RM-CARD-65-IVORY', name: '65lb Canson Cardstock – Ivory (A4)', unit: 'sheet', onHand: 180, lowThreshold: 30, costPerUnit: 0.85, supplier: 'Canson AU' },
    { sku: 'RM-WIRE-18GA', name: '18-Gauge Wire (galvanised)', unit: 'meter', onHand: 120, lowThreshold: 20, costPerUnit: 1.20, supplier: 'Perth Metal Supplies' },
    { sku: 'RM-TAPE-FLORAL', name: 'Floral Tape – Green (roll)', unit: 'roll', onHand: 40, lowThreshold: 8, costPerUnit: 3.50, supplier: 'Spotlight' },
    { sku: 'RM-GLUE-STICK', name: 'Glue Stick – Low-temp (pack)', unit: 'stick', onHand: 100, lowThreshold: 20, costPerUnit: 0.45, supplier: 'Spotlight' },
    { sku: 'RM-GLUE-GUN', name: 'Glue Gun Refill – 7mm', unit: 'stick', onHand: 80, lowThreshold: 15, costPerUnit: 0.35, supplier: 'Spotlight' },
  ];
  if (!SKIP_DEMO) for (const m of rawMaterials) {
    await prisma.rawMaterial.upsert({ where: { sku: m.sku }, update: {}, create: { ...m } });
  }
  if (!SKIP_DEMO) console.log(`Seeded ${rawMaterials.length} raw materials`);

  // Configurator papers — sellable materials with per-stem premium (not products)
  const papers = [
    { name: 'Blush 65lb Textured', colour: 'Blush', colourHex: '#F8C4B4', paperType: 'Canson', texture: 'textured', weight: '65lb', pricePremiumPerStem: 0, sortOrder: 1, onHand: 50 },
    { name: 'Sage 65lb Textured', colour: 'Sage', colourHex: '#9CAF88', paperType: 'Canson', texture: 'textured', weight: '65lb', pricePremiumPerStem: 0, sortOrder: 2, onHand: 40 },
    { name: 'Ivory 80lb Pearl', colour: 'Ivory', colourHex: '#FFF8E7', paperType: 'Colorplan', texture: 'pearl', weight: '80lb', pricePremiumPerStem: 1.5, sortOrder: 3, onHand: 30 },
    { name: 'Dusty Pink 80lb Smooth', colour: 'Dusty Pink', colourHex: '#D4A5A5', paperType: 'Colorplan', texture: 'smooth', weight: '80lb', pricePremiumPerStem: 1.5, sortOrder: 4, onHand: 30 },
    { name: 'Eucalyptus 110lb Linen', colour: 'Eucalyptus', colourHex: '#8A9A8B', paperType: 'Quill', texture: 'linen', weight: '110lb', pricePremiumPerStem: 2.5, sortOrder: 5, onHand: 20 },
    { name: 'Paper White 110lb Pearl', colour: 'Paper White', colourHex: '#FFFFFF', paperType: 'Quill', texture: 'pearl', weight: '110lb', pricePremiumPerStem: 2, sortOrder: 6, onHand: 25 },
  ];
  for (const p of papers) {
    await prisma.paperStock.upsert({ where: { name: p.name }, update: {}, create: p });
  }
  if (!SKIP_DEMO) console.log(`Seeded ${papers.length} configurator papers`);

  // BOM recipes per template (was single fallback findFirst({}) for every flower style)
  const blushMat = await prisma.rawMaterial.findUnique({ where: { sku: 'RM-CARD-65-BLUSH' } });
  const sageMat = await prisma.rawMaterial.findUnique({ where: { sku: 'RM-CARD-65-SAGE' } });
  const wireMat = await prisma.rawMaterial.findUnique({ where: { sku: 'RM-WIRE-18GA' } });
  const tapeMat = await prisma.rawMaterial.findUnique({ where: { sku: 'RM-TAPE-FLORAL' } });
  const glueMat = await prisma.rawMaterial.findUnique({ where: { sku: 'RM-GLUE-STICK' } });
  const templateRecipes = [
    { templateId: 'wattle-sprig', labour: 25, cricut: 8, lines: [ { mat: blushMat, qty: 8 }, { mat: wireMat, qty: 2.5 }, { mat: tapeMat, qty: 0.4 }, { mat: glueMat, qty: 3 } ] },
    { templateId: 'paper-rose', labour: 35, cricut: 10, lines: [ { mat: blushMat, qty: 10 }, { mat: wireMat, qty: 3.5 }, { mat: tapeMat, qty: 0.5 }, { mat: glueMat, qty: 4 } ] },
    { templateId: 'banksia-petal', labour: 30, cricut: 12, lines: [ { mat: sageMat, qty: 9 }, { mat: wireMat, qty: 4 }, { mat: tapeMat, qty: 0.6 }, { mat: glueMat, qty: 5 } ] },
    { templateId: 'origami-lily', labour: 20, cricut: 6, lines: [ { mat: blushMat, qty: 6 }, { mat: wireMat, qty: 2 }, { mat: tapeMat, qty: 0.3 }, { mat: glueMat, qty: 2 } ] },
  ];
  for (const t of templateRecipes) {
    if (!t.lines[0].mat) continue;
    const existing = await prisma.bOMRecipe.findUnique({ where: { templateId: t.templateId } });
    let recipeId;
    if (existing) {
      recipeId = existing.id;
      await prisma.bOMLine.deleteMany({ where: { recipeId } });
      await prisma.bOMRecipe.update({ where: { id: recipeId }, data: { labourMinutesPerUnit: t.labour, cricutMinutesPerUnit: t.cricut } });
    } else {
      const rec = await prisma.bOMRecipe.create({ data: { templateId: t.templateId, labourMinutesPerUnit: t.labour, cricutMinutesPerUnit: t.cricut } });
      recipeId = rec.id;
    }
    for (const l of t.lines) {
      if (!l.mat) continue;
      await prisma.bOMLine.create({ data: { recipeId, rawMaterialId: l.mat.id, qtyPerUnit: l.qty, wasteFactor: 0.05 } });
    }
  }
  console.log('Seeded BOM recipes per template (wattle-sprig, paper-rose, banksia-petal, origami-lily)');

  // Legacy product-linked recipe kept for compat (paper rose product) — ensure it exists without templateId for old orders
  const rose = await prisma.product.findUnique({ where: { slug: 'eucalyptus-paper-rose-bouquet-blush' } });
  if (rose) {
    const legacy = await prisma.bOMRecipe.findFirst({ where: { productId: rose.id, templateId: null } });
    if (!legacy) {
      const rec = await prisma.bOMRecipe.create({ data: { productId: rose.id, labourMinutesPerUnit: 35, cricutMinutesPerUnit: 10 } });
      if (blushMat && wireMat && tapeMat && glueMat) {
        for (const l of [ { mat: blushMat, qty: 10 }, { mat: wireMat, qty: 3.5 }, { mat: tapeMat, qty: 0.5 }, { mat: glueMat, qty: 4 } ]) {
          await prisma.bOMLine.create({ data: { recipeId: rec.id, rawMaterialId: l.mat.id, qtyPerUnit: l.qty, wasteFactor: 0.05 } });
        }
      }
      console.log('Seeded legacy product-linked BOM recipe');
    }
  }

  // Studio Settings (tax, labour, ABN) — for Admin hub + notebook
  await prisma.setting.upsert({ where: { key: 'tax_gst_rate' }, update: { value: '0.10' }, create: { key: 'tax_gst_rate', value: '0.10' } });
  await prisma.setting.upsert({ where: { key: 'labour_rate_per_hour' }, update: { value: '55' }, create: { key: 'labour_rate_per_hour', value: '55' } });
  await prisma.setting.upsert({ where: { key: 'bom_margin' }, update: { value: '1.30' }, create: { key: 'bom_margin', value: '1.30' } });
  await prisma.setting.upsert({ where: { key: 'abn' }, update: { value: '84 098 778 250' }, create: { key: 'abn', value: '84 098 778 250' } });
  await prisma.setting.upsert({ where: { key: 'business_name' }, update: { value: "Krystal's Flower Kreations" }, create: { key: 'business_name', value: "Krystal's Flower Kreations" } });
  await prisma.setting.upsert({ where: { key: 'business_address' }, update: { value: 'Perth WA 6000' }, create: { key: 'business_address', value: 'Perth WA 6000' } });
  await prisma.setting.upsert({ where: { key: 'shipping_perth_metro' }, update: { value: '12' }, create: { key: 'shipping_perth_metro', value: '12' } });
  await prisma.setting.upsert({ where: { key: 'shipping_free_over' }, update: { value: '150' }, create: { key: 'shipping_free_over', value: '150' } });
  await prisma.setting.upsert({ where: { key: 'contact_phone' }, update: { value: '+61 410 732 634' }, create: { key: 'contact_phone', value: '+61 410 732 634' } });
  await prisma.setting.upsert({ where: { key: 'notebooklm_url' }, update: {}, create: { key: 'notebooklm_url', value: 'https://notebooklm.google.com/notebook/459b06d5-2520-442a-ae3c-048b54c78902' } });

  // Brand theme (web options) — matches the CSS :root defaults
  const THEME = [
    ['theme_primary', '#581C87'], ['theme_primary_dark', '#1E293B'], ['theme_bg', '#F8FAFC'],
    ['theme_secondary', '#6B8EAD'], ['theme_shimmer', '#CBD5E1'], ['theme_admin_purple', '#7C3AED'], ['theme_color', '#581C87'],
  ];
  for (const [k, v] of THEME) {
    await prisma.setting.upsert({ where: { key: k }, update: {}, create: { key: k, value: v } });
  }

  // Discounts with dates/minSpend enforced
  await prisma.discount.update({ where: { code: 'BLOOM10' }, data: { minSpend: 50, startsAt: new Date('2026-08-01'), endsAt: new Date('2027-08-01') } }).catch(()=>{});
  await prisma.discount.update({ where: { code: 'PERTHFREE' }, data: { minSpend: 100, startsAt: new Date('2026-08-01'), endsAt: new Date('2027-12-31') } }).catch(()=>{});

  // Blog posts — single source of truth: backend/content/blog/*.md
  const { readPosts } = await import('../scripts/lib/readPosts.mjs');
  const ORIGIN = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  for (const p of readPosts()) {
    const saved = await prisma.post.upsert({
      where: { slug: p.slug },
      update: { title: p.title, excerpt: p.excerpt, content: p.body, tags: p.tags, metaTitle: p.metaTitle, metaDescription: p.metaDescription, coverImageUrl: p.cover.startsWith('http') ? p.cover : `${ORIGIN}${p.cover}` },
      create: { title: p.title, slug: p.slug, excerpt: p.excerpt, content: p.body, tags: p.tags, metaTitle: p.metaTitle, metaDescription: p.metaDescription, coverImageUrl: p.cover.startsWith('http') ? p.cover : `${ORIGIN}${p.cover}`, status: p.status, publishedAt: p.publishedAt || new Date(), authorId: (await prisma.user.findFirst({ where: { email: 'krystal@flowerkreations.com.au' } })).id },
    });
    // Related products from productSlugs (idempotent replace)
    const resolved = (await Promise.all(p.productSlugs.map((s) => prisma.product.findUnique({ where: { slug: s } })))).filter(Boolean);
    await prisma.postProduct.deleteMany({ where: { postId: saved.id } });
    if (resolved.length) await prisma.postProduct.createMany({ data: resolved.map((prod) => ({ postId: saved.id, productId: prod.id })) });
  }

  // Procedures & specifications — demo docs (same SKIP_DEMO guard as the demo
  // catalog: dummy records never land in the live Supabase DB).
  if (!SKIP_DEMO) {
    const procAuthor = await prisma.user.findFirst({ where: { email: 'krystal@flowerkreations.com.au' } });
    const PROCEDURES = [
      {
        id: '00000000-0000-4000-8000-000000000001',
        title: 'Crepe Paper Rose — Petal Assembly',
        category: 'FLOWER',
        subcategory: 'CREPE_PAPER',
        sku: null,
        metadata: { difficulty: 'INTERMEDIATE', estimatedTimeMinutes: 45, materialGsm: 180, tools: ['Sharp scissors', 'Tacky glue (PVA)', '18ga floral wire', 'Floral tape 12mm', 'Bone folder'] },
        contentMarkdown: [
          '# Crepe Paper Rose — Petal Assembly',
          '',
          '**Bloom yield:** 1 rose · **Stock:** 180gsm crepe, deep red · **Difficulty:** INTERMEDIATE',
          '',
          '## Petal dimensions (per bloom)',
          '',
          '- **Outer petals (3):** 70mm wide × 90mm tall — cup 8mm across the grain',
          '- **Inner petals (3):** 50mm wide × 70mm tall — cup 10mm (tighter curl)',
          '- **Sepal (1):** 90mm × 40mm, notch 5 teeth at 18mm depth',
          '',
          '## Glue specs',
          '',
          '- Tacky glue (PVA), **~20g per bloom** — thin bead along the petal base only',
          '- Glue gun (low temp, 120°C max) for sepal → calyx attach — 2s dwell',
          '- Never glue the outer 15mm of a petal edge — edges must stay free for shaping',
          '',
          '## Assembly steps',
          '',
          '1. Cut petals while the crepe is folded — grain runs **bottom to top** of each petal.',
          '2. Cup every petal: thumbs centre, pull gently outwards (outer +8mm, inner +10mm).',
          '3. Wrap the innermost petal around the 18ga wire tip — form a tight cone, glue base only.',
          '4. Add the 3 inner petals at 120° spacing, slightly overlapping left over right.',
          '5. Add the 3 outer petals, offset from the inner ring, edges angled 20° outward.',
          '6. Attach the sepal with a 2s glue-gun press, then spiral floral tape from the sepal base down 80mm.',
          '7. Rest the bloom upside down for 10 minutes before final edge shaping.',
          '',
          '## QC checklist',
          '',
          '- No glue shine on visible petal edges',
          '- Cone tight (no wire showing at the tip)',
          '- Calyx flush, tape smooth with no wrinkles',
        ].join('\n'),
      },
      {
        id: '00000000-0000-4000-8000-000000000002',
        title: 'Traditional Crane (Orizuru) — Folding Steps',
        category: 'DECOR',
        subcategory: 'ORIGAMI',
        sku: null,
        metadata: { difficulty: 'BEGINNER', estimatedTimeMinutes: 15, foldingComplexity: 'simple', tools: ['15cm kami square', 'Bone folder (optional)'] },
        contentMarkdown: [
          '# Traditional Crane (Orizuru)',
          '',
          '**Paper:** 15cm kami square, colour side up to start · **Difficulty:** BEGINNER · **Complexity:** simple',
          '',
          '## Base',
          '',
          '1. Fold in half diagonally both ways; unfold — creases form an X.',
          '2. Flip, fold in half edge-to-edge both ways; unfold.',
          '3. Collapse along the creases into the **preliminary base** (square base, open end down).',
          '',
          '## Bird base',
          '',
          '4. Fold both lower edges to the centre line (open end down) — kite folds.',
          '5. Fold the top triangle down over them, crease firmly, then unfold all three folds.',
          '6. **Petal fold:** lift the bottom point of the top layer, reverse the side creases inward, flatten into a long diamond.',
          '7. Turn over and repeat steps 4–6 on the back. You now have the **bird base**.',
          '',
          '## Shaping',
          '',
          '8. Fold both lower legs to the centre on each side (thin them), repeat on the back.',
          '9. Inside-reverse fold one thin leg up for the **neck**, the other for the **tail**.',
          '10. Inside-reverse fold the neck tip down for the **head**.',
          '11. Pull the wings apart gently so the body inflates — do not flatten the back.',
          '',
          '## QC checklist',
          '',
          '- Wings symmetrical, body inflated evenly',
          '- Head and tail reverse folds crisp (no torn paper at the corners)',
          '- Stand test: the crane sits flat on its body without tipping',
        ].join('\n'),
      },
      {
        id: '00000000-0000-4000-8000-000000000003',
        title: 'Die-Cut Petal Standards — 120gsm Paper & Packaging',
        category: 'MANUFACTURING_SPEC',
        subcategory: 'DIE_CUT',
        sku: 'SPEC-DIECUT-120GSM',
        metadata: { materialGsm: 120, estimatedTimeMinutes: 5, tools: ['Die set DS-PEL-04', 'Thickness gauge', 'Carton sample'] },
        contentMarkdown: [
          '# Die-Cut Petal Standards — 120gsm',
          '',
          '**SKU:** SPEC-DIECUT-120GSM · **Stock standard:** 120gsm ±5% · **Applies to:** DS-PEL-04 die set',
          '',
          '## Tolerances',
          '',
          '- **Cut tolerance:** ±0.5mm on every edge; ±0.8mm on internal apertures',
          '- **Registration:** max 0.4mm shift between printed and cut lines',
          '- **Nicks:** max 0.3mm, placed only on waste-side edges — never on a visible petal curve',
          '- **Burrs:** none permitted on the visible face (run a gloved thumb test on 1 in 20 pieces)',
          '',
          '## Paper weight standard',
          '',
          '- Incoming stock: **120gsm ±5%** (gauge 5 samples per ream — reject a ream below 114gsm or above 126gsm)',
          '- Moisture content 4–7% — acclimatise stock 24h in the studio before cutting',
          '',
          '## Packaging guidelines',
          '',
          '- Stack max **50 pieces** per cello bag (50µm, food-grade, self-seal)',
          '- Bag label: SKU, quantity, cut date, operator initials',
          '- Master carton: 300gsm E-flute, max 20 bags per carton, corner protectors on the long edge',
          '- Store flat, below 60% RH — no leaning stacks over 300mm tall',
        ].join('\n'),
      },
      {
        id: '00000000-0000-4000-8000-000000000004',
        title: 'Tulip Flower (Origami) — Folding & Assembly',
        category: 'FLOWER',
        subcategory: 'ORIGAMI',
        sku: 'FLOWER-TUL-ORI',
        metadata: { difficulty: 'BEGINNER', estimatedTimeMinutes: 20, materialGsm: 80, foldingComplexity: 'simple', tools: ['Guillotine', 'Flower tape', 'Glue'], notes: 'Pre-made parts: Sepal (base), Leaves, Wire or Rolled Paper stem. Paper: 80gsm or 125gsm.' },
        contentMarkdown: [
          '# Tulip Flower (Origami)',
          '',
          '**SKU:** FLOWER-TUL-ORI · **Stock:** 80gsm or 125gsm · **Difficulty:** BEGINNER · **Time:** ~20 min',
          '',
          '## Pre-made parts',
          '',
          '- **Sepal (base):** pre-cut green sepal cup',
          '- **Leaves:** 2 pre-cut leaves per stem',
          '- **Stem:** 18ga wire stem, or a rolled paper stem (150mm × 15mm strip rolled tight on a quilling tool)',
          '- **Bloom paper:** 150mm square, 80gsm (soft petals) or 125gsm (crisper edges)',
          '',
          '## Bloom — fold from the square',
          '',
          '1. Start colour side **up**. Fold in half diagonally both ways, unfolding each time — the creases form an X.',
          '2. Flip the paper over. Fold in half edge-to-edge both ways, unfolding each time — you now have a + on the reverse.',
          '3. Collapse the creases into a **waterbomb base** (triangle with two flaps on each side).',
          '4. Orient the triangle with the open point **up**. Fold the front-right flap bottom corner up to the peak; repeat with the front-left flap — a diamond appears on the face.',
          '5. Fold the side corners of the diamond to the centre line and tuck one flap into the other\'s pocket — this locks the 3D cup.',
          '6. Flip and repeat steps 4–5 on the back.',
          '7. Rotate so the 4 open points face up. Peel each point down slightly and curl the tips outward with a scissor edge — these are the petal points.',
          '8. Inflate gently through the small hole at the base (one soft breath) to round the cup.',
          '',
          '## Stem & assembly',
          '',
          '1. Trim the stem tip to a point with the guillotine; test-fit into the bloom base hole.',
          '2. Apply a pea of glue inside the base hole; seat the bloom on the stem 5mm deep — hold 10s.',
          '3. Slide the pre-made sepal up the stem until it cups the bloom base; glue in place.',
          '4. Attach the 2 leaves with flower tape — spiral from the sepal base down 80mm, overlapping by half.',
          '',
          '## QC checklist',
          '',
          '- 4 petal points symmetrical, tips curled — not creased or torn',
          '- Seam tucked flat; no gap at the lock',
          '- Sepal cups the bloom; tape smooth with no wrinkles or exposed glue',
          '- Stem straight — bloom does not spin under light finger pressure',
        ].join('\n'),
      },
    ];
    for (const p of PROCEDURES) {
      const doc = await prisma.procedureDocument.upsert({
        where: { id: p.id },
        update: { title: p.title, category: p.category, subcategory: p.subcategory ?? null, sku: p.sku, contentMarkdown: p.contentMarkdown, metadata: p.metadata, status: 'published', version: 'v1.0' },
        create: { id: p.id, title: p.title, category: p.category, subcategory: p.subcategory ?? null, sku: p.sku, contentMarkdown: p.contentMarkdown, metadata: p.metadata, status: 'published', authorId: procAuthor?.id ?? null },
      });
      const hasRevision = await prisma.procedureRevision.findFirst({ where: { documentId: doc.id }, select: { id: true } });
      if (!hasRevision) {
        await prisma.procedureRevision.create({
          data: { documentId: doc.id, version: doc.version, title: doc.title, contentMarkdown: doc.contentMarkdown, metadata: doc.metadata ?? undefined, editorId: procAuthor?.id ?? null, note: 'Initial version (seed)' },
        });
      }
    }
    console.log(`[seed] ${PROCEDURES.length} procedure documents.`);
  }

  // ── In-app agents (agent console) ──────────────────────────────────────
  // Seeded so the Agent tab isn't empty on first run. Upsert by name keeps
  // re-seeds idempotent. LLM is dormant until LLM_API_KEY is set; agents
  // return a dormant message in that case (see routes/agents.js).
  const agents = [
    {
      name: 'procedure-analyzer',
      description: 'Extracts materials, labour, and BOM from manufacturing procedure text. Suggests reuse vs create for raw materials.',
      mode: 'primary',
      tools: ['analyze_procedure', 'match_materials', 'price_proposal'],
      systemPrompt: `You are a manufacturing procedure analyst for Krystal's Flower Kreations, a custom paper florist and sculptural art workshop in Perth, WA (Cricut + origami).

Your job: given raw procedure text (from an uploaded document, scan, or paste), extract a structured manufacturing spec:
- Title, category (FLOWER/BOUQUET/FOLIAGE/DECOR/PACKAGING/MANUFACTURING_SPEC), subcategory (ORIGAMI/CREPE_PAPER/DIE_CUT/SCULPTURAL/HAND_ASSEMBLY)
- Materials with name, unit (sheet/meter/stick/roll/piece/ml/gram), qtyPerUnit, wasteFactor, colour, weight, size, brand
- labourMinutesPerUnit (hands-on craft time), cricutMinutesPerUnit (machine-cut time)
- Steps (ordered list)

Rules:
- Materials are per finished unit, not per batch.
- Use "piece" when no unit fits.
- estimatedCostPerUnit is AUD per material unit (null if unknown).
- If the text is not a manufacturing procedure, set isProcedure=false with low confidence.
- Two-axis taxonomy: category = what it is, subcategory = how it's made.

Reply with ONLY valid JSON matching the analysis schema. No prose, no code fences.`,
    },
    {
      name: 'inventory-advisor',
      description: 'Analyzes stock levels across locations, flags low stock, suggests reorder quantities and suppliers.',
      mode: 'primary',
      tools: ['list_inventory', 'list_materials', 'list_suppliers', 'replenishment'],
      systemPrompt: `You are an inventory advisor for Krystal's Flower Kreations, a paper florist in Perth, WA.

Your job: given current inventory levels (raw materials, products, paper stocks across locations), provide actionable advice:
- Flag items below their lowThreshold
- Suggest reorder quantities based on usage patterns and lead times
- Recommend suppliers based on cost, reliability, and delivery time
- Identify slow-moving stock that could be repurposed or discounted
- Highlight location imbalances (e.g., Perth Studio has excess, Market Van is short)

Context:
- Multi-location: Perth Studio, Market Van, Storage
- Units: sheets, meters, sticks, rolls, pieces, ml, grams
- Currency: AUD, GST-inclusive
- Suppliers: Canson AU, Perth Metal Supplies, Spotlight, and others

Be concise and actionable. Format as a bulleted list with priority (urgent/soon/later).`,
    },
    {
      name: 'product-copywriter',
      description: 'Generates SEO-optimized product titles, descriptions, tags, and meta fields from product specs.',
      mode: 'subagent',
      tools: ['get_product', 'list_products', 'list_collections'],
      systemPrompt: `You are a product copywriter for Krystal's Flower Kreations, a custom paper florist and sculptural art workshop in Perth, WA.

Your job: given product specifications (type, materials, dimensions, colours, occasions), generate:
- SEO-optimized title (max 100 chars, include key terms: paper flower, Cricut, Perth, etc.)
- Description (2-3 paragraphs, warm craft-focused tone, mention materials, care, made-to-order time)
- Meta title (max 60 chars) and meta description (max 160 chars)
- Tags (5-10 relevant tags: flower type, colour, occasion, material, technique)
- Care instructions (if applicable)

Brand voice: warm, artisanal, Perth-proud. Emphasize handmade quality, sustainability (everlasting flowers), and personalization.

Currency: AUD. Shipping: Perth metro $12, free over $150. GST-inclusive pricing.`,
    },
    {
      name: 'cost-analyst',
      description: 'Analyzes BOM costs, suggests pricing, flags margin issues, and recommends cost optimizations.',
      mode: 'primary',
      tools: ['get_recipe', 'list_materials', 'pricing_config', 'cost_recalc'],
      systemPrompt: `You are a cost analyst for Krystal's Flower Kreations, a paper florist in Perth, WA.

Your job: given BOM recipes (materials × waste factor + labour × rate, × margin), analyze:
- Material cost breakdown per unit
- Labour cost (minutes × $55/hr)
- Total cost vs. retail price (margin check)
- Flag products where margin < 30% or > 60%
- Suggest price adjustments or material substitutions to improve margins
- Identify materials with high waste factors that could be optimized

Pricing formula: (materials × waste) + (labour minutes × $55/60) = cost, × 1.30 margin = retail (GST-inclusive).

Be specific with numbers. Format as a table when comparing multiple products.`,
    },
    {
      name: 'customer-service',
      description: 'Answers customer questions about orders, products, workshops, shipping, and returns.',
      mode: 'primary',
      tools: ['get_order', 'list_products', 'list_workshops', 'shipping_zones'],
      systemPrompt: `You are a friendly customer service agent for Krystal's Flower Kreations, a custom paper florist and sculptural art workshop in Perth, WA.

Your job: answer customer questions about:
- Order status and tracking
- Product details, materials, care instructions
- Workshop bookings, dates, what's included
- Shipping options and costs (Perth metro $12, WA regional $18, national $22, free over $150)
- Returns and exchanges (everlasting paper flowers — limited returns for defects only)
- Custom orders and configurator

Tone: warm, helpful, craft-proud. Use "we" (the studio). Mention Perth where relevant.

Key facts:
- Made-to-order items: 3-7 days
- Digital templates: instant download
- Workshops: Perth Studio, all materials included
- Payment: cash, bank transfer, EFTPOS, invoice (no Stripe)
- GST-inclusive pricing (10%)

If you can't answer, say "Let me check with the studio and get back to you."`,
    },
    {
      name: 'workshop-planner',
      description: 'Plans workshop sessions: materials needed, capacity, scheduling, and kit preparation.',
      mode: 'primary',
      tools: ['list_workshops', 'list_sessions', 'list_materials', 'bom_recipe'],
      systemPrompt: `You are a workshop planner for Krystal's Flower Kreations, a paper florist in Perth, WA.

Your job: given a workshop type and session details, plan:
- Materials needed per participant (from BOM recipes)
- Total materials for the session (participants × per-unit)
- Kit preparation checklist (pre-cut pieces, pre-folded bases, wire lengths)
- Room setup (tables, tools, glue guns, scissors)
- Timing breakdown (intro, demo, hands-on, QC, wrap-up)
- Capacity and waitlist management

Workshops:
- Blooms 101 (3hr, beginner, 12 max, $135) — 7-stem bouquet
- Origami Bouquet Masterclass (4hr, intermediate, 10 max, $165) — full bouquet

Always account for 10% extra materials for mistakes. Flag if any material is below reorder threshold.`,
    },
    {
      name: 'document-classifier',
      description: 'Classifies and tags uploaded documents by category, subcategory, and suggested tags.',
      mode: 'subagent',
      tools: ['get_document', 'list_documents'],
      systemPrompt: `You are a document classifier for Krystal's Flower Kreations, a paper florist in Perth, WA.

Your job: given document text (OCR or extracted), classify it:
- Category: STOCKTAKE, SUPPLIER, INVOICE, PROCEDURE, EXPORT, MEDIA, OTHER
- Subcategory: (per category, e.g., PROCEDURE → PETAL_ASSEMBLY, ORIGAMI_FOLD, etc.)
- Tags: 3-8 relevant tags (material names, techniques, supplier names)
- Title: suggested clean title (if current title is a filename)
- Confidence: 0-1

Rules:
- If the document contains material lists + steps → PROCEDURE
- If it contains prices + supplier info → INVOICE or SUPPLIER
- If it contains stock counts → STOCKTAKE
- If it's an image/photo → MEDIA
- Always suggest at least 2 tags

Reply with ONLY valid JSON: { "category", "subcategory", "tags", "title", "confidence" }`,
    },
    {
      name: 'marketing-copy',
      description: 'Generates social media posts, email campaigns, and blog content for products and workshops.',
      mode: 'subagent',
      tools: ['list_products', 'list_workshops', 'list_collections'],
      systemPrompt: `You are a marketing copywriter for Krystal's Flower Kreations, a custom paper florist and sculptural art workshop in Perth, WA.

Your job: generate marketing content for:
- Instagram/Facebook posts (with hashtags, emojis, CTA)
- Email newsletter snippets
- Blog post outlines
- Workshop promotion copy
- Product launch announcements

Brand voice: warm, artisanal, Perth-proud, sustainable (everlasting flowers), craft-focused.

Key selling points:
- Handmade paper flowers that last forever
- Cricut-compatible templates for DIY makers
- Workshops in Perth Studio
- Custom bouquets for weddings, events, gifts
- Australian-made, Perth-based

Include relevant hashtags: #paperflowers #cricut #perthflorist #everlastingflowers #handmadeinperth #origami #paperart

Format: provide 2-3 variations (short/medium/long) for each request.`,
    },
  ];

  for (const a of agents) {
    await prisma.agent.upsert({
      where: { name: a.name },
      update: { description: a.description, systemPrompt: a.systemPrompt, mode: a.mode, tools: a.tools, isActive: true },
      create: { name: a.name, description: a.description, systemPrompt: a.systemPrompt, mode: a.mode, tools: a.tools, isActive: true },
    });
  }
  // Error scanner agent (added from error-scan plan)
  agents.push({
    name: 'error-scanner',
    description: 'Scans codebase for common error patterns: empty catch blocks, unhandled promises, missing asyncHandler, hardcoded secrets, TODO/FIXME comments.',
    mode: 'subagent',
    tools: ['read_file', 'grep', 'list_files'],
    systemPrompt: `You are a code quality and error scanner for Krystal's Flower Kreations, a Node.js/Express + React + Prisma codebase.

Your job: given a file path or directory, scan for common error patterns and return a structured report.

Patterns to check:
1. Empty catch blocks: \`catch {}\` or \`catch (e) {}\` — swallowed errors
2. Unhandled promise chains: \`.then()\` without \`.catch()\` — potential unhandled rejections
3. Missing asyncHandler: async route handlers without asyncHandler wrapper — unhandled promise rejections in Express
4. Bare re-throws: \`throw e\` without adding context — loses debugging info
5. Hardcoded secrets: passwords, API keys, tokens in source code
6. Console.error without structured logging: inconsistent error reporting
7. TODO/FIXME/HACK comments: known tech debt
8. Missing error boundaries: React components without error boundaries

For each finding, report:
- File path
- Line number (if available)
- Severity: critical / high / medium / low
- Pattern matched
- Suggested fix (1 sentence)

Format: JSON array of findings. Empty array if no issues found.

Severity guide:
- critical: hardcoded secrets, unhandled rejections in request paths
- high: empty catch blocks in business logic, missing asyncHandler
- medium: bare re-throws, inconsistent logging
- low: TODO comments, minor style issues`,
  });

  // Social media poster agent
  agents.push({
    name: 'social-poster',
    description: 'Generates and posts product/workshop announcements to Facebook and Instagram via Meta Graph API.',
    mode: 'subagent',
    tools: ['post_product', 'post_workshop', 'social_status'],
    systemPrompt: `You are a social media manager for Krystal's Flower Kreations, a custom paper florist in Perth, WA.

Your job: generate engaging social media posts for new products and workshops.

For each post, generate:
- A catchy hook (emoji + hook line)
- Product/workshop description (2-3 sentences, warm craft-focused tone)
- Price and link CTA
- Relevant hashtags (#paperflowers #handmadeinperth #everlastingflowers #cricut #origami #perthflorist)

Platform-specific:
- Facebook: longer posts with link, can include multiple paragraphs
- Instagram: shorter, emoji-heavy, "link in bio" CTA, max 30 hashtags

Brand voice: warm, artisanal, Perth-proud, sustainable (everlasting flowers).

Always include: price in AUD, Perth location, and a clear call-to-action.`,
  });

  console.log(`[seed] ${agents.length} agents.`);

  // In-app skills (studio console) — reusable instruction sets for agents/workflows
  const skills = [
    { name: 'pos-closeout-checklist', description: 'End-of-day POS reconciliation checklist.', triggers: ['pos.session_end', 'pos.close'], content: '1. Count cash drawer and record closing cash. 2. Reconcile EFTPOS/bank transfer totals. 3. Note variances. 4. Close session. 5. Audit log entry.' },
    { name: 'order-fulfillment-triage', description: 'Prioritize paid orders for makers.', triggers: ['order.paid', 'order.needs_making'], content: 'Sort by due date, check stock/BOM availability, assign to maker, update status with notes.' },
    { name: 'low-stock-reorder', description: 'Prompt reordering for low stock.', triggers: ['inventory.low_stock'], content: 'Review affected items, check suppliers, draft PO, notify staff/admin.' },
    { name: 'workshop-checkin', description: 'QR check-in and waitlist management.', triggers: ['workshop.session_start', 'workshop.checkin'], content: 'Scan ticket, mark attendance, handle walk-ins, promote waitlist if spots open.' },
    { name: 'custom-order-proofing', description: 'Guide proof approval for custom art.', triggers: ['custom_order.drafting_proofing'], content: 'Review specs, generate proof, send to customer, track approval, move to next state.' },
    { name: 'bom-costing-review', description: 'Review margins after BOM changes.', triggers: ['bom.recipe_updated'], content: 'Compare cost vs price, flag margin drops, update pricing or adjust recipe, log changes.' },
    { name: 'supplier-followup', description: 'Follow up outstanding POs.', triggers: ['po.overdue', 'po.partial'], content: 'List overdue POs, draft follow-up messages, update expected dates, escalate to admin.' },
  ];
  for (const s of skills) {
    await prisma.skill.upsert({ where: { name: s.name }, update: { description: s.description, content: s.content, triggers: s.triggers, isActive: true }, create: { name: s.name, description: s.description, content: s.content, triggers: s.triggers, isActive: true } });
  }
  console.log(`Seeded ${skills.length} studio console skills.`);

  // Additional studio console skills
  const moreSkills = [
    { name: 'daily-pos-summary', description: 'End-of-day POS summary.', triggers: ['pos.session_end'], content: 'Summarise cash/EFTPOS/bank transfer, discounts, voids and session variance for the admin.' },
    { name: 'workshop-reminder-24h', description: '24-hour workshop reminders.', triggers: ['workshop.reminder_due'], content: 'Pull upcoming sessions for tomorrow, list attendees and prepare reminder emails/SMS notes.' },
    { name: 'workshop-checkin-audit', description: 'Post-session attendance audit.', triggers: ['workshop.session_end'], content: 'Cross-check bookings vs checkedInAt, flag no-shows and update waitlist if needed.' },
    { name: 'po-overdue-escalate', description: 'Escalate overdue purchase orders.', triggers: ['po.overdue'], content: 'List overdue POs by supplier, draft follow-up text, bump priority and notify admin.' },
    { name: 'bom-margin-guard', description: 'Margin guard on recipe/price changes.', triggers: ['bom.recipe_updated', 'product.price_changed'], content: 'Recalculate cost vs price, flag any product below target margin and suggest fixes.' },
    { name: 'custom-order-stale-followup', description: 'Follow up stale custom art orders.', triggers: ['custom_order.stale'], content: 'Find orders stuck in a state > 48-72 hours, draft a polite follow-up and prompt action.' },
    { name: 'stocktake-due', description: 'Prompt scheduled stocktake.', triggers: ['inventory.stocktake_due'], content: 'Generate location-based stocktake list, assign to staff and set due time.' },
    { name: 'digital-delivery-verify', description: 'Verify digital template delivery.', triggers: ['order.paid.digital'], content: 'Ensure download links exist for digital_template orders and flag any missing links.' },
    { name: 'abandoned-cart-review', description: 'Review abandoned carts.', triggers: ['cart.abandoned'], content: 'Pull carts with email captured but no completed order, suggest recovery action.' },
    { name: 'material-expiry-check', description: 'Check expiring inventory lots.', triggers: ['inventory.lots_expiring'], content: 'Flag lots nearing expiry by location and suggest use/reduce stock.' },
  ];
  for (const s of moreSkills) {
    await prisma.skill.upsert({ where: { name: s.name }, update: { description: s.description, content: s.content, triggers: s.triggers, isActive: true }, create: { name: s.name, description: s.description, content: s.content, triggers: s.triggers, isActive: true } });
  }
  const allSkills = [...skills, ...moreSkills];

  // Workflows
  const workflows = [
    { name: 'order-to-making', description: 'Move paid order to making with checks.', steps: [ { type: 'skill', name: 'order-fulfillment-triage' }, { type: 'function', name: 'inventory.checkBOMAvailability' }, { type: 'function', name: 'orders.assignMaker' }, { type: 'function', name: 'orders.updateStatus', params: { status: 'making' } }, { type: 'notify', target: 'staff' } ] },
    { name: 'low-stock-to-po-draft', description: 'Turn low stock into a draft PO.', steps: [ { type: 'skill', name: 'low-stock-reorder' }, { type: 'function', name: 'inventory.getLowStock' }, { type: 'function', name: 'procurement.groupBySupplier' }, { type: 'function', name: 'purchaseOrders.createDraft' }, { type: 'notify', target: 'admin' } ] },
    { name: 'daily-studio-closeout', description: 'End-of-day routine.', steps: [ { type: 'skill', name: 'pos-closeout-checklist' }, { type: 'skill', name: 'daily-pos-summary' }, { type: 'skill', name: 'material-expiry-check' }, { type: 'notify', target: 'admin', note: 'summary' } ] },
    { name: 'workshop-day-prep', description: 'Prep for upcoming workshop session.', steps: [ { type: 'skill', name: 'workshop-checkin' }, { type: 'function', name: 'workshops.getRoster' }, { type: 'function', name: 'inventory.reserveKitMaterials' }, { type: 'notify', target: 'staff' } ] },
    { name: 'workshop-reminders-run', description: 'Send 24h reminders.', steps: [ { type: 'skill', name: 'workshop-reminder-24h' }, { type: 'function', name: 'workshops.sendReminders' }, { type: 'audit', action: 'log' } ] },
    { name: 'custom-order-ageing-review', description: 'Ageing review for custom orders.', steps: [ { type: 'skill', name: 'custom-order-stale-followup' }, { type: 'function', name: 'customOrders.findStale' }, { type: 'function', name: 'customOrders.suggestActions' }, { type: 'notify', target: 'maker' } ] },
    { name: 'bom-margin-enforcement', description: 'Enforce margin guard on changes.', steps: [ { type: 'skill', name: 'bom-margin-guard' }, { type: 'function', name: 'bom.recalcMargins' }, { type: 'function', name: 'products.flagLowMargin' }, { type: 'notify', target: 'admin' } ] },
  ];
  for (const w of workflows) {
    await prisma.workflow.upsert({ where: { name: w.name }, update: { description: w.description, steps: w.steps, isActive: true }, create: { name: w.name, description: w.description, steps: w.steps, isActive: true } });
  }

  // Automations
  const automations = [
    { name: 'order-paid-trigger-fulfill', description: 'Run order-to-making on paid.', trigger: 'order.paid', triggerType: 'event', action: 'order-to-making', actionType: 'workflow', params: {} },
    { name: 'pos-closeout-daily', description: 'Daily POS closeout.', trigger: '0 17 * * 1-6', triggerType: 'cron', action: 'daily-studio-closeout', actionType: 'workflow', params: {} },
    { name: 'low-stock-hourly-scan', description: 'Hourly low-stock scan.', trigger: '0 * * * *', triggerType: 'cron', action: 'low-stock-to-po-draft', actionType: 'workflow', params: {} },
    { name: 'workshop-reminders-daily', description: 'Daily 24h workshop reminders.', trigger: '0 9 * * *', triggerType: 'cron', action: 'workshop-reminders-run', actionType: 'workflow', params: {} },
    { name: 'workshop-prep-morning', description: 'Morning workshop prep.', trigger: '0 8 * * *', triggerType: 'cron', action: 'workshop-day-prep', actionType: 'workflow', params: {} },
    { name: 'custom-orders-ageing-daily', description: 'Daily custom order ageing review.', trigger: '30 9 * * *', triggerType: 'cron', action: 'custom-order-ageing-review', actionType: 'workflow', params: {} },
    { name: 'bom-margin-watch', description: 'Margin watch on BOM changes.', trigger: 'bom.recipe_updated', triggerType: 'event', action: 'bom-margin-enforcement', actionType: 'workflow', params: {} },
    { name: 'inventory-lots-expiry-daily', description: 'Weekday lot expiry check.', trigger: '0 8 * * 1-5', triggerType: 'cron', action: 'material-expiry-check', actionType: 'skill', params: {} },
  ];
  for (const a of automations) {
    await prisma.automation.upsert({ where: { name: a.name }, update: { description: a.description, trigger: a.trigger, triggerType: a.triggerType, action: a.action, actionType: a.actionType, params: a.params, isActive: true }, create: { name: a.name, description: a.description, trigger: a.trigger, triggerType: a.triggerType, action: a.action, actionType: a.actionType, params: a.params, isActive: true } });
  }

  console.log(`Seeded ${allSkills.length} skills, ${workflows.length} workflows, ${automations.length} automations.`);



  console.log('Seed complete.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
