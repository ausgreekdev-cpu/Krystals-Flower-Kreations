import { useRef, useState } from 'react';
import { BASE } from '../../../lib/api/customClient';
import { uploadWithProgress } from '../../../lib/uploadWithProgress';
import DuplicateDialog from '../DuplicateDialog';

// Upload queue with real per-file progress + inline metadata (title, tags,
// visibility) editable before the upload starts. Sequential uploads keep the
// Netlify function payload/connection budget predictable (mirrors the
// Document Centre). `source` marks camera captures for the scanner flow.
export default function MediaUploadPanel({ token, folderId, onDone, onClose }) {
  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dup, setDup] = useState(null);
  const dupResolve = useRef(null);
  const fileRef = useRef(null);
  const camRef = useRef(null);

  const addFiles = (files, source = 'UPLOAD') => {
    const items = Array.from(files || []).slice(0, 20).map((f) => ({
      uid: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 8)}`,
      file: f,
      preview: URL.createObjectURL(f),
      title: f.name.replace(/\.[^.]+$/, '').slice(0, 200),
      tags: '',
      visibility: 'LIBRARY',
      source,
      progress: 0,
      status: 'queued',
      error: '',
    }));
    setQueue((q) => [...q, ...items]);
  };

  const patch = (uid, p) => setQueue((q) => q.map((it) => (it.uid === uid ? { ...it, ...p } : it)));

  // Exact-duplicate inspection: 409 pauses the queue, the dialog decides
  // (replace / keep_new / skip), then the same file re-uploads with the choice.
  function askDuplicate(payload, item) {
    return new Promise((resolve) => {
      setDup({ ...payload, item });
      dupResolve.current = (decision) => { setDup(null); dupResolve.current = null; resolve(decision); };
    });
  }

  const uploadOne = (item, onDuplicate) =>
    uploadWithProgress({
      url: `${BASE}/api/media`,
      file: item.file,
      token,
      fields: { title: item.title, tags: item.tags, visibility: item.visibility, folderId, source: item.source, on_duplicate: onDuplicate },
      onProgress: (p) => patch(item.uid, { progress: p }),
    });

  async function startUpload() {
    setBusy(true);
    let done = 0;
    let onDuplicate = 'ask';
    for (const item of queue.filter((it) => it.status === 'queued')) {
      patch(item.uid, { status: 'uploading', progress: 0 });
      try {
        await uploadOne(item, onDuplicate);
        patch(item.uid, { status: 'done', progress: 1 });
        done++;
      } catch (e) {
        if (e.code === 'duplicate' && e.body?.existing) {
          const decision = await askDuplicate(e.body, item);
          if (!decision) { patch(item.uid, { status: 'error', error: 'cancelled' }); continue; }
          if (decision.applyAll) onDuplicate = decision.action;
          try {
            await uploadOne(item, decision.action);
            patch(item.uid, { status: 'done', progress: 1 });
            done++;
          } catch (e2) {
            patch(item.uid, { status: 'error', error: e2.message || 'Upload failed' });
          }
          continue;
        }
        patch(item.uid, { status: 'error', error: e.message || 'Upload failed' });
      }
    }
    setBusy(false);
    onDone?.(done);
    setQueue((q) => q.filter((it) => it.status === 'queued' || it.status === 'error'));
  }

  const input = 'w-full border border-line-strong rounded-xl px-3 py-1.5 text-xs bg-surface2 text-ink focus:outline-none focus:ring-2 focus:ring-royal-500';

  return (
    <>
    {dup && (
      <DuplicateDialog kind="media" token={token} existing={dup.existing} incoming={dup.incoming}
        onResolve={(action, applyAll) => dupResolve.current?.({ action, applyAll })}
        onCancel={() => dupResolve.current?.(null)} />
    )}
    <div className="border border-line rounded-2xl bg-surface2 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm text-ink">Upload media</h3>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => camRef.current?.click()} className="text-xs font-semibold border border-line-strong rounded-xl px-3 py-1.5 text-ink hover:bg-surface3">📷 Camera</button>
          <button type="button" onClick={() => fileRef.current?.click()} className="text-xs font-semibold border border-line-strong rounded-xl px-3 py-1.5 text-ink hover:bg-surface3">Browse</button>
          <button type="button" onClick={onClose} className="text-xs text-muted hover:underline">Close</button>
        </div>
      </div>
      <div className="text-[11px] text-muted">JPEG, PNG, WebP, GIF or AVIF — max 10MB each. Library images get responsive webp/avif variants automatically; Staff assets stay private.</div>

      <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,image/avif" aria-label="Upload images" className="sr-only"
        onChange={(e) => { const files = e.target.files; e.target.value = ''; addFiles(files); }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" aria-label="Capture image with camera" className="sr-only"
        onChange={(e) => { const files = e.target.files; e.target.value = ''; addFiles(files, 'CAMERA'); }} />

      {queue.length === 0 && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
          className="border-2 border-dashed border-line rounded-xl p-6 text-center text-xs text-muted">
          Drop images here or use Browse / Camera above.
        </div>
      )}

      {queue.map((it) => (
        <div key={it.uid} className="flex flex-wrap items-start gap-3 border border-line rounded-xl p-2.5">
          <img src={it.preview} alt="" className="w-14 h-14 rounded-lg object-cover bg-surface3 shrink-0" />
          <div className="flex-1 min-w-[180px] space-y-1.5">
            <input className={input} value={it.title} maxLength={200} disabled={it.status !== 'queued'}
              onChange={(e) => patch(it.uid, { title: e.target.value })} placeholder="Title" aria-label="Title" />
            <div className="flex gap-1.5">
              <input className={input} value={it.tags} maxLength={120} disabled={it.status !== 'queued'}
                onChange={(e) => patch(it.uid, { tags: e.target.value })} placeholder="tags, comma separated" aria-label="Tags" />
              <select className={`${input} w-28 shrink-0`} value={it.visibility} disabled={it.status !== 'queued'}
                onChange={(e) => patch(it.uid, { visibility: e.target.value })} aria-label="Visibility">
                <option value="LIBRARY">Library</option>
                <option value="STAFF">Staff</option>
              </select>
            </div>
            {(it.status === 'uploading' || it.status === 'done') && (
              <div className="h-1.5 rounded-full bg-surface3 overflow-hidden" role="progressbar" aria-valuenow={Math.round(it.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className={`h-full rounded-full transition-all ${it.status === 'done' ? 'bg-emerald-500' : 'bg-royal-50 dark:bg-royal-9000'}`} style={{ width: `${Math.round(it.progress * 100)}%` }} />
              </div>
            )}
            {it.error && <div className="text-[11px] text-red-600 dark:text-red-300">{it.error}</div>}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-[10px] text-muted">{it.status === 'queued' ? 'ready' : it.status}</span>
            {it.status === 'queued' && (
              <button type="button" onClick={() => setQueue((q) => q.filter((x) => x.uid !== it.uid))} className="text-[11px] text-red-600 dark:text-red-300 hover:underline">Remove</button>
            )}
          </div>
        </div>
      ))}

      {queue.length > 0 && (
        <div className="flex justify-end">
          <button type="button" onClick={startUpload} disabled={busy || !queue.some((it) => it.status === 'queued')}
            className="text-xs font-bold bg-royal-600 text-white rounded-xl px-4 py-2 disabled:opacity-50">
            {busy ? 'Uploading…' : `Upload ${queue.filter((it) => it.status === 'queued').length} file(s)`}
          </button>
        </div>
      )}
    </div>
    </>
  );
}
