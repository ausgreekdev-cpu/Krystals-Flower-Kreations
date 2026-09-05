import { useEffect, useState } from 'react';

const NOTEBOOK_ID = '459b06d5-2520-442a-ae3c-048b54c78902';
const NOTEBOOK_URL = `https://notebooklm.google.com/notebook/${NOTEBOOK_ID}`;
const FALLBACK_URL = `https://notebook.google.com/notebook/${NOTEBOOK_ID}`;

export default function Notebook(){
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q') || params.get('product') || params.get('workshop') || '';
  const [notebookUrl, setNotebookUrl] = useState(NOTEBOOK_URL);
  const [copied,setCopied]=useState(false);

  useEffect(()=>{
    // Try to load curated URL from settings (admin can override) — fallback to hardcoded ID
    fetch('/api/settings').then(r=> r.ok? r.json():null).then(data=>{
      const url = data?.notebooklm_url || data?.notebook_url || null;
      if(url && url.includes('notebook')) setNotebookUrl(url);
    }).catch(()=>{});
  }, []);

  const iframeSrc = q ? `${notebookUrl}?q=${encodeURIComponent(q)}` : notebookUrl;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-bloom-700">Perth Studio Notebook — Research Hub</h1>
          <p className="text-sm text-gray-600 mt-2 max-w-2xl">NotebookLM sources — Cricut settings for Perth humidity, BOM paper costs, armature wire guides, origami folds. Curated by Krystal. Ask questions, listen to Audio Overview, and explore sources.</p>
        </div>
        <div className="flex gap-2">
          <a href={notebookUrl} target="_blank" rel="noopener" className="bg-bloom-500 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-bloom-700">Open in NotebookLM →</a>
          <button onClick={()=>{ navigator.clipboard.writeText(notebookUrl); setCopied(true); setTimeout(()=>setCopied(false),2000); }} className="border rounded-xl px-4 py-2 text-sm hover:bg-bloom-50">{copied?'Copied':'Copy link'}</button>
        </div>
      </div>

      {q && <div className="mt-4 bg-bloom-50 border border-bloom-100 rounded-xl px-4 py-2 text-sm">Filtered by: <span className="font-bold">{q}</span> <a href="/notebook" className="ml-2 underline">Clear</a></div>}

      <div className="mt-6 bg-white border rounded-2xl overflow-hidden shadow-sm">
        <div className="bg-bloom-700 text-white px-4 py-2 flex justify-between items-center text-xs">
          <span>NotebookLM — {NOTEBOOK_ID.slice(0,8)} • Anyone with link can view</span>
          <span className="opacity-80">If iframe is blank, click Open in NotebookLM (Google login required)</span>
        </div>
        <iframe
          src={iframeSrc}
          title="Krystal's NotebookLM — Paper flower research"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads"
          allow="clipboard-write; fullscreen; autoplay"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ width:'100%', height:'80vh', border:0, background:'#FFF7F0' }}
        />
        <div className="bg-gray-50 border-t px-4 py-3 flex flex-col sm:flex-row justify-between gap-2 text-xs text-gray-600">
          <span>Sources: paper stocks, Cricut Maker settings, armature guides • Audio overview available inside NotebookLM</span>
          <a href={FALLBACK_URL} target="_blank" rel="noopener" className="underline">Try fallback notebook.google.com →</a>
        </div>
      </div>

      <div className="mt-6 grid md:grid-cols-3 gap-4">
        <div className="bg-white border rounded-2xl p-4">
          <h3 className="font-bold text-bloom-700 text-sm">How to use</h3>
          <ul className="text-xs text-gray-600 list-disc pl-4 mt-2 space-y-1">
            <li>Click a source on left in NotebookLM to read PDF/Doc</li>
            <li>Ask in chat: “What pressure for 65lb Blush in Perth humidity?”</li>
            <li>Listen to Audio Overview (podcast) for workshop prep</li>
          </ul>
        </div>
        <div className="bg-white border rounded-2xl p-4">
          <h3 className="font-bold text-bloom-700 text-sm">Perth tips</h3>
          <p className="text-xs text-gray-600 mt-2">Notebook holds our studio-tested Cricut Maker settings: 65lb Canson Blush — pressure 210, 80lb Sage — pressure 230, blade 45°, humidity 40-60%.</p>
          <a href="/configurator" className="mt-3 inline-block text-xs bg-bloom-500 text-white px-3 py-1.5 rounded-full">Try Configurator →</a>
        </div>
        <div className="bg-white border rounded-2xl p-4">
          <h3 className="font-bold text-bloom-700 text-sm">For workshops</h3>
          <p className="text-xs text-gray-600 mt-2">Before you book, explore guide: Cricut Blooms 101 kit list, origami lily folds.</p>
          <a href="/workshops" className="mt-3 inline-block text-xs border rounded-full px-3 py-1.5 hover:bg-bloom-50">View Workshops →</a>
        </div>
      </div>

      <div className="mt-6 bg-white border rounded-2xl p-4">
        <h3 className="font-bold text-sm">Notebook details</h3>
        <div className="text-xs text-gray-600 mt-2 space-y-1">
          <div>Notebook ID: <code className="bg-gray-100 px-1 rounded">{NOTEBOOK_ID}</code></div>
          <div>Primary: <a href={NOTEBOOK_URL} target="_blank" rel="noopener" className="underline">{NOTEBOOK_URL}</a></div>
          <div>Fallback: <a href={FALLBACK_URL} target="_blank" rel="noopener" className="underline">{FALLBACK_URL}</a></div>
          <div className="text-[11px] text-gray-500 mt-2">If iframe shows “Sign in” or blank, ensure sharing is “Anyone with link → Viewer” and allow third-party cookies for googleusercontent.com. Audio autoplay may require click.</div>
        </div>
      </div>
    </div>
  );
}
