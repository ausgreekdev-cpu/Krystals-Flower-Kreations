import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import sharp from 'sharp';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../lib/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { audit } from '../lib/audit.js';
import { upload } from '../middleware/upload.js';
import { putObject, deleteObjectByUrl } from '../services/storage.js';
import { buildVariants, masterDimensions } from '../services/imageVariants.js';

const router = Router();

const paperSchema = z.object({
  name: z.string().min(2).max(100),
  colour: z.string().min(1).max(40),
  colourHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  paperType: z.string().min(1).max(60),
  texture: z.enum(['textured','smooth','pearl','linen','glitter','metallic']).default('textured'),
  weight: z.string().min(1).max(20),
  sku: z.string().regex(/^[A-Za-z0-9._-]+$/).max(64).nullish(),
  stockType: z.string().max(40).nullish(),
  packName: z.string().max(60).nullish(),
  sellable: z.boolean().default(true),
  pricePremiumPerStem: z.number().finite().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  onHand: z.number().finite().min(0).max(1000000).default(0),
  lowThreshold: z.number().finite().min(0).max(1000000).default(5),
}).strict();

// Public — only active papers, sorted, for configurator — optionally filter by template compatibility
router.get('/', asyncHandler(async (req, res) => {
  const templateId = String(req.query.templateId || '').trim();
  const where = { isActive: true };
  if (templateId && ['wattle-sprig','paper-rose','banksia-petal','origami-lily'].includes(templateId)) {
    // empty array = compatible with all; otherwise must contain templateId
    where.OR = [
      { compatibleTemplates: { isEmpty: true } },
      { compatibleTemplates: { has: templateId } },
    ];
  }
  const papers = await prisma.paperStock.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  res.json(papers);
}));

// Admin — all papers
router.get('/all', authenticate, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const papers = await prisma.paperStock.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  res.json(papers);
}));

router.get('/low-stock', authenticate, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const all = await prisma.paperStock.findMany({ orderBy: { name: 'asc' } });
  const low = all.filter(p => Number(p.onHand) <= Number(p.lowThreshold));
  res.json(low);
}));

const bulkSchema = z.object({ papers: z.array(paperSchema).min(1).max(100) }).strict();
router.post('/bulk', authenticate, requireRole('admin','developer','maker','staff'), validate(bulkSchema), asyncHandler(async (req, res) => {
  const { papers } = req.validated;
  const created = [];
  const errors = [];
  for (const [i, data] of papers.entries()) {
    try {
      const paper = await prisma.paperStock.create({ data });
      created.push(paper);
    } catch (e) {
      errors.push({ index: i, name: data.name, error: e.code === 'P2002' ? 'duplicate name' : e.message });
    }
  }
  if (created.length) audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'paper_bulk_create', entityType: 'paper_stock', details: { count: created.length } });
  res.status(created.length ? 201 : 400).json({ created, errors, count: created.length });
}));

// ── CSV import (staff+) ─────────────────────────────────────────────────────
// Accepts the studio intake template ("Colour Name,Image,colourHex,Type,Brand,
// Pack Name,Texture,GSM,Weight LB,SKU,onHand,lowThreshold,sortOrder,isActive,
// To Sell") AND the legacy app export (name,colour,colourHex,paperType,texture,
// weight,pricePremiumPerStem,onHand,lowThreshold,sortOrder,isActive).
// Rows without a colour (the template's option lists) are skipped. Upsert key:
// SKU when present, else the derived name — re-importing a pack updates rows.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  const src = String(text || '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

const boolish = (v, dflt) => {
  const t = String(v ?? '').trim().toLowerCase();
  if (!t) return dflt;
  return ['true', 'yes', 'y', '1', 'x'].includes(t);
};

const importSchema = z.object({ csv: z.string().min(10).max(512000) }).strict();
router.post('/import', authenticate, requireRole('admin','developer','maker','staff'), rateLimit('papers_import', 10, 5), validate(importSchema), asyncHandler(async (req, res) => {
  const rows = parseCsv(req.validated.csv);
  if (rows.length < 2) return res.status(400).json({ error: 'CSV needs a header row and at least one data row', code: 'validation_failed' });
  const hdr = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => { for (const n of names) { const i = hdr.indexOf(n); if (i >= 0) return i; } return -1; };
  const at = (row, ...names) => { const i = col(...names); return i >= 0 ? String(row[i] ?? '').trim() : ''; };
  const isTemplate = col('colour name') >= 0; // studio intake template
  if (!isTemplate && col('name') < 0) return res.status(400).json({ error: "Unrecognised CSV header — expected the intake template ('Colour Name'…) or the app export ('name'…)", code: 'validation_failed' });

  const created = [], updated = [], errors = [];
  let skipped = 0;
  for (const [i, row] of rows.slice(1).entries()) {
    const colour = at(row, 'colour name', 'colour', 'color');
    if (!colour) { skipped++; continue; } // template option lists etc.
    try {
      const gsm = at(row, 'gsm');
      const lb = at(row, 'weight lb', 'weightlb');
      const brand = at(row, 'brand') || at(row, 'papertype');
      const packName = at(row, 'pack name', 'packname');
      const weightRaw = at(row, 'weight');
      const weight = weightRaw || (lb ? (/lb$/i.test(lb) ? lb : `${lb}lb`) : (gsm ? (/gsm$/i.test(gsm) ? gsm : `${gsm}gsm`) : '65lb'));
      const hex = at(row, 'colourhex', 'colorhex');
      const image = at(row, 'image');
      const rowObj = {
        name: isTemplate
          ? [colour, gsm, brand, packName].filter(Boolean).join(' ').trim().slice(0, 100)
          : at(row, 'name'),
        colour: colour.slice(0, 40),
        colourHex: /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : null,
        paperType: (brand || 'Unbranded').slice(0, 60),
        texture: ['textured', 'smooth', 'pearl', 'linen', 'glitter', 'metallic'].includes(at(row, 'texture').toLowerCase()) ? at(row, 'texture').toLowerCase() : 'textured',
        weight: weight.slice(0, 20),
        sku: at(row, 'sku') || null,
        stockType: at(row, 'type', 'stocktype') || null,
        packName: packName || null,
        sellable: boolish(at(row, 'to sell', 'sellable'), true),
        pricePremiumPerStem: Number(at(row, 'pricepremiumperstem') || 0) || 0,
        isActive: boolish(at(row, 'isactive'), true),
        sortOrder: Number(at(row, 'sortorder') || 0) || 0,
        onHand: Number(at(row, 'onhand') || 0) || 0,
        lowThreshold: Number(at(row, 'lowthreshold') || 5) || 5,
        imageUrl: /^(https?:\/\/|\/)/.test(image) ? image.slice(0, 2000) : null,
      };
      const { imageUrl, ...forSchema } = rowObj;
      const data = paperSchema.parse(forSchema);
      const existing = data.sku
        ? await prisma.paperStock.findUnique({ where: { sku: data.sku } })
        : await prisma.paperStock.findFirst({ where: { name: data.name } });
      if (existing) {
        updated.push(await prisma.paperStock.update({ where: { id: existing.id }, data: { ...data, ...(imageUrl ? { imageUrl } : {}) } }));
      } else {
        created.push(await prisma.paperStock.create({ data: { ...data, imageUrl: imageUrl || null } }));
      }
    } catch (e) {
      errors.push({ line: i + 2, colour, error: e.code === 'P2002' ? 'duplicate sku or name' : (e.issues?.[0]?.message || e.message).slice(0, 200) });
    }
  }
  if (created.length || updated.length) {
    audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'paper_import', entityType: 'paper_stock', details: { created: created.length, updated: updated.length, skipped, errors: errors.length } });
  }
  res.status(created.length || updated.length ? 200 : 400).json({ created: created.length, updated: updated.length, skipped, errors, papers: [...created, ...updated] });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0,100);
  const paper = await prisma.paperStock.findUnique({ where: { id } });
  if (!paper) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  // public can see only active, staff can see all
  if (!paper.isActive) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(404).json({ error: 'Not found', code: 'not_found' });
    try { const { verifyToken } = await import('../lib/auth.js'); verifyToken(header.slice(7)); } catch { return res.status(404).json({ error: 'Not found', code: 'not_found' }); }
  }
  res.json(paper);
}));

router.post('/', authenticate, requireRole('admin','developer','maker','staff'), validate(paperSchema), asyncHandler(async (req, res) => {
  const data = req.validated;
  const paper = await prisma.paperStock.create({ data });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'paper_create', entityType: 'paper_stock', entityId: paper.id, details: { name: paper.name, colour: paper.colour } });
  res.status(201).json(paper);
}));

router.patch('/:id', authenticate, requireRole('admin','developer','maker','staff'), validate(paperSchema.partial().strict()), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0,100);
  const data = req.validated;
  if (!Object.keys(data).length) return res.status(400).json({ error: 'No fields', code: 'validation_failed' });
  const paper = await prisma.paperStock.update({ where: { id }, data });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'paper_update', entityType: 'paper_stock', entityId: paper.id, details: { fields: Object.keys(data) } });
  res.json(paper);
}));

router.delete('/:id', authenticate, requireRole('admin','developer'), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0,100);
  const paper = await prisma.paperStock.findUnique({ where: { id } });
  if (!paper) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  if (paper.imageUrl) await deleteObjectByUrl(paper.imageUrl).catch(()=>{});
  if (paper.variants) {
    const urls = [];
    try { const v = typeof paper.variants === 'string' ? JSON.parse(paper.variants) : paper.variants; for (const bucket of Object.values(v)) for (const url of Object.values(bucket)) urls.push(String(url)); } catch {}
    await Promise.all(urls.map((u)=> deleteObjectByUrl(String(u)).catch(()=>{})));
  }
  await prisma.paperStock.delete({ where: { id } });
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'paper_delete', entityType: 'paper_stock', entityId: id, details: { name: paper.name } });
  res.json({ ok: true });
}));

// Image upload — single image per paper, with variants
const imageLimit = rateLimit('paper_image', 60, 5);
router.post('/:id/image', authenticate, requireRole('admin','developer','maker','staff'), imageLimit, upload.single('image'), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0,100);
  const paper = await prisma.paperStock.findUnique({ where: { id } });
  if (!paper) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  if (!req.file) return res.status(400).json({ error: 'No image', code: 'validation_failed' });
  let resized;
  try {
    resized = await sharp(req.file.buffer).rotate().resize(800,800, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  } catch {
    return res.status(400).json({ error: 'Not a readable image', code: 'invalid_image' });
  }
  // delete old
  if (paper.imageUrl) await deleteObjectByUrl(paper.imageUrl).catch(()=>{});
  if (paper.variants) {
    try { const v = typeof paper.variants === 'string' ? JSON.parse(paper.variants) : paper.variants; const urls=[]; for(const b of Object.values(v)) for(const u of Object.values(b)) urls.push(String(u)); await Promise.all(urls.map((u)=> deleteObjectByUrl(String(u)).catch(()=>{}))); } catch {}
  }
  const base = `papers/${id}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  let built = [];
  try { built = await buildVariants(resized); } catch (e) { console.warn(JSON.stringify({ level: 'warn', msg: 'paper variant encode failed', err: e?.message })); }
  const uploads = [
    { key: `${base}.jpg`, buf: resized, contentType: 'image/jpeg' },
    ...built.map((v) => ({ key: `${base}-${v.width}.${v.ext}`, buf: v.buf, contentType: v.contentType })),
  ];
  const urls = [];
  for (const u of uploads) urls.push(await putObject(u.key, u.buf, u.contentType));
  const [imageUrl, ...variantUrls] = urls;
  let variants = null;
  if (built.length) {
    variants = {};
    built.forEach((v, i) => { variants[v.ext] = { ...(variants[v.ext] || {}), [String(v.width)]: variantUrls[i] }; });
  }
  const { width, height } = await masterDimensions(resized).catch(() => ({ width: null, height: null }));
  const updated = await prisma.paperStock.update({ where: { id }, data: { imageUrl, variants, width, height } });
  // Also save to backend gallery (Media library) so it can be attached to products/materials/papers
  try {
    const sha256 = crypto.createHash('sha256').update(resized).digest('hex');
    const existing = await prisma.mediaAsset.findFirst({ where: { sha256, visibility: 'LIBRARY', deletedAt: null } });
    if (!existing) {
      const assetId = crypto.randomUUID();
      // Re-use the same bytes already uploaded to product-images? No — gallery uses `media` bucket, so store a copy there too
      const galleryBase = `library/${assetId}-${Date.now().toString(36)}`;
      const galleryKey = `${galleryBase}.jpg`;
      const galleryUrl = await putObject(galleryKey, resized, 'image/jpeg', { bucket: 'media' });
      let galleryVariants = null;
      if (built.length) {
        const vals = [];
        for (const v of built) vals.push(await putObject(`${galleryBase}-${v.width}.${v.ext}`, v.buf, v.contentType, { bucket: 'media' }));
        galleryVariants = {};
        built.forEach((v, i) => { galleryVariants[v.ext] = { ...(galleryVariants[v.ext] || {}), [String(v.width)]: vals[i] }; });
      }
      const galleryAsset = await prisma.mediaAsset.create({
        data: {
          id: assetId,
          title: updated.name || 'Paper image',
          altText: updated.name,
          mime: 'image/jpeg',
          sizeBytes: resized.length,
          storageRef: `media/${galleryKey}`,
          publicUrl: galleryUrl,
          sha256,
          width, height,
          variants: galleryVariants,
          visibility: 'LIBRARY',
          source: 'UPLOAD',
          tags: ['paper', updated.colour || ''].filter(Boolean),
          uploadedById: req.user.id,
        },
      });
      await prisma.mediaAttachment.create({ data: { assetId: galleryAsset.id, attachableType: 'PAPER_STOCK', attachableId: id, role: 'gallery' } });
    } else {
      await prisma.mediaAttachment.upsert({
        where: { assetId_attachableType_attachableId_role: { assetId: existing.id, attachableType: 'PAPER_STOCK', attachableId: id, role: 'gallery' } },
        update: {},
        create: { assetId: existing.id, attachableType: 'PAPER_STOCK', attachableId: id, role: 'gallery' },
      });
    }
  } catch (e) {
    console.warn(JSON.stringify({ level: 'warn', msg: 'paper gallery save failed', err: e?.message }));
  }
  audit({ actorId: req.user.id, actorEmail: req.user.email, action: 'paper_image_upload', entityType: 'paper_stock', entityId: id, details: { imageUrl } });
  res.json(updated);
}));

router.delete('/:id/image', authenticate, requireRole('admin','developer','maker','staff'), asyncHandler(async (req, res) => {
  const id = String(req.params.id).slice(0,100);
  const paper = await prisma.paperStock.findUnique({ where: { id } });
  if (!paper) return res.status(404).json({ error: 'Not found', code: 'not_found' });
  if (paper.imageUrl) await deleteObjectByUrl(paper.imageUrl).catch(()=>{});
  if (paper.variants) {
    try { const v = typeof paper.variants === 'string' ? JSON.parse(paper.variants) : paper.variants; const urls=[]; for(const b of Object.values(v)) for(const u of Object.values(b)) urls.push(String(u)); await Promise.all(urls.map((u)=> deleteObjectByUrl(String(u)).catch(()=>{}))); } catch {}
  }
  const updated = await prisma.paperStock.update({ where: { id }, data: { imageUrl: null, variants: null, width: null, height: null } });
  res.json(updated);
}));

export default router;
