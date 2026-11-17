import { useEffect, useState } from 'react';
import { TUTORIAL_STEPS, TUTORIAL_KEY } from '../lib/tutorialSteps';

export default function TutorialOverlay() {
  const [open, setOpen] = useState(() => !localStorage.getItem(TUTORIAL_KEY));
  const [i, setI] = useState(0);
  useEffect(() => { if (!open) localStorage.setItem(TUTORIAL_KEY, '1'); }, [open]);
  if (!open) return null;
  const step = TUTORIAL_STEPS[i];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-surface rounded-2xl p-6 max-w-sm w-full shadow-xl">
        <h2 className="font-bold text-ink">{step.title}</h2>
        <p className="text-sm text-muted mt-2">{step.body}</p>
        <div className="flex justify-between mt-4">
          <button onClick={() => setOpen(false)} className="text-xs text-muted">Skip</button>
          <div className="flex gap-2">
            {i > 0 && <button onClick={() => setI(i - 1)} className="text-xs border px-3 py-1 rounded">Back</button>}
            {i < TUTORIAL_STEPS.length - 1
              ? <button onClick={() => setI(i + 1)} className="text-xs bg-bloom-500 text-white px-3 py-1 rounded">Next</button>
              : <button onClick={() => setOpen(false)} className="text-xs bg-bloom-500 text-white px-3 py-1 rounded">Done</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
