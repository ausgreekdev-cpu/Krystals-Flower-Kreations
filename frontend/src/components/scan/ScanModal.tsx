// Barcode scan modal — camera viewfinder (native BarcodeDetector, no deps),
// manual fallback input, async lookup with create-new flow, audio/visual feedback.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { lookupScan, createQuickItem, type ScanResult } from './scanApi';
import { chimeSuccess, beepError, registerScan } from './feedback';

interface Props {
  open: boolean;
  onClose: () => void;
  token: string;
  /** Called for every newly registered, resolved scan (found items only). */
  onResolved: (r: ScanResult) => void;
  /** Show the "create new item" form for unknown codes (Inventory surface). */
  allowCreate?: boolean;
  /** Close the modal as soon as a scan resolves (POS: fast checkout). */
  closeOnFound?: boolean;
}

type CamState = 'off' | 'starting' | 'on' | 'denied' | 'unsupported';
type Mode = 'idle' | 'looking' | 'found' | 'not_found' | 'error';

export default function ScanModal({ open, onClose, token, onResolved, allowCreate = false, closeOnFound = false }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const aliveRef = useRef(false);
  const handleRef = useRef<(code: string) => void>(() => {});
  const [mode, setMode] = useState<Mode>('idle');
  const [cam, setCam] = useState<CamState>('off');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [err, setErr] = useState('');
  const [manual, setManual] = useState('');
  const [flash, setFlash] = useState<'ok' | 'err' | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyCreate, setBusyCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPrice, setNewPrice] = useState('');

  // Reset state on open; mark whether post-unmount async work should still land.
  useEffect(() => {
    aliveRef.current = open;
    if (open) {
      setMode('idle');
      setResult(null);
      setErr('');
      setManual('');
      setCreating(false);
      setFlash(null);
    }
  }, [open]);

  async function handleCode(raw: string) {
    const code = String(raw || '').trim();
    // Shared 2s duplicate window — same registration the wedge/POS paths use.
    if (!registerScan(code)) return;
    setMode('looking');
    setErr('');
    setCreating(false);
    try {
      const r = await lookupScan(code, token);
      if (!aliveRef.current) return;
      if (r.found) {
        setResult(r);
        setMode('found');
        setFlash('ok');
        chimeSuccess();
        window.setTimeout(() => setFlash(null), 500);
        onResolved(r);
        if (closeOnFound) onClose();
      } else {
        setResult(r);
        setMode('not_found');
        setFlash('err');
        beepError();
        window.setTimeout(() => setFlash(null), 500);
        if (allowCreate) {
          setCreating(true);
          setNewTitle('');
          setNewPrice('');
        }
      }
    } catch (e: any) {
      if (!aliveRef.current) return;
      setErr(e?.message || 'Lookup failed — retry');
      setMode('error');
      beepError();
    }
  }
  handleRef.current = handleCode;

  // ── Camera: getUserMedia + native BarcodeDetector (feature-detected) ──────
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer = 0;

    async function start() {
      const BD = (window as any).BarcodeDetector;
      if (!BD || !navigator.mediaDevices?.getUserMedia) {
        setCam('unsupported');
        return;
      }
      try {
        setCam('starting');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      } catch {
        if (!cancelled) setCam('denied');
        return;
      }
      const v = videoRef.current;
      if (cancelled || !v) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      v.srcObject = stream;
      try { await v.play(); } catch { /* muted+playsInline normally allows autoplay */ }
      if (cancelled) return;
      setCam('on');

      let detector: any;
      try {
        detector = new BD({ formats: ['upc_a', 'ean_13', 'code_128', 'qr_code', 'data_matrix'] });
      } catch {
        setCam('unsupported');
        return;
      }
      const tick = async () => {
        if (cancelled || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const value = codes && codes[0] && codes[0].rawValue;
          if (!cancelled && value) handleRef.current(String(value));
        } catch { /* frame not decodable yet */ }
        if (!cancelled) timer = window.setTimeout(tick, 250); // ~4 detections/sec is plenty
      };
      void tick();
    }
    void start();

    // Cleanup: stop every camera track + kill the detect loop on unmount/close.
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setCam('off');
    };
  }, [open]);

  function submitManual(e: FormEvent) {
    e.preventDefault();
    if (manual.trim()) void handleCode(manual);
    setManual('');
  }

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    const price = Number(newPrice);
    if (!newTitle.trim() || !Number.isFinite(price) || price < 0) return;
    setBusyCreate(true);
    try {
      const created = await createQuickItem({ title: newTitle.trim(), price, barcode: result?.scanned || '' }, token);
      const r: ScanResult = { found: true, kind: 'product', item: created };
      setResult(r);
      setMode('found');
      setCreating(false);
      setFlash('ok');
      chimeSuccess();
      onResolved(r);
      if (closeOnFound) onClose();
    } catch (e: any) {
      setErr(e?.message || 'Could not create item');
      beepError();
    } finally {
      setBusyCreate(false);
    }
  }

  if (!open) return null;
  const input = 'w-full border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-500';
  const item = result?.item;
  const name = item?.title || item?.name || '';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Scan barcode">
      <div className={`bg-surface2 border-2 rounded-2xl w-full max-w-lg p-4 space-y-3 max-h-[90vh] overflow-auto ${flash === 'ok' ? 'border-green-500 shadow-[0_0_0_4px_rgba(34,197,94,0.35)]' : flash === 'err' ? 'border-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.35)]' : 'border-line'}`}>
        <div className="flex items-center justify-between">
          <div className="font-black text-ink">Scan barcode</div>
          <button onClick={onClose} aria-label="Close scanner" className="w-8 h-8 rounded-lg border hover:bg-surface3 text-ink">✕</button>
        </div>

        {/* Live viewfinder — hidden when the browser lacks BarcodeDetector or permission */}
        {cam !== 'unsupported' && cam !== 'denied' && (
          <div className="relative bg-black rounded-xl overflow-hidden h-44">
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
            <div className="absolute inset-x-10 inset-y-6 border-2 border-white/40 rounded-lg pointer-events-none" />
            {cam !== 'on' && (
              <div className="absolute inset-0 grid place-items-center text-white/85 text-sm">
                {cam === 'starting' ? 'Starting camera…' : ''}
              </div>
            )}
          </div>
        )}
        {cam === 'denied' && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2">
            Camera permission denied — allow it in your browser settings, or use the USB scanner / type the code below.
          </div>
        )}
        {cam === 'unsupported' && (
          <div className="text-xs text-muted bg-surface3 rounded-xl p-2">
            Camera scanning isn’t available in this browser — use the USB scanner (works anywhere) or type the code below.
          </div>
        )}

        {/* Status / result */}
        {mode === 'looking' && <div className="text-sm text-muted animate-pulse">Looking up…</div>}
        {mode === 'found' && item && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <div className="font-bold text-green-900">{name}</div>
            <div className="text-xs text-green-800 mt-1">
              {item.sku ? `SKU ${item.sku}` : ''}{item.sku && item.barcode ? ' • ' : ''}{item.barcode ? `Barcode ${item.barcode}` : ''}
              {item.price != null ? ` • $${Number(item.price).toFixed(2)}` : ''}
              {typeof result?.totalOnHand === 'number' ? ` • ${result.totalOnHand} on hand` : ''}
            </div>
            {Array.isArray(result?.stock) && result.stock.length > 0 && (
              <div className="text-xs text-green-900 mt-1">{result.stock.map((s) => `${s.location}: ${s.onHand}`).join(' • ')}</div>
            )}
          </div>
        )}
        {mode === 'not_found' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800">
            Item not found — <span className="font-mono">{result?.scanned}</span>
            {!allowCreate && ' (add it in Admin → Catalog → Products)'}
          </div>
        )}
        {mode === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800">{err}</div>
        )}

        {/* Manual fallback — always available */}
        <form onSubmit={submitManual} className="flex gap-2">
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Type or scan a barcode…" aria-label="Barcode" className={`${input} flex-1`} autoFocus />
          <button type="submit" className="bg-bloom-500 text-white px-4 rounded-xl text-sm font-bold hover:bg-bloom-700">Lookup</button>
        </form>

        {/* Create-new-item flow (unknown codes, Inventory surface only) */}
        {creating && mode === 'not_found' && (
          <form onSubmit={submitCreate} className="border border-line rounded-xl p-3 space-y-2">
            <div className="text-xs font-bold text-ink">Create new item for {result?.scanned}</div>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Item name" aria-label="Item name" className={input} autoFocus />
            <input type="number" step="0.01" min="0" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="Price ($)" aria-label="Price" className={input} />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setCreating(false)} className="text-xs px-3 py-1.5 rounded-lg border hover:bg-surface3">Cancel</button>
              <button type="submit" disabled={busyCreate || !newTitle.trim()} className="text-xs px-3 py-1.5 rounded-lg bg-bloom-500 text-white font-bold disabled:opacity-50">
                {busyCreate ? 'Creating…' : 'Create item'}
              </button>
            </div>
          </form>
        )}

        <div className="text-[11px] text-muted">USB scanner: pull the trigger anywhere on the page — no focus needed. Identical scans are ignored for 2s.</div>
      </div>
    </div>
  );
}
