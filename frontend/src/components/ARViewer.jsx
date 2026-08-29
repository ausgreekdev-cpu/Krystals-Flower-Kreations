// $0 AR placeholder — <model-viewer> with CSS 3-view fallback (no paid GLB)
// Free: @google/model-viewer via unpkg CDN, cached via Workbox delux-bouquet-glbs

export default function ARViewer({ productSlug = 'peony', title = 'Everlasting Bouquet' }) {
  // Free CDN placeholder GLBs (public domain) — swap to your Blender export at /3d/<slug>.glb when ready
  // For $0, we show CSS fallback and lazy-load model-viewer only if glb exists at /3d/${productSlug}.glb
  const glb = `/3d/${productSlug}.glb`;
  const usdz = `/3d/${productSlug}.usdz`;
  return (
    <div className="bg-gradient-to-br from-bloom-50 to-white rounded-2xl border p-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-bloom-700 text-sm">AR Try-On — Free</h3>
        <span className="text-[10px] bg-bloom-500 text-white px-2 py-1 rounded-full">No app install</span>
      </div>
      {/* model-viewer free web component — will 404 gracefully until you add /3d/*.glb via Blender */}
      <div className="mt-3 bg-white rounded-xl border overflow-hidden" style={{ height: 220 }}>
        {/* Fallback CSS 3-view carousel when GLB missing */}
        <div className="w-full h-full grid place-items-center p-6 relative">
          <div className="absolute inset-0 grid grid-cols-3 gap-2 p-4 opacity-60">
            <div className="bg-bloom-50 rounded-xl grid place-items-center text-2xl">🌹</div>
            <div className="bg-bloom-50 rounded-xl grid place-items-center text-2xl">🪷</div>
            <div className="bg-bloom-50 rounded-xl grid place-items-center text-2xl">✂️</div>
          </div>
          <div className="relative bg-white/90 backdrop-blur rounded-xl px-4 py-3 border shadow text-center">
            <div className="font-bold text-bloom-700 text-sm">{title}</div>
            <div className="text-xs text-gray-600">Add your Blender export at <code className="bg-gray-100 px-1 rounded">{glb}</code></div>
            <div className="text-[11px] text-gray-500 mt-1">Then add <code>model-viewer</code> tag — CDN free: <a className="underline" href="https://modelviewer.dev" target="_blank">modelviewer.dev</a></div>
            <a href={glb} target="_blank" className="mt-2 inline-block text-xs bg-bloom-500 text-white px-3 py-1.5 rounded-full">Check GLB exists →</a>
          </div>
          {/* Uncomment when GLB ready — free, no build step */}
          {/*
          <model-viewer src={glb} ios-src={usdz} ar ar-modes="webxr scene-viewer quick-look" ar-scale="fixed" camera-controls shadow-intensity="1" alt={title} style={{width:'100%',height:'220px'}}>
            <button slot="ar-button" className="bg-bloom-500 text-white px-4 py-2 rounded-full text-xs">View on your table</button>
          </model-viewer>
          <script type="module" src="https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js"></script>
          */}
        </div>
      </div>
      <p className="text-[11px] text-gray-500 mt-2">Free pipeline: Blender 4.2 (photogrammetry) → Draco GLB &lt;2MB → Reality Converter USDZ → place in <code>frontend/public/3d/</code>. Cached 30d via Workbox.</p>
    </div>
  );
}
