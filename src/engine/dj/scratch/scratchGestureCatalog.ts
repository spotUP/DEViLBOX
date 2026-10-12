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
 * - `durationSteps`: THE gesture's length (16th steps), the one number the
 *   planner places, the executor releases on and the stroke runs over
 *   (`cycleBeats` = durationSteps / 4 / strokes is derived, audit SA-B2). It is
 *   the tuned DEViLBOX stroke the owner has heard, not the Up Rough
 *   `_GESTURE_STEPS` (baby 2, stab 1, chirp 2 ...): the reference renders
 *   offline and lets gestures overlap; here one hand performs them;
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
  ScratchLevel, ScratchRecordGestureHints, ScratchRole,
} from './scratchTypes';

export const SCRATCH_GESTURE_IDS: readonly ScratchGestureId[] = [
  'baby', 'babySlow', 'forwardStab', 'backwardStab', 'chirp', 'chirpDouble',
  'transformer4', 'transformer8', 'flare1', 'flare2', 'orbit', 'crab', 'scribble',
  'hydroplane', 'tearForward', 'tearReverse', 'twiddle', 'drag', 'laser', 'phaser',
  'tweak', 'vibrato', 'uzi', 'eightFingerCrab', 'threeClickFlare', 'drop', 'dropPhrase',
  'cut', 'echo', 'brake', 'spinup', 'needleDrop', 'needleLift',
];

/** Section 31 difficulty ladder: the demo's `scratch_dj.GESTURE_LEVELS` for its 16 gestures (P12); the extras
 *  rank as level-3 accents, the throws as foundation (a clean drop is the first thing a DJ learns). */
export const GESTURE_LEVELS: Readonly<Record<ScratchGestureId, ScratchLevel>> = {
  baby: 1, babySlow: 1, drag: 1, forwardStab: 1, backwardStab: 1, drop: 1, dropPhrase: 1,
  chirp: 2, chirpDouble: 2, transformer4: 2, transformer8: 2,
  flare1: 3, flare2: 3, tearForward: 3, tearReverse: 3, scribble: 4,
  uzi: 3, laser: 3, phaser: 3, tweak: 3, twiddle: 3, vibrato: 3,
  orbit: 4, crab: 4, hydroplane: 4, threeClickFlare: 4, eightFingerCrab: 4,
  // the reference's cut and echo are stabs (level 1); brake / spin-up are record flourishes (level-3 accents)
  cut: 1, echo: 1, brake: 3, spinup: 3,
  needleDrop: 1, needleLift: 1,
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

/**
 * The reference named cut patterns (`turntable.py cut_pattern` :320-338) as open windows over the
 * gesture, owner decision O3 (the demo's values for every gesture), ledger SCR-PG-A3.
 */
export type ReferenceCutPattern = 'open' | 'click' | 'doubleClick' | 'tripleClick' | 'transform' | 'flare1' | 'flare2' | 'crab';

export function referenceCutPattern(name: ReferenceCutPattern, cuts = 4): ScratchFaderWindow[] {
  switch (name) {
    case 'open': return OPEN;
    case 'click': return deck([0, 0.42], [0.5, 1]);
    case 'doubleClick': return deck([0, 0.22], [0.28, 0.5], [0.56, 0.78], [0.84, 1]);
    case 'tripleClick': return deck(...Array.from({ length: 3 }, (_, i) => [i / 3 + 0.02, i / 3 + 0.28] as const));
    case 'transform': return deck(...Array.from({ length: cuts }, (_, i) => [i / cuts, i / cuts + 0.5 / cuts] as const));
    case 'flare1': return deck([0, 0.45], [0.55, 1]);
    case 'flare2': return deck([0, 0.3], [0.37, 0.63], [0.7, 1]);
    case 'crab': {
      const edges = [0, 0.12, 0.19, 0.34, 0.4, 0.58, 0.63, 0.8, 0.85, 1];
      return deck(...Array.from({ length: edges.length / 2 }, (_, i) => [edges[2 * i]!, edges[2 * i + 1]!] as const));
    }
  }
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
 *  and hand over; one-window strokes of an eighth or less (stabs, lasers)
 *  punctuate; open-fader flowing gestures carry themes, intros and outros;
 *  fader-dense gestures are features. */
function rolesFor(id: ScratchGestureId, durationSteps: number, windows: number): ScratchRole[] {
  if (id === 'drop' || id === 'dropPhrase') return ['INTRO', 'THEME', 'TRANSITION'];
  if (durationSteps <= 2 && windows <= 1) return ['ACCENT', 'ANSWER', 'FILL'];
  if (windows <= 1) return ['INTRO', 'THEME', 'OUTRO', 'TRANSITION'];
  return ['THEME', 'ANSWER', 'FEATURE', 'FILL'];
}

// ── the 33 definitions (before the computed fields) ────────────────────────

interface GestureSeed {
  id: ScratchGestureId;
  name: string;
  durationSteps: number;
  styles: readonly ScratchDJStyle[];
  handPath?: ScratchHandPath;
  faderWindows: readonly ScratchFaderWindow[];
  cutLeadMs?: number;
  trueReverse: boolean;
  returnsToAnchor: boolean;
  recommendedBpm?: { min?: number; max?: number };
  allowsSampleSource: boolean;
  fx?: ScratchGesture['fx'];
  glide?: ScratchGesture['glide'];
  deckAction?: ScratchGesture['deckAction'];
  needle?: ScratchGesture['needle'];
  flourish?: boolean;
  /** Strokes of the curve inside the gesture's length (flutter textures: 2); default 1. */
  strokes?: number;
  loop: boolean;
}

const CHIRP_WINDOWS = deck([0.06, 0.44], [0.56, 0.94]);

const SEEDS: readonly GestureSeed[] = [
  {
    id: 'baby', name: 'Baby Scratch', durationSteps: 2,
    styles: ['oldSchool', 'boomBap', 'battle'],
    // reference baby (O3): out to A and back through the anchor to -A, fader open, a true reverse
    handPath: hand([[0, 0], [0.25, 1], [0.5, 0], [0.75, -1], [1, 0]]),
    faderWindows: referenceCutPattern('open'),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
loop: true,
  },
  {
    // Reference baby_slow: the same stroke at 0.6 A.
    id: 'babySlow', name: 'Slow Baby Scratch', durationSteps: 3,
    styles: ['loFi', 'battle'],
    handPath: hand([[0, 0], [0.25, 0.6], [0.5, 0], [0.75, -0.6], [1, 0]]),
    // reference slow baby: 0.6 A over a quarter of 3 steps (0.35 x speed)
    faderWindows: referenceCutPattern('open'),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
loop: true,
  },
  {
    // Reference forward_stab: audible on the forward push only, fader (0, 0.42).
    id: 'forwardStab', name: 'Forward Stab', durationSteps: 1,
    styles: ['oldSchool', 'boomBap', 'battle'],
    handPath: hand([[0, 0], [0.42, 1.3], [1, 0]]),
    faderWindows: deck([0, 0.42]),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
loop: true,
  },
  {
    // Reference backward_stab: silent forward setup, audible reverse pull (0.45, 1).
    id: 'backwardStab', name: 'Backward Stab', durationSteps: 1,
    styles: ['oldSchool', 'loFi', 'battle'],
    handPath: hand([[0, 0], [0.4, 1.2], [1, -0.2]]),
    faderWindows: deck([0.45, 1]),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
loop: true,
  },
  {
    // Section 32: every palette but battle names the chirp (lo-fi: "slow chirp").
    id: 'chirp', name: 'Chirp', durationSteps: 2,
    styles: ['oldSchool', 'boomBap', 'electro', 'loFi', 'battle'],
    handPath: hand([[0, 0], [0.5, 1.2], [1, -1.2]]),
    faderWindows: CHIRP_WINDOWS, cutLeadMs: -2,
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
loop: true,
  },
  {
    // Reference chirp_double: two chirps in one cycle, four windows.
    id: 'chirpDouble', name: 'Double Chirp', durationSteps: 2,
    styles: ['boomBap', 'electro', 'battle'],
    handPath: hand([[0, 0], [0.25, 1], [0.5, -1], [0.75, 1], [1, -1]]),
    faderWindows: deck([0.03, 0.22], [0.28, 0.47], [0.53, 0.72], [0.78, 0.97]), cutLeadMs: -2,
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
loop: true,
  },
  {
    // The record plays forward at natural speed under 4 cuts per beat
    // (reference transformer4 glide 1.0; DEViLBOX 40 % open duty).
    id: 'transformer4', name: 'Transformer', durationSteps: 2,
    glide: { ratio: 1.0, grip: 0.7 },
    styles: ['electro', 'battle'],
    faderWindows: referenceCutPattern('transform', 4),
    trueReverse: true, returnsToAnchor: false, allowsSampleSource: true,
loop: true,
  },
  {
    id: 'transformer8', name: 'Eight-Cut Transformer', durationSteps: 4,
    glide: { ratio: 1.0, grip: 0.7 },
    styles: ['electro', 'battle'],
    faderWindows: referenceCutPattern('transform', 8),
    trueReverse: true, returnsToAnchor: false, allowsSampleSource: true,
loop: true,
  },
  {
    // One click on the forward stroke, open return (reference flare1 = one cut).
    id: 'flare1', name: 'One-Click Flare', durationSteps: 2,
    styles: ['electro', 'battle'],
    handPath: hand([[0, 0], [1, 1.6]]),
    faderWindows: referenceCutPattern('flare1'),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
loop: true,
  },
  {
    // DEViLBOX Flare: two clicks on the forward stroke, direction changes on an open fader.
    id: 'flare2', name: 'Two-Click Flare', durationSteps: 2,
    styles: ['electro', 'battle'],
    // the demo's flare2 hand (scratch.py :159): one forward stroke, the fader making the two clicks (O3)
    handPath: hand([[0, 0], [1, 1.8]]),
    faderWindows: referenceCutPattern('flare2'),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
loop: true,
  },
  {
    // Reference orbit: forward flare + reverse flare, four windows.
    id: 'orbit', name: 'Orbit', durationSteps: 3,
    styles: ['electro', 'battle'],
    handPath: hand([[0, 0], [0.5, 1.4], [1, -1.4]]),
    faderWindows: deck([0, 0.22], [0.28, 0.47], [0.53, 0.72], [0.78, 1]),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
loop: true,
  },
  {
    // Record plays forward under rapid finger clicks (reference crab glide; DEViLBOX 28 % duty).
    id: 'crab', name: 'Crab', durationSteps: 2,
    glide: { ratio: 1.0, grip: 0.7 },
    styles: ['electro', 'battle'],
    faderWindows: referenceCutPattern('crab'),
    trueReverse: true, returnsToAnchor: false, allowsSampleSource: true,
loop: true,
  },
  {
    id: 'scribble', name: 'Scribble', durationSteps: 2, strokes: 2,
    styles: ['battle'],
    handPath: hand([[0, 0], [0.2, 0.4], [0.4, -0.4], [0.6, 0.4], [0.8, -0.4], [1, 0]]),
    faderWindows: OPEN,
    trueReverse: false, returnsToAnchor: true, allowsSampleSource: true,
loop: true,
  },
  {
    // Reference hydroplane (O3): the finger rides the record, a slightly slower forward glide
    // (0.7) under 12 fast tiny cuts (`transform`, cuts 12).
    id: 'hydroplane', name: 'Hydroplane', durationSteps: 3,
    glide: { ratio: 0.7, grip: 0.6 },
    styles: ['electro', 'battle'],
    faderWindows: referenceCutPattern('transform', 12),
    trueReverse: false, returnsToAnchor: false, allowsSampleSource: false,
loop: true,
  },
  {
    // Reference tear_fwd: one forward stroke split into speed segments.
    id: 'tearForward', name: 'Forward Tear', durationSteps: 2,
    styles: ['boomBap', 'battle'],
    handPath: hand([[0, 0], [0.34, 0.9], [0.5, 1.0], [0.67, 1.7], [1, 2.0]]),
    faderWindows: referenceCutPattern('open'),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
loop: true,
  },
  {
    // Reference tear_rev: the same segments pulled backward; DEViLBOX curve mirrored.
    id: 'tearReverse', name: 'Reverse Tear', durationSteps: 2,
    styles: ['boomBap', 'battle'],
    handPath: hand([[0, 0], [0.34, -0.5], [0.5, -0.6], [0.67, -1.4], [1, -2.0]]),
    faderWindows: OPEN,
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
loop: true,
  },
  {
    id: 'twiddle', name: 'Twiddle', durationSteps: 4,
    styles: ['electro', 'battle'],
    handPath: hand([[0, 0], [0.25, 1], [0.5, 0], [0.75, -1], [1, 0]]),
    faderWindows: deck([0, 0.09], [0.12, 0.18], [0.21, 0.30], [0.33, 0.59], [0.62, 0.68], [0.71, 0.80], [0.83, 1]),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
loop: true,
  },
  {
    // Reference drag: slow move, fader open.
    id: 'drag', name: 'Drag', durationSteps: 4,
    styles: ['oldSchool', 'loFi', 'battle'],
    handPath: hand([[0, 0], [1, 0.7]]),
    faderWindows: OPEN,
    trueReverse: false, returnsToAnchor: true, allowsSampleSource: true,
loop: true,
  },
  {
    id: 'laser', name: 'Laser', durationSteps: 1,
    styles: ['boomBap', 'battle'],
    handPath: hand([[0, 0], [0.6, 1.3], [1, 0]]),
    faderWindows: deck([0, 0.73]),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
loop: true,
  },
  {
    id: 'phaser', name: 'Phaser', durationSteps: 1,
    styles: ['boomBap', 'battle'],
    handPath: hand([[0, 0], [0.29, 1.2], [0.46, 1.2], [1, 0]]),
    faderWindows: deck([0, 0.67]),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
loop: true,
  },
  {
    id: 'tweak', name: 'Tweak', durationSteps: 8,
    // the record rides forward under the hand, its speed wobbling (the tuned profile, now a hand on the model)
    glide: { ratio: 1, grip: 1, profile: [[0, 1.0], [0.12, 1.5], [0.25, 0.6], [0.37, 1.3], [0.50, 0.7], [0.62, 1.6], [0.75, 0.5], [0.87, 1.4], [1, 1.0]] },
    styles: ['loFi', 'battle'],
    faderWindows: OPEN,
    trueReverse: false, returnsToAnchor: false, allowsSampleSource: false,
loop: true,
  },
  {
    id: 'vibrato', name: 'Vibrato', durationSteps: 1,
    // a fast hand wobble on a forward-riding record
    glide: { ratio: 1, grip: 1, profile: [[0, 1.25], [0.25, 0.75], [0.50, 1.25], [0.75, 0.75], [1, 1.25]] },
    styles: ['loFi', 'battle'],
    faderWindows: OPEN,
    trueReverse: false, returnsToAnchor: false, allowsSampleSource: false,
loop: true,
  },
  {
    id: 'uzi', name: 'Uzi', durationSteps: 1, strokes: 2,
    styles: ['electro', 'battle'],
    handPath: hand([[0, 0], [0.2, 0.2], [0.4, -0.2], [0.6, 0.2], [0.8, -0.2], [1, 0]]),
    faderWindows: OPEN,
    trueReverse: false, returnsToAnchor: true, allowsSampleSource: true,
loop: true,
  },
  {
    // Both hands on the fader: 8 taps per beat (DEViLBOX 20 % duty).
    id: 'eightFingerCrab', name: 'Eight-Finger Crab', durationSteps: 4,
    glide: { ratio: 1.0, grip: 0.7 },
    styles: ['electro', 'battle'],
    faderWindows: cutGrid(8, 0.20),
    trueReverse: true, returnsToAnchor: false, allowsSampleSource: true,
loop: true,
  },
  {
    id: 'threeClickFlare', name: 'Three-Click Flare', durationSteps: 4,
    styles: ['electro', 'battle'],
    handPath: hand([[0, 0], [0.5, 1.6], [1, 0]]),
    faderWindows: deck([0, 0.09], [0.12, 0.18], [0.21, 0.28], [0.31, 1]),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
loop: true,
  },
  {
    // Section 41 throw: the word rides clean, forward at natural speed, fader open.
    id: 'drop', name: 'Drop', durationSteps: 4,
    styles: ['oldSchool', 'boomBap', 'electro', 'battle', 'loFi'],
    faderWindows: OPEN,
    trueReverse: false, returnsToAnchor: false, allowsSampleSource: true,
loop: false,
  },
  {
    // A whole phrase thrown clean: a full bar of steps (reference drop_phrase).
    id: 'dropPhrase', name: 'Phrase Drop', durationSteps: 16,
    styles: ['oldSchool', 'boomBap', 'electro', 'battle', 'loFi'],
    faderWindows: OPEN,
    trueReverse: false, returnsToAnchor: false, allowsSampleSource: true,
loop: false,
  },
  {
    // Reference cut (scratch.py :168): out to 1.5 A at half the stroke and back, open (0, 0.42), 1 step.
    // Speed: 1.5 x 1560 samples at 22,050 Hz in half of 1 step at 92 BPM = 1.3 x, back the same.
    id: 'cut', name: 'Cut', durationSteps: 1,
    styles: ['oldSchool', 'battle'],
    handPath: hand([[0, 0], [0.5, 1.5], [1, 0]]),
    faderWindows: deck([0, 0.42]),
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
loop: true,
  },
  {
    // Reference echo (scratch.py :175-176): a forward stab, open (0, 0.4), whose tail feeds the
    // bus echo (delay mix 0.35, 0.16 s, reverb 0.05), 2 steps.
    id: 'echo', name: 'Echo Scratch', durationSteps: 2,
    styles: ['boomBap', 'battle'],
    handPath: hand([[0, 0], [0.42, 1.3], [1, 0]]),
    // 1.3 x 1560 samples out in 0.42 of 2 steps at 92 BPM (0.67 x), back in 0.58 (0.49 x)
    faderWindows: deck([0, 0.4]),
    fx: { delayMix: 0.35, delaySec: 0.16, reverbMix: 0.05 },
    trueReverse: true, returnsToAnchor: true, allowsSampleSource: true,
loop: false,
  },
  {
    // Reference brake (scratch.py :178, turntable.py deck_motion 'brake', classic_stop strength 3):
    // the record slows as exp(-3 t) over the gesture, fader open, 4 steps.
    id: 'brake', name: 'Record Brake', durationSteps: 4,
    deckAction: 'brake',
    styles: ['battle'], flourish: true,
    faderWindows: OPEN,
    trueReverse: false, returnsToAnchor: false, allowsSampleSource: true,
loop: false,
  },
  {
    // Reference spin-up (scratch.py :179, deck_motion 'start' on classic_sl1200, kp 9):
    // the record comes up to speed as 1 - exp(-5 t), fader open, 4 steps.
    id: 'spinup', name: 'Record Spin-Up', durationSteps: 4,
    deckAction: 'start',
    styles: ['battle'], flourish: true,
    faderWindows: OPEN,
    trueReverse: false, returnsToAnchor: false, allowsSampleSource: true,
loop: false,
  },
  {
    // Reference needle_drop (turntable.py :384-392): the routine opens with it (scratch_dj.py :110);
    // 2 steps (dj_viz _STEPS).
    id: 'needleDrop', name: 'Needle Drop', durationSteps: 2,
    styles: ['oldSchool', 'boomBap', 'electro', 'battle', 'loFi'], flourish: true, needle: 'drop',
    faderWindows: OPEN,
    trueReverse: false, returnsToAnchor: false, allowsSampleSource: false,
    loop: false,
  },
  {
    // Reference needle_lift (turntable.py :395-399): the routine closes with it (scratch_dj.py :161); 1 step.
    id: 'needleLift', name: 'Needle Lift', durationSteps: 1,
    styles: ['oldSchool', 'boomBap', 'electro', 'battle', 'loFi'], flourish: true, needle: 'lift',
    faderWindows: OPEN,
    trueReverse: false, returnsToAnchor: false, allowsSampleSource: false,
    loop: false,
  },
];

// ── computed fields ────────────────────────────────────────────────────────

const THROWS: ReadonlySet<ScratchGestureId> = new Set(['drop', 'dropPhrase']);

function activityOf(seed: GestureSeed): number {
  // reference: `play` (throws) and `deck` (brake / spin-up) gestures are the calm end by construction
  if (THROWS.has(seed.id) || seed.deckAction) return 0;
  return seed.faderWindows.length + handPathReversals(seed.handPath);
}

/** A gesture's steps are sixteenths whatever grid it is placed on. */
export const GESTURE_STEPS_PER_BEAT = 4;

const MAX_ACTIVITY = Math.max(...SEEDS.map(activityOf));

export const SCRATCH_GESTURES: readonly ScratchGesture[] = SEEDS.map((seed) => {
  const activity = activityOf(seed);
  const { strokes = 1, ...rest } = seed;
  return {
    ...rest,
    cycleBeats: seed.durationSteps / GESTURE_STEPS_PER_BEAT / strokes,
    activity,
    difficulty: GESTURE_LEVELS[seed.id],
    roles: rolesFor(seed.id, seed.durationSteps, seed.faderWindows.length),
    intensity: MAX_ACTIVITY > 0 ? activity / MAX_ACTIVITY : 0,
    requiresReverse: (seed.handPath ?? []).some((p) => p.position < 0),
  };
});

const BY_ID: ReadonlyMap<ScratchGestureId, ScratchGesture> = new Map(SCRATCH_GESTURES.map((g) => [g.id, g]));

/** A throw (section 41): the record rides forward from its attack with the fader open - the word as recorded. */
export const isThrowGesture = (id: ScratchGestureId): boolean => id === 'drop' || id === 'dropPhrase';

export function getGesture(id: ScratchGestureId): ScratchGesture {
  const g = BY_ID.get(id);
  if (!g) throw new Error(`[scratch] unknown gesture ${id}`);
  return g;
}

/** A gesture's length in beats: whole stroke cycles by construction (SA-B2). */
export function gestureBeats(id: ScratchGestureId): number {
  return getGesture(id).durationSteps / GESTURE_STEPS_PER_BEAT;
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

/** Up Rough reference ids -> catalogue ids (cut, echo, brake and spin-up are their own since SCR-PG-A4). */
export const REFERENCE_GESTURE_IDS: Readonly<Record<string, ScratchGestureId>> = {
  baby: 'baby', baby_slow: 'babySlow',
  forward_stab: 'forwardStab', backward_stab: 'backwardStab', cut: 'cut', echo: 'echo', brake: 'brake', spinup: 'spinup',
  chirp: 'chirp', chirp_double: 'chirpDouble',
  transformer4: 'transformer4', transformer8: 'transformer8',
  flare1: 'flare1', flare2: 'flare2', orbit: 'orbit',
  crab: 'crab', scribble: 'scribble', hydroplane: 'hydroplane',
  tear_fwd: 'tearForward', tear_rev: 'tearReverse', drag: 'drag',
  drop: 'drop', drop_phrase: 'dropPhrase',
};

const STAB_VARIANTS: readonly ScratchGestureId[] = ['cut', 'echo'];

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
  // the reference's cut and echo are forward stabs (scratch.py :168, :175: the stab's hand, a
  // shorter window, the echo's tail): a record that takes the stab takes them (SCR-PG-A4)
  if (out.includes('forwardStab')) for (const id of STAB_VARIANTS) if (!out.includes(id)) out.push(id);
  return out;
}
