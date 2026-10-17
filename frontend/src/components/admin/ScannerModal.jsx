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

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

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

  async function usePhoto() {
    setBusy('Processing…');
    try {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = shot; });
      const canvas = document.createElement('canvas');
      const outW = area?.width ? Math.round(area.width) : img.width;
      const outH = area?.height ? Math.round(area.height) : img.height;
      canvas.width = outW;
      canvas.height = outH;
      canvas.getContext('2d').drawImage(img, area ? -area.x : 0, area ? -area.y : 0);
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
      const file = new File([blob], `${(title.trim() || 'scan').slice(0, 80)}.jpg`, { type: 'image/jpeg' });

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

  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Scan a document" onClick={(e) => { if (e.target === e.currentTarget) { stop(); onClose(); } }}>
      <div className="bg-surface border border-line rounded-2xl w-full max-w-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-ink">📷 Scan document</h3>
          <button type="button" onClick={() => { stop(); onClose(); }} className="text-xs text-muted hover:underline">Close</button>
        </div>

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
              <button type="button" onClick={usePhoto} disabled={!!busy} className="text-xs font-bold bg-royal-600 text-white rounded-xl px-4 py-2 disabled:opacity-50">
                {busy || 'Use photo & OCR'}
              </button>
            </div>
          </>
        )}
        {err && <div className="text-xs text-red-600">{err}</div>}
        <div className="text-[10px] text-muted">Tip: fill the frame with the page, keep it flat, and use good light — OCR accuracy follows capture quality.</div>
      </div>
    </div>
  );
}
