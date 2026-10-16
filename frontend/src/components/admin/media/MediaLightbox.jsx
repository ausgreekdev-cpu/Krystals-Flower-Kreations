import { useEffect } from 'react';
import useAssetThumb from './useAssetThumb';

// Full-size preview with keyboard navigation (←/→/Esc) and a metadata strip.
export default function MediaLightbox({ assets, index, token, onNavigate, onClose, onEdit }) {
  const asset = assets[index];
  const thumb = useAssetThumb(asset, token);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNavigate(index - 1);
      if (e.key === 'ArrowRight') onNavigate(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, onClose, onNavigate]);

  if (!asset) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={`Preview ${asset.title}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-full max-w-4xl">
        <div className="flex justify-between items-center text-white/90 text-xs pb-2">
          <span className="truncate">{asset.title} · {index + 1} of {assets.length}</span>
          <div className="flex gap-3">
            <button type="button" onClick={() => onEdit?.(asset)} className="underline">Edit</button>
            <button type="button" onClick={onClose} className="underline">Close</button>
          </div>
        </div>
        <div className="bg-black/40 rounded-2xl grid place-items-center" style={{ minHeight: '50vh' }}>
          {thumb
            ? <img src={thumb} alt={asset.altText || asset.title} className="max-h-[70vh] w-auto object-contain rounded-xl" />
            : <div className="text-white/70 text-sm p-10">No preview</div>}
        </div>
        <div className="flex items-center justify-between pt-2 text-white/80 text-xs">
          <button type="button" onClick={() => onNavigate(index - 1)} disabled={index <= 0} className="border border-white/30 rounded-full px-3 py-1.5 disabled:opacity-40">← Prev</button>
          <span className="truncate px-3">{[asset.width && `${asset.width}×${asset.height}`, asset.visibility === 'STAFF' ? 'Staff archive' : 'Library', asset.caption].filter(Boolean).join(' · ')}</span>
          <button type="button" onClick={() => onNavigate(index + 1)} disabled={index >= assets.length - 1} className="border border-white/30 rounded-full px-3 py-1.5 disabled:opacity-40">Next →</button>
        </div>
      </div>
    </div>
  );
}
