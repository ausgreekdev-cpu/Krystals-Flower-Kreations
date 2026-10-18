import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../lib/api/customClient';
import ImportReviewModal from './ImportReviewModal';

// Pending procedure imports (review queue) for the Recipes tab — created from
// Document Centre / OCR drawer "→ Recipe" analysis.
export default function ImportQueue({ token }) {
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState(null);
  const [reviewId, setReviewId] = useState(null);
  const [err, setErr] = useState('');

  const refresh = useCallback(() => {
    setRows(null);
    adminApi.procedureImports.list(token, status)
      .then(setRows)
      .catch((e) => { setErr(e.message); setRows([]); });
  }, [token, status]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="border border-line rounded-2xl p-4 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold text-sm text-ink">📋 Imported procedures</h3>
        <div className="flex items-center gap-2">
          <select className="border border-line-strong rounded-lg px-2 py-1 text-xs bg-surface2 text-ink" value={status}
            onChange={(e) => setStatus(e.target.value)} aria-label="Import status filter">
            <option value="pending">Pending review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <button type="button" onClick={refresh} className="text-xs text-royal-700 hover:underline">Refresh</button>
        </div>
      </div>
      {err && <div className="text-xs text-red-600 mt-2">{err}</div>}
      {rows === null && <div className="text-xs text-muted py-4">Loading…</div>}
      {rows?.length === 0 && (
        <div className="text-xs text-muted py-4">
          Nothing {status === 'pending' ? 'pending' : status}. Use “→ Recipe” on a document in the Documents tab to analyse a procedure.
        </div>
      )}
      {rows?.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {rows.map((r) => (
            <button key={r.id} type="button" onClick={() => setReviewId(r.id)}
              className="w-full flex flex-wrap items-center gap-3 border border-line rounded-xl px-3 py-2 text-left hover:bg-surface2">
              <span className="font-semibold text-xs text-ink truncate flex-1 min-w-[160px]">{r.title || r.sourceName}</span>
              <span className="text-[10px] text-muted">{r.extracted?.materials?.length ?? 0} materials</span>
              <span className="text-xs font-bold text-highlight">${Number(r.pricing?.retail || 0).toFixed(2)}</span>
              <span className="text-[10px] text-muted">{new Date(r.createdAt).toLocaleDateString('en-AU')}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-royal-50 text-royal-700 border-royal-100">
                {status === 'pending' ? 'review' : status}
              </span>
            </button>
          ))}
        </div>
      )}
      {reviewId && (
        <ImportReviewModal importId={reviewId} token={token}
          onClose={() => setReviewId(null)}
          onSaved={refresh}
          onApproved={() => { setReviewId(null); refresh(); }} />
      )}
    </div>
  );
}
