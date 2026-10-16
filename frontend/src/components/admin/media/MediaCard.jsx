import useAssetThumb from './useAssetThumb';

const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);

export default function MediaCard({ asset, token, selected, onToggle, onOpen, onEdit }) {
  const thumb = useAssetThumb(asset, token);
  return (
    <div className={`relative group border rounded-xl overflow-hidden bg-surface2 transition ${selected ? 'border-royal-500 ring-2 ring-royal-200' : 'border-line'}`}>
      <button type="button" onClick={() => onOpen(asset)} className="block w-full aspect-square bg-surface3 overflow-hidden" aria-label={`Preview ${asset.title}`}>
        {thumb
          ? <img src={thumb} alt={asset.altText || asset.title} className="w-full h-full object-cover" loading="lazy" />
          : <div className="w-full h-full grid place-items-center text-[10px] text-muted">no preview</div>}
      </button>
      <label className="absolute top-2 left-2 flex items-center">
        <input type="checkbox" checked={selected} onChange={() => onToggle(asset.id)} className="h-4 w-4 rounded border-line-strong" aria-label={`Select ${asset.title}`} />
      </label>
      <span className={`absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${asset.visibility === 'STAFF' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-royal-50 text-royal-700 border-royal-100'}`}>
        {asset.visibility === 'STAFF' ? 'Staff' : 'Library'}
      </span>
      <div className="p-2">
        <div className="text-xs font-semibold text-ink truncate" title={asset.title}>{asset.title}</div>
        <div className="text-[10px] text-muted truncate">{fmtSize(asset.sizeBytes)}{asset.width ? ` · ${asset.width}×${asset.height}` : ''}</div>
        <button type="button" onClick={() => onEdit(asset)} className="mt-1 text-[11px] font-semibold text-royal-700 hover:underline">Edit</button>
      </div>
    </div>
  );
}
