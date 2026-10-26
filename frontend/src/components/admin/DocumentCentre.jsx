import { useEffect, useRef, useState } from 'react';
import { adminApi } from '../../lib/api/customClient';
import DocumentViewer from './DocumentViewer';
import DuplicateDialog from './DuplicateDialog';
import OcrDrawer from './OcrDrawer';
import ScannerModal from './ScannerModal';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';

// Business document upload centre — private-bucket files behind authed
// downloads. One request per file (Netlify payload limit); identical bytes
// are deduped server-side and reported as "reused".
const KINDS = ['PDF', 'CSV', 'SPREADSHEET', 'IMAGE', 'MARKDOWN', 'TEXT', 'OTHER'];
const CATEGORIES = ['STOCKTAKE', 'SUPPLIER', 'INVOICE', 'PROCEDURE', 'EXPORT', 'MEDIA', 'OTHER'];
// ◪ Suitable sub-categories per category for a paper-florist studio — mirrors backend/src/routes/documents.js SUBCATEGORIES
const SUBCATEGORIES = {
  STOCKTAKE: ['CARDSTOCK', 'WIRE_TAPE', 'ADHESIVES', 'PACKAGING', 'FINISHED'],
  SUPPLIER: ['PAPER_SUPPLIER', 'HARDWARE_SUPPLIER', 'PACKAGING_SUPPLIER', 'GENERAL_SUPPLIER'],
  INVOICE: ['PURCHASE_INVOICE', 'SALES_INVOICE', 'RECEIPT', 'QUOTE', 'CREDIT_NOTE'],
  PROCEDURE: ['PETAL_ASSEMBLY', 'ORIGAMI_FOLD', 'WIRING_TAPING', 'PACKAGING_GUIDE', 'QC_CHECK'],
  EXPORT: ['ORDER_EXPORT', 'INVENTORY_EXPORT', 'BACKUP', 'REPORT'],
  MEDIA: ['PRODUCT_PHOTO', 'WORKSHOP_PHOTO', 'BRAND_ASSET', 'REFERENCE', 'SOCIAL'],
  OTHER: ['GENERAL'],
};
const ACCEPT = '.pdf,.csv,.tsv,.txt,.md,.json,.xlsx,.xls,image/*,.svg,.zip,video/mp4,video/quicktime';
const MAX_BYTES = 25 * 1024 * 1024;

const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
const KIND_CHIP = 'text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-surface3 text-ink';

// M2: rows with a thumbRef show the server-generated 160px webp preview
// (fetched as a blob — the thumb route needs the Bearer header).
function Thumb({ id, token, kind }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let dead = false; let objUrl = '';
    adminApi.documents.thumb(id, token)
      .then((blob) => { if (dead) return; objUrl = URL.createObjectURL(blob); setUrl(objUrl); })
      .catch(() => {});
    return () => { dead = true; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [id, token]);
  if (!url) return <div className="w-10 h-10 rounded-lg bg-surface3 grid place-items-center text-[9px] font-bold text-muted shrink-0" aria-hidden>{kind.slice(0, 3)}</div>;
  return <img src={url} alt="" className="w-10 h-10 rounded-lg object-cover border border-line shrink-0" />;
}

export default function DocumentCentre({ token, role, onOpenImports }) {
  const toast = useToast();
  const [params, setParams] = useState({ q: '', kind: '', category: '', subcategory: '', page: 1 });
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [ocrDoc, setOcrDoc] = useState(null);
  const [batch, setBatch] = useState(null);
  const [dup, setDup] = useState(null);
  const dupResolve = useRef(null);
  const [viewerIdx, setViewerIdx] = useState(-1);
  const fileRef = useRef(null);
  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm bg-surface2 text-ink focus:outline-none focus:ring-2 focus:ring-royal-500';
  const label = 'block text-xs font-semibold text-muted mb-1';

  useEffect(() => {
    const t = setTimeout(() => setParams((p) => (p.q === search.trim() ? p : { ...p, q: search.trim(), page: 1 })), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let dead = false;
    setRows(null);
    adminApi.documents.list(token, params)
      .then((r) => { if (dead) return; setRows(r.documents); setTotal(r.total); setPages(r.pages); setErr(''); })
      .catch((e) => { if (!dead) { setErr(e.message); setRows([]); } });
    return () => { dead = true; };
  }, [params, token]);

  const setF = (patch) => setParams((p) => {
    const next = { ...p, ...patch, page: 1 };
    if ('category' in patch) {
      const cat = patch.category;
      const subs = cat ? (SUBCATEGORIES[cat] || []) : [];
      if (next.subcategory && !subs.includes(next.subcategory)) next.subcategory = '';
    }
    return next;
  });
  const imageRows = (rows || []).filter((d) => d.kind === 'IMAGE');
  const refresh = () => setParams((p) => ({ ...p }));

  // Exact-duplicate inspection: pause the queue on a 409 `duplicate`, let the
  // user decide (replace / keep_new / skip), then re-upload with the decision.
  function askDuplicate(payload, file) {
    return new Promise((resolve) => {
      setDup({ ...payload, file });
      dupResolve.current = (decision) => { setDup(null); dupResolve.current = null; resolve(decision); };
    });
  }

  async function uploadFiles(files) {
    const list = Array.from(files || []).slice(0, 20);
    if (!list.length) return;
    setErr('');
    let ok = 0; let dupes = 0; let replaced = 0; let skipped = 0;
    const failed = [];
    let onDuplicate = 'ask';
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (f.size > MAX_BYTES) { failed.push(`${f.name} (over 25MB)`); continue; }
      setBusy(`Uploading ${i + 1}/${list.length} — ${f.name}`);
      try {
        const r = await adminApi.documents.upload(f, token, onDuplicate, params.category || undefined, params.subcategory || undefined);
        if (r.replaced) replaced++; else if (r.skipped) skipped++; else if (r.deduped) dupes++; else ok++;
        // S3: enrich metadata from the text in its own request (the upload may
        // already be busy with OCR) — best effort, never blocks the queue.
        if (r.document?.id && !r.deduped) {
          adminApi.documents.enrich(r.document.id, token)
            .then(() => refresh())
            .catch(() => {});
        }
      } catch (e) {
        if (e.code === 'duplicate' && e.body?.existing) {
          setBusy('');
          const decision = await askDuplicate(e.body, f);
          if (!decision) { failed.push(`${f.name}: cancelled`); break; }
          if (decision.applyAll) onDuplicate = decision.action;
          setBusy(`Uploading ${i + 1}/${list.length} — ${f.name}`);
          try {
            const r = await adminApi.documents.upload(f, token, decision.action, params.category || undefined, params.subcategory || undefined);
            if (r.replaced) replaced++; else if (r.skipped) skipped++; else if (r.deduped) dupes++; else ok++;
          } catch (e2) { failed.push(`${f.name}: ${e2.message}`); }
          continue;
        }
        failed.push(`${f.name}: ${e.message}`);
      }
    }
    setBusy('');
    const bits = [`${ok} uploaded`];
    if (dupes) bits.push(`${dupes} reused`);
    if (replaced) bits.push(`${replaced} replaced`);
    if (skipped) bits.push(`${skipped} discarded`);
    const summary = bits.join(', ');
    if (failed.length) toast(`${summary} — failed: ${failed.join('; ')}`, 'error');
    else toast(summary);
    refresh();
  }

  async function download(d) {
    try {
      const blob = await adminApi.documents.download(d.id, token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = d.originalName;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) { toast(e.message, 'error'); }
  }

  async function saveEdit() {
    try {
      const body = { title: editing.title.trim(), category: editing.category, subcategory: editing.subcategory || null };
      body.tags = editing.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10);
      await adminApi.documents.update(editing.id, body, token);
      toast('Document updated');
      setEditing(null);
      refresh();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function doDelete() {
    try { await adminApi.documents.remove(confirmDel.id, token); toast('Document deleted'); setConfirmDel(null); refresh(); }
    catch (e) { toast(e.message, 'error'); }
  }

  // Batch OCR (Phase D): sequential queue over the visible IMAGE/PDF rows
  // without text — per-item progress, skips already-OCR'd rows.
  async function runBatchOcr() {
    const targets = (rows || []).filter((d) => (d.kind === 'IMAGE' || d.kind === 'PDF') && !d.hasText && d.mime !== 'image/svg+xml');
    if (!targets.length) { toast('No un-OCR’d images or PDFs on this page'); return; }
    setBatch(targets.map((d) => ({ id: d.id, title: d.title, status: 'queued' })));
    for (const t of targets) {
      setBatch((q) => q.map((x) => (x.id === t.id ? { ...x, status: 'running' } : x)));
      try {
        const r = await adminApi.documents.ocr(t.id, token, false);
        setBatch((q) => q.map((x) => (x.id === t.id ? { ...x, status: 'done', message: `${r.ocr?.chars ?? 0} chars` } : x)));
      } catch (e) {
        const msg = e.message || 'failed';
        const skipped = /already has/i.test(msg);
        setBatch((q) => q.map((x) => (x.id === t.id ? { ...x, status: skipped ? 'skipped' : 'error', message: msg } : x)));
      }
    }
    refresh();
  }

  // Procedure → recipe import (Phase 2): analyse this document's text into a
  // pending proposal, then jump to the review queue.
  async function analyzeToRecipe(d) {
    setBusy(`Analysing "${d.title}"…`);
    try {
      const r = await adminApi.procedureImports.analyze(token, { documentId: d.id });
      toast(`Recipe proposal ready (${r.engine}) — review it in Recipes`);
      onOpenImports?.();
    } catch (e) {
      toast(e.message || 'Analysis failed', e?.message?.includes('not look like') ? 'error' : 'error');
    } finally { setBusy(''); }
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files); }}
        className={`border-2 border-dashed rounded-2xl p-5 text-center transition ${dragOver ? 'border-royal-500 bg-royal-50 dark:bg-royal-900' : 'border-line bg-surface2'}`}
      >
        <input ref={fileRef} type="file" multiple accept={ACCEPT} aria-label="Upload documents" className="sr-only"
          onChange={(e) => { const files = e.target.files; e.target.value = ''; uploadFiles(files); }} />
        <div className="text-sm text-ink font-semibold">Drop files here or{' '}
          <button type="button" onClick={() => fileRef.current?.click()} className="text-royal-700 dark:text-royal-300 underline font-bold">browse</button>
          {' '}or{' '}
          <button type="button" onClick={() => setScanning(true)} className="text-royal-700 dark:text-royal-300 underline font-bold">📷 scan</button>
        </div>
        <div className="text-[11px] text-muted mt-1">PDF, XLSX, CSV, images &amp; more — max 25MB each. Identical files are detected and reused; category is guessed from the filename; PDF &amp; spreadsheet text becomes searchable.</div>
        {busy && <div className="text-xs text-royal-700 dark:text-royal-300 font-semibold mt-2" role="status">{busy}</div>}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[180px]"><label className={label} htmlFor="doc-q">Search</label>
          <input id="doc-q" className={input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title, file name, tag or contents…" /></div>
        <div><label className={label} htmlFor="doc-kind">Type</label>
          <select id="doc-kind" className={input} value={params.kind} onChange={(e) => setF({ kind: e.target.value })}>
            <option value="">All</option>
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select></div>
        <div><label className={label} htmlFor="doc-cat">Category</label>
          <select id="doc-cat" className={input} value={params.category} onChange={(e) => setF({ category: e.target.value })}>
            <option value="">All</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></div>
        <div><label className={label} htmlFor="doc-subcat">Sub-category</label>
          <select id="doc-subcat" className={input} value={params.subcategory} onChange={(e) => setF({ subcategory: e.target.value })} disabled={!params.category}>
            <option value="">All</option>
            {(params.category ? (SUBCATEGORIES[params.category] || []) : Object.values(SUBCATEGORIES).flat()).map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
          </select></div>
        <button type="button" onClick={runBatchOcr} disabled={!!batch}
          className="text-xs font-semibold border border-royal-200 text-royal-700 dark:text-royal-300 rounded-xl px-3 py-2 hover:bg-royal-50 dark:hover:bg-royal-950 disabled:opacity-50">
          {batch ? 'OCR running…' : 'Batch OCR (page)'}
        </button>
      </div>

      {batch && (
        <div className="border border-line rounded-xl p-3 bg-surface2 space-y-1">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-ink">OCR queue</div>
            <button type="button" onClick={() => setBatch(null)} className="text-[11px] text-muted hover:underline">Hide</button>
          </div>
          {batch.map((b) => (
            <div key={b.id} className="flex items-center gap-2 text-[11px]">
              <span className={`w-16 shrink-0 font-semibold ${b.status === 'done' ? 'text-emerald-600 dark:text-emerald-300' : b.status === 'error' ? 'text-red-600 dark:text-red-300' : b.status === 'running' ? 'text-royal-700 dark:text-royal-300' : 'text-muted'}`}>{b.status}</span>
              <span className="truncate flex-1 text-ink">{b.title}</span>
              {b.message && <span className="text-muted truncate max-w-[200px]">{b.message}</span>}
            </div>
          ))}
        </div>
      )}

      {err && <div className="text-xs text-red-600 dark:text-red-300">{err}</div>}
      {rows === null && <div className="text-xs text-muted py-6 text-center">Loading…</div>}
      {rows?.length === 0 && <div className="text-xs text-muted py-10 text-center">No documents match — drop a file above to add the first one.</div>}
      {rows?.map((d) => (
        <div key={d.id} className="flex flex-wrap items-center gap-3 border border-line rounded-xl px-4 py-3">
          {d.thumbRef
            ? (
              d.kind === 'IMAGE'
                ? (
                  <button type="button" onClick={() => setViewerIdx(imageRows.findIndex((x) => x.id === d.id))} className="shrink-0" aria-label={`View ${d.title}`}>
                    <Thumb id={d.id} token={token} kind={d.kind} />
                  </button>
                )
                : <Thumb id={d.id} token={token} kind={d.kind} />
            )
            : <div className="w-10 h-10 rounded-lg bg-surface3 grid place-items-center text-[9px] font-bold text-muted shrink-0" aria-hidden>{d.kind.slice(0, 3)}</div>}
          <div className="flex-1 min-w-[200px]">
            <div className="font-bold text-sm text-ink truncate">{d.title}</div>
            <div className="text-xs text-muted truncate">{d.originalName} • {fmtSize(d.sizeBytes)} • {new Date(d.createdAt).toLocaleDateString('en-AU')}</div>
          </div>
          <span className={KIND_CHIP}>{d.kind}</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-royal-50 dark:bg-royal-900 text-royal-700 dark:text-royal-300 border-royal-100 dark:border-royal-700">{d.category}</span>
          {d.subcategory && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-amber-50 dark:bg-amber-900 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-700">{d.subcategory.replace(/_/g, ' ')}</span>}
          {d.tags?.length > 0 && <span className="text-[10px] text-muted hidden md:inline">{d.tags.slice(0, 3).join(' · ')}</span>}
          {d.kind === 'IMAGE' && (
            <button onClick={() => setViewerIdx(imageRows.findIndex((x) => x.id === d.id))}
              className="text-xs font-semibold border border-line-strong rounded-xl px-2.5 py-1 text-ink hover:bg-surface3">View</button>
          )}
          <button onClick={() => download(d)} className="text-xs font-semibold border border-line-strong rounded-xl px-2.5 py-1 text-ink hover:bg-surface3">Download</button>
          {(d.kind === 'IMAGE' || d.kind === 'PDF') && (
            <button onClick={() => setOcrDoc(d)}
              className="text-xs font-semibold border border-royal-200 rounded-xl px-2.5 py-1 text-royal-700 dark:text-royal-300 hover:bg-royal-50 dark:hover:bg-royal-950">
              {d.hasText ? 'View text' : 'OCR'}
            </button>
          )}
          <button onClick={() => analyzeToRecipe(d)} disabled={!!busy}
            className="text-xs font-semibold border border-emerald-200 dark:border-emerald-700 rounded-xl px-2.5 py-1 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950 disabled:opacity-50">
            → Recipe
          </button>
          <button onClick={() => setEditing({ id: d.id, title: d.title, category: d.category, subcategory: d.subcategory || '', tags: (d.tags || []).join(', ') })}
            className="text-xs font-semibold border border-line-strong rounded-xl px-2.5 py-1 text-ink hover:bg-surface3">Edit</button>
          <button onClick={() => setConfirmDel(d)} className="text-xs font-semibold border border-red-200 dark:border-red-700 rounded-xl px-2.5 py-1 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950">Delete</button>
        </div>
      ))}

      {rows?.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted pt-1">
          <span>{total} total{role ? '' : ''}</span>
          <div className="flex items-center gap-2">
            <button disabled={params.page <= 1} onClick={() => setParams((p) => ({ ...p, page: p.page - 1 }))} className="border border-line-strong rounded-xl px-2.5 py-1 disabled:opacity-50">Prev</button>
            <span>Page {params.page} of {pages}</span>
            <button disabled={params.page >= pages} onClick={() => setParams((p) => ({ ...p, page: p.page + 1 }))} className="border border-line-strong rounded-xl px-2.5 py-1 disabled:opacity-50">Next</button>
          </div>
        </div>
      )}

      {viewerIdx >= 0 && imageRows[viewerIdx] && (
        <DocumentViewer docs={imageRows} index={viewerIdx} token={token}
          onNavigate={(i) => setViewerIdx(i >= 0 && i < imageRows.length ? i : viewerIdx)}
          onClose={() => setViewerIdx(-1)} />
      )}

      {dup && (
        <DuplicateDialog kind="document" token={token} existing={dup.existing} incoming={dup.incoming}
          onResolve={(action, applyAll) => dupResolve.current?.({ action, applyAll })}
          onCancel={() => dupResolve.current?.(null)} />
      )}

      {scanning && (
        <ScannerModal token={token} onClose={() => setScanning(false)}
          onDone={(doc, note) => { setScanning(false); toast(`${doc.title}: ${note || 'uploaded'}`); refresh(); }} />
      )}

      {ocrDoc && (
        <OcrDrawer doc={ocrDoc} token={token} onClose={() => setOcrDoc(null)}
          onSaved={() => { toast('Text saved'); refresh(); }}
          onAnalyzed={(r) => { toast(`Recipe proposal ready (${r.engine}) — review it in Recipes`); setOcrDoc(null); onOpenImports?.(); }} />
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Edit document">
          <div className="bg-surface border rounded-2xl p-5 w-full max-w-md space-y-3">
            <h3 className="font-bold text-sm">Edit document</h3>
            <div><label className={label} htmlFor="doc-title">Title</label>
              <input id="doc-title" className={input} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} maxLength={200} /></div>
            <div><label className={label} htmlFor="doc-ecat">Category</label>
              <select id="doc-ecat" className={input} value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value, subcategory: '' })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select></div>
            <div><label className={label} htmlFor="doc-esub">Sub-category</label>
              <select id="doc-esub" className={input} value={editing.subcategory || ''} onChange={(e) => setEditing({ ...editing, subcategory: e.target.value })}>
                <option value="">— None —</option>
                {(SUBCATEGORIES[editing.category] || []).map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select></div>
            <div><label className={label} htmlFor="doc-tags">Tags (comma separated)</label>
              <input id="doc-tags" className={input} value={editing.tags} onChange={(e) => setEditing({ ...editing, tags: e.target.value })} placeholder="stocktake, park-lane" /></div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEditing(null)} className="text-xs font-semibold border border-line-strong rounded-xl px-3 py-1.5">Cancel</button>
              <button onClick={saveEdit} disabled={!editing.title.trim()} className="text-xs font-bold bg-royal-600 text-white rounded-xl px-3 py-1.5 disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <ConfirmDialog
          title="Delete document"
          message={`Delete "${confirmDel.title}"? The file is removed from storage.`}
          onConfirm={doDelete}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}
