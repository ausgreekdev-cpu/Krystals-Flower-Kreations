import { useEffect, useRef, useState } from 'react';
import { adminApi } from '../../lib/api/customClient';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';

// Business document upload centre — private-bucket files behind authed
// downloads. One request per file (Netlify payload limit); identical bytes
// are deduped server-side and reported as "reused".
const KINDS = ['PDF', 'CSV', 'SPREADSHEET', 'IMAGE', 'MARKDOWN', 'TEXT', 'OTHER'];
const CATEGORIES = ['STOCKTAKE', 'SUPPLIER', 'INVOICE', 'PROCEDURE', 'EXPORT', 'MEDIA', 'OTHER'];
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

export default function DocumentCentre({ token, role }) {
  const toast = useToast();
  const [params, setParams] = useState({ q: '', kind: '', category: '', page: 1 });
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [ocrBusy, setOcrBusy] = useState('');
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

  const setF = (patch) => setParams((p) => ({ ...p, ...patch, page: 1 }));
  const refresh = () => setParams((p) => ({ ...p }));

  async function uploadFiles(files) {
    const list = Array.from(files || []).slice(0, 20);
    if (!list.length) return;
    setErr('');
    let ok = 0; let dupes = 0;
    const failed = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (f.size > MAX_BYTES) { failed.push(`${f.name} (over 25MB)`); continue; }
      setBusy(`Uploading ${i + 1}/${list.length} — ${f.name}`);
      try {
        const r = await adminApi.documents.upload(f, token);
        if (r.deduped) dupes++; else ok++;
      } catch (e) { failed.push(`${f.name}: ${e.message}`); }
    }
    setBusy('');
    const summary = `${ok} uploaded${dupes ? `, ${dupes} duplicate${dupes > 1 ? 's' : ''} reused` : ''}`;
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
      const body = { title: editing.title.trim(), category: editing.category };
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

  // M4: on-demand OCR for images (tesseract) / no-text-layer PDF retry.
  async function runOcr(d, force = false) {
    setOcrBusy(d.id);
    try {
      const r = await adminApi.documents.ocr(d.id, token, force);
      const conf = r.ocr.confidence ? ` — ${Math.round(r.ocr.confidence)}% confidence` : '';
      toast(`OCR complete: ${r.ocr.chars} characters extracted${conf}`);
      refresh();
    } catch (e) {
      if (!force && String(e.message).includes('already has extracted text')
        && window.confirm(`"${d.title}" already has extracted text. Re-run OCR anyway?`)) {
        setOcrBusy('');
        return runOcr(d, true);
      }
      toast(e.message, 'error');
    } finally { setOcrBusy(''); }
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files); }}
        className={`border-2 border-dashed rounded-2xl p-5 text-center transition ${dragOver ? 'border-royal-500 bg-royal-50' : 'border-line bg-surface2'}`}
      >
        <input ref={fileRef} type="file" multiple accept={ACCEPT} className="sr-only"
          onChange={(e) => { const files = e.target.files; e.target.value = ''; uploadFiles(files); }} />
        <div className="text-sm text-ink font-semibold">Drop files here or{' '}
          <button type="button" onClick={() => fileRef.current?.click()} className="text-royal-700 underline font-bold">browse</button>
        </div>
        <div className="text-[11px] text-muted mt-1">PDF, XLSX, CSV, images &amp; more — max 25MB each. Identical files are detected and reused; category is guessed from the filename; PDF &amp; spreadsheet text becomes searchable.</div>
        {busy && <div className="text-xs text-royal-700 font-semibold mt-2" role="status">{busy}</div>}
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
      </div>

      {err && <div className="text-xs text-red-600">{err}</div>}
      {rows === null && <div className="text-xs text-muted py-6 text-center">Loading…</div>}
      {rows?.length === 0 && <div className="text-xs text-muted py-10 text-center">No documents match — drop a file above to add the first one.</div>}
      {rows?.map((d) => (
        <div key={d.id} className="flex flex-wrap items-center gap-3 border border-line rounded-xl px-4 py-3">
          {d.thumbRef
            ? <Thumb id={d.id} token={token} kind={d.kind} />
            : <div className="w-10 h-10 rounded-lg bg-surface3 grid place-items-center text-[9px] font-bold text-muted shrink-0" aria-hidden>{d.kind.slice(0, 3)}</div>}
          <div className="flex-1 min-w-[200px]">
            <div className="font-bold text-sm text-ink truncate">{d.title}</div>
            <div className="text-xs text-muted truncate">{d.originalName} • {fmtSize(d.sizeBytes)} • {new Date(d.createdAt).toLocaleDateString('en-AU')}</div>
          </div>
          <span className={KIND_CHIP}>{d.kind}</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-royal-50 text-royal-700 border-royal-100">{d.category}</span>
          {d.tags?.length > 0 && <span className="text-[10px] text-muted hidden md:inline">{d.tags.slice(0, 3).join(' · ')}</span>}
          <button onClick={() => download(d)} className="text-xs font-semibold border border-line-strong rounded-xl px-2.5 py-1 text-ink hover:bg-surface3">Download</button>
          {(d.kind === 'IMAGE' || d.kind === 'PDF') && (
            <button onClick={() => runOcr(d)} disabled={ocrBusy === d.id}
              className="text-xs font-semibold border border-royal-200 rounded-xl px-2.5 py-1 text-royal-700 hover:bg-royal-50 disabled:opacity-50">
              {ocrBusy === d.id ? 'Reading…' : 'OCR'}
            </button>
          )}
          <button onClick={() => setEditing({ id: d.id, title: d.title, category: d.category, tags: (d.tags || []).join(', ') })}
            className="text-xs font-semibold border border-line-strong rounded-xl px-2.5 py-1 text-ink hover:bg-surface3">Edit</button>
          <button onClick={() => setConfirmDel(d)} className="text-xs font-semibold border border-red-200 rounded-xl px-2.5 py-1 text-red-600 hover:bg-red-50">Delete</button>
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

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Edit document">
          <div className="bg-surface border rounded-2xl p-5 w-full max-w-md space-y-3">
            <h3 className="font-bold text-sm">Edit document</h3>
            <div><label className={label} htmlFor="doc-title">Title</label>
              <input id="doc-title" className={input} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} maxLength={200} /></div>
            <div><label className={label} htmlFor="doc-ecat">Category</label>
              <select id="doc-ecat" className={input} value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
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
