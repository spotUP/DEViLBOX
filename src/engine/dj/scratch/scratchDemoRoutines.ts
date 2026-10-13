/**
 * The Up Rough demo's scratch planners, ported exactly (SCR-PHRASING-PARITY, SCR-PG-E1/E2): pure, the
 * demo's LFSR, the demo's numbers, so the demo's own output is the test fixture
 * (`__tests__/fixtures/phrasing_parity.json`, `tools/scratch-fixtures/gen_phrasing_parity.py`).
 *
 *   overlayRecord          `scratch.pick_source`: one record per section, the pool rotating over a track
 *   buildScratchDjRoutine  `scratch_dj.build_routine` (C5): the 32-bar showcase - intro, the A-A-B-A hook,
 *                          variation, call and response, a level-climbing showcase, breathing space, the
 *                          climax, resolution; varied phrase endings (C7); needle drop / lift
 *   validateScratchDjRoutine  `scratch_dj.validate` (C9)
 *   buildThreeDeckRoutine  `three_deck.build_scratch_events` (C10) + `render`'s record per event: per 2-bar
 *                          phrase a clean throw of the next word, then the flow builder (C13) placing
 *                          gestures back to back with energy-scaled rests, word rotation over the cue roles
 *                          (C14), gestures by the hands budget (C12 ladder)
 *
 * The demo never scratches the music: every record here is a crate record (Deck C).
 */

import { lfsr, type ScratchRandom } from './scratchRandom';
import { NumpyRandomState } from '@/engine/turntable/turntableSim';
import { DEMO_RATE } from './scratchRender';
import type { ScratchRenderSpec } from './scratchTypes';
import { pickRoutineGesture, DJ_ROUTINE_LEVELS } from './scratchRoutines';
import { SCRATCH_STYLES } from './scratchStyles';
import { CLEAN_CRATE_POOL, CUE_ROLE_POOLS, CUE_ROLE_RECORD, type CueRole } from './scratchCatalogue';
import { getGesture } from './scratchGestureCatalog';
import { stepToBeat } from './scratchAnchor';
import type { PlacedScratch, PlacementRole } from './scratchPlacement';
import type { ArcTemplate } from './scratchArc';
import type { ScratchDJStyle, ScratchGestureId, ScratchRole } from './scratchTypes';

/** One event of a demo routine: bar 0-31, step 0-15, the cue role it scratches, the record when chosen. */
export interface DemoRoutineEvent {
  bar: number;
  step: number;
  cueRole: CueRole;
  gesture: ScratchGestureId;
  velocity: number;
  record?: string;
  /** Statement and chop (C16): 'phrase' = the whole record thrown from its first sample, 'word' = its last word. */
  slice?: 'phrase' | 'word';
}

/** Reachability sentinels: which demo planner ran. */
export const demoRoutineStats = { scratchDj: 0, threeDeck: 0, overlayRecord: 0 };

// ─── The overlay's record (scratch.pick_source) ───────────────────────────

/**
 * `pick_source(style, section, seed, allowed)`: one record dominates a section, the pool rotates across
 * sections - `(seed // 4 + sum(ord(c) for c in section)) % len(pool)`, the seed being the section's
 * (the track seed + the bars before it). The pool is the clean crate (`record_set('clean')`).
 */
export function overlayRecord(section: string, sectionSeed: number, pool: readonly string[] = CLEAN_CRATE_POOL): string | undefined {
  demoRoutineStats.overlayRecord++;
  if (!pool.length) return undefined;
  let ords = 0;
  for (let i = 0; i < section.length; i++) ords += section.charCodeAt(i);
  return pool[(Math.floor(sectionSeed / 4) + ords) % pool.length];
}

// ─── scratch_dj.build_routine (C5) ───────────────────────────────────────

type Phase = 'intro' | 'theme' | 'variation' | 'call_response' | 'showcase' | 'breathing' | 'climax' | 'resolution';

/** `scratch_dj.ARC`: (section, bar0, bars, energy, level, role, density scale, silence). */
export const SCRATCH_DJ_ARC: ReadonlyArray<readonly [Phase, number, number, number, number, CueRole, number, boolean]> = [
  ['intro', 0, 4, 0.50, 1, 'HOME', 0.5, true],
  ['theme', 4, 4, 0.70, 1, 'HOME', 0.9, false],
  ['variation', 8, 4, 0.72, 2, 'HOME', 0.9, false],
  ['call_response', 12, 4, 0.75, 2, 'HOME', 0.7, true],
  ['showcase', 16, 4, 0.85, 3, 'SECONDARY', 1.0, false],
  ['breathing', 20, 4, 0.40, 1, 'HOME', 0.3, true],
  ['climax', 24, 6, 1.00, 4, 'SECONDARY', 1.2, false],
  ['resolution', 30, 2, 0.60, 1, 'HOME', 0.7, false],
];

/** Varied phrase endings (s.17): the last gesture of a section's last bar cycles these. */
export const SCRATCH_DJ_END_GESTURES: readonly ScratchGestureId[] = ['baby', 'transformer8', 'backwardStab', 'forwardStab'];

type Ev = [number, CueRole, ScratchGestureId, number];

/**
 * The 32-bar showcase as an event list (`build_routine(style, seed)`, line for line - including the
 * demo's own aliasing: the theme's last bar rewrites hook A's last gesture in place, so the variation's
 * and the resolution's hook A end on that phrase ending).
 */
export function buildScratchDjRoutine(style: ScratchDJStyle, seed: number): DemoRoutineEvent[] {
  demoRoutineStats.scratchDj++;
  const pal = SCRATCH_STYLES[style];
  const rnd = lfsr(seed * 131 + 7);
  const out: DemoRoutineEvent[] = [{ bar: 0, step: 0, cueRole: 'HOME', gesture: 'needleDrop', velocity: 0.6 }];
  const hookA: Ev[] = [[2, 'HOME', 'baby', 0.7], [10, 'HOME', 'forwardStab', 0.72]];
  const hookB: Ev[] = [[2, 'HOME', 'forwardStab', 0.72], [8, 'HOME', 'backwardStab', 0.7], [14, 'HOME', pal.maxLevel >= 2 ? 'chirp' : 'baby', 0.74]];
  let ei = 0;
  for (const [name, b0, bars, energy, , role, dscale] of SCRATCH_DJ_ARC) {
    const dens = pal.densityScale * dscale;
    for (let b = 0; b < bars; b++) {
      const bar = b0 + b;
      const lastInSec = b === bars - 1;
      let seq: Ev[];
      if (name === 'intro') {
        seq = b === 1 ? [[2, 'HOME', 'drag', 0.5]] : b === 2 ? [[8, 'HOME', 'baby', 0.55]] : b === 3 ? [[14, 'HOME', 'forwardStab', 0.6]] : [];
      } else if (name === 'theme') {
        seq = [hookA, hookA, hookB, hookA][b]!;
      } else if (name === 'variation') {
        const pat = [hookA, hookA, hookB, hookA][b]!;
        seq = pat.map(([s, r, g, v]): Ev => [s, r, (rnd() > 0.6 && pal.maxLevel >= 2) ? 'chirp' : g, v]);
      } else if (name === 'call_response') {
        seq = b % 2 === 0 ? [[6, 'HOME', pickRoutineGesture(1, style, rnd), 0.72]] : [[14, 'ACCENT', pickRoutineGesture(2, style, rnd), 0.75]];
      } else if (name === 'showcase') {
        const lvl = 1 + b;
        const first = pickRoutineGesture(Math.min(lvl, 2), style, rnd);
        const second = pickRoutineGesture(Math.min(lvl + 1, pal.maxLevel), style, rnd);
        seq = [[2, role, first, energy], [10, role, second, energy]];
      } else if (name === 'breathing') {
        seq = b === 0 ? [[1, 'HOME', 'drag', 0.42]] : b === 2 ? [[8, 'HOME', 'forwardStab', 0.5]] : [];
      } else if (name === 'climax') {
        const steps = pal.densityScale >= 1.0 ? [2, 6, 10, 14] : [2, 10];
        seq = [];
        for (const s of steps) {
          if (rnd() < dens) {
            const r: CueRole = pal.fxAmount > 0 && rnd() < pal.fxAmount ? 'FX' : role;
            const g = pickRoutineGesture(pal.maxLevel, style, rnd);
            seq.push([s, r, g, 0.9 + 0.1 * rnd()]);
          }
        }
      } else {
        seq = b === 0 ? hookA : [[6, 'HOME', 'forwardStab', 0.6]];
      }
      // varied phrase ending on a section's last bar (s.17) - in place, as the demo does
      if (lastInSec && seq.length && name !== 'intro' && name !== 'breathing') {
        const [s0, r0, , v0] = seq[seq.length - 1]!;
        seq[seq.length - 1] = [s0, r0, SCRATCH_DJ_END_GESTURES[ei % SCRATCH_DJ_END_GESTURES.length]!, v0];
        ei++;
      }
      for (const [step, r, g, v] of seq) out.push({ bar, step: Math.min(step, 15), cueRole: r, gesture: g, velocity: Math.max(0.2, Math.min(1, v)) });
    }
  }
  out.push({ bar: 31, step: 15, cueRole: 'HOME', gesture: 'needleLift', velocity: 0.5 });
  // the showcase scratches one record per cue role (`cues_from_bank`)
  return out.map((e) => (isNeedle(e.gesture) ? e : { ...e, record: CUE_ROLE_RECORD[e.cueRole] }));
}

/** `scratch_dj.validate` (s.28): no silence, no home theme, every bar the hardest, no opening / closing. */
export function validateScratchDjRoutine(events: readonly DemoRoutineEvent[]): string[] {
  const issues: string[] = [];
  const perBar = new Map<number, DemoRoutineEvent[]>();
  for (const e of events) perBar.set(e.bar, [...(perBar.get(e.bar) ?? []), e]);
  if (32 - perBar.size < 2) issues.push('no silence -- every bar has a scratch (s.28)');
  const roles = [...perBar.values()].flat().map((e) => e.cueRole);
  if (roles.length && roles.filter((r) => r === 'HOME').length < 0.4 * roles.length) issues.push('no home theme -- samples change too freely (s.28)');
  const hard = DJ_ROUTINE_LEVELS[4];
  if ([...perBar.values()].filter((evs) => evs.every((e) => hard.includes(e.gesture))).length > 20) issues.push('every bar uses the hardest technique (s.28)');
  if (!events.some((e) => e.gesture === 'needleDrop')) issues.push('no opening (needle drop)');
  if (!events.some((e) => e.gesture === 'needleLift')) issues.push('no closing (needle lift)');
  return issues;
}

// ─── three_deck.build_scratch_events (C10) ───────────────────────────────

type DeckCRole = 'intro' | 'answer' | 'feature' | 'silent' | 'theme';

/** `ARC_3DECK`: (section, bar0, bars, juggle level, scratch level, Deck C role). */
export const THREE_DECK_ARC: ReadonlyArray<readonly [string, number, number, number, number, DeckCRole]> = [
  ['establish', 0, 4, 1, 2, 'intro'],
  ['build', 4, 4, 2, 3, 'answer'],
  ['half_bar', 8, 4, 2, 3, 'feature'],
  ['reorder', 12, 4, 3, 2, 'answer'],
  ['scratch_feat', 16, 4, 1, 4, 'feature'],
  ['juggle_feat', 20, 4, 3, 0, 'silent'],
  ['combined', 24, 4, 2, 3, 'feature'],
  ['final_burst', 28, 2, 4, 0, 'silent'],
  ['resolution', 30, 2, 1, 2, 'theme'],
];
/** `ARC_ENERGY`: the routine builds to its climax. */
export const THREE_DECK_ENERGY: readonly number[] = [0.45, 0.60, 0.68, 0.75, 0.85, 0.80, 0.95, 1.0, 0.55];
/** `SCRATCH_GESTURE_BY_LEVEL`: the energetic ladder (C12, owner decision O6: no flare1, no one-click flare). */
export const THREE_DECK_GESTURES: Readonly<Record<1 | 2 | 3 | 4, readonly ScratchGestureId[]>> = {
  1: ['chirp', 'forwardStab', 'cut'],
  2: ['chirpDouble', 'transformer4', 'tearForward'],
  3: ['tearForward', 'transformer8', 'scribble'],
  4: ['flare2', 'orbit', 'crab'],
};
/** `REST_PROB_BY_ROLE` / `REST_PROB_DEFAULT`: the flow builder's breathing step, by Deck C role. */
export const THREE_DECK_REST_PROB: Readonly<Record<string, number>> = { feature: 0.06, theme: 0.18, answer: 0.20, intro: 0.30 };
export const THREE_DECK_REST_DEFAULT = 0.2;
/** `DEFAULT_BUDGET`: two hands, a prepped juggle on A/B. */
export const THREE_DECK_BUDGET = 6;
/** The word rotation: each 2-bar phrase throws the next cue role's word. */
const CUE_CYCLE: readonly CueRole[] = ['HOME', 'SECONDARY', 'ACCENT', 'FX', 'SECONDARY', 'HOME', 'ACCENT', 'FX'];

/** `JUGGLE_JL_MIN`: only sections at or above this juggle level hand-juggle (three_deck.py :198). */
export const THREE_DECK_JUGGLE_JL_MIN = 3;

/** `_section_juggles(jl, role)`: a section beat-juggles only at JUGGLE_JL_MIN and with Deck C silent (C15). */
export const sectionJuggles = (jl: number, role: string): boolean => jl >= THREE_DECK_JUGGLE_JL_MIN && role === 'silent';

/**
 * C15, the two hands (three_deck `_perf_events` :201-224): the A/B decks hand-juggle ONLY while Deck C is out -
 * the routine's sections where `_section_juggles` holds (juggle_feat bars 20-23, final_burst 28-29). Everywhere
 * else in the routine a hand is on Deck C and the A/B decks only play and fade. `bar` counts from the routine's
 * first bar; outside [0, 32) the routine has no say (null).
 */
export function threeDeckJuggleAllowed(bar: number): boolean | null {
  const sec = THREE_DECK_ARC.find(([, b0, bars]) => bar >= b0 && bar < b0 + bars);
  return sec ? sectionJuggles(sec[3], sec[5]) : null;
}

/** `scratch_permission(juggle_level, budget)`: the scratch level two hands leave. */
export const scratchPermissionFor = (juggleLevel: number, budget = THREE_DECK_BUDGET): number => Math.max(0, Math.min(4, budget - juggleLevel));

/**
 * `build_scratch_events(seed)` + the record each event plays (`render`: a clean throw advances its role's
 * pool, the scratches after it chop that word). `pools` defaults to the crate's role pools.
 *
 * `phraseEmphasis` (C16, three_deck `phrase_emphasis`): STATEMENT AND CHOP for a crate of one spoken phrase - each
 * phrase throws the whole phrase clean (HOME, drop_phrase), every scratch after it chops ONE word (ACCENT); the
 * record's statement plays from its first sample, the scratches read its last word (`cues_with_word_emphasis`).
 */
export function buildThreeDeckRoutine(seed: number, opts: { budget?: number; pools?: Readonly<Record<CueRole, readonly string[]>>; phraseEmphasis?: boolean } = {}): DemoRoutineEvent[] {
  demoRoutineStats.threeDeck++;
  const budget = opts.budget ?? THREE_DECK_BUDGET;
  const pools = opts.pools ?? CUE_ROLE_POOLS;
  const emphasis = !!opts.phraseEmphasis;
  const rnd: ScratchRandom = lfsr(seed * 71 + 5);
  const ev: Array<Omit<DemoRoutineEvent, 'record'>> = [{ bar: 0, step: 0, cueRole: 'HOME', gesture: 'needleDrop', velocity: 0.6 }];
  let phraseI = 0;
  THREE_DECK_ARC.forEach(([, b0, bars, jl, sl, role], si) => {
    const lvl = Math.min(sl, scratchPermissionFor(jl, budget));
    if (lvl <= 0 || role === 'silent') return;
    const energy = THREE_DECK_ENERGY[si]!;
    const gestures = THREE_DECK_GESTURES[lvl as 1 | 2 | 3 | 4];
    const restProb = (THREE_DECK_REST_PROB[role] ?? THREE_DECK_REST_DEFAULT) * (1.3 - 0.6 * energy);
    for (let b = 0; b < bars; b++) {
      const newPhrase = b % 2 === 0;
      if (newPhrase) phraseI++;
      const phraseCue: CueRole = emphasis ? 'HOME' : CUE_CYCLE[phraseI % CUE_CYCLE.length]!;
      let st = 0;
      if (newPhrase) {
        const g: ScratchGestureId = emphasis ? 'dropPhrase' : 'drop';
        ev.push({ bar: b0 + b, step: 0, cueRole: phraseCue, gesture: g, velocity: Math.min(1, 0.65 + 0.35 * energy) });
        st = getGesture(g).durationSteps;
      }
      while (st < 15) {
        let g = gestures[Math.trunc(rnd() * gestures.length) % gestures.length]!;
        if (role === 'intro' && rnd() > 0.6) g = 'baby';
        // chop the word, never the statement; the occasional bark accent draws only in the rotation
        const cue: CueRole = emphasis ? 'ACCENT' : rnd() > 0.78 ? 'ACCENT' : phraseCue;
        const velocity = Math.min(1, 0.55 + 0.4 * energy + 0.12 * (rnd() - 0.5));
        ev.push({ bar: b0 + b, step: st, cueRole: cue, gesture: g, velocity });
        st += getGesture(g).durationSteps;
        if (rnd() < restProb) st += 1;
      }
    }
  });
  ev.push({ bar: 31, step: 15, cueRole: 'HOME', gesture: 'needleLift', velocity: 0.5 });
  const roleI: Partial<Record<CueRole, number>> = {};
  // `pools.get(role) or pools.get("HOME")`, else the first record of any pool
  const anyRecord = (['HOME', 'SECONDARY', 'ACCENT', 'FX'] as const).map((r) => pools[r][0]).find((x) => x !== undefined);
  return ev.map((e) => {
    if (isNeedle(e.gesture)) return e;
    if (e.gesture === 'drop') roleI[e.cueRole] = (roleI[e.cueRole] ?? 0) + 1;
    const pool = pools[e.cueRole].length ? pools[e.cueRole] : pools.HOME;
    const record = pool.length ? pool[(roleI[e.cueRole] ?? 0) % pool.length] : anyRecord;
    return { ...e, ...(record ? { record } : {}), ...(emphasis ? { slice: e.cueRole === 'HOME' || e.cueRole === 'SECONDARY' ? 'phrase' as const : 'word' as const } : {}) };
  });
}

// ─── The two routines as arc templates (C5, C10): the performer reads its phase per bar ────

const level = (n: number): 1 | 2 | 3 | 4 => Math.max(1, Math.min(4, n)) as 1 | 2 | 3 | 4;

/** `scratch_dj.ARC` as an arc template (phases, energy, level, cue role, density scale, silence). */
export const SCRATCH_DJ_TEMPLATE: ArcTemplate = {
  name: 'scratchDj', bars: 32,
  phases: SCRATCH_DJ_ARC.map(([name, startBar, bars, energy, lvl, role, densityScale, silenceAllowed]) => ({ name, startBar, bars, energy, level: level(lvl), sourceRole: role, densityScale, silenceAllowed })),
};

/** `three_deck.ARC_3DECK` as an arc template (the scratch level after the hands budget; a silent role allows silence). */
export const THREE_DECK_TEMPLATE: ArcTemplate = {
  name: 'threeDeck', bars: 32,
  phases: THREE_DECK_ARC.map(([name, startBar, bars, jl, sl, role], i) => ({
    name: name as ArcTemplate['phases'][number]['name'], startBar, bars, energy: THREE_DECK_ENERGY[i]!,
    level: level(Math.min(sl, scratchPermissionFor(jl))), sourceRole: 'HOME' as const, densityScale: 1, silenceAllowed: role === 'silent',
  })),
};

const isNeedle = (g: ScratchGestureId): boolean => g === 'needleDrop' || g === 'needleLift';

/** The plan role a cue role performs as (the executor's role: anchors, the governor's vocal rule). */
export const CUE_ROLE_SCRATCH_ROLE: Readonly<Record<CueRole, ScratchRole>> = { HOME: 'THEME', SECONDARY: 'FEATURE', ACCENT: 'ACCENT', FX: 'FILL' };

/** A demo routine laid from `startBar` as placed events the executor plays (needles open / close it). */
export function demoRoutineToPlaced(events: readonly DemoRoutineEvent[], startBar: number, beatsPerBar = 4, render?: readonly ScratchRenderSpec[]): PlacedScratch[] {
  return events.map((e, i) => {
    const bar = startBar + e.bar;
    const placementRole: PlacementRole = e.step >= 15 ? 'turnaround' : e.step >= 6 && e.step <= 8 ? 'answer' : 'accent';
    const role: ScratchRole = e.gesture === 'needleDrop' ? 'INTRO' : e.gesture === 'needleLift' ? 'OUTRO' : e.gesture === 'drop' ? 'INTRO' : CUE_ROLE_SCRATCH_ROLE[e.cueRole];
    return { bar, step: e.step, beat: stepToBeat({ bar, step: e.step }, '1/16', beatsPerBar), gesture: e.gesture, velocity: e.velocity, placementRole, role, ...(e.record ? { record: e.record } : {}), ...(render?.[i] ? { render: render[i] } : {}) };
  });
}

/**
 * How the demo renders each event of its routine (`three_deck.render`, `scratch_dj.render`): the
 * physics seed `seed + bar x 16 + step` (a needle: `seed`), and the human timing in whole samples -
 * three_deck draws int((-4 + 8 rand) ms) from RandomState(seed), scratch_dj int((-8 + 18 lfsr) ms)
 * from the LFSR(seed x 999 + 3) - once per stroke, in event order, none for a needle.
 */
export function demoRoutineRenderSpecs(events: readonly DemoRoutineEvent[], seed: number, routine: 'threeDeck' | 'scratchDj'): ScratchRenderSpec[] {
  const mt = routine === 'threeDeck' ? new NumpyRandomState(seed >>> 0) : null;
  const lf = routine === 'scratchDj' ? lfsr(seed * 999 + 3) : null;
  return events.map((e) => {
    if (isNeedle(e.gesture)) return { seed, humanizeSamples: 0, chain: routine };
    const ms = mt ? -4 + 8 * mt.rand() : -8 + 18 * lf!();
    return { seed: seed + e.bar * 16 + e.step, humanizeSamples: Math.trunc(ms * 1e-3 * DEMO_RATE), chain: routine, ...(e.slice ? { slice: e.slice } : {}) };
  });
}
