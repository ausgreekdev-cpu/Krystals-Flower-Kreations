import { useCallback, useEffect, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import { adminApi } from '../../lib/api/customClient';

// Phone-camera document capture: live preview → capture frame → rotate/crop
// (react-easy-crop) → upload as a business document → auto-run OCR. Falls
// back to a capture-attributed file input when getUserMedia is unavailable
// (desktop browsers without a camera, denied permissions).
export default function ScannerModal({ token, onDone, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [camErr, setCamErr] = useState('');
  const [shot, setShot] = useState(null); // dataURL of the captured frame
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('single'); // single | pages (multi-page PDF)
  const [pages, setPages] = useState([]); // [{ id, blob, dataUrl }]

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Esc closes the dialog (keyboard accessibility).
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { stop(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stop, onClose]);

  useEffect(() => {
    let dead = false;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
      .then((s) => {
        if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
      })
      .catch((e) => setCamErr(e?.message || 'Camera unavailable'));
    return () => { dead = true; stop(); };
  }, [stop]);

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d').drawImage(v, 0, 0);
    stop();
    setShot(canvas.toDataURL('image/jpeg', 0.92));
    setTitle(`Scan ${new Date().toLocaleDateString('en-AU')}`);
  }

  function rotate() {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      setShot(canvas.toDataURL('image/jpeg', 0.92));
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    img.src = shot;
  }

  function pickFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setShot(String(reader.result)); setTitle(file.name.replace(/\.[^.]+$/, '')); };
    reader.readAsDataURL(file);
    stop();
  }

  // Crop the current capture into a compressed JPEG page blob.
  async function croppedBlob() {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = shot; });
    const canvas = document.createElement('canvas');
    const outW = area?.width ? Math.round(area.width) : img.width;
    const outH = area?.height ? Math.round(area.height) : img.height;
    canvas.width = outW;
    canvas.height = outH;
    canvas.getContext('2d').drawImage(img, area ? -area.x : 0, area ? -area.y : 0);
    return new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
  }

  async function usePhoto() {
    setBusy('Processing…');
    try {
      const blob = await croppedBlob();
      const file = new File([blob], `${(title.trim() || 'scan').slice(0, 80)}.jpg`, { type: 'image/jpeg' });

      if (mode === 'pages') {
        // stack the page and go back to the camera for the next one
        setPages((p) => [...p, { id: `${Date.now()}-${p.length}`, blob, dataUrl: shot }]);
        setShot(null);
        setArea(null);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setBusy('');
        return;
      }

      setBusy('Uploading…');
      const r = await adminApi.documents.upload(file, token);
      const doc = r.document;
      if (r.deduped) {
        setBusy('');
        onDone?.(doc, 'reused');
        return;
      }
      // Auto-OCR scans (image documents) — errors never block the upload.
      setBusy('Reading text…');
      try {
        const ocr = await adminApi.documents.ocr(doc.id, token, false);
        onDone?.(ocr.document || doc, `OCR: ${ocr.ocr?.chars ?? 0} chars`);
      } catch {
        onDone?.(doc, 'uploaded (OCR unavailable)');
      }
    } catch (e) {
      setErr(e.message || 'Could not process the scan');
      setBusy('');
    }
  }

  function movePage(i, dir) {
    setPages((p) => {
      const next = [...p];
      const j = i + dir;
      if (j < 0 || j >= next.length) return p;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function saveAsPdf() {
    if (!pages.length) return;
    setBusy('Assembling PDF…');
    try {
      // compress each page so the batch stays under the server's 5MB guard
      const files = [];
      for (const [i, p] of pages.entries()) {
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = p.dataUrl; });
        const scale = Math.min(1, 1400 / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.72));
        files.push(new File([blob], `page-${i + 1}.jpg`, { type: 'image/jpeg' }));
      }
      setBusy('Reading text…');
      const r = await adminApi.documents.assemble(files, (title.trim() || `Scan ${new Date().toLocaleDateString('en-AU')}`).slice(0, 80), token);
      onDone?.(r.document, r.deduped ? 'reused' : `${r.pages} pages · OCR done`);
    } catch (e) {
      setErr(e.message || 'Could not assemble the PDF');
      setBusy('');
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Scan a document" onClick={(e) => { if (e.target === e.currentTarget) { stop(); onClose(); } }}>
      <div className="bg-surface border border-line rounded-2xl w-full max-w-2xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-sm text-ink">📷 Scan document</h3>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-line-strong overflow-hidden" role="group" aria-label="Scan mode">
              <button type="button" onClick={() => setMode('single')} aria-pressed={mode === 'single'}
                className={`text-[11px] px-2.5 py-1 font-semibold ${mode === 'single' ? 'bg-royal-600 text-white' : 'text-ink'}`}>Single image</button>
              <button type="button" onClick={() => setMode('pages')} aria-pressed={mode === 'pages'}
                className={`text-[11px] px-2.5 py-1 font-semibold ${mode === 'pages' ? 'bg-royal-600 text-white' : 'text-ink'}`}>Multi-page PDF</button>
            </div>
            <button type="button" onClick={() => { stop(); onClose(); }} className="text-xs text-muted hover:underline">Close</button>
          </div>
        </div>

        {mode === 'pages' && (
          <div className="space-y-2">
            {pages.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Scanned pages">
                {pages.map((p, i) => (
                  <div key={p.id} role="listitem" className="relative w-16 shrink-0">
                    <img src={p.dataUrl} alt={`Page ${i + 1}`} className="w-16 h-20 object-cover rounded-lg border border-line" />
                    <span className="absolute bottom-0 left-0 right-0 text-center text-[9px] bg-black/60 text-white rounded-b-lg">{i + 1}</span>
                    <div className="absolute top-0 right-0 flex gap-0.5">
                      <button type="button" onClick={() => movePage(i, -1)} disabled={i === 0} aria-label={`Move page ${i + 1} earlier`}
                        className="w-4 h-4 rounded bg-black/70 text-white text-[9px] leading-none disabled:opacity-30">↑</button>
                      <button type="button" onClick={() => movePage(i, 1)} disabled={i === pages.length - 1} aria-label={`Move page ${i + 1} later`}
                        className="w-4 h-4 rounded bg-black/70 text-white text-[9px] leading-none disabled:opacity-30">↓</button>
                      <button type="button" onClick={() => setPages((ps) => ps.filter((x) => x.id !== p.id))} aria-label={`Remove page ${i + 1}`}
                        className="w-4 h-4 rounded bg-red-600 text-white text-[9px] leading-none">✕</button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => { setShot(null); setArea(null); }}
                  className="w-16 h-20 shrink-0 rounded-lg border-2 border-dashed border-line text-[10px] text-muted grid place-items-center">+ page</button>
              </div>
            ) : (
              <div className="text-[11px] text-muted">Multi-page mode: capture each page, then save them as one PDF. Each page is OCR'd and the pages become one document.</div>
            )}
          </div>
        )}

        {!shot && (
          <>
            {camErr
              ? (
                <div className="space-y-2">
                  <div className="text-xs text-muted">Camera unavailable ({camErr}) — capture straight from a phone camera input instead:</div>
                  <input type="file" accept="image/*" capture="environment" aria-label="Scan from device camera" className="block w-full text-xs" onChange={(e) => pickFile(e.target.files?.[0])} />
                </div>
              ) : (
                <>
                  <video ref={videoRef} playsInline muted className="w-full h-72 bg-black rounded-xl object-contain" />
                  <div className="flex justify-center gap-2">
                    <button type="button" onClick={capture} className="text-xs font-bold bg-royal-600 text-white rounded-xl px-5 py-2">Capture</button>
                  </div>
                </>
              )}
          </>
        )}

        {shot && (
          <>
            <div className="relative h-72 bg-surface3 rounded-xl overflow-hidden">
              <Cropper image={shot} crop={crop} zoom={zoom} aspect={undefined} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, px) => setArea(px)} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-muted flex items-center gap-2">Zoom
                <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom" />
              </label>
              <button type="button" onClick={rotate} className="text-xs font-semibold border border-line-strong rounded-xl px-3 py-1.5">↻ Rotate</button>
              <button type="button" onClick={() => { setShot(null); setArea(null); }} className="text-xs text-muted hover:underline">Retake</button>
              <div className="flex-1" />
              <input className="border border-line-strong rounded-xl px-3 py-1.5 text-xs w-44" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Scan title" />
              {mode === 'pages' ? (
                <>
                  <button type="button" onClick={usePhoto} disabled={!!busy} className="text-xs font-semibold border border-line-strong rounded-xl px-3 py-2 disabled:opacity-50">
                    {busy || 'Add page'}
                  </button>
                  <button type="button" onClick={saveAsPdf} disabled={!!busy || !pages.length} className="text-xs font-bold bg-royal-600 text-white rounded-xl px-4 py-2 disabled:opacity-50">
                    {busy || `Save ${pages.length} page${pages.length === 1 ? '' : 's'} as PDF`}
                  </button>
                </>
              ) : (
                <button type="button" onClick={usePhoto} disabled={!!busy} className="text-xs font-bold bg-royal-600 text-white rounded-xl px-4 py-2 disabled:opacity-50">
                  {busy || 'Use photo & OCR'}
                </button>
              )}
            </div>
          </>
        )}
        {err && <div className="text-xs text-red-600">{err}</div>}
        <div className="text-[10px] text-muted">Tip: fill the frame with the page, keep it flat, and use good light — OCR accuracy follows capture quality.</div>
      </div>
    </div>
  );
}
