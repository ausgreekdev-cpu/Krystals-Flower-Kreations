import { useEffect, useMemo, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode/dist/JsBarcode.all.js';
import Modal from './Modal';

// Avery L7160 / J8160 / MP7160 compatible sheet: A4, 3×7 labels of 63.5×38.1 mm.
const LABELS_PER_SHEET = 21;
// Each cell mounts an SVG + JsBarcode render — unbounded totals can freeze the tab.
const MAX_LABELS = 500;

function BarcodeLabel({ value, name }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      const width = Math.max(0.8, Math.min(1.5, 230 / ((value.length + 3) * 11)));
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        width,
        height: 40,
        fontSize: 12,
        font: 'monospace',
        margin: 1,
        textMargin: 1,
        displayValue: true,
      });
    } catch { /* unencodable value — leave cell with name only */ }
  }, [value]);
  return (
    <div className="label-cell">
      <div className="label-name" title={name}>{name}</div>
      {value && <svg ref={ref} className="label-bars" aria-label={value} />}
    </div>
  );
}

export default function LabelPrintModal({ title, items, onClose }) {
  const printable = useMemo(() => items.filter((i) => i.value), [items]);
  // Clamp the whole selection so the total label count never exceeds MAX_LABELS.
  const clampAll = (raw) => {
    const out = {};
    let total = 0;
    for (const i of printable) {
      const q = Math.max(0, Math.min(99, Number(raw[i.id]) || 0));
      const allowed = Math.min(q, Math.max(0, MAX_LABELS - total));
      out[i.id] = allowed;
      total += allowed;
    }
    return out;
  };
  const [qtys, setQtys] = useState(() => clampAll(Object.fromEntries(printable.map((i) => [i.id, 1]))));
  const selectedCount = printable.filter((i) => (qtys[i.id] || 0) > 0).length;
  const labelCount = printable.reduce((n, i) => n + (qtys[i.id] || 0), 0);
  const atCap = labelCount >= MAX_LABELS;

  const cells = useMemo(() => {
    const out = [];
    for (const item of printable) {
      const q = qtys[item.id] || 0;
      for (let n = 0; n < q; n++) out.push(item);
    }
    return out;
  }, [printable, qtys]);
  const pages = useMemo(() => {
    const out = [];
    for (let i = 0; i < cells.length; i += LABELS_PER_SHEET) out.push(cells.slice(i, i + LABELS_PER_SHEET));
    return out;
  }, [cells]);

  function setQty(id, q) {
    setQtys((prev) => clampAll({ ...prev, [id]: Math.max(0, Math.min(99, Number(q) || 0)) }));
  }
  const missing = items.length - printable.length;

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs no-print">
          <button className="px-2.5 py-1 rounded-xl border border-line-strong font-semibold hover:bg-surface3" onClick={() => setQtys(clampAll(Object.fromEntries(printable.map((i) => [i.id, 1]))))}>Select all</button>
          <button className="px-2.5 py-1 rounded-xl border border-line-strong font-semibold hover:bg-surface3" onClick={() => setQtys(Object.fromEntries(printable.map((i) => [i.id, 0])))}>Clear</button>
          <span className="text-muted">{selectedCount} of {printable.length} items • {labelCount} labels • {pages.length} sheet{pages.length === 1 ? '' : 's'}</span>
          {atCap && <span className="text-amber-600 font-semibold">Cap {MAX_LABELS} labels per print — reduce copies to add more.</span>}
          <button
            className="ml-auto px-3 py-1.5 rounded-xl bg-royal-500 text-white font-bold disabled:opacity-40"
            disabled={labelCount === 0}
            onClick={() => window.print()}
          >🖨 Print ({labelCount})</button>
        </div>

        <p className="text-[11px] text-muted no-print">
          Avery L7160-compatible sheet — 63.5 × 38.1 mm, 21 per A4. Print at <b>100% scale</b> (no “fit to page”), portrait.
          {missing > 0 && <> <span className="text-amber-600 font-semibold">{missing} item{missing === 1 ? '' : 's'} without a barcode/SKU skipped.</span></>}
        </p>

        <div className="space-y-1 no-print">
          {printable.map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-xs border-b border-line py-1.5">
              <input
                type="checkbox"
                checked={(qtys[item.id] || 0) > 0}
                onChange={(e) => setQty(item.id, e.target.checked ? 1 : 0)}
                className="accent-royal-500"
              />
              <span className="font-medium text-ink flex-1 min-w-0 truncate" title={item.name}>{item.name}</span>
              <code className="text-muted shrink-0">{item.value}</code>
              <input
                type="number"
                min="0"
                max="99"
                value={qtys[item.id] ?? 0}
                onChange={(e) => setQty(item.id, e.target.value)}
                className="w-14 border border-line-strong rounded-lg px-2 py-1 text-right"
                aria-label={`Copies of ${item.name}`}
              />
            </div>
          ))}
          {printable.length === 0 && <div className="text-xs text-muted py-3 text-center">No items with a barcode or SKU.</div>}
        </div>

        <div id="label-sheet" className="overflow-x-auto">
          {pages.map((page, pi) => (
            <div key={pi} className="label-page">
              {page.map((item, ci) => <BarcodeLabel key={`${item.id}-${ci}`} value={item.value} name={item.name} />)}
            </div>
          ))}
          {pages.length === 0 && <div className="text-xs text-muted py-4 text-center no-print">Nothing selected.</div>}
        </div>
      </div>
    </Modal>
  );
}
