// Scanner capture guidance — frame signals sampled from the live camera.
//
// Pure functions so the thresholds live in one place. The three signals:
//   light — mean luminance (55–200 good: not too dark, not blown out)
//   fill  — centre vs border brightness (a bright page fills the middle)
//   steady — frame-to-frame change (holding the phone still)
export function frameSignals(mean, centreMean, borderMean, diff) {
  const light = mean >= 55 && mean <= 200 ? 'good' : mean >= 30 && mean <= 230 ? 'warn' : 'bad';
  const fillDelta = centreMean - borderMean;
  const fill = fillDelta > 15 ? 'good' : fillDelta > 6 ? 'warn' : 'bad';
  const steady = diff < 5 ? 'good' : diff < 12 ? 'warn' : 'bad';
  return { light, fill, steady };
}

export const allGood = (sig) =>
  Boolean(sig) && sig.light === 'good' && sig.fill === 'good' && sig.steady === 'good';

export const CHIP = { good: 'bg-emerald-500 text-white border-emerald-500', warn: 'bg-amber-400 text-black border-amber-400', bad: 'bg-red-500 text-white border-red-500' };
