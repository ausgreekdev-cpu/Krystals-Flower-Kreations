// Scan feedback: WebAudio chimes (zero audio-asset files) + duplicate suppression.

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    try { ctx = new AC(); } catch { return null; }
  }
  // Browsers start AudioContext suspended until a user gesture — resume lazily.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function blip(freq: number, at: number, dur: number, type: OscillatorType, peak = 0.15) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ac.currentTime + at;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** Two-tone success chime (880 → 1320 Hz). */
export function chimeSuccess() {
  blip(880, 0, 0.12, 'sine');
  blip(1320, 0.1, 0.18, 'sine');
}

/** Low error beep (220 Hz square). */
export function beepError() {
  blip(220, 0, 0.2, 'square', 0.12);
}

// ── Duplicate suppression ──────────────────────────────────────────────────
// One module-level record shared by every input path (USB wedge, camera,
// manual) so the same code can't be processed twice within the window —
// held scanner triggers and double-reads are the common cause.
const last = { code: '', at: 0 };
const DEFAULT_WINDOW_MS = 2000;

/** Returns true if this scan should be processed; false if it's a duplicate. */
export function registerScan(code: string, windowMs = DEFAULT_WINDOW_MS): boolean {
  const key = String(code || '').trim();
  if (!key) return false;
  const now = Date.now();
  if (last.code === key && now - last.at < windowMs) return false;
  last.code = key;
  last.at = now;
  return true;
}
