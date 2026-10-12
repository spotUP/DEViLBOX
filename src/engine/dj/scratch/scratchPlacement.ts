/**
 * Scratch placement brain (owner plan `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md`
 * sections 8, 21, 22, 23, 24, 35, 36, 41; D6; ledger SCR-P4.4 - P4.9, P4.12).
 *
 * A pure, deterministic port of the Up Rough reference `tools/scratch.py`
 * ("DJ BRAIN - PLACEMENT"): the same LFSR, the same density states, the same
 * preferred steps and the same pick band, so a Python run is the test fixture.
 * Nothing here touches an engine or a clock; it speaks bars, steps and beats.
 *
 *   sectionDensity / DENSITY_RATE   how much a style scratches in a section
 *   vocabulary / pickGesture        which gesture, by energy and role
 *   planPhrase                      one bar (reference `plan_phrase`, section-local)
 *   validatePhrase                  un-DJ-like patterns reported
 *   humanizeMs                      a few ms of hand, never across the beat
 *
 * More energy means a higher ceiling and a busier gesture band, not more
 * events every bar: the density state sets how often anything happens (a DJ
 * spends far more time NOT scratching than scratching, placement manual s.2).
 */

import { barSeed, lfsr, type ScratchRandom } from './scratchRandom';
import { getGesture, gestureBeats, isScratchGestureId, isThrowGesture, REFERENCE_GESTURE_IDS, SCRATCH_GESTURES } from './scratchGestureCatalog';
import { maxLevelFor, SCRATCH_STYLES, type ScratchMode } from './scratchStyles';
import { DEFAULT_GRID, stepToBeat, STEPS_PER_BEAT, type ScratchGrid } from './scratchAnchor';
import type { ScratchDJStyle, ScratchGestureId, ScratchRole } from './scratchTypes';
import type { ScratchRecord } from './scratchCatalogue';

// ─── Density (sections 21, 22) ───────────────────────────────────────────

export type DensityState = 'none' | 'veryLow' | 'low' | 'medium' | 'high' | 'showcase';
export const DENSITY_ORDER: readonly DensityState[] = ['none', 'veryLow', 'low', 'medium', 'high', 'showcase'];

/** Phrases per bar for each state (reference `DENSITY_RATE`). */
export const DENSITY_RATE: Readonly<Record<DensityState, number>> = {
  none: 0, veryLow: 0.09, low: 0.18, medium: 0.4, high: 0.7, showcase: 1.4,
};

/** Section names of the reference; Auto DJ section kinds map onto them (`scratchSectionFor`). */
export type ScratchSection =
  | 'intro' | 'verse' | 'call' | 'response' | 'hook' | 'breakdown' | 'outro' | 'A' | 'B' | 'A2'
  | 'instrumental' | 'showcase' | 'break' | 'dj_break' | 'bridge';

export const SECTION_DENSITY: Readonly<Record<ScratchSection, DensityState>> = {
  intro: 'medium', verse: 'veryLow', call: 'medium', response: 'medium', hook: 'low', breakdown: 'low',
  outro: 'medium', A: 'medium', B: 'medium', A2: 'medium',
  instrumental: 'showcase', showcase: 'showcase', break: 'high', dj_break: 'showcase', bridge: 'high',
};

export const SECTION_ENERGY: Readonly<Record<ScratchSection, number>> = {
  intro: 0.6, verse: 0.2, hook: 0.6, call: 0.9, response: 0.7, breakdown: 0.4, outro: 0.85, A: 0.7, B: 0.8, A2: 0.85,
  instrumental: 1.0, showcase: 1.0, break: 0.9, dj_break: 1.0, bridge: 0.9,
};

/** The reference profile `scale` of each palette: the density ladder input (section 32). */
export const LADDER_SCALE: Readonly<Record<ScratchDJStyle, number>> = {
  oldSchool: 0.6, boomBap: 0.8, electro: 1.1, battle: 1.4, loFi: 0.35,
};

/** Python's `round`: halves to even (JS rounds halves up). */
export function pyRound(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/** Density state for a style in a section: the section default shifted by `round((scale - 0.8) x 2.5)` steps. */
export function sectionDensity(style: ScratchDJStyle, section: ScratchSection | string, scale?: number): DensityState {
  const base = SECTION_DENSITY[section as ScratchSection] ?? 'veryLow';
  const shift = pyRound(((scale ?? LADDER_SCALE[style]) - 0.8) * 2.5);
  const i = DENSITY_ORDER.indexOf(base) + shift;
  return DENSITY_ORDER[Math.max(0, Math.min(DENSITY_ORDER.length - 1, i))]!;
}

/**
 * Preferred grid steps (reference `_STEPS = [15, 16 - 1, 8, 7, 6, 0]`). The reference clamps its
 * 16 to 15 and so plans two gestures on one step; 16 is the next bar's downbeat, outside the bar:
 * it is drawn (the random stream stays the reference's) and never placed (audit SA-B1).
 */
export const PREFERRED_STEPS: readonly number[] = [15, 16, 8, 7, 6, 0];
/** Phrase-end bars of a 16-bar phrase carry most of the scratching. */
export const PHRASE_END_BARS: readonly number[] = [3, 7, 15];
/** Never more than this many gestures in a bar (section 30). */
export const MAX_PER_BAR = 4;
/** Placement velocity weights (reference `PLAN_VEL`). */
export const PLAN_VEL = { base: 0.55, rand: 0.40, energy: 0.10 } as const;

export type PlacementRole = 'turnaround' | 'answer' | 'accent';

/** Reference role by step: >= 15 turnaround, 6-8 answer, else accent. */
export function roleForStep(step: number): PlacementRole {
  return step >= 15 ? 'turnaround' : (step === 6 || step === 7 || step === 8) ? 'answer' : 'accent';
}

/** The plan role a placement role performs as (section 83). */
export const SCRATCH_ROLE_OF: Readonly<Record<PlacementRole, ScratchRole>> = {
  turnaround: 'FILL', answer: 'ANSWER', accent: 'ACCENT',
};

// ─── Vocabulary (section 22) ─────────────────────────────────────────────

export { isThrowGesture };

/**
 * How demanding a gesture is: its level first (section 31), then its activity. Used to FILL a vocabulary a
 * mode cap left too small (`fillVocabulary`); the vocabulary itself is ranked as the demo ranks it.
 */
export const effortKey = (id: ScratchGestureId): number => getGesture(id).difficulty * 100 + getGesture(id).activity;

const REFERENCE_NAME: ReadonlyMap<ScratchGestureId, string> = new Map(Object.entries(REFERENCE_GESTURE_IDS).map(([ref, id]) => [id, ref]));
/** The demo's name of a gesture (`forward_stab`): its tie-break order. */
export const referenceName = (id: ScratchGestureId): string => REFERENCE_NAME.get(id) ?? id;

/**
 * The gestures ranked calm -> busy as the demo ranks them (`scratch.vocabulary`: activity = fader windows +
 * hand reversals, then the demo's name; SCR-PHRASING-PARITY D6), optionally thinned to `count` evenly
 * spaced entries. A faderless gesture (hydroplane's glide, a throw) sits at the calm end, as in the demo.
 */
export function vocabulary(gestures: readonly ScratchGestureId[], count?: number): ScratchGestureId[] {
  const name = referenceName;
  const ranked = [...new Set(gestures)].filter(isScratchGestureId)
    .sort((a, b) => (getGesture(a).activity - getGesture(b).activity) || (name(a) < name(b) ? -1 : name(a) > name(b) ? 1 : 0));
  if (!count || count >= ranked.length) return ranked;
  const n = Math.max(1, Math.trunc(count));
  if (n === 1) return [ranked[Math.floor(ranked.length / 2)]!];
  const out: ScratchGestureId[] = [];
  for (let i = 0; i < n; i++) {
    const g = ranked[pyRound(i * (ranked.length - 1) / (n - 1))]!;
    if (!out.includes(g)) out.push(g);
  }
  return out;
}

/**
 * The gestures a style performs in a mode (not ranked): the palette's bias (plus
 * the genre's) inside the level the mode and style allow; a palette without a bias
 * (battle) takes every gesture in the level. SAFE adds the chirp (section 62).
 */
export function planVocabulary(style: ScratchDJStyle, mode: ScratchMode, genreBias: readonly ScratchGestureId[] = []): ScratchGestureId[] {
  const cap = maxLevelFor(mode, style);
  if (cap === 0) return [];
  const allowed = (id: ScratchGestureId): boolean => {
    if (isThrowGesture(id) || getGesture(id).flourish) return false;
    const g = getGesture(id);
    return g.difficulty <= cap || (mode === 'SAFE' && id === 'chirp');
  };
  const wanted = [...SCRATCH_STYLES[style].bias, ...genreBias];
  const pool = wanted.length ? wanted : SCRATCH_GESTURES.map((g) => g.id);
  const core = [...new Set(pool)].filter(allowed);
  // a palette's bias inside a restrained mode can leave one gesture (electro in MUSICAL: chirp
  // alone): the vocabulary is filled with the nearest gestures the mode allows (section 22)
  return fillVocabulary(core, SCRATCH_GESTURES.map((g) => g.id).filter(allowed));
}

/** The smallest vocabulary a phrase is planned from (section 21: no phrase of one gesture). */
export const MIN_VOCABULARY = 3;

/**
 * `core` filled up to `min` gestures from `candidates`, nearest in effort (level, then activity)
 * to the core first, so the palette keeps its character.
 */
export function fillVocabulary(core: readonly ScratchGestureId[], candidates: readonly ScratchGestureId[], min = MIN_VOCABULARY): ScratchGestureId[] {
  const out = [...new Set(core)];
  if (out.length >= min) return out;
  const centre = out.length ? out.reduce((sum, g) => sum + effortKey(g), 0) / out.length : 0;
  const rest = [...new Set(candidates)].filter((g) => !out.includes(g) && !isThrowGesture(g))
    .sort((a, b) => Math.abs(effortKey(a) - centre) - Math.abs(effortKey(b) - centre) || (a < b ? -1 : 1));
  for (const g of rest) { if (out.length >= min) break; out.push(g); }
  return out;
}

/**
 * Choose a gesture from the whole vocabulary by energy and role: energy picks WHERE in the
 * calm -> busy ranking to sit, a turnaround (+1.0) or an answer (+0.5) sits busier than an
 * accent; the pick inside the band is random, and a gesture never repeats twice running
 * while an alternative exists.
 */
export function pickGesture(vocab: readonly ScratchGestureId[], energy: number, role: PlacementRole, rnd: ScratchRandom, last?: ScratchGestureId | null): ScratchGestureId {
  if (vocab.length === 0) return 'baby';
  const n = vocab.length;
  const shift = role === 'turnaround' ? 1.0 : role === 'answer' ? 0.5 : 0.0;
  const centre = Math.min(n - 1, Math.max(0, energy * (n - 1) + shift));
  const lo = Math.max(0, Math.trunc(centre) - 1);
  const hi = Math.min(n - 1, Math.trunc(centre) + (centre % 1 ? 2 : 1));
  let band = vocab.slice(lo, hi + 1);
  if (band.length === 0) band = [...vocab];
  if (last && band.includes(last) && band.length > 1) band = band.filter((g) => g !== last);
  return band[Math.min(band.length - 1, Math.trunc(rnd() * band.length))]!;
}

// ─── One hand (sections 8, 21, 83; audit SA-B1) ──────────────────────────

/** Where a placed gesture ends, in beats: its start plus its one length (`gestureBeats`). */
export const placedEnd = (e: Pick<PlacedScratch, 'beat' | 'gesture'> & { beats?: number }): number => e.beat + (e.beats ?? gestureBeats(e.gesture));

/** One hand on one record performs one gesture at a time: does `e` start before `other` ends (or vice versa)? */
export function overlapsOneHand(a: Pick<PlacedScratch, 'beat' | 'gesture'>, b: Pick<PlacedScratch, 'beat' | 'gesture'>): boolean {
  return a.beat < placedEnd(b) - 1e-9 && b.beat < placedEnd(a) - 1e-9;
}

/** Pairs of events that overlap (validation). */
export function oneHandConflicts(events: readonly PlacedScratch[]): number {
  const sorted = [...events].sort((x, y) => x.beat - y.beat);
  let n = 0;
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j]!.beat < placedEnd(sorted[i]!) - 1e-9; j++) n++;
  }
  return n;
}

/**
 * The events one hand can perform, in time order: an event starts only after the one before it
 * ends; a later event that would start inside a sounding gesture is dropped (the sounding one has
 * the record). Priority inside a bar is the placement's own (`planPhrase`); across bars, time.
 */
export function oneHand<T extends Pick<PlacedScratch, 'beat' | 'gesture'>>(events: readonly T[]): T[] {
  const out: T[] = [];
  for (const e of [...events].sort((x, y) => x.beat - y.beat)) {
    const last = out[out.length - 1];
    if (last && e.beat < placedEnd(last) - 1e-9) continue;
    out.push(e);
  }
  return out;
}

// ─── One bar (section 21) ────────────────────────────────────────────────

export interface PlacedScratch {
  bar: number;
  /** 0-15 on the default grid. */
  step: number;
  /** bar x beatsPerBar + step / stepsPerBeat: the plan's own beat (bar 0 = the downbeat grid's
   *  first bar), for order and spacing; `toScratchEvents` puts it on the deck clock (SA-M1). */
  beat: number;
  gesture: ScratchGestureId;
  /** 0..1 stroke energy. */
  velocity: number;
  placementRole: PlacementRole;
  role: ScratchRole;
  /** The event's length in beats when it is not the gesture's own: a throw plays its whole word or
   *  phrase (section 41), however long the record (`throwBeats`). */
  beats?: number;
  /** The crate record the event scratches, when the plan chose it per event or per section (the demo's
   *  `pick_source` / role pools); the window's chosen source otherwise. */
  record?: string;
}

export interface PlanPhraseInput {
  style: ScratchDJStyle;
  section: ScratchSection | string;
  bar: number;
  bars: number;
  seed: number;
  /** The palette's gestures for the style and mode (`planVocabulary`); ranked inside. */
  gestures: readonly ScratchGestureId[];
  /** Overrides the section's energy (the performance context's energy). */
  energy?: number;
  scale?: number;
  /** Replaces the resolved phrases-per-bar rate. */
  rateOverride?: number;
  /** Replaces the section's density state (the planner's mode-capped state, SA-M6): the
   *  showcase multipliers and rest window follow the state actually played. */
  density?: DensityState;
  planVel?: Partial<typeof PLAN_VEL>;
  gestureCount?: number;
  beatsPerBar?: number;
  grid?: ScratchGrid;
}

/** Expected scratches this bar from the density rate (phrase ends carry most, section 21). */
export function expectedPerBar(density: DensityState, rate: number, phraseEnd: boolean): number {
  return density === 'showcase' ? rate * (phraseEnd ? 3.0 : 2.2) : rate * (phraseEnd ? 3.0 : 0.35);
}

/**
 * The reference `plan_phrase` for one bar: k scratches (floor + fractional-probability
 * rounding, at most 4) on the preferred steps, each a gesture picked by energy and role.
 * Most bars stay silent. Of the reference's k, only what one hand can perform is placed
 * (SA-B1): the reference's step 16 is outside the bar, and a candidate that would start
 * inside (or run into) an already placed gesture is dropped, in the reference's priority
 * order (turnaround, answer, accent). The draws are the reference's either way.
 */
/** Reachability sentinel (SCR-P4.R4): bars `planPhrase` drew. */
export const scratchPlacementStats = { planPhrase: 0 };

export function planPhrase(input: PlanPhraseInput): PlacedScratch[] {
  scratchPlacementStats.planPhrase++;
  const pv = { ...PLAN_VEL, ...input.planVel };
  const density = input.density ?? sectionDensity(input.style, input.section, input.scale);
  let rate = DENSITY_RATE[density];
  if (input.rateOverride !== undefined) rate = input.rateOverride;
  if (rate <= 0) return [];
  const rnd = lfsr(barSeed(input.seed, input.bar, input.section));
  const energy = input.energy ?? SECTION_ENERGY[input.section as ScratchSection] ?? 0.4;
  // the demo's bars 3, 7, 15 of the SECTION and its last bar (`bar` is section-local, `bars` the
  // section's length): no 16-bar cycle - a long section is sparse between them (SCR-PHRASING-PARITY D2)
  const phraseEnd = PHRASE_END_BARS.includes(input.bar) || input.bar === input.bars - 1;
  const expected = expectedPerBar(density, rate, phraseEnd);
  let k = Math.trunc(expected);
  if (rnd() < expected - k) k++;
  k = Math.min(k, MAX_PER_BAR);
  if (k <= 0) return [];
  const vocab = vocabulary(input.gestures, input.gestureCount);
  const beatsPerBar = input.beatsPerBar ?? 4;
  const grid = input.grid ?? DEFAULT_GRID;
  const placed: PlacedScratch[] = [];
  const perBar = stepsPerBar(grid, beatsPerBar);
  let last: ScratchGestureId | null = null;
  let drawn = 0;
  for (const step of PREFERRED_STEPS) {
    if (drawn >= k) break;
    drawn++;
    const placementRole = roleForStep(step);
    const g = pickGesture(vocab, phraseEnd ? Math.min(1.0, energy + 0.15) : energy, placementRole, rnd, last);
    last = g;
    const vel = pv.base + pv.rand * rnd() + pv.energy * energy;
    if (step >= perBar) continue; // the reference's 16: the next bar's downbeat, not this bar
    const e: PlacedScratch = {
      bar: input.bar, step, beat: stepToBeat({ bar: input.bar, step }, grid, beatsPerBar), gesture: g,
      velocity: Math.min(1.0, vel), placementRole, role: SCRATCH_ROLE_OF[placementRole],
    };
    if (placed.some((p) => overlapsOneHand(p, e))) continue;
    placed.push(e);
  }
  return placed;
}

/** A planned rest: a decision with a reason, not an absence (state machine P6.4). */
export interface PlannedRest { bar: number; reason: 'vocal'; role: ScratchRole }

// ─── Validate (section 21) ───────────────────────────────────────────────

/** `placed` is one array per bar. Returns the issues found (the demo's `validate_phrase` + one hand). */
export function validatePhrase(placed: readonly (readonly PlacedScratch[])[], _bars?: number): string[] {
  const issues: string[] = [];
  const perBar = placed.map((p) => p.length);
  if (perBar.length > 2 && perBar.every((c) => c > 0)) issues.push('scratches every bar (placement s.30)');
  if (perBar.some((c) => c > MAX_PER_BAR)) issues.push('too busy (>4 gestures/bar)');
  const gestures = placed.flat().map((p) => p.gesture);
  if (gestures.length > 3 && new Set(gestures).size === 1) issues.push('every scratch uses the same gesture (s.30)');
  const conflicts = oneHandConflicts(placed.flat());
  if (conflicts) issues.push(`${conflicts} gesture(s) start before the one before ends (one hand, s.21)`);
  return issues;
}

// ─── Humanize (section 35) ───────────────────────────────────────────────

export const HUMANIZE_RANGE_MS = { min: -8, max: 10 } as const;
/** Fast tempos leave one-step gestures exactly on the grid. */
export const HUMANIZE_OFF_BPM = 140;

/**
 * A few milliseconds of hand for one event: in [-8, +10] ms, never across the boundary of the beat
 * the event sits in, never the same offset twice in a row, none for a one-step gesture at 140 BPM or
 * faster. Applied at execution (`ScratchEvent.humanizeMs`); the plan's beats are never moved.
 */
export function humanizeMs(event: Pick<PlacedScratch, 'beat' | 'gesture'>, rnd: ScratchRandom, bpm: number, previous?: number | null): number {
  if (getGesture(event.gesture).durationSteps <= 1 && bpm >= HUMANIZE_OFF_BPM) return 0;
  const beatMs = 60000 / Math.max(1, bpm);
  const into = (event.beat - Math.floor(event.beat + 1e-9)) * beatMs;
  const lo = Math.max(HUMANIZE_RANGE_MS.min, -into);
  const hi = Math.min(HUMANIZE_RANGE_MS.max, beatMs - into - 1e-6);
  if (hi <= lo) return Math.max(0, lo);
  let off = Math.round((lo + rnd() * (hi - lo)) * 10) / 10;
  off = Math.max(lo, Math.min(hi, off));
  if (previous !== undefined && previous !== null && off === previous) {
    off = off + 0.1 <= hi ? Math.round((off + 0.1) * 10) / 10 : Math.round((off - 0.1) * 10) / 10;
  }
  return off;
}

/** A bar with more vocal than this is the vocal's (section 24). */
export const VOCAL_BUSY = 0.7;

// ─── Throws (section 41) ─────────────────────────────────────────────────

/**
 * A throw's length in beats at `bpm` (section 41 "the full word"): the record from its attack to
 * the end of its safe range, rounded up to a 1/16 step, never shorter than the gesture.
 */
export function throwBeats(record: Pick<ScratchRecord, 'durationSec'> & Partial<Pick<ScratchRecord, 'safe' | 'anchors'>>, bpm: number, gesture: ScratchGestureId = 'drop'): number {
  const sec = (record.safe?.[1] ?? record.durationSec) - (record.anchors?.attack ?? 0);
  const beats = Math.ceil((sec / (60 / Math.max(1, bpm))) * 4 - 1e-9) / 4;
  return Math.max(gestureBeats(gesture), beats);
}

/** Steps in a bar for a grid (4/4). */
export const stepsPerBar = (grid: ScratchGrid = DEFAULT_GRID, beatsPerBar = 4): number => beatsPerBar * STEPS_PER_BEAT[grid];
