/**
 * The scratch gesture catalogue (owner plan sections 9, 10, 31, 38, 39, 67;
 * ledger SCR-P1.2, P1.3, P1.10, P1.11). ONE table: the 19 DEViLBOX patterns
 * keep their tuned velocity curves as the execution curves of their gestures
 * (`SCRATCH_PATTERNS` in `DJScratchEngine.ts` is derived from here, D3), the
 * hand paths and fader windows are ported from the Up Rough generator
 * (`tools/scratch.py GESTURES`, `tools/turntable.py cut_pattern`).
 *
 * Numbers and their sources:
 * - hand paths: Up Rough `GESTURES[...].hand`, A = 1 stroke unit (section 9);
 * - `durationSteps`: Up Rough `_GESTURE_STEPS` (16th steps); DEViLBOX extras
 *   not in the reference take their pattern cycle x 4;
 * - fader windows: the reference's windows where it defines the gesture
 *   (chirp, chirpDouble, orbit, forwardStab, backwardStab), the DEViLBOX cut
 *   duty where DEViLBOX already executes a tuned cut (transformer 40 %, crab
 *   28 %, eight-finger crab 20 %), else the open spans of the legacy frames;
 * - `cutLeadMs`: reference `off` (chirp family -2 ms, section 19);
 * - `activity`: reference `gesture_activity` = windows + hand reversals;
 * - `difficulty`: section 31 ladder (see `scratchStyles.ts GESTURE_LEVELS`).
 */

import type {
  ScratchDJStyle, ScratchFaderWindow, ScratchGesture, ScratchGestureId, ScratchHandPath,
  ScratchLevel, ScratchRecordGestureHints, ScratchRole, ScratchVelocityPoint,
} from './scratchTypes';

export const SCRATCH_GESTURE_IDS: readonly ScratchGestureId[] = [
  'baby', 'babySlow', 'forwardStab', 'backwardStab', 'chirp', 'chirpDouble',
  'transformer4', 'transformer8', 'flare1', 'flare2', 'orbit', 'crab', 'scribble',
  'hydroplane', 'tearForward', 'tearReverse', 'twiddle', 'drag', 'laser', 'phaser',
  'tweak', 'vibrato', 'uzi', 'eightFingerCrab', 'threeClickFlare', 'drop', 'dropPhrase',
];

/** Section 31 difficulty ladder; the extras rank as level-3 accents, the
 *  throws as foundation (a clean drop is the first thing a DJ learns). */
export const GESTURE_LEVELS: Readonly<Record<ScratchGestureId, ScratchLevel>> = {
  baby: 1, babySlow: 1, drag: 1, forwardStab: 1, backwardStab: 1, drop: 1, dropPhrase: 1,
  chirp: 2, chirpDouble: 2, transformer4: 2, tearForward: 2,
  flare1: 3, flare2: 3, transformer8: 3, scribble: 3, tearReverse: 3,
  uzi: 3, laser: 3, phaser: 3, tweak: 3, twiddle: 3, vibrato: 3,
  orbit: 4, crab: 4, hydroplane: 4, threeClickFlare: 4, eightFingerCrab: 4,
};

// ── helpers ────────────────────────────────────────────────────────────────

const A = 1; // one stroke unit (reference A = 1500 samples at 22,050 Hz)

function hand(points: ReadonlyArray<readonly [t: number, position: number]>): ScratchHandPath {
  return points.map(([t, position]) => ({ t, position: position * A, grip: 1 }));
}

function deck(...spans: ReadonlyArray<readonly [number, number]>): ScratchFaderWindow[] {
  return spans.map((open) => ({ open, curve: 'deck' as const }));
}

/** `transform` cut grid of the reference (`cut_pattern('transform', cuts)`)
 *  with an explicit open duty instead of the reference's 0.5. */
function cutGrid(cuts: number, duty: number): ScratchFaderWindow[] {
  return deck(...Array.from({ length: cuts }, (_, i) => [i / cuts, i / cuts + duty / cuts] as const));
}

const OPEN = deck([0, 1]);

function v(points: ReadonlyArray<readonly [t: number, velocity: number]>): ScratchVelocityPoint[] {
  return points.map(([t, velocity]) => ({ t, velocity }));
}

/** Reversals of a hand path (reference `gesture_activity`): sign changes of
 *  the stroke direction, zero-length moves ignored. */
export function handPathReversals(path: ScratchHandPath | undefined): number {
  if (!path) return 0;
  let reversals = 0;
  let prev: number | null = null;
  for (let k = 1; k < path.length; k++) {
    const d = path[k]!.position - path[k - 1]!.position;
    if (prev !== null && d * prev < 0) reversals++;
    if (d !== 0) prev = d;
  }
  return reversals;
}

/** Roles a gesture can take, from its shape (section 83 roles): throws open
 *  and hand over; one-step gestures punctuate; open-fader flowing gestures
 *  carry themes, intros and outros; fader-dense gestures are features. */
function rolesFor(id: ScratchGestureId, durationSteps: number, windows: number): ScratchRole[] {
  if (id === 'drop' || id === 'dropPhrase') return ['INTRO', 'THEME', 'TRANSITION'];
  if (durationSteps <= 1) return ['ACCENT', 'ANSWER', 'FILL'];
  if (windows <= 1) return ['INTRO', 'THEME', 'OUTRO', 'TRANSITION'];
  return ['THEME', 'ANSWER', 'FEATURE', 'FILL'];
}

// ── the 27 definitions (before the computed fields) ────────────────────────

interface GestureSeed {
  id: ScratchGestureId;
  name: string;
  durationSteps: number;
  styles: readonly ScratchDJStyle[];
  handPath?: ScratchHandPath;
  velocityCurve: readonly ScratchVelocityPoint[];
  faderWindows: readonly ScratchFaderWindow[];
  cutLeadMs?: number;
  trueReverse: boolean;
  returnsToAnchor: boolean;
  recommendedBpm?: { min?: number; max?: number };
  allowsSampleSource: boolean;
  cycleBeats: number;
  interpolateVelocity: boolean;
  loop: boolean;
}

// Legacy DEViLBOX velocity curves (the frames of `DJScratchEngine.ts` before
// SCR-P1.3, velocities only; the fader lives in `faderWindows`).
const BABY_CURVE = v([
  [0, 0.2], [0.04, 0.8], [0.20, 2.4], [0.36, 0.8],
  [0.40, 0.2], [0.44, 0.8], [0.60, 1.8], [0.76, 0.8],
  [0.80, 0.2],
]);
const BABY_WINDOWS = deck([0.04, 0.40], [0.44, 0.80]);
const FLARE_CURVE = v([
  [0, 0], [0.10, 2.2], [0.15, 2.2], [0.19, 2.2], [0.33, 2.0], [0.37, 1.5],
  [0.50, 0], [0.65, -1.0], [0.90, -0.3],
]);
const CHIRP_CURVE = v([
  [0, 0], [0.06, 0.5], [0.25, 2.0], [0.44, 0.3],
  [0.50, 0], [0.56, -0.3], [0.75, -1.2], [0.94, -0.3],
]);
const CHIRP_WINDOWS = deck([0.06, 0.44], [0.56, 0.94]);
const TEAR_CURVE = v([
  [0, 0], [0.03, 0.5], [0.12, 2.0], [0.25, 0], [0.32, 0], [0.45, 2.0],
  [0.53, 0.3], [0.58, -0.3], [0.70, -1.2], [0.90, 0],
]);
const GLIDE_CURVE = v([[0, 1.0]]);

const SEEDS: readonly GestureSeed[] = [
  {
    id: 'baby', name: 'Baby Scratch', durationSteps: 2,
    styles: ['oldSchool', 'boomBap', 'battle'],
    handPath: hand([[0, 0], [0.25, 1], [0.5, 0], [0.75, -1], [1, 0]]),
    velocityCurve: BABY_CURVE, faderWindows: BABY_WINDOWS,
    trueReverse: false, returnsToAnchor: true, allowsSampleSource: true,
    cycleBeats: 1, interpolateVelocity: true, loop: true,
  },
  {
    // Reference baby_slow: the same stroke at 0.6 A.
    id: 'babySlow', name: 'Slow Baby Scratch', durationSteps: 3,
    styles: ['loFi', 'battle'],
    handPath: hand([[0, 0], [0.25, 0.6], [0.5, 0], [0.75, -0.6], [1, 0]]),
    velocityCurve: BABY_CURVE.map((p) => ({ t: p.t, velocity: p.velocity * 0.6 })),
    faderWindows: BABY_WINDOWS,
    trueReverse: false, returnsToAnchor: true, allowsSampleSource: true,
    cycleBeats: 1, interpolateVelocity: true, loop: true,
  },
  {
    // Reference forward_stab: audible on the forward push only, fader (0, 0.42).
    id: 'forwardStab', name: 'Forward Stab', durationSteps: 1,
    styles: ['oldSchool', 'boomBap', 'battle'],
    handPath: hand([[0, 0], [0.42, 1.3], [1, 0]]),
    velocityCurve: v([[0, 2.5], [0.50, -1.0]]),
    faderWindows: deck([0, 0.42]),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
    cycleBeats: 0.5, interpolateVelocity: false, loop: true,
  },
  {
    // Reference backward_stab: silent forward setup, audible reverse pull (0.45, 1).
    id: 'backwardStab', name: 'Backward Stab', durationSteps: 1,
    styles: ['oldSchool', 'loFi', 'battle'],
    handPath: hand([[0, 0], [0.4, 1.2], [1, -0.2]]),
    velocityCurve: v([[0, 1.0], [0.45, -2.5]]),
    faderWindows: deck([0.45, 1]),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
    cycleBeats: 0.5, interpolateVelocity: false, loop: true,
  },
  {
    // Section 32: every palette but battle names the chirp (lo-fi: "slow chirp").
    id: 'chirp', name: 'Chirp', durationSteps: 2,
    styles: ['oldSchool', 'boomBap', 'electro', 'loFi', 'battle'],
    handPath: hand([[0, 0], [0.5, 1.2], [1, -1.2]]),
    velocityCurve: CHIRP_CURVE, faderWindows: CHIRP_WINDOWS, cutLeadMs: -2,
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
    cycleBeats: 0.25, interpolateVelocity: true, loop: true,
  },
  {
    // Reference chirp_double: two chirps in one cycle, four windows.
    id: 'chirpDouble', name: 'Double Chirp', durationSteps: 2,
    styles: ['boomBap', 'electro', 'battle'],
    handPath: hand([[0, 0], [0.25, 1], [0.5, -1], [0.75, 1], [1, -1]]),
    velocityCurve: [
      ...CHIRP_CURVE.map((p) => ({ t: p.t / 2, velocity: p.velocity })),
      ...CHIRP_CURVE.map((p) => ({ t: 0.5 + p.t / 2, velocity: p.velocity })),
    ],
    faderWindows: deck([0.03, 0.22], [0.28, 0.47], [0.53, 0.72], [0.78, 0.97]), cutLeadMs: -2,
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
    cycleBeats: 0.5, interpolateVelocity: true, loop: true,
  },
  {
    // The record plays forward at natural speed under 4 cuts per beat
    // (reference transformer4 glide 1.0; DEViLBOX 40 % open duty).
    id: 'transformer4', name: 'Transformer', durationSteps: 2,
    styles: ['electro', 'battle'],
    velocityCurve: GLIDE_CURVE, faderWindows: cutGrid(4, 0.40),
    trueReverse: true, returnsToAnchor: false, allowsSampleSource: true,
    cycleBeats: 1, interpolateVelocity: false, loop: true,
  },
  {
    id: 'transformer8', name: 'Eight-Cut Transformer', durationSteps: 4,
    styles: ['electro', 'battle'],
    velocityCurve: GLIDE_CURVE, faderWindows: cutGrid(8, 0.40),
    trueReverse: true, returnsToAnchor: false, allowsSampleSource: true,
    cycleBeats: 1, interpolateVelocity: false, loop: true,
  },
  {
    // One click on the forward stroke, open return (reference flare1 = one cut).
    id: 'flare1', name: 'One-Click Flare', durationSteps: 2,
    styles: ['electro', 'battle'],
    handPath: hand([[0, 0], [1, 1.6]]),
    velocityCurve: FLARE_CURVE, faderWindows: deck([0, 0.15], [0.19, 1]),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
    cycleBeats: 1, interpolateVelocity: true, loop: true,
  },
  {
    // DEViLBOX Flare: two clicks on the forward stroke, direction changes on an open fader.
    id: 'flare2', name: 'Two-Click Flare', durationSteps: 2,
    styles: ['electro', 'battle'],
    handPath: hand([[0, 0], [0.5, 1.8], [1, 0]]),
    velocityCurve: FLARE_CURVE, faderWindows: deck([0, 0.15], [0.19, 0.33], [0.37, 1]),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
    cycleBeats: 1, interpolateVelocity: true, loop: true,
  },
  {
    // Reference orbit: forward flare + reverse flare, four windows.
    id: 'orbit', name: 'Orbit', durationSteps: 3,
    styles: ['electro', 'battle'],
    handPath: hand([[0, 0], [0.5, 1.4], [1, -1.4]]),
    velocityCurve: v([
      [0, 0], [0.12, 2.2], [0.20, 2.2], [0.24, 2.0], [0.42, 0.5],
      [0.50, 0], [0.62, -1.2], [0.70, -1.2], [0.74, -1.0], [0.92, -0.3],
    ]),
    faderWindows: deck([0, 0.22], [0.28, 0.47], [0.53, 0.72], [0.78, 1]),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
    cycleBeats: 1, interpolateVelocity: true, loop: true,
  },
  {
    // Record plays forward under rapid finger clicks (reference crab glide; DEViLBOX 28 % duty).
    id: 'crab', name: 'Crab', durationSteps: 2,
    styles: ['electro', 'battle'],
    velocityCurve: GLIDE_CURVE, faderWindows: cutGrid(4, 0.28),
    trueReverse: true, returnsToAnchor: false, allowsSampleSource: true,
    cycleBeats: 1, interpolateVelocity: false, loop: true,
  },
  {
    id: 'scribble', name: 'Scribble', durationSteps: 2,
    styles: ['battle'],
    handPath: hand([[0, 0], [0.2, 0.4], [0.4, -0.4], [0.6, 0.4], [0.8, -0.4], [1, 0]]),
    velocityCurve: v([
      [0, 1.5], [0.125, 0.3], [0.25, 1.5], [0.375, 0.3],
      [0.50, 1.5], [0.625, 0.3], [0.75, 1.5], [0.875, 0.3],
    ]),
    faderWindows: OPEN,
    trueReverse: false, returnsToAnchor: true, allowsSampleSource: true,
    cycleBeats: 0.25, interpolateVelocity: true, loop: true,
  },
  {
    // DEViLBOX hydroplane is the faderless wiki technique (opposing-hand flutter);
    // the reference's 12-cut variant is not it (see the ledger "P1 as built").
    id: 'hydroplane', name: 'Hydroplane', durationSteps: 3,
    styles: ['electro', 'battle'],
    velocityCurve: v([
      [0, 1.0], [0.14, 0.15], [0.26, 1.1], [0.38, 0.15],
      [0.50, 1.0], [0.62, 0.2], [0.74, 1.0], [0.86, 0.25],
    ]),
    faderWindows: OPEN,
    trueReverse: false, returnsToAnchor: false, allowsSampleSource: false,
    cycleBeats: 1, interpolateVelocity: true, loop: true,
  },
  {
    // Reference tear_fwd: one forward stroke split into speed segments.
    id: 'tearForward', name: 'Forward Tear', durationSteps: 2,
    styles: ['boomBap', 'battle'],
    handPath: hand([[0, 0], [0.34, 0.9], [0.5, 1.0], [0.67, 1.7], [1, 2.0]]),
    velocityCurve: TEAR_CURVE, faderWindows: deck([0.03, 0.53], [0.58, 0.90]),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
    cycleBeats: 1, interpolateVelocity: true, loop: true,
  },
  {
    // Reference tear_rev: the same segments pulled backward; DEViLBOX curve mirrored.
    id: 'tearReverse', name: 'Reverse Tear', durationSteps: 2,
    styles: ['boomBap', 'battle'],
    handPath: hand([[0, 0], [0.34, -0.5], [0.5, -0.6], [0.67, -1.4], [1, -2.0]]),
    velocityCurve: TEAR_CURVE.map((p) => ({ t: p.t, velocity: -p.velocity })),
    faderWindows: OPEN,
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
    cycleBeats: 1, interpolateVelocity: true, loop: true,
  },
  {
    id: 'twiddle', name: 'Twiddle', durationSteps: 4,
    styles: ['electro', 'battle'],
    handPath: hand([[0, 0], [0.25, 1], [0.5, 0], [0.75, -1], [1, 0]]),
    velocityCurve: v([
      [0, 0], [0.05, 1.0], [0.09, 1.5], [0.12, 1.8], [0.18, 2.2], [0.21, 2.2],
      [0.30, 1.8], [0.33, 1.5], [0.45, 0.3], [0.50, 0], [0.55, -0.5], [0.59, -0.8],
      [0.62, -1.0], [0.68, -1.2], [0.71, -1.0], [0.80, -0.6], [0.83, -0.4], [0.95, -0.1],
    ]),
    faderWindows: deck([0, 0.09], [0.12, 0.18], [0.21, 0.30], [0.33, 0.59], [0.62, 0.68], [0.71, 0.80], [0.83, 1]),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
    cycleBeats: 1, interpolateVelocity: true, loop: true,
  },
  {
    // Reference drag: slow move, fader open.
    id: 'drag', name: 'Drag', durationSteps: 4,
    styles: ['oldSchool', 'loFi', 'battle'],
    handPath: hand([[0, 0], [1, 0.7]]),
    velocityCurve: v([[0, 1.0], [0.20, 0.7], [0.40, 0.4], [0.60, 0.2], [0.75, 0.15], [0.90, 0.8]]),
    faderWindows: OPEN,
    trueReverse: false, returnsToAnchor: true, allowsSampleSource: true,
    cycleBeats: 2, interpolateVelocity: true, loop: true,
  },
  {
    id: 'laser', name: 'Laser', durationSteps: 1,
    styles: ['boomBap', 'battle'],
    handPath: hand([[0, 0], [0.6, 1.3], [1, 0]]),
    velocityCurve: v([[0, 5.0], [0.20, 2.5], [0.40, 0.8], [0.60, 0.2], [0.73, -1.0]]),
    faderWindows: deck([0, 0.73]),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
    cycleBeats: 0.25, interpolateVelocity: true, loop: true,
  },
  {
    id: 'phaser', name: 'Phaser', durationSteps: 1,
    styles: ['boomBap', 'battle'],
    handPath: hand([[0, 0], [0.29, 1.2], [0.46, 1.2], [1, 0]]),
    velocityCurve: v([[0, 5.0], [0.17, 2.0], [0.29, 0], [0.46, 0], [0.67, -0.8]]),
    faderWindows: deck([0, 0.67]),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
    cycleBeats: 0.25, interpolateVelocity: true, loop: true,
  },
  {
    id: 'tweak', name: 'Tweak', durationSteps: 8,
    styles: ['loFi', 'battle'],
    velocityCurve: v([
      [0, 1.0], [0.12, 1.5], [0.25, 0.6], [0.37, 1.3], [0.50, 0.7], [0.62, 1.6], [0.75, 0.5], [0.87, 1.4],
    ]),
    faderWindows: OPEN,
    trueReverse: false, returnsToAnchor: false, allowsSampleSource: false,
    cycleBeats: 2, interpolateVelocity: true, loop: true,
  },
  {
    id: 'vibrato', name: 'Vibrato', durationSteps: 1,
    styles: ['loFi', 'battle'],
    velocityCurve: v([[0, 1.25], [0.25, 0.75], [0.50, 1.25], [0.75, 0.75]]),
    faderWindows: OPEN,
    trueReverse: false, returnsToAnchor: false, allowsSampleSource: false,
    cycleBeats: 0.25, interpolateVelocity: true, loop: true,
  },
  {
    id: 'uzi', name: 'Uzi', durationSteps: 1,
    styles: ['electro', 'battle'],
    handPath: hand([[0, 0], [0.2, 0.2], [0.4, -0.2], [0.6, 0.2], [0.8, -0.2], [1, 0]]),
    velocityCurve: v([
      [0, 1.4], [0.125, 0.6], [0.25, 1.4], [0.375, 0.6],
      [0.50, 1.4], [0.625, 0.6], [0.75, 1.4], [0.875, 0.6],
    ]),
    faderWindows: OPEN,
    trueReverse: false, returnsToAnchor: true, allowsSampleSource: true,
    cycleBeats: 0.125, interpolateVelocity: true, loop: true,
  },
  {
    // Both hands on the fader: 8 taps per beat (DEViLBOX 20 % duty).
    id: 'eightFingerCrab', name: 'Eight-Finger Crab', durationSteps: 4,
    styles: ['electro', 'battle'],
    velocityCurve: GLIDE_CURVE, faderWindows: cutGrid(8, 0.20),
    trueReverse: true, returnsToAnchor: false, allowsSampleSource: true,
    cycleBeats: 1, interpolateVelocity: false, loop: true,
  },
  {
    id: 'threeClickFlare', name: 'Three-Click Flare', durationSteps: 4,
    styles: ['electro', 'battle'],
    handPath: hand([[0, 0], [0.5, 1.6], [1, 0]]),
    velocityCurve: v([
      [0, 0], [0.06, 2.4], [0.09, 2.4], [0.12, 2.4], [0.18, 2.2], [0.21, 2.0],
      [0.28, 1.8], [0.31, 1.5], [0.42, 0.5], [0.50, 0], [0.65, -1.0], [0.90, -0.3],
    ]),
    faderWindows: deck([0, 0.09], [0.12, 0.18], [0.21, 0.28], [0.31, 1]),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
    cycleBeats: 1, interpolateVelocity: true, loop: true,
  },
  {
    // Section 41 throw: the word rides clean, forward at natural speed, fader open.
    id: 'drop', name: 'Drop', durationSteps: 4,
    styles: ['oldSchool', 'boomBap', 'electro', 'battle', 'loFi'],
    velocityCurve: GLIDE_CURVE, faderWindows: OPEN,
    trueReverse: false, returnsToAnchor: false, allowsSampleSource: true,
    cycleBeats: 1, interpolateVelocity: false, loop: false,
  },
  {
    // A whole phrase thrown clean: a full bar of steps (reference drop_phrase).
    id: 'dropPhrase', name: 'Phrase Drop', durationSteps: 16,
    styles: ['oldSchool', 'boomBap', 'electro', 'battle', 'loFi'],
    velocityCurve: GLIDE_CURVE, faderWindows: OPEN,
    trueReverse: false, returnsToAnchor: false, allowsSampleSource: true,
    cycleBeats: 4, interpolateVelocity: false, loop: false,
  },
];

// ── computed fields ────────────────────────────────────────────────────────

const THROWS: ReadonlySet<ScratchGestureId> = new Set(['drop', 'dropPhrase']);

function activityOf(seed: GestureSeed): number {
  if (THROWS.has(seed.id)) return 0; // reference: `play` gestures are the calm end by construction
  return seed.faderWindows.length + handPathReversals(seed.handPath);
}

const MAX_ACTIVITY = Math.max(...SEEDS.map(activityOf));

export const SCRATCH_GESTURES: readonly ScratchGesture[] = SEEDS.map((seed) => {
  const activity = activityOf(seed);
  return {
    ...seed,
    activity,
    difficulty: GESTURE_LEVELS[seed.id],
    roles: rolesFor(seed.id, seed.durationSteps, seed.faderWindows.length),
    intensity: MAX_ACTIVITY > 0 ? activity / MAX_ACTIVITY : 0,
    requiresReverse: (seed.handPath ?? []).some((p) => p.position < 0)
      || seed.velocityCurve.some((p) => p.velocity < 0 && seed.trueReverse),
  };
});

const BY_ID: ReadonlyMap<ScratchGestureId, ScratchGesture> = new Map(SCRATCH_GESTURES.map((g) => [g.id, g]));

export function getGesture(id: ScratchGestureId): ScratchGesture {
  const g = BY_ID.get(id);
  if (!g) throw new Error(`[scratch] unknown gesture ${id}`);
  return g;
}

export function isScratchGestureId(id: string): id is ScratchGestureId {
  return BY_ID.has(id as ScratchGestureId);
}

/** Reference `gesture_activity`: fader windows + hand reversals; 0 for an
 *  unknown id, a throw or a deck flourish. */
export function gestureActivity(id: string): number {
  return BY_ID.get(id as ScratchGestureId)?.activity ?? 0;
}

/** Reference `vocabulary`: ids ranked calm -> busy, ties broken by id. */
export function rankByActivity(ids: readonly ScratchGestureId[]): ScratchGestureId[] {
  return [...new Set(ids)].filter(isScratchGestureId)
    .sort((a, b) => (gestureActivity(a) - gestureActivity(b)) || (a < b ? -1 : a > b ? 1 : 0));
}

// ── source compatibility (sections 38, 39) ─────────────────────────────────

/** Up Rough reference ids -> catalogue ids. `cut` and `echo` are forward
 *  stabs (echo = a stab with a delay tail, section 43); `brake`/`spinup` are
 *  deck flourishes with no gesture here. */
export const REFERENCE_GESTURE_IDS: Readonly<Record<string, ScratchGestureId>> = {
  baby: 'baby', baby_slow: 'babySlow',
  forward_stab: 'forwardStab', backward_stab: 'backwardStab', cut: 'forwardStab', echo: 'forwardStab',
  chirp: 'chirp', chirp_double: 'chirpDouble',
  transformer4: 'transformer4', transformer8: 'transformer8',
  flare1: 'flare1', flare2: 'flare2', orbit: 'orbit',
  crab: 'crab', scribble: 'scribble', hydroplane: 'hydroplane',
  tear_fwd: 'tearForward', tear_rev: 'tearReverse', drag: 'drag',
  drop: 'drop', drop_phrase: 'dropPhrase',
};

/**
 * Gestures a record may carry (section 38) and the clean / pre-scratched
 * rule (section 39): pre-scratched audio is a one-shot (`drop`) for FX,
 * accents and transitions, never fed to the scratch engine as clean vinyl.
 */
export function compatibleGestures(record: ScratchRecordGestureHints): ScratchGestureId[] {
  if (record.preScratched) return ['drop'];
  const out: ScratchGestureId[] = [];
  for (const ref of record.recommendedGestures) {
    const id = REFERENCE_GESTURE_IDS[ref];
    if (id && !out.includes(id) && getGesture(id).allowsSampleSource) out.push(id);
  }
  return out;
}
