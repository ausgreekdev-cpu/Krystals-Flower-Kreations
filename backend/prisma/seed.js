import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Krystal\'s Flower Kreations...');

  const password = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'krystal@flowerkreations.com.au' },
    update: {},
    create: { email: 'krystal@flowerkreations.com.au', name: 'Krystal', role: 'admin', password },
  });
  await prisma.user.upsert({
    where: { email: 'admin@krystal.local' },
    update: {},
    create: { email: 'admin@krystal.local', name: 'Admin', role: 'developer', password },
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
    { title: 'Armature Art', slug: 'armature-art', description: 'Sculptural wire & paper armatures', sortOrder: 2 },
    { title: 'Cricut Templates', slug: 'cricut-templates', description: 'SVG cut files for your Maker', sortOrder: 3 },
    { title: 'Origami', slug: 'origami', description: 'Folded paper creations', sortOrder: 4 },
    { title: 'Workshop Kits', slug: 'workshop-kits', description: 'Take-home kits with materials + guide', sortOrder: 5 },
  ];
  for (const c of collections) {
    await prisma.collection.upsert({ where: { slug: c.slug }, update: {}, create: c });
  }

  const products = [
    { title: 'Eucalyptus Paper Rose Bouquet — Blush', slug: 'eucalyptus-paper-rose-bouquet-blush', description: '12-stem blush paper roses with eucalyptus, 250gsm textured cardstock. Made to order 3-5 days. Cricut-compatible petals.', price: 89, sku: 'KFK-ROSE-BLUSH-12', type: 'made_to_order', stockMode: 'made_to_order', madeToOrderDays: 5, paperStock: '250gsm Canson blush + sage', cricutCompatible: true, isFeatured: true, weightGrams: 450 },
    { title: 'Banksia Armature — Large', slug: 'banksia-armature-large', description: 'Sculptural banksia on wire armature, 45cm. Each piece unique — armature art workshop technique.', price: 195, sku: 'KFK-ARM-BANKSIA-L', type: 'physical', stockMode: 'tracked', isFeatured: true, weightGrams: 800 },
    { title: 'Cricut SVG — Wattle Sprig (Digital)', slug: 'cricut-svg-wattle-sprig', description: 'Instant download — layered SVG + PNG for Cricut Maker. Includes 3 sizes + assembly guide PDF. For personal use.', price: 14.95, sku: 'KFK-SVG-WATTLE-01', type: 'digital_template', stockMode: 'digital', cricutCompatible: true, weightGrams: 0 },
    { title: 'Origami Crane Mobile — Pastel', slug: 'origami-crane-mobile-pastel', description: '25 hand-folded cranes on driftwood, pastel palette. Nursery-ready.', price: 65, sku: 'KFK-ORIGAMI-CRANE-MOB', type: 'physical', stockMode: 'tracked', weightGrams: 320 },
    { title: 'Paper Peony — Single Stem (Ivory)', slug: 'paper-peony-ivory-single', description: 'Single peony stem, ivory 220gsm + wire. Perfect for adding to bouquets.', price: 18, sku: 'KFK-PEONY-IVORY-1', type: 'physical', stockMode: 'tracked', weightGrams: 40 },
    { title: 'Workshop Ticket — Cricut Blooms 101 (Perth)', slug: 'workshop-cricut-blooms-101', description: '3hr beginner workshop — Perth Studio. Make a 7-stem bouquet to take home. All materials included. Max 12. Next: see sessions.', price: 135, sku: 'KFK-WS-CRICUT-101', type: 'workshop_ticket', stockMode: 'made_to_order', weightGrams: 0 },
    { title: 'Workshop Ticket — Origami Bouquet Masterclass', slug: 'workshop-origami-bouquet-masterclass', description: '4hr intermediate — folded roses + lilies + assembly. Kit posted if you join online.', price: 165, sku: 'KFK-WS-ORIGAMI-MAST', type: 'workshop_ticket', stockMode: 'made_to_order', weightGrams: 0 },
    { title: 'Everlasting Native Bundle — Table Centre', slug: 'native-bundle-table-centre', description: 'Low centrepiece — paper natives + dried eucalyptus on armature base. 30cm wide.', price: 125, sku: 'KFK-NATIVE-CENTRE-30', type: 'made_to_order', stockMode: 'made_to_order', madeToOrderDays: 7, isFeatured: true, weightGrams: 600 },
  ];
  for (const p of products) {
    const prod = await prisma.product.upsert({ where: { slug: p.slug }, update: {}, create: p });
    // Add placeholder image
    const hasImage = await prisma.productImage.findFirst({ where: { productId: prod.id } });
    if (!hasImage) {
      await prisma.productImage.create({ data: { productId: prod.id, url: `https://picsum.photos/seed/${prod.slug}/800/800`, alt: prod.title, sortOrder: 0 } });
    }
    // Ensure inventory level
    await prisma.inventoryLevel.upsert({
      where: { productId_variantId_locationId: { productId: prod.id, variantId: null, locationId: studio.id } },
      update: {},
      create: { productId: prod.id, variantId: null, locationId: studio.id, onHand: p.stockMode === 'tracked' ? 10 : 0 },
    });
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
  const w1 = await prisma.workshop.upsert({ where: { slug: 'cricut-blooms-101' }, update: {}, create: { title: 'Cricut Blooms 101', slug: 'cricut-blooms-101', description: 'Learn to cut, curl & assemble paper roses with your Cricut Maker. Take home a 7-stem bouquet.', location: 'Perth Studio, WA', price: 135, capacity: 12, durationMinutes: 180, level: 'beginner' } });
  const w2 = await prisma.workshop.upsert({ where: { slug: 'origami-bouquet-masterclass' }, update: {}, create: { title: 'Origami Bouquet Masterclass', slug: 'origami-bouquet-masterclass', description: 'Fold roses, lilies & leaves — assemble a full bouquet. Paper kit included.', location: 'Perth Studio, WA', price: 165, capacity: 10, durationMinutes: 240, level: 'intermediate' } });
  const nextSat = new Date(); nextSat.setDate(nextSat.getDate() + (6 - nextSat.getDay() + 7) % 7); nextSat.setHours(10,0,0,0);
  for (const w of [w1, w2]) {
    const exists = await prisma.workshopSession.findFirst({ where: { workshopId: w.id } });
    if (!exists) {
      await prisma.workshopSession.create({ data: { workshopId: w.id, startsAt: nextSat, endsAt: new Date(nextSat.getTime() + w.durationMinutes * 60000), capacity: w.capacity } });
      const following = new Date(nextSat); following.setDate(following.getDate() + 7);
      await prisma.workshopSession.create({ data: { workshopId: w.id, startsAt: following, endsAt: new Date(following.getTime() + w.durationMinutes * 60000), capacity: w.capacity } });
    }
  }

  // Blog posts
  const posts = [
    { title: '5 Paper Stocks That Make Roses Look Real', slug: 'paper-stocks-for-roses', excerpt: 'Canson, Colorplan & the one we use for Perth humidity — cut settings included.', content: '# 5 Paper Stocks\n\nPerth humidity is no joke. Here is what we use in the studio...', status: 'published', tags: 'cricut,tutorial,paper', publishedAt: new Date() },
    { title: 'Origami Lily — Step-by-Step', slug: 'origami-lily-step-by-step', excerpt: 'Fold a lily in 12 steps — video + crease diagram.', content: '# Origami Lily\n\nYou only need a 15cm square...', status: 'published', tags: 'origami,tutorial', publishedAt: new Date() },
    { title: 'Behind the Armature: Why Wire Matters', slug: 'behind-armature-wire', excerpt: 'From idea to bloom — how armatures give sculptures movement.', content: '# Armature Art\n\nWe start with 1.6mm galvanised wire...', status: 'published', tags: 'armature,process', publishedAt: new Date() },
  ];
  for (const p of posts) await prisma.post.upsert({ where: { slug: p.slug }, update: {}, create: p });

  console.log('Seed complete.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
