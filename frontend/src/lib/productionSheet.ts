// Printable production sheet for a custom art order — opened from the Kanban
// card and printed via window.print() in its own window (isolated from app
// CSS; no print-stylesheet gymnastics). Data comes straight from the
// /api/custom-orders rows (spec + bomSnapshot are persisted at creation).

type Spec = Record<string, unknown> & {
  templateId?: string; paperColor?: string; paperTexture?: string; weight?: string;
  stemCount?: number; heightMm?: number; palette?: string | null; notes?: string;
  addGreenery?: boolean; vaseIncluded?: boolean; domeIncluded?: boolean; ledIncluded?: boolean;
};
type BomLine = { sku?: string | null; name?: string; unit?: string; qty?: number; cost?: number; effectiveQty?: number };
type CustomOrder = {
  orderNumber: string; customerName?: string | null; customerEmail?: string | null;
  state?: string; createdAt?: string | Date; totalPrice?: number | string;
  estimatedMinutes?: number | null; spec?: Spec | null; bomSnapshot?: BomLine[] | null;
};

// templateId → served cut-sheet base name (frontend/public/cut-sheets/<base>.svg)
export function cutSheetFor(templateId?: string | null): string | null {
  return (templateId && CUT_SHEETS[templateId]) || null;
}
const CUT_SHEETS: Record<string, string> = {
  'paper-rose': 'paper-rose',
  'origami-lily': 'origami-lily',
  'banksia-petal': 'banksia-petal',
};

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const money = (v: unknown) => `$${(Number(v) || 0).toFixed(2)}`;
const leadDays = (mins?: number | null) => Math.max(3, Math.ceil(((mins || 0) / 60) / 2));

export function buildProductionSheetHtml(order: CustomOrder, origin = ''): string {
  const spec: Spec = order.spec || {};
  const lines: BomLine[] = Array.isArray(order.bomSnapshot) ? order.bomSnapshot : [];
  const materials = lines.length
    ? `<table><thead><tr><th>Material</th><th>SKU</th><th>Qty</th><th>Unit</th><th>Cost</th></tr></thead><tbody>
        ${lines.map((l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.sku)}</td><td>${esc(Number(l.qty ?? l.effectiveQty ?? 0).toFixed(2))}</td><td>${esc(l.unit)}</td><td>${money(l.cost)}</td></tr>`).join('')}
       </tbody></table>`
    : '<p class="muted">No BOM snapshot on this order (created before BOM capture, or no matching recipe).</p>';
  const cutBase = spec.templateId ? CUT_SHEETS[spec.templateId] : undefined;
  const cutLinks = cutBase
    ? `<p><a href="${origin}/cut-sheets/${cutBase}.svg">Cut sheet (SVG)</a> · <a href="${origin}/cut-sheets/${cutBase}-score.svg">Score lines (SVG)</a> · <a href="${origin}/cut-sheets/${cutBase}-assembly.pdf">Assembly guide (PDF)</a></p>`
    : '<p class="muted">No generated cut sheet for this template (wattle-sprig is hand-cut).</p>';
  const addOns = [['addGreenery', 'Greenery'], ['vaseIncluded', 'Vase'], ['domeIncluded', 'Glass dome'], ['ledIncluded', 'LED lights']]
    .filter(([k]) => spec[k as keyof Spec]).map(([, label]) => label);

  return `<!doctype html><html><head><meta charset="utf-8"><title>Production sheet — ${esc(order.orderNumber)}</title>
<style>
  @page { margin: 14mm; }
  body { font: 13px/1.5 -apple-system, 'Segoe UI', sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: #555; margin: 18px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 5px 8px; text-align: left; }
  th { background: #f5f5f5; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  .muted { color: #666; }
  .specs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px 16px; }
  .specs div span { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #666; }
  .specs div strong { font-size: 13px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; }
  a { color: #333; }
  @media print { .no-print { display: none; } }
</style></head><body>
<div class="head">
  <div>
    <h1>Production sheet — ${esc(order.orderNumber)}</h1>
    <div class="muted">${esc(order.customerName)}${order.customerEmail ? ` · ${esc(order.customerEmail)}` : ''} · ${esc(new Date(order.createdAt ?? Date.now()).toLocaleDateString('en-AU'))} · state: ${esc(order.state || '—')}</div>
  </div>
  <button class="no-print" onclick="window.print()">Print</button>
</div>

<h2>Spec</h2>
<div class="specs">
  <div><span>Template</span><strong>${esc(spec.templateId)}</strong></div>
  <div><span>Colour</span><strong>${esc(spec.paperColor)}${spec.palette ? ` (${esc(spec.palette)})` : ''}</strong></div>
  <div><span>Texture / weight</span><strong>${esc(spec.paperTexture)} · ${esc(spec.weight)}</strong></div>
  <div><span>Stems</span><strong>${esc(spec.stemCount)}</strong></div>
  <div><span>Height</span><strong>${esc(spec.heightMm)} mm</strong></div>
  <div><span>Add-ons</span><strong>${addOns.length ? esc(addOns.join(', ')) : '—'}</strong></div>
</div>
${spec.notes ? `<p><strong>Customer note:</strong> ${esc(spec.notes)}</p>` : ''}

<h2>Materials (BOM)</h2>
${materials}

<h2>Labour &amp; lead time</h2>
<div class="specs">
  <div><span>Craft labour</span><strong>${order.estimatedMinutes ? `${order.estimatedMinutes} min (~${(order.estimatedMinutes / 60).toFixed(1)} h)` : '—'}</strong></div>
  <div><span>Lead days</span><strong>~${leadDays(order.estimatedMinutes)} days</strong></div>
  <div><span>Quoted total</span><strong>${money(order.totalPrice)} (GST incl.)</strong></div>
</div>

<h2>Cut files</h2>
${cutLinks}
</body></html>`;
}

// Opens the sheet in its own window and hands it to the browser's print dialog.
export function printProductionSheet(order: CustomOrder) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(buildProductionSheetHtml(order, window.location.origin));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
  return true;
}
