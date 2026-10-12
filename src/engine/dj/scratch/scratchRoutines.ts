/**
 * Named routines and word-slice intelligence (owner plan sections 37, 40;
 * ledger SCR-P4.10, P4.11). The eight routines of the reference
 * `tools/scratch_routine.py ROUTINES` as semantic events - a role, a gesture, the
 * word slot it scratches (`sourceRole`), a step - with the section -> routine
 * table of `tools/scratch.py SECTION_ROUTINE`. Steps are the reference's own,
 * on the 1/16 grid of a 4/4 bar; a step of 16 lands on the next bar's downbeat.
 */

import { getScratchRecord, type ScratchRecord } from './scratchCatalogue';
import { REFERENCE_GESTURE_IDS } from './scratchGestureCatalog';
import { DEFAULT_GRID, stepToBeat, type ScratchGrid } from './scratchAnchor';
import type { PlacedScratch } from './scratchPlacement';
import type { ScratchCue } from './ScratchRecordVoice';
import type { ScratchDJStyle, ScratchGestureId, ScratchRole } from './scratchTypes';
import { lfsr, type ScratchRandom } from './scratchRandom';
import type { JugglePhase } from '../autodj/juggle/juggleTypes';
import { SCRATCH_STYLES } from './scratchStyles';

export type RoutineName =
  | 'phraseEnd' | 'hookCallResponse' | 'electroTransformer' | 'chirpFlareShowcase'
  | 'introDrag' | 'snareAnswer' | 'phraseReconstruction' | 'default';

/** The word slots a routine scratches (reference cue names). */
export type WordSlot = 'IF' | 'YOU' | 'REALLY' | 'ROCK' | 'FUNKY' | 'BEAT' | 'PHRASE';

/** The record role each slot asks of the crate, and the reference bank mapping (`bank_cues`). */
export const SLOT_SOURCE: Readonly<Record<WordSlot, { role: ScratchRole; record: string; word: string }>> = {
  IF: { role: 'INTRO', record: 'ONE', word: 'IF' },
  YOU: { role: 'INTRO', record: 'TWO', word: 'YOU' },
  REALLY: { role: 'INTRO', record: 'THREE', word: 'REALLY' },
  ROCK: { role: 'THEME', record: 'FRESH_STANDARD', word: 'ROCK' },
  FUNKY: { role: 'FILL', record: 'AH_STANDARD', word: 'FUNKY' },
  BEAT: { role: 'ANSWER', record: 'YEAH_STANDARD', word: 'BEAT' },
  PHRASE: { role: 'FEATURE', record: 'AH_FRESH_FULL_PHRASE', word: 'PHRASE' },
};

/** The long record whose word slices phrase reconstruction plays in sequence (section 40). */
export const PHRASE_RECORD = 'IF_YOU_REALLY_LIKE_TO_ROCK_THE_FUNKY_BEAT';

export interface RoutineEvent {
  /** Bar within the routine, 0-based. */
  bar: number;
  step: number;
  role: ScratchRole;
  gesture: ScratchGestureId;
  /** The word slot scratched. */
  sourceRole: WordSlot;
  velocity: number;
  /** The ending: gets the delay tail (section 43). */
  tail: boolean;
}

export interface ScratchRoutine {
  name: RoutineName | 'juggleResponse';
  /** Length in bars. */
  bars: number;
  events: readonly RoutineEvent[];
}

const g = (ref: string): ScratchGestureId => {
  const id = REFERENCE_GESTURE_IDS[ref];
  if (!id) throw new Error(`[scratchRoutines] unknown reference gesture ${ref}`);
  return id;
};
const e = (bar: number, step: number, role: ScratchRole, ref: string, sourceRole: WordSlot, velocity: number, tail = false): RoutineEvent =>
  ({ bar, step, role, gesture: g(ref), sourceRole, velocity, tail });

export const SCRATCH_ROUTINES: Readonly<Record<RoutineName, ScratchRoutine>> = {
  // Routine One (s.4): classic phrase-end boom-bap cut, once every 4-8 bars.
  phraseEnd: { name: 'phraseEnd', bars: 1, events: [
    e(0, 14, 'ACCENT', 'forward_stab', 'ROCK', 0.9), e(0, 15, 'FILL', 'baby', 'FUNKY', 0.8), e(0, 16, 'OUTRO', 'chirp', 'BEAT', 0.85, true)] },
  // Routine Two (s.5): hook call-and-response.
  hookCallResponse: { name: 'hookCallResponse', bars: 2, events: [
    e(0, 11, 'THEME', 'forward_stab', 'ROCK', 0.9), e(0, 15, 'THEME', 'baby', 'FUNKY', 0.8),
    e(1, 7, 'ANSWER', 'chirp', 'BEAT', 0.85), e(1, 14, 'ANSWER', 'transformer8', 'BEAT', 0.9, true)] },
  // Routine Three (s.6): electro transformer, the fader makes the complexity.
  electroTransformer: { name: 'electroTransformer', bars: 2, events: [
    e(0, 1, 'THEME', 'transformer4', 'BEAT', 0.8), e(0, 9, 'THEME', 'transformer8', 'BEAT', 0.85),
    e(1, 1, 'ANSWER', 'transformer8', 'BEAT', 0.9), e(1, 9, 'FEATURE', 'hydroplane', 'BEAT', 0.9),
    e(1, 14, 'OUTRO', 'backward_stab', 'BEAT', 0.95, true)] },
  // Routine Four (s.7): chirp + flare showcase, DJ sections only.
  chirpFlareShowcase: { name: 'chirpFlareShowcase', bars: 2, events: [
    e(0, 1, 'FEATURE', 'chirp', 'ROCK', 0.9), e(0, 5, 'FEATURE', 'chirp_double', 'FUNKY', 0.9),
    e(0, 9, 'FEATURE', 'flare1', 'BEAT', 0.9), e(0, 13, 'FEATURE', 'orbit', 'BEAT', 0.95),
    e(1, 1, 'FEATURE', 'flare2', 'ROCK', 0.9), e(1, 8, 'FEATURE', 'chirp', 'FUNKY', 0.9),
    e(1, 13, 'OUTRO', 'orbit', 'BEAT', 0.95, true)] },
  // Routine Five (s.8): slow intro drag on the full phrase.
  introDrag: { name: 'introDrag', bars: 2, events: [e(0, 1, 'INTRO', 'drag', 'PHRASE', 0.7, true)] },
  // Routine Six (s.9): snare answer, one answer per bar at most.
  snareAnswer: { name: 'snareAnswer', bars: 2, events: [
    e(0, 6, 'ANSWER', 'forward_stab', 'ROCK', 0.85), e(1, 14, 'ANSWER', 'baby', 'BEAT', 0.8)] },
  // Routine Seven (s.10): phrase reconstruction, the real words in sequence.
  phraseReconstruction: { name: 'phraseReconstruction', bars: 2, events: [
    e(0, 1, 'THEME', 'forward_stab', 'IF', 0.8), e(0, 6, 'THEME', 'forward_stab', 'YOU', 0.8),
    e(0, 11, 'THEME', 'forward_stab', 'REALLY', 0.8), e(1, 1, 'THEME', 'forward_stab', 'ROCK', 0.85),
    e(1, 6, 'THEME', 'forward_stab', 'FUNKY', 0.85), e(1, 12, 'OUTRO', 'forward_stab', 'BEAT', 0.9, true)] },
  // Factory default (s.17).
  default: { name: 'default', bars: 2, events: [
    e(0, 7, 'THEME', 'forward_stab', 'ROCK', 0.9), e(0, 15, 'THEME', 'baby', 'FUNKY', 0.8),
    e(1, 7, 'ANSWER', 'chirp', 'BEAT', 0.85), e(1, 14, 'ANSWER', 'transformer8', 'BEAT', 0.9, true)] },
};

/** Section -> routine (reference `SECTION_ROUTINE`). */
export const SECTION_ROUTINE: Readonly<Record<string, RoutineName>> = {
  intro: 'introDrag', verse: 'phraseEnd', hook: 'hookCallResponse', call: 'hookCallResponse',
  response: 'snareAnswer', breakdown: 'phraseReconstruction', showcase: 'chirpFlareShowcase',
  outro: 'introDrag', A: 'phraseEnd', B: 'hookCallResponse', A2: 'hookCallResponse', bridge: 'snareAnswer',
};

/** The routine a section gets; the two palettes whose identity is a routine win over the section. */
export function routineFor(style: ScratchDJStyle, section: string): RoutineName {
  if (style === 'electro') return 'electroTransformer';
  if (style === 'battle') return 'chirpFlareShowcase';
  return SECTION_ROUTINE[section] ?? 'phraseEnd';
}

/** A routine laid on the bar grid from `startBar`: placed events, ready for the executor's planner. */
export function routineToPlaced(routine: ScratchRoutine, startBar: number, grid: ScratchGrid = DEFAULT_GRID, beatsPerBar = 4): PlacedScratch[] {
  return routine.events.map((ev) => {
    const bar = startBar + ev.bar;
    return {
      bar, step: ev.step, beat: stepToBeat({ bar, step: ev.step }, grid, beatsPerBar), gesture: ev.gesture, velocity: ev.velocity,
      placementRole: ev.role === 'ANSWER' ? 'answer' : ev.step >= 15 ? 'turnaround' : 'accent', role: ev.role,
    };
  });
}

// ─── The scratch_dj ladder and the juggle response (sections 26, 49; SCR-P7.9) ──

/** The reference DJ routine's gesture hierarchy (`tools/scratch_dj.py` GESTURE_LEVELS :43-48). */
export const DJ_ROUTINE_LEVELS: Readonly<Record<1 | 2 | 3 | 4, readonly ScratchGestureId[]>> = {
  1: ['baby', 'babySlow', 'forwardStab', 'backwardStab', 'drag'],
  2: ['chirp', 'chirpDouble', 'transformer4', 'transformer8'],
  3: ['flare1', 'flare2', 'tearForward'],
  4: ['orbit', 'crab', 'scribble', 'hydroplane'],
};

/**
 * `_pick_gesture(level, pal, rnd)` (`scratch_dj.py` :72-82): a gesture at the level, capped to the
 * style's max level, biased toward the style's preferred gestures half of the time.
 */
export function pickRoutineGesture(level: number, style: ScratchDJStyle, rnd: ScratchRandom): ScratchGestureId {
  const pal = SCRATCH_STYLES[style];
  const lvl = Math.max(1, Math.min(level, pal.maxLevel)) as 1 | 2 | 3 | 4;
  const pool = DJ_ROUTINE_LEVELS[lvl];
  let biased: readonly ScratchGestureId[] = pool.filter((g) => pal.bias.includes(g));
  if (!biased.length) biased = pool;
  if (pal.bias.length && rnd() < 0.5) {
    const cand = pal.bias.filter((g) => ([1, 2, 3, 4] as const).slice(0, lvl).some((l) => DJ_ROUTINE_LEVELS[l].includes(g)));
    if (cand.length) biased = cand;
  }
  return biased[Math.floor(rnd() * biased.length) % biased.length]!;
}

/**
 * The juggle response (owner plan section 49): over the juggle's own phases, bar by bar -
 * A and B loops (SETUP / ESTABLISH / INTENSIFY) + the scratch vocal: the reference hook bar A
 * (`scratch_dj.py` :113, baby step 2 v 0.7, forward stab step 10 v 0.72);
 * the A/B trade (PEAK) + the scratch response: the reference call / response (:133-137, even bars
 * a level-1 answer on step 6 v 0.72, odd bars a level-2 accent on step 14 v 0.75);
 * the A+B payoff (PAYOFF, RELEASE): the scratch is out, both hands on the juggle (`three_deck.py`
 * final_burst, deck C silent).
 */
export function juggleResponseRoutine(phases: ReadonlyArray<JugglePhase | null>, style: ScratchDJStyle, seed: number): ScratchRoutine {
  const rnd: ScratchRandom = lfsr(seed * 131 + 7);
  const events: RoutineEvent[] = [];
  let trade = 0;
  phases.forEach((phase, bar) => {
    if (phase === 'SETUP' || phase === 'ESTABLISH' || phase === 'INTENSIFY') {
      events.push({ bar, step: 2, role: 'THEME', gesture: 'baby', sourceRole: 'ROCK', velocity: 0.7, tail: false });
      events.push({ bar, step: 10, role: 'THEME', gesture: 'forwardStab', sourceRole: 'ROCK', velocity: 0.72, tail: false });
    } else if (phase === 'PEAK') {
      if (trade % 2 === 0) events.push({ bar, step: 6, role: 'ANSWER', gesture: pickRoutineGesture(1, style, rnd), sourceRole: 'BEAT', velocity: 0.72, tail: false });
      else events.push({ bar, step: 14, role: 'ACCENT', gesture: pickRoutineGesture(2, style, rnd), sourceRole: 'BEAT', velocity: 0.75, tail: true });
      trade++;
    }
  });
  return { name: 'juggleResponse', bars: phases.length, events };
}

/** The reference's own sanity rules for a routine (`validate_routine`): empty = fine. */
export function validateRoutine(routine: ScratchRoutine): string[] {
  const issues: string[] = [];
  const pairs = routine.events.map((x) => `${x.gesture}/${x.sourceRole}`);
  if (pairs.length > 3 && new Set(pairs).size === 1) issues.push('same gesture on the same word every time (s.16)');
  const perBar = new Map<number, number>();
  for (const x of routine.events) perBar.set(x.bar, (perBar.get(x.bar) ?? 0) + 1);
  if ([...perBar.values()].some((n) => n > 6)) issues.push('too many events in a bar (s.16)');
  return issues;
}

// ─── Word-slice intelligence (section 40) ────────────────────────────────

export type WordPattern =
  | { kind: 'WHOLE' }
  | { kind: 'LAST_WORD' }
  | { kind: 'WORD'; word: number | string }
  | { kind: 'ANCHOR_VOWEL' };

export interface WordCue {
  /** The cue the voice takes. */
  cue: ScratchCue;
  /** Seconds of the record the cue resolves to. */
  seconds: number;
  label: string;
}

/**
 * Where a record is scratched for a word pattern. WHOLE plays the phrase from its attack, LAST_WORD
 * anchors on the vowel of the final word slice (a record without slices: its tail), WORD(n) on slice n
 * (1-based) or the slice of that name, ANCHOR_VOWEL on the record's own vowel anchor.
 */
export function wordPlan(record: Pick<ScratchRecord, 'id' | 'anchors' | 'wordSlices'>, pattern: WordPattern): WordCue | null {
  const slices = record.wordSlices;
  switch (pattern.kind) {
    case 'WHOLE': return { cue: 'attack', seconds: record.anchors.attack, label: 'whole phrase' };
    case 'ANCHOR_VOWEL': return { cue: 'vowel', seconds: record.anchors.vowel, label: 'vowel' };
    case 'LAST_WORD': {
      const last = slices[slices.length - 1];
      return last ? { cue: { word: last.name }, seconds: last.vowel, label: last.name } : { cue: 'tail', seconds: record.anchors.tail, label: 'ending' };
    }
    case 'WORD': {
      const w = typeof pattern.word === 'number' ? slices[pattern.word - 1] : slices.find((s) => s.name === pattern.word);
      return w ? { cue: { word: w.name }, seconds: w.vowel, label: w.name } : null;
    }
  }
}

/** The reference sequence on a phrase record: the whole phrase, its last word twice, the whole phrase. */
export const WORD_SEQUENCE: readonly WordPattern[] = [{ kind: 'WHOLE' }, { kind: 'LAST_WORD' }, { kind: 'LAST_WORD' }, { kind: 'WHOLE' }];

export function wordSequence(record: Pick<ScratchRecord, 'id' | 'anchors' | 'wordSlices'>): WordCue[] {
  return WORD_SEQUENCE.map((p) => wordPlan(record, p)).filter((c): c is WordCue => c !== null);
}

/** The cue a routine slot takes on the phrase record (`phraseReconstruction`), or its bank record's vowel. */
export function slotCue(slot: WordSlot): { recordId: string; cue: ScratchCue } {
  const src = SLOT_SOURCE[slot];
  const phrase = getScratchRecord(PHRASE_RECORD);
  if (slot !== 'PHRASE' && phrase?.wordSlices.some((s) => s.name === src.word)) return { recordId: PHRASE_RECORD, cue: { word: src.word } };
  return { recordId: src.record, cue: slot === 'PHRASE' ? 'attack' : 'vowel' };
}
