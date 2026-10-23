/**
 * Three-page A4 assembly guide for one paper-flower cut sheet.
 *
 * Print-ready: A4 210 x 297 mm, all vector, no bleed, body text 8-10 pt, safe
 * margins. Page 1 is the at-a-glance sheet (mat diagram, palette, cut settings,
 * files + Design Space workflow), page 2 the shaping guide (piece inventory,
 * hand techniques, layer order), page 3 the numbered assembly steps, finishing
 * notes and troubleshooting.
 *
 * Layout runs on a top-down y cursor and throws if a page overflows, so long
 * copy fails generation instead of silently printing over the footer.
 */
import { PdfDoc } from './minipdf.mjs';

const W = 210;
const H = 297;
const M = 18;
const CW = W - M * 2;

const INK = '#241419';
const MUTED = '#6E5A64';
const BODY = '#3B2A31';
const RULE = '#E3D6DB';
const BLOOM = '#A8557A';
const PANEL = '#FBF4F7';
const SHEET_BG = '#FFFFFF';

const sentence = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const PRESENTATION = [
  'Stems: 18 ga wire carries a rose or peony head; step down to 20 ga where you want the neck to bend.',
  'Vases: weight the base with sand or glass beads - a paper bouquet is top heavy and will tip.',
  'Shipping and storage: box with tissue, never a sealed bag, or the petals crush flat.',
];

function chrome(page, { title, pageNo, total, files }) {
  page.text("KRYSTAL'S FLOWER KREATIONS  -  PERTH WA", M, 12, { size: 6.8, bold: true, color: BLOOM });
  page.text(title.toUpperCase(), W - M, 12, { size: 6.8, color: MUTED, align: 'right' });
  page.line(M, 15.5, W - M, 15.5, { color: RULE, width: 0.3 });

  page.line(M, H - 15, W - M, H - 15, { color: RULE, width: 0.3 });
  page.text(files, M, H - 10.5, { size: 6.8, color: MUTED });
  page.text(`Page ${pageNo} of ${total}`, W - M, H - 10.5, { size: 6.8, color: MUTED, align: 'right' });
}

function heading(page, y, text, sub) {
  page.text(text, M, y, { size: 13, bold: true, color: INK });
  let next = y + 6;
  if (sub) next = page.para(sub, M, next, CW, { size: 9, leading: 12, color: MUTED });
  else next += 2;
  page.line(M, next, W - M, next, { color: RULE, width: 0.3 });
  return next + 6;
}

function bullets(page, items, x, y, width, { size = 8.6, leading = 11.4 } = {}) {
  let cursor = y;
  for (const item of items) {
    page.circle(x + 1, cursor - 1.1, 0.55, { fill: BLOOM });
    cursor = page.para(item, x + 4, cursor, width - 4, { size, leading }) + 1;
  }
  return cursor;
}

/** Diagram of the packed mat at `size` mm square. */
function drawSheet(page, x, y, size, pieces, bg) {
  const s = size / 305;
  page.rect(x, y, size, size, { fill: bg, stroke: RULE, width: 0.3 });
  for (const pc of pieces) {
    const pts = pc.pts.map((p) => ({ x: x + (p.x + pc.offset.x) * s, y: y + (p.y + pc.offset.y) * s }));
    page.polygon(pts, { fill: pc.fill, stroke: '#C9B4BC', width: 0.16 });
    for (const hole of pc.holes) {
      const hpts = hole.pts.map((p) => ({ x: x + (p.x + pc.offset.x) * s, y: y + (p.y + pc.offset.y) * s }));
      page.polygon(hpts, { fill: bg, width: 0 });
    }
  }
  for (let i = 1; i < 12; i++) {
    const g = i * 25.4 * s;
    page.line(x + g, y, x + g, y + size, { color: '#F0E7EA', width: 0.15 });
    page.line(x, y + g, x + size, y + g, { color: '#F0E7EA', width: 0.15 });
  }
}

function paletteLegend(page, x, y, width, palette) {
  let cursor = y;
  for (const [hex, label] of palette) {
    page.roundRect(x, cursor - 3.3, 7, 4.8, 1, { fill: hex, stroke: '#D8C6CD', width: 0.2 });
    page.text(label, x + 10, cursor, { size: 8, color: INK });
    page.text(hex.toUpperCase(), x + width, cursor, { size: 7, color: MUTED, align: 'right' });
    cursor += 7.5;
  }
  return cursor;
}

function techniqueCards(page, y, techniques, h) {
  let cursor = y;
  for (const [i, t] of techniques.entries()) {
    page.roundRect(M, cursor, CW, h, 2.5, { fill: SHEET_BG, stroke: RULE, width: 0.35 });
    page.circle(M + 9, cursor + h / 2 - 1, 5, { fill: PANEL, stroke: BLOOM, width: 0.4 });
    page.text(String(i + 1), M + 9, cursor + h / 2 + 0.9, { size: 9.5, bold: true, color: BLOOM, align: 'center' });
    page.text(t.name, M + 19, cursor + h / 2 - 1, { size: 10.5, bold: true, color: INK });
    page.para(t.text, M + 19, cursor + h / 2 + 5.5, CW - 26, { size: 8.8, leading: 11.4, color: BODY });
    cursor += h + 5;
  }
  return cursor;
}

function stackDiagram(page, x, y, layers) {
  const boxW = 112;
  const boxH = 12;
  const step = 9;
  layers.forEach((label, i) => {
    // layer 1 sits at the bottom of the stack
    const bx = x + i * 4;
    const by = y + (layers.length - 1 - i) * step;
    page.roundRect(bx, by, boxW, boxH, 2, { fill: i % 2 ? PANEL : '#F4E4E9', stroke: BLOOM, width: 0.35 });
    page.text(`${i + 1}`, bx + 5.5, by + 8, { size: 8.5, bold: true, color: BLOOM });
    page.text(label, bx + 12, by + 7.9, { size: 8, color: INK });
  });
  return y + (layers.length - 1) * step + boxH;
}

export function renderGuidePdf({ design, pieces, inventory, palette }) {
  const total = 3;
  const files = `${design.slug}.svg  +  ${design.slug}-score.svg`;
  const doc = new PdfDoc({
    title: `${design.title} - assembly guide`,
    author: "Krystal's Flower Kreations",
    subject: 'Cricut paper flower cut sheet: shaping and assembly guide',
  });

  const guard = (y, pageName) => {
    if (y > H - 20) throw new Error(`${design.slug}: ${pageName} content overflows (y=${y.toFixed(1)} mm)`);
    return y;
  };

  const scoreCount = pieces.reduce((n, pc) => n + pc.scores.length, 0);

  /* ------------------------------------------------------------ page 1 */
  const p1 = doc.addPage(W, H);
  chrome(p1, { title: design.title, pageNo: 1, total, files });

  let y = p1.para(design.title, M, 27, CW, { size: 21, leading: 25, bold: true, color: INK });
  p1.text(`${design.finished}   -   ${design.guide.time}   -   ${design.guide.level}`, M, y - 1, {
    size: 9, color: BLOOM, bold: true,
  });
  y += 6;
  p1.line(M, y, W - M, y, { color: RULE, width: 0.3 });
  y = p1.para(design.guide.summary, M, y + 7, CW, { size: 9.5, leading: 13, color: BODY });

  // mat diagram + palette + cut settings
  const panelTop = y + 4;
  const panelH = 110;
  p1.roundRect(M, panelTop, CW, panelH, 3, { fill: PANEL, stroke: RULE, width: 0.3 });
  p1.text('EVERY PIECE ON ONE 12 x 12 IN MAT', M + 6, panelTop + 9, { size: 7, bold: true, color: BLOOM });
  const sheetSize = 86;
  drawSheet(p1, M + 6, panelTop + 14, sheetSize, pieces, SHEET_BG);
  p1.text(`${pieces.length} cut pieces, ${scoreCount} score lines - shown at ${Math.round((sheetSize / 305) * 100)}%`,
    M + 6, panelTop + panelH - 5, { size: 6.6, color: MUTED });

  const legendX = M + 6 + sheetSize + 11;
  const legendW = W - M - 9 - legendX;
  p1.text('CARDSTOCK KEY', legendX, panelTop + 9, { size: 7, bold: true, color: BLOOM });
  paletteLegend(p1, legendX, panelTop + 17, legendW, palette);

  p1.text('CUT SETTINGS', legendX, panelTop + 62, { size: 7, bold: true, color: BLOOM });
  p1.para(
    'Fine-point blade on Cardstock 65 lb, More pressure, StandardGrip 12 x 12 in mat. The dashed grey paths are scores - set their linetype before cutting.',
    legendX, panelTop + 68, legendW, { size: 7.6, leading: 9.6, color: BODY },
  );

  // files + Design Space workflow
  const kitTop = panelTop + panelH + 6;
  const kitH = 52;
  p1.roundRect(M, kitTop, CW, kitH, 3, { fill: SHEET_BG, stroke: RULE, width: 0.3 });

  p1.text('FILES IN THIS KIT', M + 6, kitTop + 9, { size: 7, bold: true, color: BLOOM });
  const kitFiles = [
    [`${design.slug}.svg`, `Cut sheet: ${pieces.length} pieces on one 305 mm mat.`],
    [`${design.slug}-score.svg`, `Score guides only, in the same positions - pair it with the cut sheet.`],
    [`${design.slug}-assembly.pdf`, 'This three-page guide.'],
  ];
  let fileY = kitTop + 18;
  for (const [name, desc] of kitFiles) {
    p1.text(name, M + 6, fileY, { size: 8.2, bold: true, color: INK });
    fileY = p1.para(desc, M + 6, fileY + 5, 76, { size: 7.2, leading: 8.8, color: MUTED }) + 2.5;
  }

  const dsX = M + 92;
  const dsW = W - M - 6 - dsX;
  p1.text('IN DESIGN SPACE', dsX, kitTop + 9, { size: 7, bold: true, color: BLOOM });
  const dsSteps = [
    'Upload both SVGs and keep them at 12 in - never resize one of the pair.',
    'Select everything, then Attach, so each score lands on its piece.',
    'Set the dashed paths to Linetype > Score, then cut on Cardstock 65 lb.',
  ];
  let dsY = kitTop + 18;
  for (const [i, step] of dsSteps.entries()) {
    p1.circle(dsX + 2.4, dsY - 1.1, 2.4, { fill: PANEL, stroke: BLOOM, width: 0.3 });
    p1.text(String(i + 1), dsX + 2.4, dsY + 0.1, { size: 6.6, bold: true, color: BLOOM, align: 'center' });
    dsY = p1.para(step, dsX + 7, dsY, dsW - 7, { size: 7.6, leading: 9.2, color: BODY }) + 1.6;
  }
  guard(kitTop + kitH, 'page 1');

  // materials + tools sit under the kit panel
  const matTop = kitTop + kitH + 9;
  const colW = (CW - 8) / 2;
  p1.text('MATERIALS', M, matTop, { size: 7, bold: true, color: BLOOM });
  p1.text('TOOLS', M + colW + 8, matTop, { size: 7, bold: true, color: BLOOM });
  const leftEnd = bullets(p1, design.guide.materials, M, matTop + 5, colW, { size: 8.2, leading: 10.4 });
  const rightEnd = bullets(p1, design.guide.tools, M + colW + 8, matTop + 5, colW, { size: 8.2, leading: 10.4 });
  guard(Math.max(leftEnd, rightEnd), 'page 1');

  /* ------------------------------------------------------------ page 2 */
  const p2 = doc.addPage(W, H);
  chrome(p2, { title: design.title, pageNo: 2, total, files });

  y = heading(p2, 31, 'Shaping guide',
    'Shape the paper before any glue goes on. Once the fibres are broken, the piece holds its curve.');

  p2.text('PIECES ON THE MAT', M, y, { size: 6.8, bold: true, color: BLOOM });
  const half = Math.ceil(inventory.length / 2);
  const invTop = y + 7;
  let invBottom = invTop;
  for (const [col, group] of [inventory.slice(0, half), inventory.slice(half)].entries()) {
    let cursor = invTop;
    for (const item of group) {
      const x = M + col * (CW / 2);
      p2.text(sentence(item.name), x, cursor, { size: 8.6, color: INK });
      p2.text(`x${item.qty}`, x + CW / 2 - 8, cursor, { size: 8.6, color: MUTED, align: 'right' });
      cursor += 9.6;
    }
    invBottom = Math.max(invBottom, cursor);
  }
  y = guard(invBottom + 1, 'page 2');

  p2.line(M, y, W - M, y, { color: RULE, width: 0.3 });
  y += 8;
  p2.text('HANDS ON', M, y, { size: 6.8, bold: true, color: BLOOM });

  // The bottom panel is sized first, then the technique cards take the slack so
  // a sparse design (few pieces, one layer) cannot leave a half-empty page.
  const layered = design.guide.stack.length > 1;
  const bottomPanelH = layered ? 14 + design.guide.stack.length * 9 + 12 : 34;
  const cardsTop = y + 6;
  const avail = (H - 20) - bottomPanelH - 16 - cardsTop;
  const cardH = Math.max(26, Math.min(40, (avail - 10) / 3));
  const cardsEnd = techniqueCards(p2, cardsTop, design.guide.shaping, cardH);
  const bottomPanelTop = cardsEnd + 1;

  if (layered) {
    p2.roundRect(M, bottomPanelTop, CW, bottomPanelH, 2.5, { fill: PANEL, stroke: RULE, width: 0.3 });
    p2.text('LAYER ORDER  -  BOTTOM TO TOP', M + 6, bottomPanelTop + 8, { size: 6.6, bold: true, color: BLOOM });
    stackDiagram(p2, M + 6, bottomPanelTop + 13, design.guide.stack);
    p2.text('Glue each layer onto the one below it, offsetting the joins so no two meet at the same point.',
      M + 6, bottomPanelTop + bottomPanelH - 4, { size: 7, color: MUTED });
  } else {
    p2.roundRect(M, bottomPanelTop, CW, bottomPanelH, 2.5, { fill: PANEL, stroke: RULE, width: 0.3 });
    p2.text('WHAT ONE SHEET MAKES', M + 6, bottomPanelTop + 8, { size: 6.6, bold: true, color: BLOOM });
    p2.para(design.guide.makes, M + 6, bottomPanelTop + 15, CW - 12, { size: 9, leading: 12, color: INK });
    p2.text(`Leftover pieces are spares - ${scoreCount} score lines repeat across them, so one torn strip costs a spray, not the sheet.`,
      M + 6, bottomPanelTop + bottomPanelH - 5, { size: 7, color: MUTED });
  }
  guard(bottomPanelTop + bottomPanelH, 'page 2');

  /* ------------------------------------------------------------ page 3 */
  const p3 = doc.addPage(W, H);
  chrome(p3, { title: design.title, pageNo: 3, total, files });

  y = heading(p3, 31, 'Assembly', 'Work in order - every step assumes the one before it.');

  for (const [i, step] of design.guide.steps.entries()) {
    p3.circle(M + 4, y - 1.2, 4.4, { fill: PANEL, stroke: BLOOM, width: 0.35 });
    p3.text(String(i + 1), M + 4, y + 0.6, { size: 8, bold: true, color: BLOOM, align: 'center' });
    y = p3.para(step, M + 12, y, CW - 12, { size: 8.9, leading: 12.4, color: BODY });
    y += 4;
  }
  y = guard(y + 2, 'page 3');

  const careTop = y + 2;
  const careH = 44;
  p3.roundRect(M, careTop, CW, careH, 2.5, { fill: PANEL, stroke: RULE, width: 0.3 });
  p3.text('FINISHING & CARE', M + 6, careTop + 9, { size: 6.6, bold: true, color: BLOOM });
  const careEnd = bullets(p3, design.guide.care, M + 6, careTop + 16, (CW - 20) / 2, { size: 8, leading: 10.4 });
  p3.text('FINISHING', M + CW / 2 + 6, careTop + 9, { size: 6.6, bold: true, color: BLOOM });
  p3.para(
    'Trim any whiskers of glue with small scissors. A light dusting of chalk or ink on the petal edges deepens the colour and hides score marks. Keep finished pieces in a box, not a bag, so the petals hold their cup.',
    M + CW / 2 + 6, careTop + 16, (CW - 20) / 2, { size: 8, leading: 10.4, color: BODY },
  );
  guard(careTop + careH, 'page 3');

  const troubleTop = careTop + careH + 6;
  p3.roundRect(M, troubleTop, CW, 30, 2.5, { fill: SHEET_BG, stroke: '#E3CBD4', width: 0.35 });
  p3.text('IF SOMETHING GOES WRONG', M + 6, troubleTop + 8, { size: 6.6, bold: true, color: BLOOM });
  p3.para(design.guide.trouble, M + 6, troubleTop + 15, CW - 12, { size: 8.6, leading: 10.6, color: INK });
  guard(troubleTop + 30, 'page 3');

  const presTop = troubleTop + 36;
  p3.text('PRESENTATION & PACKAGING', M, presTop, { size: 6.8, bold: true, color: BLOOM });
  const presEnd = bullets(p3, PRESENTATION, M, presTop + 7, CW, { size: 8.4, leading: 11 });

  const preTop = presEnd + 5;
  p3.roundRect(M, preTop, CW, 34, 2.5, { fill: PANEL, stroke: RULE, width: 0.3 });
  p3.text('BEFORE YOU CUT', M + 6, preTop + 8, { size: 6.6, bold: true, color: BLOOM });
  const halfW = (CW - 20) / 2;
  const checks = [
    `Piece count: ${pieces.length} shapes on the mat - count them on screen first.`,
    `Score lines: ${scoreCount} dashed paths, each sitting on a piece.`,
    'Size: the mat imports at 12 x 12 in - do not scale a single piece.',
    'Material: cardstock 65 lb. Heavier stock will not cup cleanly.',
  ];
  bullets(p3, checks.slice(0, 2), M + 6, preTop + 15, halfW, { size: 7.8, leading: 10 });
  bullets(p3, checks.slice(2), M + 12 + halfW, preTop + 15, halfW, { size: 7.8, leading: 10 });
  guard(preTop + 34, 'page 3');

  p3.text('Questions, or a piece that will not sit right? krystalsflowercreations.com.au - we answer every message.',
    M, H - 23, { size: 7.2, color: MUTED });

  return doc.build();
}
