import { useEffect, useState } from 'react';

// AR try-on via <model-viewer> (CDN loaded once in index.html). A GLB is only
// rendered when /3d/<slug>.glb exists AND is a real model (>1KB) — the repo
// ships 12-byte placeholders until the Blender export lands.
export default function ARViewer({ productSlug = 'peony', title = 'Everlasting Bouquet' }) {
  const glb = `/3d/${productSlug}.glb`;
  const [ready, setReady] = useState(false);
  const [probing, setProbing] = useState(true);
  useEffect(() => {
    let alive = true;
    setProbing(true); setReady(false);
    // Range GET: vite HEAD omits content-length; missing files fall back to
    // SPA index.html (text/html) which must never count as a model.
    fetch(glb, { headers: { Range: 'bytes=0-1' } })
      .then(async (r) => {
        if (!alive || !r.ok) return;
        const ct = r.headers.get('content-type') || '';
        if (ct.includes('text/html')) return;
        const m = (r.headers.get('content-range') || '').match(/\/(\d+)\s*$/);
        let size = m ? Number(m[1]) : Number(r.headers.get('content-length') || 0);
        if (!size) size = (await r.blob()).size;
        if (size > 1024) setReady(true);
      })
      .catch(() => {})
      .finally(() => { if (alive) setProbing(false); });
    return () => { alive = false; };
  }, [glb]);
  return (
    <div className="bg-gradient-to-br from-surface to-surface2 rounded-2xl border p-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-ink text-sm">AR Try-On — Free</h3>
        <span className="text-[10px] bg-bloom-500 text-white px-2 py-1 rounded-full">No app install</span>
      </div>
      <div className="mt-3 bg-surface2 rounded-xl border overflow-hidden" style={{ height: 220 }}>
        {ready ? (
          <model-viewer
            src={glb}
            alt={title}
            ar
            ar-modes="webxr scene-viewer quick-look"
            camera-controls
            touch-action="pan-y"
            shadow-intensity="1"
            environment-image="neutral"
            style={{ width: '100%', height: '220px', backgroundColor: 'transparent' }}
          >
            <button slot="ar-button" className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-bloom-500 text-white px-4 py-2 rounded-full text-xs font-bold shadow">View on your table</button>
          </model-viewer>
        ) : (
          <div className="w-full h-full grid place-items-center p-6 relative">
            <div className="absolute inset-0 grid grid-cols-3 gap-2 p-4 opacity-60">
              <div className="bg-surface rounded-xl grid place-items-center text-2xl">🌹</div>
              <div className="bg-surface rounded-xl grid place-items-center text-2xl">🪷</div>
              <div className="bg-surface rounded-xl grid place-items-center text-2xl">✂️</div>
            </div>
            <div className="relative bg-surface2/90 backdrop-blur rounded-xl px-4 py-3 border shadow text-center">
              <div className="font-bold text-ink text-sm">{title}</div>
              <div className="text-xs text-muted">{probing ? 'Checking 3D model…' : <>Add your Blender export at <code className="bg-surface3 px-1 rounded">{glb}</code></>}</div>
              <a href={glb} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs bg-bloom-500 text-white px-3 py-1.5 rounded-full">Check GLB exists →</a>
            </div>
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted mt-2">Free pipeline: Blender 4.2 → Draco GLB &lt;2MB → place in <code>frontend/public/3d/</code>. Cached 30d via Workbox.</p>
    </div>
  );
}
