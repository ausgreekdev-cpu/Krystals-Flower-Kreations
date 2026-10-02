// USB/Bluetooth HID barcode scanner ("keyboard wedge") hook.
//
// Handheld scanners type characters like a keyboard at ~1–5ms per key;
// humans type at ~80ms+. We buffer keystrokes and only treat a burst as a
// scan when every inter-key gap is under MAX_KEY_GAP_MS and the buffer is
// long enough to be a real code. Enter/Tab (the scanners' trailing key)
// terminates the burst; the event is swallowed so a stray \r never reaches
// the page. Keystrokes inside inputs are buffered too (that's where a
// scanner types when an input has focus) but slow human typing always
// resets the buffer first — no focus clicking required either way.
import { useEffect, useRef } from 'react';

const MAX_KEY_GAP_MS = 50;
const MIN_SCAN_LEN = 4;
const MAX_LEN = 50;

export function useWedgeScanner(onScan: (code: string) => void, active = true) {
  const cb = useRef(onScan);
  cb.current = onScan; // always call the latest closure (state captured per render)

  useEffect(() => {
    if (!active) return;
    let buf = '';
    let lastKeyAt = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      const now = Date.now();
      // Gap too long → the previous keys were human typing, not a scan burst.
      if (now - lastKeyAt > MAX_KEY_GAP_MS) buf = '';
      lastKeyAt = now;

      if (e.key === 'Enter' || e.key === 'Tab') {
        const code = buf.trim();
        buf = '';
        if (code.length >= MIN_SCAN_LEN) {
          // Capture-phase listener: stop the event before inputs/react see it.
          e.preventDefault();
          e.stopPropagation();
          cb.current(code);
        }
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Escape') { buf = ''; return; }
      if (e.key.length === 1) { // printable character (scanner or human)
        buf += e.key;
        if (buf.length > MAX_LEN) buf = '';
      }
    };

    // capture: true so we run before any input's handlers.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [active]);
}
