import { useEffect, useState } from 'react';
import { adminApi } from '../../lib/api/customClient';

const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);

// Full-size image viewer for the Document Centre (keyboard: ←/→/Esc). Loads
// the original bytes through the authed download route — the 160px thumb is
// shown instantly while the full image streams in.
export default function DocumentViewer({ docs, index, token, onNavigate, onClose }) {
  const doc = docs[index];
  const [full, setFull] = useState(null);
  const [thumb, setThumb] = useState(null);

  // Thumb paints immediately (160px webp) while the original streams in —
  // the authed file route can take seconds on cold prod functions.
  useEffect(() => {
    if (!doc?.id) return;
    setFull(null);
    setThumb(null);
    let revoked = false;
    let thumbUrl = null;
    let fullUrl = null;
    if (doc.thumbRef) {
      adminApi.documents.thumb(doc.id, token)
        .then((b) => { if (!revoked) { thumbUrl = URL.createObjectURL(b); setThumb(thumbUrl); } })
        .catch(() => {});
    }
    adminApi.documents.download(doc.id, token)
      .then((b) => {
        if (revoked) return;
        fullUrl = URL.createObjectURL(b);
        setFull(fullUrl);
      })
      .catch(() => {});
    return () => {
      revoked = true;
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
      if (fullUrl) URL.revokeObjectURL(fullUrl);
    };
  }, [doc?.id, token]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNavigate(index - 1);
      if (e.key === 'ArrowRight') onNavigate(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, onClose, onNavigate]);

  if (!doc) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/85 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={`Image viewer — ${doc.title}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-full max-w-5xl">
        <div className="flex justify-between items-center text-white/90 text-xs pb-2">
          <span className="truncate">{doc.title} · {index + 1} of {docs.length} images</span>
          <div className="flex gap-3">
            <a
              href={`${(import.meta.env.VITE_API_URL || '')}/api/documents/${doc.id}/file`}
              onClick={(e) => {
                e.preventDefault();
                adminApi.documents.download(doc.id, token)
                  .then((b) => {
                    const url = URL.createObjectURL(b);
                    const a = document.createElement('a');
                    a.href = url; a.download = doc.originalName || 'document';
                    document.body.appendChild(a); a.click(); a.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 10_000);
                  })
                  .catch(() => {});
              }}
              className="underline">Download</a>
            <button type="button" onClick={onClose} className="underline">Close</button>
          </div>
        </div>
        <div className="bg-black/40 rounded-2xl grid place-items-center" style={{ minHeight: '50vh' }}>
          {full || thumb
            ? <img src={full || thumb} alt={doc.title} className={`max-h-[72vh] w-auto object-contain rounded-xl ${full ? '' : 'opacity-70'}`} />
            : <div className="text-white/70 text-sm p-10">Loading image…</div>}
          {thumb && !full && <div className="text-white/60 text-[11px] pb-2">loading full size…</div>}
        </div>
        <div className="flex items-center justify-between pt-2 text-white/80 text-xs">
          <button type="button" onClick={() => onNavigate(index - 1)} disabled={index <= 0} className="border border-white/30 rounded-full px-3 py-1.5 disabled:opacity-40">← Prev</button>
          <span className="truncate px-3">{[doc.originalName, fmtSize(doc.sizeBytes), new Date(doc.createdAt).toLocaleDateString('en-AU'), doc.category].filter(Boolean).join(' · ')}</span>
          <button type="button" onClick={() => onNavigate(index + 1)} disabled={index >= docs.length - 1} className="border border-white/30 rounded-full px-3 py-1.5 disabled:opacity-40">Next →</button>
        </div>
      </div>
    </div>
  );
}
