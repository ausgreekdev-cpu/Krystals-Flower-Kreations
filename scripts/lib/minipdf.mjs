/**
 * Minimal, dependency-free PDF writer: PDF 1.4, vector paths, base-14 fonts.
 *
 * Just enough to lay out a print-ready guide without pulling a PDF library and
 * its lockfile into the repo. Coordinates are millimetres measured from the
 * TOP-LEFT of the page (designer convention); the writer flips them to PDF's
 * bottom-left origin. Font metrics are the Adobe AFM widths for Helvetica and
 * Helvetica-Bold, so text wrapping and alignment are the same as a real
 * typesetter's.
 */
const MM_TO_PT = 72 / 25.4;

/* Widths for WinAnsi codes 32..126, thousandths of an em (Adobe AFM). */
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

const hex = (value) => {
  const v = String(value).replace('#', '');
  const n = parseInt(v.length === 3 ? v.split('').map((c) => c + c).join('') : v, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const num = (v) => Number(v.toFixed(3)).toString();

function escapeText(s) {
  return String(s)
    .replace(/[^\x20-\x7e]/g, (c) => ({ '\u2014': '-', '\u2013': '-', '\u2019': "'", '\u201c': '"', '\u201d': '"', '\u00b7': '-', '\u00d7': 'x' }[c] || '?'))
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

export function textWidthMm(str, sizePt, bold = false) {
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  let units = 0;
  for (const ch of String(str)) {
    const code = ch.charCodeAt(0);
    units += code >= 32 && code <= 126 ? table[code - 32] : table['?'.charCodeAt(0) - 32];
  }
  return (units / 1000) * sizePt / MM_TO_PT;
}

export class Page {
  constructor(widthMm, heightMm) {
    this.width = widthMm;
    this.height = heightMm;
    this.ops = [];
  }

  _pt(x, y) {
    return `${num(x * MM_TO_PT)} ${num((this.height - y) * MM_TO_PT)}`;
  }

  q() { this.ops.push('q'); return this; }
  Q() { this.ops.push('Q'); return this; }

  fillColor(color) {
    const [r, g, b] = hex(color);
    this.ops.push(`${num(r)} ${num(g)} ${num(b)} rg`);
    return this;
  }

  strokeColor(color) {
    const [r, g, b] = hex(color);
    this.ops.push(`${num(r)} ${num(g)} ${num(b)} RG`);
    return this;
  }

  lineWidth(mm) {
    this.ops.push(`${num(mm * MM_TO_PT)} w`);
    return this;
  }

  dash(onMm, offMm, phaseMm = 0) {
    this.ops.push(`[${num(onMm * MM_TO_PT)} ${num(offMm * MM_TO_PT)}] ${num(phaseMm * MM_TO_PT)} d`);
    return this;
  }

  solid() { this.ops.push('[] 0 d'); return this; }

  moveTo(x, y) { this.ops.push(`${this._pt(x, y)} m`); return this; }
  lineTo(x, y) { this.ops.push(`${this._pt(x, y)} l`); return this; }

  curveTo(c1x, c1y, c2x, c2y, x, y) {
    this.ops.push(`${this._pt(c1x, c1y)} ${this._pt(c2x, c2y)} ${this._pt(x, y)} c`);
    return this;
  }

  close() { this.ops.push('h'); return this; }
  fill() { this.ops.push('f'); return this; }
  stroke() { this.ops.push('S'); return this; }
  fillStroke() { this.ops.push('B'); return this; }

  /** Straight-edged polygon in mm, top-left origin. */
  polygon(points, { fill, stroke, width = 0.3, close = true } = {}) {
    if (!points.length) return this;
    this.q();
    if (fill) this.fillColor(fill);
    if (stroke) this.strokeColor(stroke);
    this.lineWidth(width);
    points.forEach((p, i) => (i ? this.lineTo(p.x, p.y) : this.moveTo(p.x, p.y)));
    if (close) this.close();
    if (fill && stroke) this.fillStroke();
    else if (fill) this.fill();
    else this.stroke();
    return this.Q();
  }

  rect(x, y, w, h, opts = {}) {
    return this.polygon([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], opts);
  }

  roundRect(x, y, w, h, r, opts = {}) {
    const k = r * 0.5522847498;
    this.q();
    if (opts.fill) this.fillColor(opts.fill);
    if (opts.stroke) this.strokeColor(opts.stroke);
    this.lineWidth(opts.width ?? 0.3);
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.curveTo(x + w - r + k, y, x + w, y + r - k, x + w, y + r);
    this.lineTo(x + w, y + h - r);
    this.curveTo(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h);
    this.curveTo(x + r - k, y + h, x, y + h - r + k, x, y + h - r);
    this.lineTo(x, y + r);
    this.curveTo(x, y + r - k, x + r - k, y, x + r, y);
    this.close();
    if (opts.fill && opts.stroke) this.fillStroke();
    else if (opts.fill) this.fill();
    else this.stroke();
    return this.Q();
  }

  circle(cx, cy, r, opts = {}) {
    const k = r * 0.5522847498;
    this.q();
    if (opts.fill) this.fillColor(opts.fill);
    if (opts.stroke) this.strokeColor(opts.stroke);
    this.lineWidth(opts.width ?? 0.3);
    this.moveTo(cx - r, cy);
    this.curveTo(cx - r, cy - k, cx - k, cy - r, cx, cy - r);
    this.curveTo(cx + k, cy - r, cx + r, cy - k, cx + r, cy);
    this.curveTo(cx + r, cy + k, cx + k, cy + r, cx, cy + r);
    this.curveTo(cx - k, cy + r, cx - r, cy + k, cx - r, cy);
    this.close();
    if (opts.fill && opts.stroke) this.fillStroke();
    else if (opts.fill) this.fill();
    else this.stroke();
    return this.Q();
  }

  line(x1, y1, x2, y2, opts = {}) {
    this.q();
    this.strokeColor(opts.color ?? '#000000');
    this.lineWidth(opts.width ?? 0.3);
    if (opts.dash) this.dash(opts.dash[0], opts.dash[1]);
    this.moveTo(x1, y1).lineTo(x2, y2).stroke();
    return this.Q();
  }

  /** Baseline-anchored text. Returns the drawn width in mm. */
  text(str, x, y, { size = 10, bold = false, color = '#221016', align = 'left' } = {}) {
    const width = textWidthMm(str, size, bold);
    const X = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
    const [r, g, b] = hex(color);
    this.ops.push(
      `BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${num(r)} ${num(g)} ${num(b)} rg 1 0 0 1 ${this._pt(X, y)} Tm (${escapeText(str)}) Tj ET`,
    );
    return width;
  }

  textWidth(str, size, bold = false) {
    return textWidthMm(str, size, bold);
  }

  /** Word-wrapped paragraph; `leading` is in points. Returns the next baseline y. */
  para(str, x, y, widthMm, { size = 9.5, leading = 13, bold = false, color = '#221016' } = {}) {
    let cursor = y;
    for (const line of wrapText(str, widthMm, size, bold)) {
      this.text(line, x, cursor, { size, bold, color });
      cursor += leading / MM_TO_PT;
    }
    return cursor;
  }

  toStream() {
    return this.ops.join('\n');
  }
}

export function wrapText(str, widthMm, size, bold = false) {
  const out = [];
  for (const block of String(str).split('\n')) {
    const words = block.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (textWidthMm(next, size, bold) <= widthMm || !line) line = next;
      else { out.push(line); line = word; }
    }
    if (line) out.push(line);
  }
  return out;
}

export class PdfDoc {
  constructor({ title = '', author = '', subject = '', creator = 'Krystal\'s Flower Kreations' } = {}) {
    this.pages = [];
    this.meta = { title, author, subject, creator };
  }

  addPage(widthMm = 210, heightMm = 297) {
    const page = new Page(widthMm, heightMm);
    this.pages.push(page);
    return page;
  }

  build() {
    const objs = [];
    const catalogNum = 1;
    const pagesNum = 2;
    const f1 = 3;
    const f2 = 4;
    let next = 5;
    const pageNums = [];

    for (const page of this.pages) {
      const pageNum = next++;
      const contentNum = next++;
      pageNums.push(pageNum);
      const stream = page.toStream();
      objs[pageNum] = `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${num(page.width * MM_TO_PT)} ${num(page.height * MM_TO_PT)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> /ProcSet [/PDF /Text] >> /Contents ${contentNum} 0 R >>`;
      objs[contentNum] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`;
    }

    const infoNum = next++;
    objs[catalogNum] = `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`;
    objs[pagesNum] = `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageNums.length} >>`;
    objs[f1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[f2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    const { title, author, subject, creator } = this.meta;
    objs[infoNum] = `<< /Title (${escapeText(title)}) /Author (${escapeText(author)}) /Subject (${escapeText(subject)}) /Creator (${escapeText(creator)}) /Producer (${escapeText(creator)} guide generator) >>`;

    const chunks = [];
    let offset = 0;
    const push = (text) => {
      const buf = Buffer.isBuffer(text) ? text : Buffer.from(text, 'latin1');
      chunks.push(buf);
      offset += buf.length;
    };

    push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
    const offsets = [];
    for (let n = 1; n < objs.length; n++) {
      offsets[n] = offset;
      push(`${n} 0 obj\n${objs[n]}\nendobj\n`);
    }

    const xrefOffset = offset;
    let xref = `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
    for (let n = 1; n < objs.length; n++) {
      xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
    }
    push(xref);
    push(`trailer\n<< /Size ${objs.length} /Root ${catalogNum} 0 R /Info ${infoNum} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

    return Buffer.concat(chunks);
  }
}

/**
 * Structural audit of a generated PDF: header, xref offsets that really point
 * at their objects, page count and the trailing EOF marker. Returns the list
 * of problems (empty means the file is well-formed).
 */
export function validatePdf(buf, { pages } = {}) {
  const problems = [];
  const text = buf.toString('latin1');
  if (!text.startsWith('%PDF-1.4')) problems.push('missing %PDF-1.4 header');
  if (!text.trimEnd().endsWith('%%EOF')) problems.push('missing %%EOF marker');

  const startxref = Number((text.match(/startxref\s+(\d+)\s+%%EOF\s*$/) || [])[1]);
  if (!Number.isFinite(startxref)) {
    problems.push('missing startxref offset');
    return problems;
  }
  if (text.slice(startxref, startxref + 4) !== 'xref') {
    problems.push(`startxref ${startxref} does not point at the xref table`);
    return problems;
  }

  const sizeMatch = text.slice(startxref).match(/^xref\s+0\s+(\d+)\s/);
  const size = sizeMatch ? Number(sizeMatch[1]) : 0;
  const entries = text.slice(startxref).match(/^\d{10} \d{5} [nf] $/gm) || [];
  if (entries.length !== size) problems.push(`xref lists ${entries.length} of ${size} objects`);

  for (let n = 1; n < entries.length; n++) {
    const off = Number(entries[n].slice(0, 10));
    if (text.slice(off, off + 40).indexOf(`${n} 0 obj`) !== 0) {
      problems.push(`xref entry ${n} points at ${off}, not at "${n} 0 obj"`);
      break;
    }
  }

  const pageObjects = (text.match(/\/Type \/Page\b/g) || []).length;
  if (pages !== undefined && pageObjects !== pages) problems.push(`page objects ${pageObjects}, expected ${pages}`);

  return problems;
}
