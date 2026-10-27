#!/usr/bin/env node
/**
 * Paper-flower cut sheets for Cricut (and any vinyl/plotter cutter).
 *
 * Every file is a 305 x 305 mm (12 x 12 in) mat sheet containing:
 *   - <g id="cut">    filled closed paths — one path per physical piece, so
 *                     Design Space lists them individually and groups them by
 *                     the fill colour hint (petal / leaf / stem cardstock).
 *   - <g id="score">  dashed polylines for fold + shaping guides. Design Space
 *                     imports these as cut paths; assign the "Score" line type
 *                     (or leave them and the perforation still folds cleanly).
 *
 * All geometry is millimetres, generated analytically so the finished sizes in
 * the README are exact, then shelf-packed so no two pieces overlap and nothing
 * crosses the mat margin.
 *
 * Each design also ships a **score-only companion** (`<slug>-score.svg`, same
 * mat layout, score paths only) and a **3-page A4 assembly guide**
 * (`<slug>-assembly.pdf`) rendered by `lib/flower-guide.mjs`.
 *
 *   node scripts/generate-paper-flower-svgs.mjs          # write + validate
 *   node scripts/generate-paper-flower-svgs.mjs --check  # validate only
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderGuidePdf } from './lib/flower-guide.mjs';
import { validatePdf } from './lib/minipdf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'SVG', 'paper-flowers');

const SHEET = 305; // mm — 12in Cricut mat
const MARGIN = 8;
const PAD = 0.8; // spline control points can bow ~0.1mm past the outline bbox
const GAP = 5; // mm between pieces so the blade never nicks a neighbour
const CONTENT = SHEET - MARGIN * 2;

const COL = {
  petal: '#F3DEE1',
  petalDeep: '#E7C2C9',
  gold: '#F2D26B',
  goldDeep: '#E8BC4A',
  leaf: '#BCCBAE',
  leafDark: '#A6B998',
  neutral: '#EADCC8',
  stem: '#9FB08F',
};

/* ------------------------------------------------------------------ maths */

const r2 = (v) => Math.round(v * 100) / 100;

/**
 * Monotone cubic (PCHIP) interpolation through [[t, v], …] keys.
 * Zero-slope smoothstep per segment leaves a visible ripple along a cut edge;
 * PCHIP keeps the slope continuous without ever overshooting a key.
 */
function profile(keys) {
  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  const n = xs.length;
  const h = [];
  const d = [];
  for (let i = 0; i < n - 1; i++) {
    h[i] = xs[i + 1] - xs[i];
    d[i] = (ys[i + 1] - ys[i]) / h[i];
  }
  const m = new Array(n).fill(0);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const scale = 3 / Math.sqrt(s);
      m[i] = scale * a * d[i];
      m[i + 1] = scale * b * d[i];
    }
  }

  return (t) => {
    const x = Math.min(xs[n - 1], Math.max(xs[0], t));
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const u = (x - xs[i]) / h[i];
    const u2 = u * u;
    const u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * ys[i]
      + (u3 - 2 * u2 + u) * h[i] * m[i]
      + (-2 * u3 + 3 * u2) * ys[i + 1]
      + (u3 - u2) * h[i] * m[i + 1];
  };
}

const PETAL_PROFILE = profile([
  [0, 0.08], [0.1, 0.42], [0.3, 0.82], [0.55, 1], [0.78, 0.88], [0.92, 0.56], [1, 0.2],
]);
const LEAF_PROFILE = profile([
  [0, 0.06], [0.05, 0.3], [0.16, 0.62], [0.32, 0.88], [0.55, 1], [0.76, 0.82], [0.9, 0.5], [1, 0.03],
]);
const SLIM_PROFILE = profile([
  [0, 0.3], [0.1, 0.7], [0.3, 1], [0.6, 1], [0.85, 0.9], [1, 0.7],
]);

/**
 * Closed blade outline: base edge at y = 0, tip at y = -h.
 * Sampled densely (~1.6mm of arc per point) and emitted as straight segments —
 * spline shortcuts overshoot at the shoulder and kink the silhouette, which a
 * blade faithfully reproduces. 0.1mm of chord error is far below cuttability.
 */
function blade(w, h, opts = {}) {
  const {
    prof = PETAL_PROFILE, ruffle = 0, freq = 3, notch = 0,
  } = opts;
  const steps = Math.max(36, Math.min(160, Math.round((2 * (w + h)) / 1.6)));
  const half = (t) => {
    let v = (w / 2) * prof(t);
    if (ruffle) v *= 1 + ruffle * Math.pow(t, 1.4) * Math.sin(2 * Math.PI * freq * t);
    return Math.max(0.7, v);
  };
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push({ x: -half(t), y: -h * t });
  }
  const tipHalf = half(1);
  if (notch > 0) {
    pts.push({ x: -tipHalf - (w * 0.02), y: -h * 0.995 });
    pts.push({ x: 0, y: -h + notch });
    pts.push({ x: tipHalf + w * 0.02, y: -h * 0.995 });
  }
  for (let i = steps - 1; i >= 0; i--) {
    const t = i / steps;
    pts.push({ x: half(t), y: -h * t });
  }
  return pts;
}

/** Dense outline of a petal ring (daisy / gerbera). */
function petalRing({ petals, rOuter, rValley, rInnerHole = 0, stepsPerPetal = 18, sharpness = 0.7 }) {
  const outer = [];
  const total = petals * stepsPerPetal;
  for (let i = 0; i < total; i++) {
    const th = (i / total) * Math.PI * 2;
    const lobe = Math.pow(0.5 + 0.5 * Math.cos(petals * th), sharpness);
    const r = rValley + (rOuter - rValley) * lobe;
    outer.push({ x: Math.cos(th) * r, y: Math.sin(th) * r });
  }
  const holes = rInnerHole ? [{ pts: circle(0, 0, rInnerHole) }] : [];
  return { pts: outer, holes };
}

function circle(cx, cy, r) {
  const n = Math.max(40, Math.round((2 * Math.PI * r) / 1.2));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(th) * r, y: cy + Math.sin(th) * r });
  }
  return pts;
}

/** Star of pointed sepals: base disc radius rBase, tips at rTip. */
function sepalStar({ lobes = 5, rBase = 10, rTip = 30, sharpness = 1.9 }) {
  const n = lobes * 40;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const lobe = 0.5 + 0.5 * Math.cos(lobes * th);
    const r = rBase + (rTip - rBase) * Math.pow(lobe, sharpness);
    pts.push({ x: Math.cos(th) * r, y: Math.sin(th) * r });
  }
  return pts;
}

/** Serrated (toothed) leaf outline — sharp edges, so straight segments. */
function serratedLeaf(w, h, teeth = 9) {
  const pts = [];
  const N = teeth * 8;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let half = (w / 2) * LEAF_PROFILE(t);
    const saw = 1 + 0.17 * (Math.abs(((i % 8) / 8) * 2 - 1) - 0.5);
    if (t > 0.08 && t < 0.9) half *= saw;
    pts.push({ x: -half, y: -h * t });
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    let half = (w / 2) * LEAF_PROFILE(t);
    const saw = 1 + 0.17 * (Math.abs(((i % 8) / 8) * 2 - 1) - 0.5);
    if (t > 0.08 && t < 0.9) half *= saw;
    pts.push({ x: half, y: -h * t });
  }
  return pts;
}

/** Spiral strip used to roll the rose centre. */
function spiralRibbon({ turns, rStart, rEnd, band, stepsPerTurn = 26 }) {
  const steps = Math.round(turns * stepsPerTurn);
  const outer = [];
  const inner = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const th = u * turns * Math.PI * 2;
    const r = rStart + (rEnd - rStart) * u;
    outer.push({ x: Math.cos(th) * r, y: Math.sin(th) * r });
    inner.push({ x: Math.cos(th) * (r - band), y: Math.sin(th) * (r - band) });
  }
  return [...outer, ...inner.reverse()];
}

/* ------------------------------------------------------------- path output */

function linePath(pts) {
  return `M${pts.map((p) => `${r2(p.x)},${r2(p.y)}`).join('L')}`;
}

/* ---------------------------------------------------------------- pieces */

const piece = ({ id, pts, holes = [], fill, scores = [] }) => ({
  id, pts, holes, fill, scores,
});

const foldScore = (w, h, at) => [
  [{ x: -w * 0.2, y: -h * at }, { x: w * 0.2, y: -h * at }],
];
const veinScore = (h) => [[{ x: 0, y: -h * 0.06 }, { x: 0, y: -h * 0.94 }]];

function petalPiece(w, h, opts = {}) {
  return piece({
    id: opts.id,
    pts: blade(w, h, opts),
    fill: opts.fill || COL.petal,
    scores: foldScore(w, h, opts.foldAt ?? 0.18),
  });
}

function leafPiece(w, h, opts = {}) {
  return piece({
    id: opts.id,
    pts: blade(w, h, { prof: LEAF_PROFILE, steps: 12 }),
    fill: opts.fill || COL.leaf,
    scores: veinScore(h),
  });
}

function discPiece({ id, r, holeR = 0, fill = COL.neutral, scores = [] }) {
  return piece({
    id,
    pts: circle(0, 0, r),
    holes: holeR ? [{ pts: circle(0, 0, holeR) }] : [],
    fill,
    scores,
  });
}

/* --------------------------------------------------------------- designs */

function rose() {
  const pieces = [];
  for (let i = 0; i < 5; i++) pieces.push(petalPiece(54, 66, { id: `outer-petal-${i + 1}`, ruffle: 0.025, freq: 2, steps: 11 }));
  for (let i = 0; i < 5; i++) pieces.push(petalPiece(44, 54, { id: `mid-petal-${i + 1}`, steps: 11 }));
  for (let i = 0; i < 5; i++) pieces.push(petalPiece(33, 40, { id: `inner-petal-${i + 1}`, fill: COL.petalDeep, steps: 11 }));
  pieces.push(piece({
    id: 'rolled-centre',
    pts: spiralRibbon({ turns: 2.25, rStart: 9, rEnd: 24, band: 6 }),
    smooth: false,
    fill: COL.petalDeep,
  }));
  pieces.push(piece({
    id: 'calyx',
    pts: sepalStar({ lobes: 5, rBase: 11, rTip: 30 }),
    smooth: false,
    fill: COL.stem,
  }));
  pieces.push(leafPiece(30, 68, { id: 'leaf-large-1' }));
  pieces.push(leafPiece(30, 68, { id: 'leaf-large-2' }));
  pieces.push(leafPiece(22, 50, { id: 'leaf-small-1', fill: COL.leafDark }));
  pieces.push(leafPiece(22, 50, { id: 'leaf-small-2', fill: COL.leafDark }));
  return pieces;
}

function peony() {
  const pieces = [];
  for (let i = 0; i < 6; i++) {
    pieces.push(petalPiece(60, 64, { id: `outer-petal-${i + 1}`, ruffle: 0.075, freq: 3.5, notch: 5, steps: 13 }));
  }
  for (let i = 0; i < 5; i++) {
    pieces.push(petalPiece(46, 50, { id: `mid-petal-${i + 1}`, ruffle: 0.06, freq: 3, notch: 4, steps: 13 }));
  }
  for (let i = 0; i < 4; i++) {
    pieces.push(petalPiece(34, 36, { id: `inner-petal-${i + 1}`, ruffle: 0.05, freq: 2.5, fill: COL.petalDeep }));
  }
  pieces.push(discPiece({
    id: 'centre-disc',
    r: 14,
    holeR: 2,
    fill: COL.petalDeep,
    scores: [
      [{ x: -11, y: 0 }, { x: 11, y: 0 }],
      [{ x: 0, y: -11 }, { x: 0, y: 11 }],
    ],
  }));
  pieces.push(leafPiece(34, 62, { id: 'leaf-1' }));
  pieces.push(leafPiece(34, 62, { id: 'leaf-2' }));
  pieces.push(leafPiece(26, 48, { id: 'leaf-3', fill: COL.leafDark }));
  return pieces;
}

function gerbera() {
  const pieces = [];
  const outer = petalRing({ petals: 26, rOuter: 70, rValley: 52, rInnerHole: 18, stepsPerPetal: 18, sharpness: 0.55 });
  pieces.push(piece({ id: 'petal-ring-outer', ...outer, fill: COL.petal }));
  const mid = petalRing({ petals: 22, rOuter: 55, rValley: 40, rInnerHole: 14, stepsPerPetal: 18, sharpness: 0.6 });
  pieces.push(piece({ id: 'petal-ring-mid', ...mid, fill: COL.petalDeep }));
  pieces.push(discPiece({
    id: 'centre-disc',
    r: 24,
    holeR: 3,
    fill: COL.neutral,
    scores: [
      [{ x: -18, y: 0 }, { x: 18, y: 0 }],
      [{ x: 0, y: -18 }, { x: 0, y: 18 }],
    ],
  }));
  pieces.push(leafPiece(28, 66, { id: 'leaf-1' }));
  pieces.push(leafPiece(28, 66, { id: 'leaf-2' }));
  return pieces;
}

function lily() {
  const pieces = [];
  for (let i = 0; i < 6; i++) {
    pieces.push(petalPiece(32, 88, { id: `petal-${i + 1}`, ruffle: 0.045, freq: 3, notch: 7, steps: 14 }));
  }
  for (let i = 0; i < 9; i++) {
    pieces.push(piece({
      id: `stamen-${i + 1}`,
      pts: blade(4.5, 46, { prof: SLIM_PROFILE, steps: 6 }),
      fill: COL.neutral,
      scores: veinScore(46),
    }));
  }
  pieces.push(discPiece({ id: 'centre-disc', r: 10, holeR: 2, fill: COL.leafDark }));
  pieces.push(leafPiece(16, 74, { id: 'leaf-1', fill: COL.leafDark }));
  pieces.push(leafPiece(16, 74, { id: 'leaf-2', fill: COL.leafDark }));
  return pieces;
}

function banksia() {
  const pieces = [];
  pieces.push(piece({ id: 'leaf-serrated-large-1', pts: serratedLeaf(34, 90, 9), smooth: false, fill: COL.leaf, scores: veinScore(90) }));
  pieces.push(piece({ id: 'leaf-serrated-large-2', pts: serratedLeaf(34, 90, 9), smooth: false, fill: COL.leaf, scores: veinScore(90) }));
  pieces.push(piece({ id: 'leaf-serrated-small-1', pts: serratedLeaf(26, 68, 7), smooth: false, fill: COL.leafDark, scores: veinScore(68) }));
  pieces.push(piece({ id: 'leaf-serrated-small-2', pts: serratedLeaf(26, 68, 7), smooth: false, fill: COL.leafDark, scores: veinScore(68) }));
  pieces.push(piece({
    id: 'cone-strip',
    pts: blade(62, 120, { prof: SLIM_PROFILE, steps: 8 }),
    fill: COL.neutral,
    scores: Array.from({ length: 11 }, (_, i) => {
      const y = -((i + 1) * 10);
      const half = (62 / 2) * SLIM_PROFILE(Math.abs(y) / 120) * 0.92;
      return [{ x: -half, y }, { x: half, y }];
    }),
  }));
  for (let i = 0; i < 16; i++) {
    pieces.push(piece({
      id: `scale-${i + 1}`,
      pts: blade(14, 18, { prof: SLIM_PROFILE, steps: 5 }),
      fill: COL.stem,
    }));
  }
  return pieces;
}

function eucalyptus() {
  const pieces = [];
  const coin = (r, i, fill, size) => piece({
    id: `coin-leaf-${size}-${i}`,
    pts: circle(0, 0, r),
    smooth: false,
    fill,
    scores: [[{ x: 0, y: -r * 0.82 }, { x: 0, y: r * 0.82 }]],
  });
  for (let i = 1; i <= 6; i++) pieces.push(coin(13, i, COL.leaf, 'large'));
  for (let i = 1; i <= 8; i++) pieces.push(coin(10.5, i, COL.leafDark, 'mid'));
  for (let i = 1; i <= 10; i++) pieces.push(coin(8, i, COL.leafDark, 'small'));
  for (let i = 1; i <= 4; i++) {
    pieces.push(piece({
      id: `stem-strip-${i}`,
      pts: blade(4.6, 105, { prof: SLIM_PROFILE, steps: 6 }),
      fill: COL.stem,
      scores: [[{ x: 0, y: -6 }, { x: 0, y: -99 }]],
    }));
  }
  return pieces;
}

function wattle() {
  const pieces = [];
  // Fringed puff heads — scalloped discs; the fringe is cut at build time
  // (see the guide) and the two cross scores let the head cup into a ball.
  const puff = (r, i) => piece({
    id: `puff-head-${i}`,
    ...petalRing({ petals: 20, rOuter: r, rValley: r * 0.86, stepsPerPetal: 9, sharpness: 0.85 }),
    fill: i % 2 ? COL.gold : COL.goldDeep,
    scores: [
      [{ x: r2(-r * 0.85), y: 0 }, { x: r2(r * 0.85), y: 0 }],
      [{ x: 0, y: r2(-r * 0.85) }, { x: 0, y: r2(r * 0.85) }],
    ],
  });
  for (let i = 1; i <= 3; i++) pieces.push(puff(21, i));
  for (let i = 4; i <= 7; i++) pieces.push(puff(15, i));
  // Slim phyllodes — the long narrow leaves real wattle carries
  for (let i = 1; i <= 3; i++) pieces.push(leafPiece(11, 82, { id: `phyllode-long-${i}`, fill: COL.leaf }));
  for (let i = 1; i <= 3; i++) pieces.push(leafPiece(9, 62, { id: `phyllode-short-${i}`, fill: COL.leafDark }));
  // Sprig stems — tapered strips with a lengthwise fold score
  for (let i = 1; i <= 2; i++) {
    pieces.push(piece({
      id: `sprig-stem-${i}`,
      pts: blade(5, 150, { prof: SLIM_PROFILE, steps: 6 }),
      fill: COL.stem,
      scores: [[{ x: 0, y: -8 }, { x: 0, y: -142 }]],
    }));
  }
  return pieces;
}

const CARE = [
  'Dust with a soft brush or a hairdryer on cool.',
  'Keep out of direct sun - dyed cardstock fades.',
  'Paper is flammable: never place a bloom near a flame.',
  'Store stems flat or upright in a vase, never folded.',
];

const DESIGNS = [
  {
    slug: 'rose-classic',
    title: 'Classic Rose — layered cut sheet',
    finished: 'Bloom 62 mm across · stem 200 mm',
    build: 'Roll the spiral centre onto 18ga wire. Cup each petal over a thumb, glue outer ring first (offset joins), then mid, then inner, then the spiral centre into the cup. Wrap the 5-point calyx under the bloom and tape in the leaves.',
    pieces: rose,
    guide: {
      summary: 'A layered paper rose: three petal rings around a rolled spiral centre, closed with a five-point calyx and two pairs of leaves.',
      makes: 'One 62 mm bloom - 15 petals, a spiral centre and a calyx - plus four leaves.',
      time: '45-60 min',
      level: 'Intermediate',
      materials: [
        '65 lb (176 gsm) cardstock - blush, 2 sheets',
        '65 lb cardstock - sage, 1 sheet',
        '18 ga floral wire, one 300 mm stem',
        'Floral tape, 12 mm',
        'Low-temp glue gun and tacky glue',
      ],
      tools: [
        'Fine-point Cricut blade',
        'StandardGrip 12 x 12 mat',
        'Spatula and weeding hook',
        'Pencil for curling',
        'Small sharp scissors',
      ],
      shaping: [
        { name: 'Cup', text: 'Press the centre of each petal into your palm with your thumb and draw the edges back so it holds a shallow bowl.' },
        { name: 'Curl', text: 'Pull the petal edge between thumb and the back of a scissor blade - the edge should lean outward, not fold over.' },
        { name: 'Roll', text: 'Roll the spiral centre from the tail end inwards. Glue the tail flat against the roll so it cannot spring open.' },
      ],
      steps: [
        'Cut the sheet on "Cardstock 65 lb" with More pressure, then lift each piece with a spatula so the narrow 4 mm petal bases do not curl.',
        'Cup all 15 petals. Work on a soft surface so the paper takes a gentle curve rather than a crease.',
        'Roll the spiral centre around the wire tip and glue the tail flat. This becomes the bud the inner ring hugs.',
        'Glue the five outer petals around the spiral, overlapping each join by half a petal and keeping all the bases level.',
        'Add the mid ring rotated half a petal, then the inner ring tucked tight against the roll.',
        'Slide the calyx up the wire and glue its five points under the bloom, then wrap the stem with floral tape.',
        'Tape the two large leaves on opposite sides about 60 mm below the bloom, then the small leaves 25 mm lower.',
      ],
      stack: ['Outer petals x5', 'Mid petals x5', 'Inner petals x5', 'Rolled spiral centre'],
      care: CARE,
      trouble: 'Petal edges tearing on the mat? Drop one pressure step and fit a fresh blade - the notches at each base are only 4 mm wide and are the first thing to catch.',
    },
  },
  {
    slug: 'peony-ruffled',
    title: 'Ruffled Peony — layered cut sheet',
    finished: 'Bloom 78 mm across',
    build: 'Scrunch each petal between thumb and blade of scissors to break the paper fibres, then cup. Layer outer → mid → inner with joins offset by half a petal. Glue the scored centre disc in last and press a crease along both score lines for a cupped heart.',
    pieces: peony,
    guide: {
      summary: 'A full, ruffled peony: eighteen petals in three rings plus a cupped centre disc. The scrunch is what makes it read as fabric rather than paper.',
      makes: 'One 78 mm bloom - 15 petals and a centre disc - plus three leaves.',
      time: '50-65 min',
      level: 'Intermediate',
      materials: [
        '65 lb (176 gsm) cardstock - blush, 3 sheets',
        '65 lb cardstock - sage, 1 sheet',
        '18 ga floral wire, one stem',
        'Floral tape, 12 mm',
        'Low-temp glue gun',
      ],
      tools: [
        'Fine-point Cricut blade',
        'StandardGrip 12 x 12 mat',
        'Spatula',
        'Scissors (for the scrunch)',
        'Tweezers for the inner petals',
      ],
      shaping: [
        { name: 'Scrunch', text: 'Pull each petal lengthways between thumb and the back of a scissor blade, four or five times, until a crease network forms.' },
        { name: 'Cup', text: 'Thumb in the centre, edges lifted. Peony petals should look slightly irregular - do not flatten them.' },
        { name: 'Crease', text: 'Press along both score lines of the centre disc so it cups into a heart shape before gluing.' },
      ],
      steps: [
        'Cut the sheet, then scrunch every petal. Skipping this step is the difference between a peony and a flat flower.',
        'Cup the scrunched petals in your palm, keeping the notches at the tips soft.',
        'Glue the six outer petals in a ring, overlapping each join by about a third of a petal.',
        'Add the five mid petals rotated half a petal, then the four inner petals standing almost upright against the wire.',
        'Crease the centre disc on both score lines so it cups, then glue it into the middle of the inner ring.',
        'Wrap the stem with floral tape and tape the three leaves on, largest lowest.',
      ],
      stack: ['Outer petals x6', 'Mid petals x5', 'Inner petals x4', 'Centre disc'],
      care: CARE,
      trouble: 'Bloom looks flat after assembly? The scrunch was too gentle - each petal needs a visible crease network before it is cupped.',
    },
  },
  {
    slug: 'gerbera-daisy',
    title: 'Gerbera Daisy — flat petal rings',
    finished: 'Bloom 148 mm across',
    build: 'This one is flat by design: curl the outer ring petals upwards around a pencil, glue the mid ring on top rotated half a petal, then the centre disc. Two rings give a full-looking bloom from the side as well as the front.',
    pieces: gerbera,
    guide: {
      summary: 'A flat, graphic daisy cut as two petal rings and a scored centre disc. Quick to build, and it holds its shape without wire through the bloom.',
      makes: 'One 148 mm bloom - a 26-petal ring, a 22-petal ring and a centre disc - plus two leaves.',
      time: '20-30 min',
      level: 'Beginner',
      materials: [
        '65 lb (176 gsm) cardstock - blush, 1 sheet',
        '65 lb cardstock - sage, 1 sheet',
        '18 ga floral wire, one stem',
        'Floral tape, 12 mm',
        'Tacky glue',
      ],
      tools: [
        'Fine-point Cricut blade',
        'StandardGrip 12 x 12 mat',
        'Spatula',
        'Pencil for curling',
        'Bone folder (optional)',
      ],
      shaping: [
        { name: 'Curl', text: 'Lay the ring flat on the table and run a pencil along each petal, lifting only the last third towards you.' },
        { name: 'Cup', text: 'Press the centre disc along both score lines so it sits proud of the rings like a real flower head.' },
        { name: 'Ease', text: 'Flex the ring gently in both directions before gluing so the paper relaxes and lies flat again.' },
      ],
      steps: [
        'Cut both petal rings and the centre disc. Each ring is a single piece - do not detach the petals.',
        'Curl the outer ring petal by petal until the tips lift evenly all the way around.',
        'Glue the mid ring onto the outer ring, rotated half a petal so the gaps are covered.',
        'Cup the centre disc on both score lines and glue it over the ring centres. The 3 mm hole is the wire seat.',
        'Push the wire through the hole, add a dab of glue on the underside, and tape the two leaves onto the stem.',
        'Open any petals that closed up while the glue set - the ring should look the same from every angle.',
      ],
      stack: ['Outer ring (26 petals)', 'Mid ring (22 petals)', 'Centre disc'],
      care: CARE,
      trouble: 'Ring curls unevenly? Curl with the piece flat on the table rather than in your hand, and count the petals so the lift matches all the way round.',
    },
  },
  {
    slug: 'lily-six-petal',
    title: 'Six-Petal Lily — shaped petals',
    finished: 'Bloom 90 mm across · stem 250 mm',
    build: 'Curl each petal lengthways around a pencil, fold on the base score. Glue the six petals in a ring, notched tips facing out. Bend the thin stamens and glue them into the centre disc; tape the two slim leaves onto the stem.',
    pieces: lily,
    guide: {
      summary: 'Six long, notched petals shaped around a pencil, with nine thin stamens and a cupped centre. The curl does all the work - the cut stays simple.',
      makes: 'One 90 mm bloom - six petals, nine stamens and a centre disc - plus two slim leaves.',
      time: '35-45 min',
      level: 'Intermediate',
      materials: [
        '65 lb (176 gsm) cardstock - ivory, 1 sheet',
        '65 lb cardstock - sage, 1 sheet',
        '20 ga floral wire, one 250 mm stem',
        'Floral tape, 12 mm',
        'Tacky glue',
      ],
      tools: [
        'Fine-point blade (premium for the 4.5 mm stamens)',
        'StandardGrip 12 x 12 mat',
        'Spatula and tweezers',
        'Pencil for curling',
        'Small sharp scissors',
      ],
      shaping: [
        { name: 'Curl', text: 'Wrap each petal lengthways around a pencil, then flex it back the other way so it holds a soft S rather than a tube.' },
        { name: 'Fold', text: 'Fold along the base score line so the last 15 mm of every petal stands up against the wire.' },
        { name: 'Bend', text: 'Draw each stamen over the pencil edge to curve it - they should all bend the same way.' },
      ],
      steps: [
        'Cut the sheet. The stamens are only 4.5 mm wide - lift them with a spatula, not your fingers.',
        'Curl all six petals lengthways, then fold each base on its score line.',
        'Glue the six petals in a ring with the notched tips facing out, keeping all the bases at the same height.',
        'Bend the stamens into shallow curves and glue the bundle into the centre disc.',
        'Seat the stamen bundle in the middle of the petal ring and hold it until the glue grabs.',
        'Wrap the stem with floral tape and tape the two slim leaves on opposite sides.',
      ],
      stack: ['Petal ring x6', 'Stamen bundle + centre disc'],
      care: CARE,
      trouble: 'Petal tips splitting at the notch? Re-cut that piece with a fresh blade and one pressure step lower - the notch is the thinnest point on the sheet.',
    },
  },
  {
    slug: 'banksia-native',
    title: 'Banksia — cone + serrated leaves',
    finished: 'Cone 120 mm long · leaves 90 mm',
    build: 'Roll the scored cone strip into a tapered cylinder on a wire, glue the seam. Shape each scale into a shallow cup and glue on in rows from the base up, overlapping like roof tiles. Tape the serrated leaves in pairs down the stem.',
    pieces: banksia,
    guide: {
      summary: 'A rolled banksia cone built from one scored strip and sixteen shaped scales, finished with serrated leaves taped down the stem.',
      makes: 'One 120 mm cone (strip plus 16 scales) and four serrated leaves.',
      time: '60-75 min',
      level: 'Advanced',
      materials: [
        '65 lb (176 gsm) cardstock - natural, 2 sheets',
        '65 lb cardstock - olive, 1 sheet',
        '18 ga floral wire, one stem',
        'Floral tape, 12 mm',
        'Low-temp glue gun',
      ],
      tools: [
        'Fine-point Cricut blade',
        'StandardGrip 12 x 12 mat',
        'Spatula',
        'Pencil or paintbrush handle (for cupping scales)',
        'Tweezers',
      ],
      shaping: [
        { name: 'Fold', text: 'Fold every score line on the cone strip lightly before rolling - eleven creases are easier to set flat than in a curve.' },
        { name: 'Roll', text: 'Roll the strip around the wire from the narrow end, keeping the seam straight so the cone stays tapered.' },
        { name: 'Cup', text: 'Roll each scale over a pencil tip into a shallow scoop so it stands off the cone like a real seed pod.' },
      ],
      steps: [
        'Cut the sheet and fold all eleven score lines on the cone strip before anything else.',
        'Roll the strip into a tapered cylinder around the wire and glue the seam. Hold it until the glue sets - this shape is the whole flower.',
        'Cup all sixteen scales over a pencil tip.',
        'Glue the first row of six scales at the base of the cone, all pointing down and outward.',
        'Add row after row, offset by half a scale and overlapping the row below like roof tiles. Work upwards to the tip.',
        'Wrap the stem and tape the four serrated leaves on in pairs, largest pair lowest.',
      ],
      stack: ['Cone strip (rolled)', 'Scale rows from base up'],
      care: CARE,
      trouble: 'Cone bulging or twisting? Roll it around a wire held vertical and keep the seam straight; a wavering seam is what makes the cone lean.',
    },
  },
  {
    slug: 'eucalyptus-foliage',
    title: 'Eucalyptus Foliage — coin leaves',
    finished: 'Spray 240 mm long · leaves 16–26 mm',
    build: 'Cup every coin leaf along its score line (thumb in the middle, curl both edges up). Glue pairs alternately left and right down a taped 18ga wire, largest leaves at the base, smallest at the tip. Three sprays fill a bouquet.',
    pieces: eucalyptus,
    guide: {
      summary: 'Coin-leaf foliage: twenty-four scored discs on four paper stems, three sprays per sheet. The workhorse filler for any bouquet.',
      makes: 'Three 240 mm sprays from 24 coin leaves and four stems, with spare leaves left over.',
      time: '25-35 min',
      level: 'Beginner',
      materials: [
        '65 lb (176 gsm) cardstock - sage, 1 sheet',
        '65 lb cardstock - olive, 1 sheet',
        '18 ga floral wire, four 240 mm stems',
        'Floral tape, 12 mm',
        'Tacky glue',
      ],
      tools: [
        'Fine-point blade (premium for the 4.6 mm stems)',
        'StandardGrip 12 x 12 mat',
        'Spatula and tweezers',
        'Floral tape dispenser (optional)',
        'Small sharp scissors',
      ],
      shaping: [
        { name: 'Cup', text: 'Thumb under the middle of a coin, both edges up - a shallow spoon, not a taco.' },
        { name: 'Pair', text: 'Glue leaves in opposite pairs down each stem, turning the pair a quarter turn from the last so the spray fills out.' },
        { name: 'Flex', text: 'Bend the finished spray into a gentle curve; eucalyptus grows with a droop, not a straight line.' },
      ],
      steps: [
        'Cut the sheet: 24 coins in three sizes plus four 4.6 mm stem strips. Sort the coins into size piles.',
        'Cup every coin along its score so both edges lift like a spoon.',
        'Glue a coin to the end of each stem strip, then work down in pairs - one left, one right - about 18 mm apart.',
        'Rotate each new pair a quarter turn from the one above so the spray looks full from above.',
        'Tape each paper stem onto a wire, then bend the whole spray gently into a curve.',
        'Use the six largest coins at the base of each spray and the ten smallest at the tips.',
      ],
      stack: ['Stem + leaf pairs (largest to smallest)'],
      care: CARE,
      trouble: 'Stem strips tearing? Cut them from the long grain of the cardstock and handle them with tweezers, not fingertips.',
    },
  },
  {
    slug: 'wattle-sprig',
    title: 'Golden Wattle Sprig — fringed puff heads',
    finished: 'Sprig 300 mm · puff heads 40 mm and 30 mm',
    build: 'Fringe each scalloped disc toward the centre with fine scissors, dome it over a fingertip and tack the rim. Gather three or four heads at each stem tip in loose clusters, then tape the slim phyllode leaves down the stem in pairs.',
    pieces: wattle,
    guide: {
      summary: "Australia's golden wattle: seven scalloped puff heads fringed and domed into fuzzy gold balls, with slim phyllode leaves on two paper stems. The signature filler for native arrangements.",
      makes: 'Two 300 mm sprigs — seven puff heads (3 x 40 mm, 4 x 30 mm) and six phyllode leaves.',
      time: '45-60 min',
      level: 'Intermediate',
      materials: [
        '65 lb (176 gsm) cardstock - gold, 1 sheet',
        '65 lb cardstock - sage, 1 sheet',
        '20 ga floral wire, two 300 mm stems',
        'Floral tape, 12 mm - green',
        'Tacky glue',
      ],
      tools: [
        'Fine-point blade',
        'StandardGrip 12 x 12 mat',
        'Small sharp scissors (fringing)',
        'Spatula and tweezers',
        'Pencil or fingertip for doming',
      ],
      shaping: [
        { name: 'Fringe', text: 'Cut fine slits from the scalloped edge toward the centre, stopping about 6 mm short - the denser the fringe, the fluffier the head.' },
        { name: 'Dome', text: 'Press the centre over a fingertip and work the fringe upward so the disc becomes a ball, not a saucer.' },
        { name: 'Gather', text: 'Cluster the heads in twos and threes at the stem tip rather than in a straight line - wattle grows in bursts.' },
      ],
      steps: [
        'Cut the seven discs and fringe each one with fine scissors, cutting toward the centre and stopping 6 mm short.',
        'Dome every disc over a fingertip and tack the rim so it holds its ball shape.',
        'Wrap both stems with green floral tape from the tip down.',
        'Glue three puff heads to the tip of the first stem and four to the second, in loose clusters.',
        'Tape the six phyllode leaves down the stems in pairs, longest pair nearest the heads.',
        'Fluff the fringes outward once the glue sets - the heads should read as fuzzy gold balls.',
      ],
      stack: ['Puff heads x7 (fringed + domed)', 'Phyllodes x6, stems x2'],
      care: CARE,
      trouble: 'Heads looking flat? The fringing stopped too far out - slits need to reach within 6 mm of the centre for the dome to hold.',
    },
  },

];

/* ---------------------------------------------------------------- layout */

function bboxOf(pts) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function shelfPack(pieces) {
  const order = pieces
    .map((pc, i) => ({ pc, i, box: bboxOf(pc.pts) }))
    .sort((a, b) => b.box.h - a.box.h || b.box.w - a.box.w);

  const edge = MARGIN + PAD;
  let x = edge;
  let y = edge;
  let rowH = 0;
  for (const entry of order) {
    const { pc, box } = entry;
    if (box.w > CONTENT - PAD * 2 || box.h > CONTENT - PAD * 2) {
      throw new Error(`${pc.id} is ${box.w.toFixed(1)}x${box.h.toFixed(1)} mm — larger than the mat`);
    }
    if (x + box.w > SHEET - edge + 1e-6) {
      x = edge;
      y += rowH + GAP;
      rowH = 0;
    }
    if (y + box.h > SHEET - edge + 1e-6) {
      throw new Error(`${pc.id} does not fit on the sheet — trim the piece list`);
    }
    pc.offset = { x: x - box.minX, y: y - box.minY };
    pc.placed = { x, y, w: box.w, h: box.h };
    x += box.w + GAP;
    rowH = Math.max(rowH, box.h);
  }
  return order.map((e) => e.pc);
}

const shift = (pts, o) => pts.map((p) => ({ x: p.x + o.x, y: p.y + o.y }));

/* ---------------------------------------------------------------- emitter */

/** The packed mat — cut sheet, score companion and guide all share this. */
function buildSheet(design) {
  return shelfPack(design.pieces());
}

function scorePaths(pieces) {
  const out = [];
  for (const pc of pieces) {
    // A piece can carry several guides (banksia cone bands, gerbera cross); ids
    // must stay unique or SVGs and Design Space layers collide.
    pc.scores.forEach((line, i) => {
      const id = i === 0 ? `${pc.id}-score` : `${pc.id}-score-${i + 1}`;
      out.push(`    <path id="${id}" d="${linePath(shift(line, pc.offset))}"/>`);
    });
  }
  return out;
}

function renderCutSvg(design, pieces) {
  const cuts = pieces.map((pc) => {
    const parts = [`${linePath(shift(pc.pts, pc.offset))}Z`];
    for (const hole of pc.holes) parts.push(`${linePath(shift(hole.pts, pc.offset))}Z`);
    return `    <path id="${pc.id}" fill="${pc.fill}" d="${parts.join('')}"/>`;
  });

  const scores = scorePaths(pieces);

  const meta = {
    generator: 'scripts/generate-paper-flower-svgs.mjs',
    sheetMm: SHEET,
    finished: design.finished,
    pieces: pieces.length,
    cutSettings: 'Fine-point blade · Cardstock 65lb · More pressure · StandardGrip mat',
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET}mm" height="${SHEET}mm" viewBox="0 0 ${SHEET} ${SHEET}" version="1.1">
  <title>${escapeXml(design.title)}</title>
  <desc>${escapeXml(`${design.finished}. ${design.build}`)}</desc>
  <metadata>${escapeXml(JSON.stringify(meta))}</metadata>
  <g id="cut" fill-rule="evenodd" stroke="none">
${cuts.join('\n')}
  </g>
  <g id="score" fill="none" stroke="#8A8F98" stroke-width="0.4" stroke-dasharray="3 1.6" stroke-linecap="round">
${scores.join('\n')}
  </g>
</svg>
`;
}

/**
 * Score-only companion: the same mat layout with nothing but the fold and
 * shaping guides. Uploaded alongside the cut sheet, select-all + Attach in
 * Design Space registers every score on its piece. Deliberately contains no
 * filled shapes - anything filled would be cut a second time.
 */
function renderScoreSvg(design, pieces) {
  const scores = scorePaths(pieces);
  const meta = {
    kind: 'score-only companion',
    pairsWith: `${design.slug}.svg`,
    sheetMm: SHEET,
    scoreLines: pieces.reduce((n, pc) => n + pc.scores.length, 0),
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET}mm" height="${SHEET}mm" viewBox="0 0 ${SHEET} ${SHEET}" version="1.1">
  <title>${escapeXml(`${design.title} — score guides only`)}</title>
  <desc>${escapeXml(`Score-only companion for ${design.slug}.svg. Same 305 mm mat, same positions: upload both files, select everything and Attach, then set this layer's linetype to Score. Contains no cut shapes.`)}</desc>
  <metadata>${escapeXml(JSON.stringify(meta))}</metadata>
  <g id="score" fill="none" stroke="#8A8F98" stroke-width="0.4" stroke-dasharray="3 1.6" stroke-linecap="round">
${scores.join('\n')}
  </g>
</svg>
`;
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ------------------------------------------------------------- validation */

/** Independent re-parse of the emitted `d` strings. */
function parsePath(d) {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const subs = [];
  let cur = null;
  let i = 0;
  let cmd = null;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[A-Za-z]/.test(t)) { cmd = t; i++; }
    if (cmd === 'M') {
      cur = { pts: [{ x: num(), y: num() }], closed: false };
      subs.push(cur);
      cmd = 'L';
    } else if (cmd === 'L') {
      cur.pts.push({ x: num(), y: num() });
    } else if (cmd === 'C') {
      const c1 = { x: num(), y: num() };
      const c2 = { x: num(), y: num() };
      const p = { x: num(), y: num() };
      const from = cur.pts[cur.pts.length - 1];
      for (let s = 1; s <= 8; s++) {
        const u = s / 8;
        const v = 1 - u;
        cur.pts.push({
          x: v * v * v * from.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * p.x,
          y: v * v * v * from.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u * u * u * p.y,
        });
      }
    } else if (cmd === 'Z') {
      if (cur) cur.closed = true;
      i++;
    } else {
      throw new Error(`Unsupported path command: ${cmd}`);
    }
  }
  return subs;
}

const areaOf = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a / 2);
};

function validateDesign(design, svg) {
  const problems = [];
  const cutMatch = svg.match(/<g id="cut"[\s\S]*?<\/g>/);
  const scoreMatch = svg.match(/<g id="score"[\s\S]*?<\/g>/);
  if (!cutMatch) problems.push('missing cut group');
  if (!scoreMatch) problems.push('missing score group');

  const paths = [...(cutMatch?.[0].matchAll(/<path id="([^"]+)" fill="([^"]+)" d="([^"]+)"\/>/g) || [])]
    .map((m) => ({ id: m[1], fill: m[2], d: m[3] }));

  const allIds = [...svg.matchAll(/<path id="([^"]+)"/g)].map((m) => m[1]);
  const duplicates = [...new Set(allIds.filter((id, i) => allIds.indexOf(id) !== i))];
  if (duplicates.length) problems.push(`duplicate path ids: ${duplicates.join(', ')}`);

  const boxes = [];
  let area = 0;
  let minSide = Infinity;

  for (const p of paths) {
    const subs = parsePath(p.d);
    if (!subs.length || !subs[0].pts.length) problems.push(`${p.id}: empty path`);
    for (const s of subs) {
      if (!s.closed) problems.push(`${p.id}: subpath not closed`);
      for (const pt of s.pts) {
        if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) problems.push(`${p.id}: non-finite coordinate`);
        if (pt.x < MARGIN - 0.01 || pt.x > SHEET - MARGIN + 0.01 || pt.y < MARGIN - 0.01 || pt.y > SHEET - MARGIN + 0.01) {
          problems.push(`${p.id}: coordinate ${pt.x.toFixed(1)},${pt.y.toFixed(1)} outside mat margin`);
        }
      }
    }
    const outer = subs[0].pts;
    const a = areaOf(outer) - subs.slice(1).reduce((sum, s) => sum + areaOf(s.pts), 0);
    if (a < 15) problems.push(`${p.id}: cut area ${a.toFixed(1)} mm² too small`);
    area += Math.max(0, a);
    const b = bboxOf(outer);
    if (b.w < 2.4 || b.h < 2.4) problems.push(`${p.id}: piece ${b.w.toFixed(1)}x${b.h.toFixed(1)} mm below 2.4 mm minimum`);
    minSide = Math.min(minSide, b.w, b.h);
    boxes.push({ id: p.id, ...b });
  }

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap = a.minX < b.maxX - 0.01 && b.minX < a.maxX - 0.01 && a.minY < b.maxY - 0.01 && b.minY < a.maxY - 0.01;
      if (overlap) problems.push(`${a.id} overlaps ${b.id}`);
    }
  }

  const scorePaths = [...(scoreMatch?.[0].matchAll(/<path id="([^"]+)" d="([^"]+)"\/>/g) || [])];
  for (const [, id, d] of scorePaths) {
    for (const sub of parsePath(d)) {
      for (const pt of sub.pts) {
        if (pt.x < MARGIN || pt.x > SHEET - MARGIN || pt.y < MARGIN || pt.y > SHEET - MARGIN) {
          problems.push(`${id}: score line outside mat margin`);
        }
      }
    }
  }

  return {
    id: design.slug,
    sheets: 1,
    pieces: paths.length,
    scores: scorePaths.length,
    minSide: Math.round(minSide * 10) / 10,
    coverage: Math.round((area / (SHEET * SHEET)) * 1000) / 10,
    problems,
  };
}

/**
 * Score-only companion: no cut group, every score inside the mat margin, and
 * every score registered onto the cut piece it belongs to (same positions).
 */
function validateScoreSheet(design, svg, cutSvg) {
  const problems = [];
  if (/<g id="cut"/.test(svg)) problems.push('score companion contains a cut group (would double-cut)');
  const group = svg.match(/<g id="score"[\s\S]*?<\/g>/);
  if (!group) return { problems: [...problems, 'missing score group'], scores: 0 };
  const paths = [...group[0].matchAll(/<path id="([^"]+)" d="([^"]+)"\/>/g)];
  if (!paths.length) problems.push('score companion has no score paths');
  const ids = paths.map((m) => m[1]);
  const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (duplicates.length) problems.push(`duplicate score ids: ${duplicates.join(', ')}`);

  const cutBoxes = new Map();
  for (const m of cutSvg.matchAll(/<path id="([^"]+)" fill="[^"]+" d="([^"]+)"\/>/g)) {
    const pts = parsePath(m[2])[0].pts;
    cutBoxes.set(m[1], bboxOf(pts));
  }

  for (const [, id, d] of paths) {
    const pts = parsePath(d)[0].pts;
    for (const pt of pts) {
      if (pt.x < MARGIN || pt.x > SHEET - MARGIN || pt.y < MARGIN || pt.y > SHEET - MARGIN) {
        problems.push(`${id}: score outside mat margin`);
      }
    }
    const target = cutBoxes.get(id.replace(/-score(-\d+)?$/, ''));
    if (!target) {
      problems.push(`${id}: no matching cut piece`);
      continue;
    }
    const box = bboxOf(pts);
    const inside = box.minX >= target.minX - 0.05 && box.maxX <= target.maxX + 0.05
      && box.minY >= target.minY - 0.05 && box.maxY <= target.maxY + 0.05;
    if (!inside) problems.push(`${id}: score falls outside its cut piece`);
  }
  const meta = JSON.parse((svg.match(/<metadata>([\s\S]*?)<\/metadata>/) || [, '{}'])[1].replace(/&quot;/g, '"'));
  if (meta.pairsWith !== `${design.slug}.svg`) problems.push('metadata does not name the cut sheet it pairs with');
  return { problems, scores: paths.length };
}

/** Group piece ids into "outer petal x5" style inventory rows. */
function inventory(pieces) {
  const counts = new Map();
  for (const pc of pieces) {
    const name = pc.id
      .replace(/-\d+$/, '')
      .replace(/-(large|mid|small)$/, ' ($1)')
      .replace(/-/g, ' ');
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()].map(([name, qty]) => ({ name, qty }));
}

const FILL_LABELS = new Map([
  [COL.petal, 'Blush cardstock'],
  [COL.petalDeep, 'Rose cardstock'],
  [COL.leaf, 'Sage cardstock'],
  [COL.leafDark, 'Deep sage cardstock'],
  [COL.neutral, 'Natural cardstock'],
  [COL.stem, 'Olive cardstock'],
]);

function paletteFor(pieces) {
  const used = new Set(pieces.map((pc) => pc.fill));
  return [...FILL_LABELS].filter(([fill]) => used.has(fill));
}

/* ---------------------------------------------------------------- preview */

function previewHtml(designs, reports) {
  const cards = designs.map((d) => {
    const svg = d.svg
      .replace(/^<\?xml[^>]*\?>\s*/, '')
      .replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="100%" height="100%"');
    const rep = reports[d.slug];
    return `    <figure class="card">
      <div class="sheet">${svg}</div>
      <figcaption>
        <h2>${escapeXml(d.title)}</h2>
        <p class="meta">${escapeXml(d.finished)}</p>
        <p class="stats">${rep.pieces} cut pieces · ${rep.scores} score lines · ${rep.coverage}% of mat</p>
        <p class="build">${escapeXml(d.build)}</p>
        <p class="links">
          <a href="${d.slug}-assembly.pdf">Assembly guide (PDF)</a>
          <a href="${d.slug}-score.svg">Score-only SVG</a>
        </p>
      </figcaption>
    </figure>`;
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Paper flower cut sheets — Krystal's Flower Kreations</title>
<style>
  :root { --ink:#3a2230; --muted:#7b6470; --paper:#fbf7f2; --line:#e6d9dd; --bloom:#a8557a; }
  * { box-sizing: border-box; }
  body { margin:0; padding:40px 28px 64px; background:var(--paper); color:var(--ink);
    font:15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { max-width:1180px; margin:0 auto 28px; }
  h1 { margin:0 0 6px; font-size:26px; letter-spacing:-0.01em; }
  header p { margin:0; color:var(--muted); max-width:70ch; }
  .grid { max-width:1180px; margin:0 auto; display:grid; gap:22px;
    grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); }
  .card { margin:0; background:#fff; border:1px solid var(--line); border-radius:14px; overflow:hidden;
    box-shadow:0 1px 2px rgba(58,34,48,.05); }
  .sheet { aspect-ratio:1; padding:10px; background:
    repeating-linear-gradient(0deg,#f4eef0 0 1px,transparent 1px 20px),
    repeating-linear-gradient(90deg,#f4eef0 0 1px,transparent 1px 20px), #fff; }
  .sheet svg { display:block; width:100%; height:100%; }
  figcaption { padding:14px 16px 16px; border-top:1px solid var(--line); }
  h2 { margin:0 0 2px; font-size:15px; }
  .meta { margin:0; font-size:13px; color:var(--bloom); font-weight:600; }
  .stats { margin:2px 0 8px; font-size:12px; color:var(--muted); }
  .build { margin:0; font-size:13px; color:#4a3340; }
  .links { margin:10px 0 0; display:flex; flex-wrap:wrap; gap:8px 16px; font-size:12px; }
  .links a { color:var(--bloom); font-weight:600; text-decoration:none; border-bottom:1px solid rgba(168,85,122,.35); }
  .links a:hover { border-bottom-color:var(--bloom); }
</style>
</head>
<body>
<header>
  <h1>Paper flower cut sheets — 12 × 12 in (305 mm)</h1>
  <p>Every sheet is one Cricut mat: filled shapes cut, dashed paths score. Solid fills are only colour hints for
  cardstock; each drawn shape becomes its own cut line. Each card also links the three-page assembly guide (PDF)
  and the score-only companion SVG, which regenerates from the same geometry as the cut sheet.</p>
</header>
<div class="grid">
${cards.join('\n')}
</div>
</body>
</html>
`;
}

/* ------------------------------------------------------- preview artwork */

// Flat illustrations for the storefront's template previews (public/svg/) —
// composed from the SAME geometry the cut sheets use, so the preview always
// matches what gets cut. Transparent background; the UI provides the frame.
function shape(pts, fill, stroke, transform = '', extra = '') {
  return `<path d="${linePath(pts)}Z" fill="${fill}" stroke="${stroke}" stroke-width="2.2" stroke-linejoin="round"${transform ? ` transform="${transform}"` : ''}${extra ? ` ${extra}` : ''}/>`;
}

const petalAt = (w, h, cx, cy, angle, fill, stroke, opts = {}) =>
  shape(blade(w, h, opts), fill, stroke, `translate(${cx} ${cy}) rotate(${angle})`);

function leafAt(w, h, cx, cy, angle, fill, stroke) {
  const pts = blade(w, h, { prof: LEAF_PROFILE, steps: 40 });
  const vein = veinScore(h).map((poly) => ({ pts: poly }));
  const body = shape(pts, fill, stroke, `translate(${cx} ${cy}) rotate(${angle})`);
  const v = vein.map((g) => `<path d="${linePath(g.pts)}" fill="none" stroke="${stroke}" stroke-width="1.4" stroke-dasharray="4 3" transform="translate(${cx} ${cy}) rotate(${angle})"/>`).join('');
  return body + v;
}

function rosePreview() {
  const cx = 200, cy = 212;
  const els = [];
  els.push(`<path d="M200 214 C 197 285, 203 335, 200 400" fill="none" stroke="#7C5A46" stroke-width="9" stroke-linecap="round"/>`);
  els.push(leafAt(38, 92, 200, 300, -52, COL.leaf, '#6E8259'));
  els.push(leafAt(32, 78, 200, 335, 128, COL.leafDark, '#5C7049'));
  for (let i = 0; i < 5; i++) els.push(petalAt(66, 92, cx, cy, i * 72, '#E7A9B7', '#B76B7B'));
  for (let i = 0; i < 5; i++) els.push(petalAt(54, 74, cx, cy, 36 + i * 72, '#F2C6D0', '#C4828F'));
  for (let i = 0; i < 5; i++) els.push(petalAt(40, 56, cx, cy, 10 + i * 72, '#F8DEE4', '#CC8D9A'));
  els.push(shape(spiralRibbon({ turns: 2.25, rStart: 9, rEnd: 26, band: 7 }), '#C77E8E', '#B76B7B', `translate(${cx} ${cy})`));
  return els;
}

function lilyPreview() {
  const cx = 200, cy = 196;
  const els = [];
  els.push(`<path d="M200 200 C 198 280, 202 335, 200 400" fill="none" stroke="#7C5A46" stroke-width="8" stroke-linecap="round"/>`);
  els.push(leafAt(16, 120, 200, 300, -18, COL.leaf, '#6E8259'));
  els.push(leafAt(16, 108, 200, 325, 196, COL.leafDark, '#5C7049'));
  for (let i = 0; i < 6; i++) {
    els.push(petalAt(56, 128, cx, cy, i * 60, '#FBF3E4', '#C08BA6', { notch: 9 }));
  }
  for (let i = 0; i < 9; i++) {
    const a = (i * 40 * Math.PI) / 180;
    els.push(`<path d="M${cx} ${cy} q ${Math.round(Math.cos(a) * 34)} ${Math.round(Math.sin(a) * 34 - 42)} ${Math.round(Math.cos(a) * 52)} ${Math.round(Math.sin(a) * 52 - 62)}" fill="none" stroke="#B7879F" stroke-width="3" stroke-linecap="round"/>`);
    els.push(`<circle cx="${cx + Math.cos(a) * 54}" cy="${cy + Math.sin(a) * 54 - 64}" r="5" fill="#D9A93C" stroke="#B98B22" stroke-width="1.5"/>`);
  }
  els.push(`<ellipse cx="${cx}" cy="${cy}" rx="15" ry="11" fill="#E8C2D2" stroke="#C08BA6" stroke-width="2"/>`);
  return els;
}

function banksiaPreview() {
  const els = [];
  els.push(`<path d="M200 272 L200 400" fill="none" stroke="#7C5A46" stroke-width="10" stroke-linecap="round"/>`);
  els.push(leafAt(42, 118, 196, 332, -58, COL.leafDark, '#5C7049'));
  els.push(shape(serratedLeaf(40, 112, 9), COL.leaf, '#6E8259', 'translate(206 342) rotate(62)'));
  // Tall tapered cone (banksia spike), scales fitted INSIDE its silhouette
  const cone = 'M158 266 C 152 190, 156 118, 200 88 C 244 118, 248 190, 242 266 C 220 280, 180 280, 158 266 Z';
  els.push(`<path d="${cone}" fill="#B98A4E" stroke="#8A5A2B" stroke-width="2.4" stroke-linejoin="round"/>`);
  const rows = [
    { y: 252, count: 5, spread: 22 },
    { y: 218, count: 5, spread: 20 },
    { y: 184, count: 4, spread: 21 },
    { y: 150, count: 4, spread: 18 },
    { y: 118, count: 3, spread: 16 },
  ];
  for (const { y, count, spread } of rows) {
    for (let i = 0; i < count; i++) {
      const x = 200 + (i - (count - 1) / 2) * spread;
      els.push(`<path d="M${x - 10} ${y} q 10 13 20 0" fill="#D9A85E" stroke="#8A5A2B" stroke-width="2" stroke-linecap="round"/>`);
    }
  }
  els.push(`<path d="M186 92 l -2 -20 M200 86 l 0 -24 M214 92 l 2 -20" stroke="#8A5A2B" stroke-width="3" stroke-linecap="round"/>`);
  return els;
}

function wattlePreview() {
  const els = [];
  els.push(`<path d="M200 400 C 198 320, 202 260, 200 190" fill="none" stroke="#7C5A46" stroke-width="8" stroke-linecap="round"/>`);
  els.push(`<path d="M200 300 C 160 285, 138 262, 122 232" fill="none" stroke="#7C5A46" stroke-width="6" stroke-linecap="round"/>`);
  els.push(`<path d="M200 258 C 240 244, 262 222, 278 192" fill="none" stroke="#7C5A46" stroke-width="6" stroke-linecap="round"/>`);
  els.push(leafAt(13, 96, 196, 322, -28, COL.leaf, '#6E8259'));
  els.push(leafAt(13, 88, 205, 350, 158, COL.leafDark, '#5C7049'));
  els.push(leafAt(12, 82, 186, 288, -70, COL.leaf, '#6E8259'));
  els.push(leafAt(12, 82, 216, 268, 72, COL.leafDark, '#5C7049'));
  const cluster = (cx, cy, scale) => {
    const florets = [[0, 0, 17], [-19, -9, 13], [17, -12, 14], [-11, 15, 12], [15, 12, 12], [-22, 5, 10], [3, -21, 11], [24, 2, 9]];
    return florets.map(([dx, dy, r], i) =>
      `<circle cx="${cx + dx * scale}" cy="${cy + dy * scale}" r="${r * scale}" fill="${i % 2 ? COL.gold : COL.goldDeep}" stroke="#C0922E" stroke-width="2"/>`).join('');
  };
  els.push(cluster(200, 168, 1.15));
  els.push(cluster(118, 218, 0.95));
  els.push(cluster(282, 178, 1));
  els.push(cluster(150, 130, 0.7));
  els.push(cluster(252, 122, 0.72));
  return els;
}

const PREVIEW_BUILDERS = {
  'rose-classic': rosePreview,
  'lily-six-petal': lilyPreview,
  'banksia-native': banksiaPreview,
  'wattle-sprig': wattlePreview,
};

function renderPreviewSvg(design) {
  const body = (PREVIEW_BUILDERS[design.slug] || rosePreview)().join('\n    ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 420" width="400" height="420">
  <title>${escapeXml(design.title)} — template preview</title>
  ${body}
</svg>
`;
}

/* ------------------------------------------------------------------- main */

async function main() {
  const checkOnly = process.argv.includes('--check');
  await mkdir(OUT_DIR, { recursive: true });

  const reports = {};
  const rendered = [];
  let failed = 0;

  for (const design of DESIGNS) {
    const pieces = buildSheet(design);
    const cutSvg = renderCutSvg(design, pieces);
    const scoreSvg = renderScoreSvg(design, pieces);
    const guidePdf = renderGuidePdf({ design, pieces, inventory: inventory(pieces), palette: paletteFor(pieces) });

    const artifacts = [
      { name: `${design.slug}.svg`, data: cutSvg },
      { name: `${design.slug}-score.svg`, data: scoreSvg },
      { name: `${design.slug}-assembly.pdf`, data: guidePdf },
      { name: `${design.slug}-preview.svg`, data: renderPreviewSvg(design) },
    ];

    const problems = [];
    for (const a of artifacts) {
      const target = path.join(OUT_DIR, a.name);
      const bytes = Buffer.isBuffer(a.data) ? a.data : Buffer.from(a.data, 'utf8');
      if (checkOnly) {
        const onDisk = await readFile(target).catch(() => null);
        if (!onDisk) problems.push(`${a.name} is missing - run without --check`);
        else if (!onDisk.equals(bytes)) problems.push(`${a.name} is stale - re-run without --check`);
      } else {
        await writeFile(target, bytes);
      }
    }

    const cutReport = validateDesign(design, cutSvg);
    const scoreReport = validateScoreSheet(design, scoreSvg, cutSvg);
    problems.push(...cutReport.problems.map((p) => `cut: ${p}`));
    problems.push(...scoreReport.problems.map((p) => `score: ${p}`));
    problems.push(...validatePdf(guidePdf, { pages: 3 }).map((p) => `guide: ${p}`));

    design.svg = cutSvg;
    rendered.push(design);
    reports[design.slug] = {
      ...cutReport,
      problems,
      scoreProblems: scoreReport.problems,
      scoreLines: scoreReport.scores,
      guideKb: Math.round(guidePdf.length / 1024),
    };
    if (problems.length) failed++;
  }

  if (!checkOnly) {
    await writeFile(path.join(OUT_DIR, 'preview.html'), previewHtml(rendered, reports), 'utf8');
  }

  for (const [slug, rep] of Object.entries(reports)) {
    const status = rep.problems.length ? 'FAIL' : 'ok  ';
    console.log(`${status} ${slug.padEnd(20)} ${String(rep.pieces).padStart(2)} pieces  ${String(rep.scores).padStart(2)} scores  min ${rep.minSide} mm  ${rep.coverage}% mat  guide ${rep.guideKb} KB`);
    for (const p of rep.problems) console.log(`       - ${p}`);
  }
  if (failed) {
    console.error(`\n${failed} design(s) failed validation`);
    process.exit(1);
  }
  console.log(`\n${Object.keys(reports).length} designs x (cut SVG + score SVG + guide PDF) in ${path.relative(ROOT, OUT_DIR)}${checkOnly ? ' (checked)' : ''}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
