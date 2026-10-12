/**
 * Scratch anchors, the position-to-rate converter and the step grid (owner
 * plan `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md` sections 8,
 * 11, 17, 18, 60; D5; ledger SCR-P3.1, P3.2, P3.6).
 *
 * Pure functions. The planner speaks beats and steps (never milliseconds);
 * the executor turns them into context time through the deck's beat clock.
 *
 *   anchorFor(source, role)              which home point a role scratches from
 *   deckAnchor(...)                      a deck anchor with its safe range in beats
 *   positionCurveToRateCurve(path, ...)  hand position (strokes) -> playback rate (D5)
 *   stepToBeat({bar, step}, grid)        planner grid -> beat
 */

import { getScratchRecord } from './scratchCatalogue';
import type { ScratchCue } from './ScratchRecordVoice';
import type {
  DeckAnchorKind, DeckScratchAnchor, ScratchAnchor, ScratchGesture, ScratchHandPath, ScratchRole, ScratchSource,
} from './scratchTypes';

// ─── Anchors (section 11) ────────────────────────────────────────────────

/** Which point of a record a role scratches from: the sung vowel for the
 *  melodic roles, the attack for hits and counts, the tail for endings. */
export const CRATE_CUE_BY_ROLE: Readonly<Record<ScratchRole, 'attack' | 'vowel' | 'tail'>> = {
  INTRO: 'attack',
  THEME: 'vowel',
  ANSWER: 'vowel',
  ACCENT: 'attack',
  FILL: 'attack',
  FEATURE: 'vowel',
  TRANSITION: 'tail',
  OUTRO: 'tail',
};

/** The deck anchor kind a role prefers (first match among the candidates wins). */
export const DECK_ANCHOR_BY_ROLE: Readonly<Record<ScratchRole, readonly DeckAnchorKind[]>> = {
  INTRO: ['downbeat', 'hit'],
  THEME: ['downbeat', 'vocalOnset'],
  ANSWER: ['snare', 'vocalOnset', 'downbeat'],
  ACCENT: ['snare', 'hit', 'downbeat'],
  FILL: ['snare', 'hit', 'downbeat'],
  FEATURE: ['vocalOnset', 'hit', 'downbeat'],
  TRANSITION: ['downbeat', 'hit'],
  OUTRO: ['downbeat', 'hit'],
};

/** Forward room of a deck anchor in beats (the track plays on past the home). */
export const DECK_SAFE_FORWARD_BEATS = 1;
/** Reverse room of a deck anchor in beats (a record pulled back, not a rewind). */
export const DECK_SAFE_REVERSE_BEATS = 0.5;

/** A crate anchor resolved for a role: the cue the voice takes and its position. */
export interface ResolvedCrateAnchor extends ScratchAnchor {
  cue: 'attack' | 'vowel' | 'tail';
}

/**
 * The anchor a role scratches from on a source. A CRATE source resolves to the
 * record's attack / vowel / tail (position in seconds of record); a DECK
 * source keeps its own anchor (picked among candidates by `pickDeckAnchor`).
 */
export function anchorFor(source: ScratchSource, role: ScratchRole): ResolvedCrateAnchor | DeckScratchAnchor | null {
  if (source.type === 'CRATE') {
    const record = getScratchRecord(source.recordId);
    if (!record) return null;
    const cue = CRATE_CUE_BY_ROLE[role];
    return {
      cue,
      // a cue the catalogue marks before the safe start (an attack at 0) sits on the safe edge, as the voice plays it
      position: Math.max(record.safe[0], Math.min(record.safe[1], record.anchors[cue])),
      safe: record.safe,
      safeForward: record.safeForward,
      safeReverse: record.safeReverse,
    };
  }
  if (source.type === 'DECK') return source.anchor;
  return null;
}

/** The cue the voice takes for a role on a record (`ScratchRecordVoice.cue`). */
export function cueForRole(role: ScratchRole): ScratchCue {
  return CRATE_CUE_BY_ROLE[role];
}

/** Seconds of one beat at `bpm`. */
export function beatSec(bpm: number): number {
  return 60 / Math.max(1, bpm);
}

/**
 * A deck anchor on the deck's beat grid: `positionSec` is where the beat
 * sits in the track; the safe range is +1 beat forward and -0.5 beat back
 * (the needle may play on a beat past the home, and be pulled half a beat
 * behind it - further and the groove is lost).
 */
export function deckAnchor(positionSec: number, beat: number, kind: DeckAnchorKind, bpm: number): DeckScratchAnchor {
  const b = beatSec(bpm);
  return {
    position: positionSec,
    beat,
    kind,
    safe: [Math.max(0, positionSec - DECK_SAFE_REVERSE_BEATS * b), positionSec + DECK_SAFE_FORWARD_BEATS * b],
  };
}

/** The deck anchor a role prefers among `candidates`, else the first candidate. */
export function pickDeckAnchor(candidates: readonly DeckScratchAnchor[], role: ScratchRole): DeckScratchAnchor | null {
  if (candidates.length === 0) return null;
  for (const kind of DECK_ANCHOR_BY_ROLE[role]) {
    const hit = candidates.find((c) => c.kind === kind);
    if (hit) return hit;
  }
  return candidates[0]!;
}

// ─── Position to rate (section 17, D5) ───────────────────────────────────

/** One stroke unit "A" in seconds of record: 1500 samples at 22,050 Hz (reference `tools/scratch.py`). */
export const STROKE_SEC = 1500 / 22050;
/** Rate clamp of the record voice and the decks (`setScratchVelocity`). */
export const MAX_RATE = 4;
/** Rate curve resolution: one rate per 5 ms. */
export const RATE_STEP_SEC = 0.005;

export interface RatePoint { t: number; rate: number }

export interface PositionCurveResult {
  /** Piecewise-constant rate, `t` in seconds from the stroke start, in units of natural speed. */
  points: RatePoint[];
  /** The fastest rate the hand path asked for, before the clamp. */
  requestedPeak: number;
  /** The clamp bit: some rate exceeded +-MAX_RATE. */
  clamped: boolean;
  /** Record seconds travelled net (end position - start position) after smoothing and clamping. */
  netTravelSec: number;
}

function positionAt(path: ScratchHandPath, t: number): number {
  const pts = [...path].sort((a, b) => a.t - b.t);
  if (pts.length === 0) return 0;
  if (t <= pts[0]!.t) return pts[0]!.position;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
    if (t <= b.t) return b.t === a.t ? b.position : a.position + (b.position - a.position) * (t - a.t) / (b.t - a.t);
  }
  return pts[pts.length - 1]!.position;
}

/**
 * Hand position (stroke units over a cycle) -> playback rate, rate = d(position)/dt
 * in seconds of record per second. The velocity is sampled every 5 ms; where the
 * hand reverses, the position is smoothed (a [1 2 1]/4 kernel, two passes, the
 * end points pinned) so the rate bends through zero instead of flipping (the
 * grip: a hand holds the record while it turns). Pinned end points keep the net
 * travel exact: a stroke that returns home integrates to zero.
 */
export function positionCurveToRateCurve(handPath: ScratchHandPath, durationSec: number, sampleRate: number): PositionCurveResult {
  const stepFrames = Math.max(1, Math.round(RATE_STEP_SEC * sampleRate));
  const step = stepFrames / sampleRate;
  const n = Math.max(1, Math.ceil(durationSec / step - 1e-9));
  const times: number[] = [];
  for (let i = 0; i <= n; i++) times.push(Math.min(i * step, durationSec));
  const pos = times.map((t) => positionAt(handPath, durationSec > 0 ? t / durationSec : 0) * STROKE_SEC);
  // smooth near reversals
  const reversalAt = (i: number): boolean => {
    if (i < 1 || i >= n) return false;
    const before = pos[i]! - pos[i - 1]!, after = pos[i + 1]! - pos[i]!;
    return before * after < 0 || (before !== 0 && after === 0) || (before === 0 && after !== 0);
  };
  for (let pass = 0; pass < 2; pass++) {
    const marks = new Set<number>();
    for (let i = 1; i < n; i++) if (reversalAt(i)) { marks.add(i - 1); marks.add(i); marks.add(i + 1); }
    const next = pos.slice();
    for (const i of marks) {
      if (i < 1 || i >= n) continue;
      next[i] = 0.25 * pos[i - 1]! + 0.5 * pos[i]! + 0.25 * pos[i + 1]!;
    }
    for (let i = 0; i <= n; i++) pos[i] = next[i]!;
  }
  const points: RatePoint[] = [];
  let requestedPeak = 0;
  let clamped = false;
  let travel = 0;
  for (let i = 0; i < n; i++) {
    const dt = times[i + 1]! - times[i]!;
    const raw = dt > 0 ? (pos[i + 1]! - pos[i]!) / dt : 0;
    if (Math.abs(raw) > Math.abs(requestedPeak)) requestedPeak = raw;
    const rate = Math.max(-MAX_RATE, Math.min(MAX_RATE, raw));
    if (rate !== raw) clamped = true;
    points.push({ t: times[i]!, rate });
    travel += rate * dt;
  }
  return { points, requestedPeak, clamped, netTravelSec: travel };
}

/** Integral of a rate curve over `durationSec` (seconds of record). */
export function integrateRateCurve(points: readonly RatePoint[], durationSec: number): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const end = i + 1 < points.length ? points[i + 1]!.t : durationSec;
    sum += points[i]!.rate * (end - points[i]!.t);
  }
  return sum;
}

// ─── Step grid (section 8) ───────────────────────────────────────────────

export type ScratchGrid = '1/8' | '1/16' | '1/32';

/** Steps per beat (a beat is a quarter note). */
export const STEPS_PER_BEAT: Readonly<Record<ScratchGrid, number>> = { '1/8': 2, '1/16': 4, '1/32': 8 };
export const DEFAULT_GRID: ScratchGrid = '1/16';
/** Below this tempo a one-step gesture may sit on the 1/32 grid. */
export const THIRTY_SECOND_MAX_BPM = 110;

/** The grids a gesture may be placed on at `bpm`: 1/8 and 1/16 always, 1/32 only for one-step gestures under 110 BPM. */
export function allowedGrids(gesture: Pick<ScratchGesture, 'durationSteps'>, bpm: number): ScratchGrid[] {
  const grids: ScratchGrid[] = ['1/8', '1/16'];
  if (gesture.durationSteps <= 1 && bpm < THIRTY_SECOND_MAX_BPM) grids.push('1/32');
  return grids;
}

/**
 * A planner position -> beat. `bar` counts from 0 like the beat clock
 * (`beat = bar x beatsPerBar + step / stepsPerBeat`), `step` is the step in the bar's grid.
 * The owner plan's sample event (`{bar: 17, step: 14, beat: 68.875}`) does not
 * follow from its own definitions (step 14 of a 1/16 bar is beat 3.5 of the bar = 71.5,
 * while 68.875 = 17 x 4 + 14/16 treats a step as a sixteenth of a BEAT); the
 * musically exact value is used and the deviation is recorded in the ledger.
 */
export function stepToBeat(pos: { bar: number; step: number }, grid: ScratchGrid = DEFAULT_GRID, beatsPerBar = 4): number {
  return pos.bar * beatsPerBar + pos.step / STEPS_PER_BEAT[grid];
}

/** The inverse: a beat -> the nearest grid position. */
export function beatToStep(beat: number, grid: ScratchGrid = DEFAULT_GRID, beatsPerBar = 4): { bar: number; step: number } {
  const total = Math.round(beat * STEPS_PER_BEAT[grid]);
  const perBar = beatsPerBar * STEPS_PER_BEAT[grid];
  return { bar: Math.floor(total / perBar), step: total - Math.floor(total / perBar) * perBar };
}
