import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/api/customClient';
import useAssetThumb from './media/useAssetThumb';

const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);

// Exact-duplicate inspection: shows both sides of a sha256 collision and asks
// what to do — replace the existing record, delete it and store the new one,
// or discard the new upload. `onResolve(action, applyAll)` resumes the upload
// queue with the decision; the choice is sent as `on_duplicate` on the retry.
export default function DuplicateDialog({ kind, token, existing, incoming, busy, onResolve, onCancel }) {
  const mediaThumb = useAssetThumb(kind === 'media' ? existing : null, token);
  const [docThumb, setDocThumb] = useState(null);
  const [applyAll, setApplyAll] = useState(false);
  const attached = Number(existing?.attachments || 0);

  useEffect(() => {
    if (kind !== 'document' || !existing?.id) return;
    let revoked = false;
    let objectUrl = null;
    adminApi.documents.thumb(existing.id, token)
      .then((b) => { if (!revoked) { objectUrl = URL.createObjectURL(b); setDocThumb(objectUrl); } })
      .catch(() => {});
    return () => { revoked = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [kind, existing?.id, token]);

  const thumb = kind === 'media' ? mediaThumb : docThumb;
  const title = existing?.title || existing?.originalName || 'Untitled';
  const incomingName = incoming?.originalName || incoming?.title || 'incoming file';

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Duplicate file detected">
      <div className="bg-surface border border-line rounded-2xl w-full max-w-xl p-5 space-y-4">
        <div>
          <h3 className="font-bold text-sm text-ink">Exact duplicate detected</h3>
          <p className="text-xs text-muted mt-1">
            <span className="font-semibold text-ink">{incomingName}</span> has identical contents (sha256) to a file already in the {kind === 'media' ? 'media library' : 'document centre'}.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 items-start">
          {thumb
            ? <img src={thumb} alt="" className="w-24 h-24 rounded-xl object-cover border border-line bg-surface3" />
            : <div className="w-24 h-24 rounded-xl border border-line bg-surface3 grid place-items-center text-[10px] text-muted">no preview</div>}
          <div className="text-xs text-ink space-y-0.5 flex-1 min-w-[180px]">
            <div className="font-bold">{title}</div>
            {existing?.originalName && <div className="text-muted">file: {existing.originalName}</div>}
            <div className="text-muted">
              {fmtSize(existing?.sizeBytes)}
              {existing?.createdAt && <> · added {new Date(existing.createdAt).toLocaleString('en-AU')}</>}
              {existing?.uploadedById && <> · by {String(existing.uploadedById).slice(0, 8)}…</>}
            </div>
            {(existing?.category || existing?.tags?.length > 0) && (
              <div className="text-muted">
                {existing.category}{existing.tags?.length ? ` · ${existing.tags.join(' · ')}` : ''}
              </div>
            )}
            <div className="text-muted">incoming: {fmtSize(incoming?.sizeBytes)}</div>
            {attached > 0 && (
              <div className="text-amber-700 dark:text-amber-400 font-semibold">
                ⚠ attached to {attached} item{attached === 1 ? '' : 's'} — “delete existing” is unavailable
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={!!busy} onClick={() => onResolve('replace', applyAll)}
            className="text-xs font-bold bg-royal-600 text-white rounded-xl px-3 py-2 disabled:opacity-50">
            {busy === 'replace' ? 'Replacing…' : 'Replace existing'}
          </button>
          <button type="button" disabled={!!busy || attached > 0} onClick={() => onResolve('keep_new', applyAll)}
            className="text-xs font-semibold border border-red-200 text-red-600 rounded-xl px-3 py-2 hover:bg-red-50 disabled:opacity-50">
            {busy === 'keep_new' ? 'Working…' : 'Delete existing & upload new'}
          </button>
          <button type="button" disabled={!!busy} onClick={() => onResolve('skip', applyAll)}
            className="text-xs font-semibold border border-line-strong rounded-xl px-3 py-2 disabled:opacity-50">
            {busy === 'skip' ? 'Working…' : 'Discard this upload'}
          </button>
          <button type="button" disabled={!!busy} onClick={onCancel} className="text-xs text-muted hover:underline">Cancel</button>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} className="h-4 w-4" />
          Apply to all remaining duplicates in this batch
        </label>
      </div>
    </div>
  );
}
