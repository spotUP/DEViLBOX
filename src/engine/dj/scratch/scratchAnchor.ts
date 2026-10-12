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
 *   stepToBeat({bar, step}, grid)        planner grid -> beat
 */

import { getScratchRecord } from './scratchCatalogue';
import type { ScratchCue } from './ScratchRecordVoice';
import type {
  DeckAnchorKind, DeckScratchAnchor, ScratchAnchor, ScratchGesture, ScratchRole, ScratchSource,
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

// ─── The rate clamp ──────────────────────────────────────────────────────

/** Rate clamp of the record voice and the decks (`setScratchVelocity`). */
export const MAX_RATE = 4;

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
