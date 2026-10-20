import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import sharp from 'sharp';
import * as XLSX from 'xlsx';
import prisma from '../src/lib/prisma.js';
import { deleteObjectByUrl } from '../src/services/storage.js';
import { __setOcrRecognize, prepareForOcr, collectWords } from '../src/services/ocr.js';
import { startServer, api } from './helpers.js';

// Smart document upload centre (M1–M4): private-bucket storage, sha256 dedup,
// authed download, metadata edits, soft-delete that removes the bytes — plus
// the two pre-existing upload bugs fixed in M1 (procedure media one-file-per-
// request works and soft-deleting a procedure cleans storage). M2 adds
// filename auto-categorisation, text extraction + content search, and 160px
// webp thumbnails. M3 extends extraction to PDF full-text (unpdf) and
// XLSX/XLS rows (SheetJS). M4 adds on-demand OCR (tesseract.js) for images —
// the engine is stubbed here so tests never touch the network.
let srv;
let adminToken;

const auth = () => ({ Authorization: `Bearer ${adminToken}` });
const UNIQUE = Date.now().toString(36);
const CSV = `sku,name,qty\nPL-001,Park Lane Cardstock,120\n# m1test ${UNIQUE}\n`;
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';

async function uploadFile(content, name, type) {
  const fd = new FormData();
  fd.append('file', new Blob([content], { type }), name);
  const res = await fetch(`${srv.base}/api/documents`, { method: 'POST', headers: auth(), body: fd });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// Minimal single-page PDF with a correct xref (pdf.js-repairable hand-rolled
// PDFs are flaky; computing real offsets is deterministic). Latin-1 text only.
function makePdf(text) {
  const stream = `BT /F1 12 Tf 20 150 Td (${text}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

function makeXlsx(rows, sheetName = 'Stocktake') {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function purgeDocs() {
  const stale = await prisma.businessDocument.findMany({ where: { OR: [
    { originalName: { contains: 'm1test' } }, { originalName: { contains: UNIQUE } },
  ] } });
  for (const d of stale) {
    await deleteObjectByUrl(d.storageRef).catch(() => {});
    if (d.thumbRef) await deleteObjectByUrl(d.thumbRef).catch(() => {});
  }
  if (stale.length) await prisma.businessDocument.deleteMany({ where: { id: { in: stale.map((d) => d.id) } } });
}

async function purgeProcedures() {
  const stale = await prisma.procedureDocument.findMany({ where: { title: 'M1 Test Proc' }, include: { media: true } });
  for (const p of stale) for (const m of p.media) await deleteObjectByUrl(m.url).catch(() => {});
  if (stale.length) await prisma.procedureDocument.deleteMany({ where: { id: { in: stale.map((p) => p.id) } } });
}

before(async () => {
  srv = await startServer();
  globalThis.__m4OcrCalls = 0;
  __setOcrRecognize(async () => {
    globalThis.__m4OcrCalls += 1;
    return {
      text: `Stub scan body m4token-${UNIQUE}`,
      confidence: 88,
      width: 1200, height: 800,
      words: [
        { text: 'Stub', confidence: 95, bbox: { x0: 10, y0: 20, x1: 90, y1: 55 } },
        { text: 'scan', confidence: 41, bbox: { x0: 100, y0: 20, x1: 170, y1: 55 } },
        { text: 'garbage', confidence: 5, bbox: { x0: 180, y0: 20, x1: 260, y1: 55 } },
      ],
    };
  });
  const login = await api(srv.base, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@krystal.local', password: 'admin123' }),
  });
  assert.equal(login.status, 200, 'seeded developer login');
  adminToken = login.body.token;
  await purgeDocs();
  await purgeProcedures();
});

after(async () => {
  __setOcrRecognize(null);
  await purgeDocs();
  await purgeProcedures();
  await srv.close();
});

test('POST /api/documents stores a CSV in the private bucket', async () => {
  const { status, body } = await uploadFile(CSV, `m1test-basic-${UNIQUE}.csv`, 'text/csv');
  assert.equal(status, 201, JSON.stringify(body).slice(0, 300));
  assert.equal(body.deduped, false);
  const doc = body.document;
  assert.ok(doc.storageRef.startsWith('business-documents/'), `private ref, got ${doc.storageRef}`);
  assert.ok(!doc.storageRef.startsWith('http'), 'never a public URL');
  assert.equal(doc.kind, 'CSV');
  assert.equal(doc.category, 'OTHER');
  assert.match(doc.sha256, /^[0-9a-f]{64}$/);
  assert.equal(doc.title, `m1test-basic-${UNIQUE}`);
  globalThis.__m1DocId = doc.id;
});

test('identical bytes are deduped — same row, no second object', async () => {
  const { status, body } = await uploadFile(CSV, `m1test-basic-${UNIQUE}.csv`, 'text/csv');
  assert.equal(status, 200, `dedup returns 200, got ${status}`);
  assert.equal(body.deduped, true);
  assert.equal(body.document.id, globalThis.__m1DocId, 'returns the existing row');
  const count = await prisma.businessDocument.count({ where: { sha256: body.document.sha256, deletedAt: null } });
  assert.equal(count, 1, 'only one row per unique byte stream');
});

test('list requires auth and finds the doc via search + filters', async () => {
  const noAuth = await fetch(`${srv.base}/api/documents`);
  assert.equal(noAuth.status, 401);

  const res = await api(srv.base, `/api/documents?q=m1test-basic&kind=CSV`, { headers: auth() });
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 200));
  assert.ok(res.body.documents.some((d) => d.id === globalThis.__m1DocId), 'search finds the upload');
  assert.equal(typeof res.body.total, 'number');
  assert.ok(res.body.documents.every((d) => d.kind === 'CSV'), 'kind filter applied');

  const miss = await api(srv.base, `/api/documents?q=no-such-doc-${UNIQUE}`, { headers: auth() });
  assert.equal(miss.body.documents.length, 0);
});

test('download requires auth and serves the exact bytes', async () => {
  const noAuth = await fetch(`${srv.base}/api/documents/${globalThis.__m1DocId}/file`);
  assert.equal(noAuth.status, 401);

  const res = await fetch(`${srv.base}/api/documents/${globalThis.__m1DocId}/file`, { headers: auth() });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition') || '', /attachment/);
  assert.match(res.headers.get('content-disposition') || '', /m1test-basic/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(await res.text(), CSV, 'round-trips the original CSV bytes');
});

test('PATCH updates title, category and tags; invalid category is rejected', async () => {
  const bad = await api(srv.base, `/api/documents/${globalThis.__m1DocId}`, {
    method: 'PATCH', headers: auth(),
    body: JSON.stringify({ category: 'NOT_A_CATEGORY' }),
  });
  assert.equal(bad.status, 400);

  const ok = await api(srv.base, `/api/documents/${globalThis.__m1DocId}`, {
    method: 'PATCH', headers: auth(),
    body: JSON.stringify({ title: 'Park Lane Stocktake (m1test)', category: 'STOCKTAKE', tags: ['Stocktake', 'park-lane', 'stocktake'] }),
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.body).slice(0, 200));
  assert.equal(ok.body.title, 'Park Lane Stocktake (m1test)');
  assert.equal(ok.body.category, 'STOCKTAKE');
  assert.deepEqual(ok.body.tags, ['stocktake', 'park-lane'], 'lowercased + deduped');
});

test('rejects a fake PDF and accepts a real-looking xlsx as SPREADSHEET', async () => {
  const fake = await uploadFile('MZ-this is not a pdf', `m1test-fake-${UNIQUE}.pdf`, 'application/pdf');
  assert.equal(fake.status, 415);

  const pk = Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.from(`m1test xlsx ${UNIQUE}`.repeat(8))]);
  const sheet = await uploadFile(pk, `m1test-sheet-${UNIQUE}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(sheet.status, 201, JSON.stringify(sheet.body).slice(0, 200));
  assert.equal(sheet.body.document.kind, 'SPREADSHEET');
  globalThis.__m1SheetId = sheet.body.document.id;
});

test('DELETE soft-deletes and removes the stored bytes', async () => {
  const doc = await prisma.businessDocument.findUnique({ where: { id: globalThis.__m1DocId } });
  assert.ok(doc, 'row exists before delete');

  const del = await api(srv.base, `/api/documents/${globalThis.__m1DocId}`, { method: 'DELETE', headers: auth() });
  assert.equal(del.status, 200);

  assert.equal((await api(srv.base, `/api/documents/${globalThis.__m1DocId}`, { headers: auth() })).status, 404);
  assert.equal((await fetch(`${srv.base}/api/documents/${globalThis.__m1DocId}/file`, { headers: auth() })).status, 404);
  const list = await api(srv.base, '/api/documents?q=m1test-basic', { headers: auth() });
  assert.ok(!list.body.documents.some((d) => d.id === globalThis.__m1DocId), 'gone from the list');

  if (doc.storageRef.startsWith('business-documents/')) {
    // local driver (tests never set SUPABASE_*): private bytes live under backend/uploads-private
    const key = doc.storageRef.slice('business-documents/'.length);
    assert.equal(fs.existsSync(`uploads-private/${key}`), false, `bytes removed from uploads-private/${key}`);
  }
});

test('procedure soft-delete now cleans media rows and storage objects', async () => {
  const created = await api(srv.base, '/api/procedures', {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ title: 'M1 Test Proc', category: 'PAPER_FLOWER', contentMarkdown: '# m1', status: 'draft' }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body).slice(0, 200));
  const procId = created.body.id;

  const fd = new FormData();
  fd.append('files', new Blob([SVG], { type: 'image/svg+xml' }), 'm1test.svg');
  const up = await fetch(`${srv.base}/api/procedures/${procId}/media`, { method: 'POST', headers: auth(), body: fd });
  assert.equal(up.status, 201, await up.clone().text().catch(() => ''));
  const media = await prisma.documentMedia.findMany({ where: { documentId: procId } });
  assert.equal(media.length, 1);
  const url = media[0].url;

  const del = await api(srv.base, `/api/procedures/${procId}`, { method: 'DELETE', headers: auth() });
  assert.equal(del.status, 200, JSON.stringify(del.body).slice(0, 200));

  assert.equal(await prisma.documentMedia.count({ where: { documentId: procId } }), 0, 'media rows removed');
  if (url.startsWith('/uploads/')) {
    assert.equal(fs.existsSync(`uploads/${url.slice('/uploads/'.length)}`), false, 'media object removed from disk');
  }
});

// ── M2: auto-categorise, extraction + content search, thumbnails ────────────

test('filename auto-categorises (stocktake keyword wins over generic csv)', async () => {
  const { status, body } = await uploadFile(`sku,name,qty\nX-${UNIQUE},Widget,1\n`, `M1 Stocktake ${UNIQUE}.csv`, 'text/csv');
  assert.equal(status, 201, JSON.stringify(body).slice(0, 200));
  assert.equal(body.document.category, 'STOCKTAKE');
});

test('CSV text is extracted and q finds the doc by content', async () => {
  const token = `zebra-${UNIQUE}`;
  const csv = `sku,name,qty\nZL-1,Paper ${token},42\n`;
  globalThis.__m2ExtractCsv = csv;
  const { status, body } = await uploadFile(csv, `export-${UNIQUE}.csv`, 'text/csv');
  assert.equal(status, 201, JSON.stringify(body).slice(0, 200));
  const id = body.document.id;
  globalThis.__m2ExtractId = id;
  assert.equal(body.document.category, 'EXPORT', 'export keyword auto-categorised');

  const det = await api(srv.base, `/api/documents/${id}`, { headers: auth() });
  assert.ok(det.body.extractedText?.includes(token), 'extractedText populated');

  const list = await api(srv.base, `/api/documents?q=${token}`, { headers: auth() });
  assert.ok(list.body.documents.some((d) => d.id === id), 'content search hits');
});

test('markdown is extracted + auto-categorised; images get a webp thumbnail', async () => {
  const mdToken = `owl-${UNIQUE}`;
  const md = await uploadFile(`# Guide\n\nUnique phrase ${mdToken} here.\n`, `procedure-${UNIQUE}.md`, 'text/markdown');
  assert.equal(md.status, 201, JSON.stringify(md.body).slice(0, 200));
  assert.equal(md.body.document.kind, 'MARKDOWN');
  assert.equal(md.body.document.category, 'PROCEDURE', 'procedure keyword auto-categorised');
  assert.ok(md.body.document.extractedText?.includes(mdToken), 'markdown extracted');

  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 200, g: 40, b: 90 } } }).png().toBuffer();
  const img = await uploadFile(png, `scan-${UNIQUE}.png`, 'image/png');
  assert.equal(img.status, 201, JSON.stringify(img.body).slice(0, 200));
  assert.equal(img.body.document.category, 'MEDIA', 'scan keyword → MEDIA');
  assert.equal(img.body.document.kind, 'IMAGE');
  assert.ok(img.body.document.thumbRef?.startsWith('business-documents/docs/'), `thumbRef, got ${img.body.document.thumbRef}`);
  globalThis.__m2ImgId = img.body.document.id;

  const thumb = await fetch(`${srv.base}/api/documents/${globalThis.__m2ImgId}/thumb`, { headers: auth() });
  assert.equal(thumb.status, 200);
  assert.equal(thumb.headers.get('content-type'), 'image/webp');
  assert.equal(thumb.headers.get('x-content-type-options'), 'nosniff');
  const bytes = Buffer.from(await thumb.arrayBuffer());
  assert.ok(bytes.length > 12 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP', 'valid webp bytes');

  const anon = await fetch(`${srv.base}/api/documents/${globalThis.__m2ImgId}/thumb`);
  assert.equal(anon.status, 401, 'thumb requires auth');
});

test('non-image docs have no thumbnail — thumb endpoint 404s', async () => {
  const res = await fetch(`${srv.base}/api/documents/${globalThis.__m2ExtractId}/thumb`, { headers: auth() });
  assert.equal(res.status, 404);
});

test('dedup hit backfills extractedText for pre-M2 rows', async () => {
  await prisma.businessDocument.update({ where: { id: globalThis.__m2ExtractId }, data: { extractedText: null } });
  const { status, body } = await uploadFile(globalThis.__m2ExtractCsv, `export-${UNIQUE}.csv`, 'text/csv');
  assert.equal(status, 200);
  assert.equal(body.deduped, true);
  assert.ok(body.document.extractedText?.includes(`zebra-${UNIQUE}`), 'extractedText backfilled on dedup');
});

test('deleting an image also removes its thumbnail bytes', async () => {
  const doc = await prisma.businessDocument.findUnique({ where: { id: globalThis.__m2ImgId } });
  assert.ok(doc?.thumbRef, 'image row has thumbRef');
  const del = await api(srv.base, `/api/documents/${globalThis.__m2ImgId}`, { method: 'DELETE', headers: auth() });
  assert.equal(del.status, 200);
  const key = doc.thumbRef.slice('business-documents/'.length);
  assert.equal(fs.existsSync(`uploads-private/${key}`), false, `thumb bytes removed from uploads-private/${key}`);
});

// ── M3: PDF full-text (unpdf) + XLSX rows (SheetJS) ─────────────────────────

test('PDF full-text is extracted, auto-categorised and content-searchable', async () => {
  const token = `pelican-${UNIQUE}`;
  const pdf = makePdf(`Invoice body with ${token} and line items`);
  const { status, body } = await uploadFile(pdf, `invoice-m3-${UNIQUE}.pdf`, 'application/pdf');
  assert.equal(status, 201, JSON.stringify(body).slice(0, 200));
  const id = body.document.id;
  assert.equal(body.document.kind, 'PDF');
  assert.equal(body.document.category, 'INVOICE', 'invoice keyword auto-categorised');
  assert.ok(body.document.extractedText?.includes(token), `pdf text extracted, got: ${JSON.stringify(body.document.extractedText)?.slice(0, 120)}`);

  const list = await api(srv.base, `/api/documents?q=${token}`, { headers: auth() });
  assert.ok(list.body.documents.some((d) => d.id === id), 'content search hits the pdf');
  globalThis.__m3PdfId = id;
  globalThis.__m3PdfBytes = pdf;
});

test('PDF with no text layer uploads with extractedText null', async () => {
  const { status, body } = await uploadFile(makePdf(''), `m3-empty-${UNIQUE}.pdf`, 'application/pdf');
  assert.equal(status, 201, JSON.stringify(body).slice(0, 200));
  assert.equal(body.document.extractedText, null, 'no text layer → null (M4 OCR territory)');
});

test('XLSX rows are extracted as csv-ish text and content-searchable', async () => {
  const token = `kakapo-${UNIQUE}`;
  const buf = makeXlsx([
    ['sku', 'name', 'qty'],
    ['PL-77', `Park Lane card ${token}`, 120],
    ['RS-12', 'Rose sheet blush', 44],
  ]);
  const { status, body } = await uploadFile(buf, `stocktake-m3-${UNIQUE}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(status, 201, JSON.stringify(body).slice(0, 200));
  const id = body.document.id;
  assert.equal(body.document.kind, 'SPREADSHEET');
  assert.equal(body.document.category, 'STOCKTAKE', 'stocktake keyword auto-categorised');
  assert.ok(body.document.extractedText?.includes(token), `cell text extracted, got: ${JSON.stringify(body.document.extractedText)?.slice(0, 160)}`);
  assert.ok(body.document.extractedText?.includes('# Stocktake'), 'sheet name prefixed');

  const list = await api(srv.base, `/api/documents?q=${token}`, { headers: auth() });
  assert.ok(list.body.documents.some((d) => d.id === id), 'content search hits the xlsx');
  globalThis.__m3XlsxId = id;
});

test('dedup hit backfills extractedText for a pre-M3 PDF row', async () => {
  await prisma.businessDocument.update({ where: { id: globalThis.__m3PdfId }, data: { extractedText: null } });
  const { status, body } = await uploadFile(globalThis.__m3PdfBytes, `invoice-m3-${UNIQUE}.pdf`, 'application/pdf');
  assert.equal(status, 200);
  assert.equal(body.deduped, true);
  assert.ok(body.document.extractedText?.includes(`pelican-${UNIQUE}`), 'pdf text backfilled on dedup');
});

// ── M4: on-demand OCR (stubbed tesseract engine — no network in tests) ──────

test('OCR extracts text from an image and makes it content-searchable', async () => {
  const png = await sharp({ create: { width: 60, height: 30, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
  const before = globalThis.__m4OcrCalls;
  const up = await uploadFile(png, `m4scan-${UNIQUE}.png`, 'image/png');
  assert.equal(up.status, 201, JSON.stringify(up.body).slice(0, 200));
  const id = up.body.document.id;
  globalThis.__m4ImgId = id;
  // S1: images are auto-OCR'd on upload — text and word boxes land inline
  assert.ok(up.body.document.extractedText?.includes(`m4token-${UNIQUE}`), 'auto-OCR on upload');
  assert.equal(globalThis.__m4OcrCalls, before + 1, 'engine invoked once during upload');
  assert.ok(up.body.document.ocrWords?.pages?.[0]?.words?.length, 'word boxes captured on upload');

  const res = await api(srv.base, `/api/documents/${id}/ocr?force=1`, { method: 'POST', headers: auth() });
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 200));
  assert.equal(globalThis.__m4OcrCalls, before + 2, 'engine invoked again on re-run');
  assert.ok(res.body.document.extractedText?.includes(`m4token-${UNIQUE}`), 'text stored');
  assert.equal(res.body.ocr.confidence, 88);
  assert.ok(res.body.ocr.chars > 0);

  const list = await api(srv.base, `/api/documents?q=m4token-${UNIQUE}`, { headers: auth() });
  assert.ok(list.body.documents.some((d) => d.id === id), 'ocr text is searchable');
});

test('OCR requires auth, refuses non-image/pdf, and 409s when text exists (force re-runs)', async () => {
  const id = globalThis.__m4ImgId;
  assert.equal((await fetch(`${srv.base}/api/documents/${id}/ocr`, { method: 'POST' })).status, 401);

  const csvDoc = await api(srv.base, `/api/documents/${globalThis.__m2ExtractId}`, { headers: auth() });
  assert.ok(csvDoc.body, 'csv doc still active');
  const wrong = await api(srv.base, `/api/documents/${globalThis.__m2ExtractId}/ocr`, { method: 'POST', headers: auth() });
  assert.equal(wrong.status, 415);

  const again = await api(srv.base, `/api/documents/${id}/ocr`, { method: 'POST', headers: auth() });
  assert.equal(again.status, 409, 'already has text');

  const before = globalThis.__m4OcrCalls;
  const forced = await api(srv.base, `/api/documents/${id}/ocr?force=1`, { method: 'POST', headers: auth() });
  assert.equal(forced.status, 200, JSON.stringify(forced.body).slice(0, 200));
  assert.equal(globalThis.__m4OcrCalls, before + 1, 'force re-invokes the engine');
});

test('text-less PDF OCR returns 422 guidance; SVG is refused', async () => {
  // single-space content stream: distinct bytes from the M3 empty-pdf fixture,
  // and unpdf yields only whitespace → clip() → null (still "no text layer")
  const pdf = await uploadFile(makePdf(' '), `m4empty-${UNIQUE}.pdf`, 'application/pdf');
  assert.equal(pdf.status, 201, JSON.stringify(pdf.body).slice(0, 200));
  const pdfOcr = await api(srv.base, `/api/documents/${pdf.body.document.id}/ocr`, { method: 'POST', headers: auth() });
  assert.equal(pdfOcr.status, 422);
  assert.match(pdfOcr.body.error, /no text layer/i);

  const svg = await uploadFile('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>', `m4vec-${UNIQUE}.svg`, 'image/svg+xml');
  assert.equal(svg.status, 201, JSON.stringify(svg.body).slice(0, 200));
  const svgOcr = await api(srv.base, `/api/documents/${svg.body.document.id}/ocr`, { method: 'POST', headers: auth() });
  assert.equal(svgOcr.status, 415);
  assert.match(svgOcr.body.error, /SVG/i);
});

// ── Phase D: OCR drawer + batch groundwork ─────────────────────────────────

test('extractedText is editable via PATCH (OCR drawer save)', async () => {
  const csv = await uploadFile(`a,b\n1,2\n# drawer ${UNIQUE}\n`, `m5drawer-${UNIQUE}.csv`, 'text/csv');
  assert.equal(csv.status, 201, JSON.stringify(csv.body).slice(0, 200));
  const id = csv.body.document.id;

  const saved = await api(srv.base, `/api/documents/${id}`, {
    method: 'PATCH', headers: auth(),
    body: JSON.stringify({ extractedText: `Edited by the OCR drawer ${UNIQUE}` }),
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body).slice(0, 200));
  assert.equal(saved.body.extractedText, `Edited by the OCR drawer ${UNIQUE}`);

  const read = await api(srv.base, `/api/documents/${id}`, { headers: auth() });
  assert.equal(read.body.extractedText, `Edited by the OCR drawer ${UNIQUE}`);

  // clearing works (nullable)
  const cleared = await api(srv.base, `/api/documents/${id}`, {
    method: 'PATCH', headers: auth(), body: JSON.stringify({ extractedText: null }),
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.extractedText, null);
});

test('OCR persists confidence + timestamp and list rows carry hasText', async () => {
  const png = await sharp({ create: { width: 220, height: 120, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
  const up = await uploadFile(png, `m5ocr-${UNIQUE}.png`, 'image/png');
  assert.equal(up.status, 201, JSON.stringify(up.body).slice(0, 200));
  const id = up.body.document.id;

  const before = await api(srv.base, '/api/documents?kind=IMAGE&limit=50', { headers: auth() });
  const beforeRow = before.body.documents.find((d) => d.id === id);
  // images are auto-OCR'd on upload (S1), so the row already carries text
  assert.equal(beforeRow.hasText, true, 'uploaded image is auto-OCRd');

  // the row already carries auto-OCR text, so a re-run needs force
  const ocr = await api(srv.base, `/api/documents/${id}/ocr?force=1`, { method: 'POST', headers: auth() });
  assert.equal(ocr.status, 200, JSON.stringify(ocr.body).slice(0, 200));
  assert.equal(ocr.body.ocr.confidence, 88);
  assert.ok(ocr.body.document.ocrAt, 'ocrAt persisted');
  assert.equal(ocr.body.document.ocrConfidence, 88);

  const after = await api(srv.base, '/api/documents?kind=IMAGE&limit=50', { headers: auth() });
  const afterRow = after.body.documents.find((d) => d.id === id);
  assert.equal(afterRow.hasText, true, 'list rows flag extracted text');
  assert.equal(afterRow.extractedText, undefined, 'list rows do not ship the text body');
});

// ── Phase E: OCR preprocessing pipeline ────────────────────────────────────

test('prepareForOcr trims borders, grayscales and upscales small scans', async () => {
  // 400x300 white page with a small black block inside — borders must go.
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="white"/><rect x="120" y="100" width="160" height="100" fill="black"/></svg>';
  const small = await sharp(Buffer.from(svg)).png().toBuffer();
  const out = await prepareForOcr(small);
  const meta = await sharp(out).metadata();
  assert.ok(meta.width > 300, `tiny input upscaled, got ${meta.width}px wide`);
  assert.ok(out.length > 0);

  // grayscale output (tesseract prefers single-channel)
  const grayMeta = await sharp(out).metadata();
  assert.ok(grayMeta.channels === 1 || grayMeta.space === 'b-w', `grayscale output, got ${grayMeta.channels} channels / ${grayMeta.space}`);

  // busy photo-like input survives the pipeline untouched in spirit
  const photo = await sharp({ create: { width: 900, height: 700, channels: 3, background: { r: 120, g: 80, b: 40 } } }).png().toBuffer();
  const out2 = await prepareForOcr(photo);
  const meta2 = await sharp(out2).metadata();
  assert.ok(meta2.width > 0 && meta2.height > 0, 'photo path returns a readable image');
});

test('prepareForOcr never throws on garbage bytes', async () => {
  const out = await prepareForOcr(Buffer.from('not-an-image'));
  assert.ok(Buffer.isBuffer(out), 'falls back to the original buffer');
});

// ── Exact-duplicate inspection (ask/replace/keep_new/skip) ─────────────────

test('duplicate uploads: ask/replace/keep_new/skip semantics', async () => {
  const bytes = `exact dup body ${UNIQUE}`;
  const first = await uploadFile(bytes, `dupA-${UNIQUE}.txt`, 'text/plain');
  assert.equal(first.status, 201, JSON.stringify(first.body).slice(0, 200));
  const firstId = first.body.document.id;

  const uploadWith = (name, onDuplicate) => {
    const fd = new FormData();
    fd.append('file', new Blob([bytes], { type: 'text/plain' }), name);
    fd.append('on_duplicate', onDuplicate);
    return fetch(`${srv.base}/api/documents`, { method: 'POST', headers: auth(), body: fd }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  };

  // ask → 409 with both sides, nothing stored
  const ask = await uploadWith(`dupAsk-${UNIQUE}.txt`, 'ask');
  assert.equal(ask.status, 409, JSON.stringify(ask.body).slice(0, 200));
  assert.equal(ask.body.code, 'duplicate');
  assert.equal(ask.body.existing.id, firstId);
  assert.equal(ask.body.incoming.originalName, `dupAsk-${UNIQUE}.txt`);

  // replace → same row, incoming identity wins
  const rep = await uploadWith(`dupReplaced-${UNIQUE}.txt`, 'replace');
  assert.equal(rep.status, 200, JSON.stringify(rep.body).slice(0, 200));
  assert.equal(rep.body.replaced, true);
  assert.equal(rep.body.document.id, firstId);
  assert.equal(rep.body.document.originalName, `dupReplaced-${UNIQUE}.txt`);

  // skip → incoming discarded
  const skip = await uploadWith(`dupSkip-${UNIQUE}.txt`, 'skip');
  assert.equal(skip.status, 200);
  assert.equal(skip.body.skipped, true);
  assert.equal(skip.body.document.id, firstId);

  // keep_new → old row retired, fresh row stored
  const keep = await uploadWith(`dupFresh-${UNIQUE}.txt`, 'keep_new');
  assert.equal(keep.status, 201, JSON.stringify(keep.body).slice(0, 200));
  assert.notEqual(keep.body.document.id, firstId);
  const oldRow = await prisma.businessDocument.findUnique({ where: { id: firstId } });
  assert.ok(oldRow.deletedAt, 'old row retired (soft-deleted)');

  // invalid value → 400
  const bad = await uploadWith(`dupBad-${UNIQUE}.txt`, 'bogus');
  assert.equal(bad.status, 400);
});

// ── S1: word boxes + auto-OCR on image upload ──────────────────────────────

test('auto-OCR on image upload stores text, confidence and word boxes', async () => {
  const before = globalThis.__m4OcrCalls;
  const png = await sharp({ create: { width: 400, height: 260, channels: 3, background: { r: 240, g: 240, b: 240 } } }).png().toBuffer();
  const up = await uploadFile(png, `auto-ocr-${UNIQUE}.png`, 'image/png');
  assert.equal(up.status, 201, JSON.stringify(up.body).slice(0, 200));
  assert.ok(globalThis.__m4OcrCalls > before, 'OCR ran during upload');
  const doc = up.body.document;
  assert.match(doc.extractedText || '', /Stub scan body/, `text extracted: ${doc.extractedText}`);
  assert.equal(doc.ocrConfidence, 88);
  assert.ok(doc.ocrAt, 'ocrAt stamped');
  assert.ok(doc.ocrWords?.pages?.length === 1, 'one page of words');
  const words = doc.ocrWords.pages[0].words;
  assert.equal(words.length, 2, 'low-confidence junk (<20%) dropped');
  assert.equal(words[1].t, 'scan');
  assert.equal(words[1].c, 41);
  assert.equal(words[1].x0, 100);
  assert.equal(doc.ocrWords.pages[0].w, 1200);
  assert.equal(doc.ocrWords.pages[0].h, 800);
});

test('non-image uploads are not auto-OCRd', async () => {
  const before = globalThis.__m4OcrCalls;
  const up = await uploadFile(`plain text ${UNIQUE}`, `plain-${UNIQUE}.txt`, 'text/plain');
  assert.equal(up.status, 201);
  assert.equal(globalThis.__m4OcrCalls, before, 'no OCR for text docs');
  assert.equal(up.body.document.ocrWords, null);
});

test('OCR endpoint persists word boxes on the record', async () => {
  const png = await sharp({ create: { width: 300, height: 200, channels: 3, background: { r: 250, g: 250, b: 250 } } }).png().toBuffer();
  const up = await uploadFile(png, `words-${UNIQUE}.png`, 'image/png');
  assert.equal(up.status, 201);
  const id = up.body.document.id;
  const forced = await api(srv.base, `/api/documents/${id}/ocr?force=1`, { method: 'POST', headers: auth() });
  assert.equal(forced.status, 200, JSON.stringify(forced.body).slice(0, 200));
  assert.ok(forced.body.document.ocrWords?.pages?.[0]?.words?.length, 'words persisted on re-run');
  assert.equal(forced.body.document.ocrWords.pages[0].words[0].t, 'Stub');
});

// tesseract.js v7 dropped the top-level data.words — words live under
// blocks → paragraphs → lines → words. Lock that shape so the extractor keeps
// working when the engine is upgraded.
test('collectWords flattens the tesseract v7 block tree', () => {
  const words = collectWords([
    { paragraphs: [{ lines: [{ words: [{ text: 'INVOICE', confidence: 94, bbox: { x0: 1, y0: 2, x1: 3, y1: 4 } }] }] }] },
    { paragraphs: [{ lines: [{ words: [{ text: '4821', confidence: 40, bbox: { x0: 5, y0: 6, x1: 7, y1: 8 } }] }] }] },
  ]);
  assert.equal(words.length, 2);
  assert.equal(words[0].text, 'INVOICE');
  assert.equal(words[1].confidence, 40);
  assert.equal(collectWords(null).length, 0, 'null blocks are tolerated');
});
