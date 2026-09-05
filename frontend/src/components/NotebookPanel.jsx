import { useState, useEffect } from 'react';

export default function NotebookPanel({ compact=false, query='' }){
  const [url,setUrl]=useState('https://notebooklm.google.com/notebook/459b06d5-2520-442a-ae3c-048b54c78902');
  useEffect(()=>{
    fetch('/api/settings').then(r=> r.ok? r.json():null).then(data=>{
      const u = data?.notebooklm_url || data?.notebook_url;
      if(u && u.includes('notebook')) setUrl(u);
    }).catch(()=>{});
  }, []);
  const href = query ? `${url}?q=${encodeURIComponent(query)}` : url;
  if(compact){
    return (
      <div className="bg-white border rounded-xl p-3 flex justify-between items-center">
        <span className="text-xs font-bold text-bloom-700">📓 Notebook — {query || 'Perth studio research'}</span>
        <a href={href} target="_blank" rel="noopener" className="text-xs bg-bloom-500 text-white px-3 py-1 rounded-full">Open →</a>
      </div>
    );
  }
  return (
    <details className="bg-white border rounded-2xl">
      <summary className="px-4 py-3 font-bold text-sm cursor-pointer">📓 NotebookLM — {query || 'Cricut settings & BOM'}</summary>
      <div className="p-4 border-t">
        <p className="text-xs text-gray-600">Ask in NotebookLM: “What pressure for {query || '65lb Blush'} in Perth humidity?” — sources include paper stocks, armature guides.</p>
        <a href={href} target="_blank" rel="noopener" className="mt-2 inline-block text-xs bg-bloom-500 text-white px-3 py-1.5 rounded-full">Open NotebookLM →</a>
        <div className="mt-3 border rounded-xl overflow-hidden" style={{height:320}}>
          <iframe src={url} title="NotebookLM" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" allow="clipboard-write; fullscreen" loading="lazy" style={{width:'100%',height:'100%',border:0}} />
        </div>
      </div>
    </details>
  );
}
