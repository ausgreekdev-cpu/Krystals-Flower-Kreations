// Persistent scanner-status pill — "Scanner listening" + last scan + result flash.
// Renders only on wedge-active surfaces (POS, Inventory), so `armed` is true
// whenever it's mounted. Subscribes to events emitted by feedback.ts /
// useWedgeScanner.ts; needs no props and touches no handler code.
//
// Browser note: there is NO API to detect a HID/Bluetooth scanner connection.
// "Listening" means the wedge listener is active on this page; the relative
// timestamp of the last capture proves the hardware path works.
import { useEffect, useState } from 'react';

interface LastScan {
  code: string;
  at: number;
  accepted: boolean;
}

export default function ScannerIndicator() {
  const [last, setLast] = useState<LastScan | null>(null);
  const [flash, setFlash] = useState<'ok' | 'err' | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const onScan = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      setLast({ code: String(d.code || ''), at: Date.now(), accepted: d.accepted !== false });
    };
    const onWedge = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      setLast({ code: String(d.code || ''), at: Date.now(), accepted: true });
    };
    const onOk = () => {
      setFlash('ok');
      window.setTimeout(() => setFlash(null), 500);
    };
    const onErr = () => {
      setFlash('err');
      window.setTimeout(() => setFlash(null), 500);
    };
    window.addEventListener('kfk:scan', onScan);
    window.addEventListener('kfk:wedge', onWedge);
    window.addEventListener('kfk:scan-ok', onOk);
    window.addEventListener('kfk:scan-err', onErr);
    const tick = window.setInterval(() => setNow(Date.now()), 1000); // relative age
    return () => {
      window.removeEventListener('kfk:scan', onScan);
      window.removeEventListener('kfk:wedge', onWedge);
      window.removeEventListener('kfk:scan-ok', onOk);
      window.removeEventListener('kfk:scan-err', onErr);
      window.clearInterval(tick);
    };
  }, []);

  const age = last ? Math.max(0, Math.round((now - last.at) / 1000)) : null;
  const border =
    flash === 'ok'
      ? 'border-green-500 shadow-[0_0_0_3px_rgba(34,197,94,0.3)]'
      : flash === 'err'
        ? 'border-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.3)]'
        : 'border-line';
  const dot = flash === 'err' ? 'bg-red-500' : 'bg-green-500';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Barcode scanner status"
      className={`fixed bottom-4 right-4 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full border bg-surface2 shadow-lg text-xs font-semibold select-none ${border}`}
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dot}`} />
        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dot}`} />
      </span>
      <span className="text-ink whitespace-nowrap">Scanner listening</span>
      {last && (
        <span className="text-muted font-mono font-normal truncate max-w-[160px] whitespace-nowrap">
          {last.code} · {age}s{last.accepted ? '' : ' · dup'}
        </span>
      )}
    </div>
  );
}
