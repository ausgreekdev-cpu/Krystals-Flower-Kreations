import { useCallback, useEffect, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import { adminApi } from '../../lib/api/customClient';
import { frameSignals, allGood, CHIP } from '../../lib/scanGuidance';

const CATEGORIES = ['STOCKTAKE', 'SUPPLIER', 'INVOICE', 'PROCEDURE', 'EXPORT', 'MEDIA', 'OTHER'];
const SUBCATEGORIES = {
  STOCKTAKE: ['CARDSTOCK', 'WIRE_TAPE', 'ADHESIVES', 'PACKAGING', 'FINISHED'],
  SUPPLIER: ['PAPER_SUPPLIER', 'HARDWARE_SUPPLIER', 'PACKAGING_SUPPLIER', 'GENERAL_SUPPLIER'],
  INVOICE: ['PURCHASE_INVOICE', 'SALES_INVOICE', 'RECEIPT', 'QUOTE', 'CREDIT_NOTE'],
  PROCEDURE: ['PETAL_ASSEMBLY', 'ORIGAMI_FOLD', 'WIRING_TAPING', 'PACKAGING_GUIDE', 'QC_CHECK'],
  EXPORT: ['ORDER_EXPORT', 'INVENTORY_EXPORT', 'BACKUP', 'REPORT'],
  MEDIA: ['PRODUCT_PHOTO', 'WORKSHOP_PHOTO', 'BRAND_ASSET', 'REFERENCE', 'SOCIAL'],
  OTHER: ['GENERAL'],
};

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
  const [category, setCategory] = useState('OTHER');
  const [subcategory, setSubcategory] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('single'); // single | pages (multi-page PDF)
  const [pages, setPages] = useState([]); // [{ id, blob, dataUrl }]
  const [signals, setSignals] = useState(null); // { light, fill, steady }
  const [autoCapture, setAutoCapture] = useState(true);
  const [countdown, setCountdown] = useState(null);
  const prevFrame = useRef(null);
  const sampleRef = useRef(null);

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

  // The camera stays alive for the life of the dialog — capture() reuses the
  // same stream, so multi-page mode and Retake never land on a frozen preview.
  const startCamera = useCallback(async () => {
    if (streamRef.current) return;
    try {
      const s = await navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
      streamRef.current = s;
      if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
      setCamErr('');
    } catch (e) {
      setCamErr(e?.message || 'Camera unavailable');
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => stop();
  }, [startCamera, stop]);

  // Capture guidance: sample the frame ~4×/s while the live view is showing
  // (S4). Cheap: 160×120 downscaled pixels only.
  useEffect(() => {
    if (shot) { setSignals(null); setCountdown(null); prevFrame.current = null; return undefined; }
    const id = setInterval(() => {
      const v = videoRef.current;
      if (!v || !v.videoWidth) return;
      const canvas = sampleRef.current || (sampleRef.current = document.createElement('canvas'));
      canvas.width = 160; canvas.height = 120;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(v, 0, 0, 160, 120);
      const px = ctx.getImageData(0, 0, 160, 120).data;
      let sum = 0; let cSum = 0; let cN = 0; let bSum = 0; let bN = 0;
      const lum = new Uint8Array(160 * 120);
      for (let y = 0; y < 120; y++) {
        for (let x = 0; x < 160; x++) {
          const i = (y * 160 + x) * 4;
          const l = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
          lum[y * 160 + x] = l;
          sum += l;
          const centre = x > 24 && x < 136 && y > 18 && y < 102;
          if (centre) { cSum += l; cN++; } else { bSum += l; bN++; }
        }
      }
      let diff = 0;
      if (prevFrame.current) {
        let d = 0;
        for (let i = 0; i < lum.length; i++) d += Math.abs(lum[i] - prevFrame.current[i]);
        diff = d / lum.length;
      }
      prevFrame.current = lum;
      setSignals(frameSignals(sum / lum.length, cSum / cN, bSum / bN, diff));
    }, 250);
    return () => clearInterval(id);
  }, [shot]);

  // Auto-capture: when all three signals are green for a beat, count down and
  // snap. Any drop cancels the countdown; the manual button always works.
  useEffect(() => {
    if (!autoCapture || shot || busy) { setCountdown(null); return undefined; }
    if (!allGood(signals)) { setCountdown(null); return undefined; }
    if (countdown === null) { setCountdown(3); return undefined; }
    const t = setTimeout(() => {
      if (countdown <= 1) { setCountdown(null); capture(); }
      else setCountdown(countdown - 1);
    }, 700);
    return () => clearTimeout(t);
  }, [signals, autoCapture, countdown, shot, busy]);

  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d').drawImage(v, 0, 0);
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
      const r = await adminApi.documents.upload(file, token, undefined, category, subcategory || undefined);
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
      const r = await adminApi.documents.assemble(files, (title.trim() || `Scan ${new Date().toLocaleDateString('en-AU')}`).slice(0, 80), token, category, subcategory || undefined);
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
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {[
                      { k: 'light', label: '💡 Light' },
                      { k: 'fill', label: '📐 In frame' },
                      { k: 'steady', label: '✋ Steady' },
                    ].map((c) => (
                      <span key={c.k} className={`px-2.5 py-1 rounded-full border font-semibold ${signals ? CHIP[signals[c.k]] : 'bg-surface3 text-muted border-line'}`}>
                        {c.label}
                      </span>
                    ))}
                    <label className="flex items-center gap-1.5 ml-auto text-muted">
                      <input type="checkbox" checked={autoCapture} onChange={(e) => { setAutoCapture(e.target.checked); setCountdown(null); }} className="h-4 w-4" aria-label="Auto-capture when framed" />
                      Auto-capture
                    </label>
                  </div>
                  {countdown !== null && (
                    <div aria-live="polite" className="text-center text-sm font-bold text-royal-700 dark:text-royal-300">
                      Hold steady… {countdown}
                    </div>
                  )}
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
              <select value={category} onChange={(e) => { setCategory(e.target.value); setSubcategory(''); }} aria-label="Category" className="border border-line-strong rounded-xl px-3 py-1.5 text-xs bg-surface2 text-ink">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={subcategory} onChange={(e) => setSubcategory(e.target.value)} aria-label="Sub-category" className="border border-line-strong rounded-xl px-3 py-1.5 text-xs bg-surface2 text-ink">
                <option value="">— Sub —</option>
                {(SUBCATEGORIES[category] || []).map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
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
        {err && <div className="text-xs text-red-600 dark:text-red-300">{err}</div>}
        <div className="text-[10px] text-muted">Tip: fill the frame with the page, keep it flat, and use good light — OCR accuracy follows capture quality.</div>
      </div>
    </div>
  );
}
