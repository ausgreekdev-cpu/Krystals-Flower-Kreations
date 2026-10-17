import { useEffect, useRef, useState } from 'react';
import { BASE, adminApi } from '../../../lib/api/customClient';
import { uploadWithProgress } from '../../../lib/uploadWithProgress';
import useAssetThumb from './useAssetThumb';

function PickCard({ asset, token, onPick }) {
  const thumb = useAssetThumb(asset, token);
  return (
    <button type="button" onClick={() => onPick(asset)} className="group border border-line rounded-xl overflow-hidden bg-surface2 hover:border-royal-500 transition text-left">
      <div className="aspect-square bg-surface3 overflow-hidden">
        {thumb && <img src={thumb} alt={asset.altText || asset.title} className="w-full h-full object-cover" loading="lazy" />}
      </div>
      <div className="px-2 py-1 text-[11px] text-ink truncate">{asset.title}</div>
    </button>
  );
}

// "Upload once, attach anywhere" picker — Library assets only (public
// surfaces need a public URL). Upload-new attaches immediately after upload.
export default function MediaPickerModal({ token, onPick, onClose }) {
  const [assets, setAssets] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    adminApi.media.list(token, { visibility: 'LIBRARY', limit: 48 })
      .then((r) => setAssets(r.assets))
      .catch((e) => { setErr(e.message); setAssets([]); });
  }, [token]);

  async function uploadNew(file) {
    setBusy(`Uploading ${file.name}…`);
    try {
      const r = await uploadWithProgress({
        url: `${BASE}/api/media`, file, token,
        fields: { title: file.name.replace(/\.[^.]+$/, ''), visibility: 'LIBRARY' },
      });
      onPick(r.asset);
    } catch (e) { setErr(e.message); setBusy(''); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Pick from media library" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface border border-line rounded-2xl w-full max-w-3xl max-h-[80vh] overflow-y-auto p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-ink">Choose from the media library</h3>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => fileRef.current?.click()} className="text-xs font-semibold border border-line-strong rounded-xl px-3 py-1.5 hover:bg-surface3">＋ Upload new</button>
            <button type="button" onClick={onClose} className="text-xs text-muted hover:underline">Close</button>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" aria-label="Upload new library image" className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadNew(f); }} />
        {busy && <div className="text-xs text-royal-700 dark:text-royal-300" role="status">{busy}</div>}
        {err && <div className="text-xs text-red-600">{err}</div>}
        {assets === null && <div className="text-xs text-muted py-8 text-center">Loading…</div>}
        {assets?.length === 0 && <div className="text-xs text-muted py-8 text-center">No library assets yet — use “Upload new”.</div>}
        {assets && assets.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {assets.map((a) => <PickCard key={a.id} asset={a} token={token} onPick={onPick} />)}
          </div>
        )}
        <div className="text-[10px] text-muted">Staff-archive photos can't be used on public content — promote them to the library first (Edit → Visibility).</div>
      </div>
    </div>
  );
}
