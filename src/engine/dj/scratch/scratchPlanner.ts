/**
 * The scratch planner (owner plan sections 21-24, 35, 37, 41, 62, 66; ledger
 * SCR-P4.13): a `ScratchPerformanceContext` + a mode + a seed in, a phrase of
 * placed scratches out. Pure and deterministic - the same seed and context give
 * the same events - and conservative where the music is: low beat
 * confidence plays level 1 only with no routine and behaves as SAFE.
 */

import { barSeed, lfsr } from './scratchRandom';
import {
  DENSITY_RATE, planBars, planVocabulary, pickGesture, vocabulary, humanizeMs, withThrow, isThrowGesture, sectionDensity,
  DENSITY_ORDER, type DensityState, type PlacedScratch, type PlannedRest, type ThrowMemory,
} from './scratchPlacement';
import { routineFor, routineToPlaced, SCRATCH_ROUTINES, type RoutineName } from './scratchRoutines';
import { maxLevelFor, SCRATCH_STYLES, type ScratchMode } from './scratchStyles';
import { getGesture } from './scratchGestureCatalog';
import { STEPS_PER_BEAT, DEFAULT_GRID } from './scratchAnchor';
import type { ScratchPerformanceContext } from './scratchContext';
import type { ScratchRecord } from './scratchCatalogue';
import type { ScratchAnchor, ScratchEvent, ScratchGestureId, ScratchSource, DeckScratchAnchor } from './scratchTypes';

/** Below this beat confidence the planner plays safe: level 1, no routine. */
export const LOW_BEAT_CONFIDENCE = 0.5;

/** Densest state each mode may reach (section 62). */
export const MODE_MAX_DENSITY: Readonly<Record<ScratchMode, DensityState>> = {
  OFF: 'none', SAFE: 'low', MUSICAL: 'medium', PERFORMER: 'high', BATTLE: 'showcase',
};

export interface ScratchPlanOptions {
  mode: ScratchMode;
  seed: number;
  /** First bar of the plan and its length. */
  fromBar: number;
  bars: number;
  /** The record the phrase is scratched on (opens with a throw). */
  record?: Pick<ScratchRecord, 'id' | 'durationSec' | 'clean'>;
  throwMemory?: ThrowMemory;
  /** Genre modifiers (section 33): density multiplier, rest multiplier, extra bias, level cap. */
  genre?: { densityScale?: number; restScale?: number; bias?: readonly ScratchGestureId[]; levelCap?: number; durationCapSteps?: number };
  /** Vocal activity per bar of the plan; every bar takes the context's reading when omitted. */
  vocalByBar?: readonly number[];
  routines?: boolean;
}

export interface ScratchPlan {
  /** Effective mode after the confidence and permission gates. */
  mode: ScratchMode;
  events: PlacedScratch[];
  bars: PlacedScratch[][];
  rests: PlannedRest[];
  routine?: RoutineName;
  issues: string[];
  /** Why the plan is what it is (telemetry). */
  reasons: string[];
}

const minDensity = (a: DensityState, b: DensityState): DensityState =>
  DENSITY_ORDER[Math.min(DENSITY_ORDER.indexOf(a), DENSITY_ORDER.indexOf(b))]!;

/** The mode the context allows: OFF without permission, SAFE (level 1) when the grid is not trusted. */
export function effectiveMode(ctx: Pick<ScratchPerformanceContext, 'beatConfidence' | 'scratchPermission'>, mode: ScratchMode): { mode: ScratchMode; levelCap?: 1; reason?: string } {
  if (mode === 'OFF' || ctx.scratchPermission <= 0) return { mode: 'OFF', reason: mode === 'OFF' ? 'mode off' : 'no scratch permission' };
  if (ctx.beatConfidence < LOW_BEAT_CONFIDENCE) return { mode: 'SAFE', levelCap: 1, reason: `beat confidence ${ctx.beatConfidence.toFixed(2)} below ${LOW_BEAT_CONFIDENCE}: level 1 only, no routine` };
  return { mode };
}

/** Fit a routine's gestures to the style's vocabulary (a gesture outside it is replaced, role and word kept). */
function routineInVocabulary(placed: PlacedScratch[], vocab: readonly ScratchGestureId[], seed: number, section: string): PlacedScratch[] {
  const ranked = vocabulary(vocab);
  const rnd = lfsr(barSeed(seed, 0, section) + 0x77);
  return placed.map((p) => {
    if (ranked.includes(p.gesture)) return p;
    const g = pickGesture(ranked, getGesture(p.gesture).intensity, p.placementRole, rnd, null);
    return { ...p, gesture: g };
  });
}

export function planScratch(ctx: ScratchPerformanceContext, opts: ScratchPlanOptions): ScratchPlan {
  const reasons: string[] = [];
  const eff = effectiveMode(ctx, opts.mode);
  if (eff.reason) reasons.push(eff.reason);
  const empty: ScratchPlan = { mode: eff.mode, events: [], bars: Array.from({ length: opts.bars }, () => []), rests: [], issues: [], reasons };
  if (eff.mode === 'OFF' || opts.bars <= 0) return empty;

  const style = ctx.style;
  const genre = opts.genre ?? {};
  let gestures = planVocabulary(style, eff.mode, genre.bias ?? []);
  const levelCap = Math.min(eff.levelCap ?? 4, genre.levelCap ?? 4, maxLevelFor(eff.mode, style) || 4);
  gestures = gestures.filter((id) => getGesture(id).difficulty <= levelCap || (eff.mode === 'SAFE' && !eff.levelCap && id === 'chirp'));
  if (genre.durationCapSteps) gestures = gestures.filter((id) => getGesture(id).durationSteps <= genre.durationCapSteps! && id !== 'drag');
  if (gestures.length === 0) { reasons.push('no gesture inside the level cap'); return empty; }

  // density: the section's state for the style, capped by the mode, scaled by the genre
  const natural = sectionDensity(style, ctx.sectionName);
  const capped = minDensity(natural, MODE_MAX_DENSITY[eff.mode]);
  const rate = DENSITY_RATE[capped] * (genre.densityScale ?? 1);
  reasons.push(`${ctx.sectionName}: ${natural}${capped !== natural ? ` capped to ${capped} by ${eff.mode}` : ''}`);

  const vocalByBar = opts.vocalByBar ?? Array(opts.bars).fill(ctx.vocalActivity);
  // a drop or a build escalates: the energy climbs bar by bar so the busy band opens up (section 22)
  const kind = ctx.section?.kind;
  const energyByBar = kind === 'drop' || kind === 'build' || kind === 'pre-drop'
    ? Array.from({ length: opts.bars }, (_, i) => Math.min(1, ctx.energy * (0.5 + 0.5 * (opts.bars > 1 ? i / (opts.bars - 1) : 1)) + (opts.bars > 1 ? 0.3 * i / (opts.bars - 1) : 0.3)))
    : undefined;
  const barRole = capped === 'showcase' ? 'FEATURE' as const : undefined;
  const planned = planBars({
    style, section: ctx.sectionName, bars: opts.fromBar + opts.bars, seed: opts.seed, gestures, energy: ctx.energy,
    fromBar: opts.fromBar, count: opts.bars, vocalByBar, energyByBar, rateOverride: rate, barRole,
    restScale: SCRATCH_STYLES[style].restScale * (genre.restScale ?? 1),
    beatsPerBar: ctx.meter, grid: DEFAULT_GRID,
  });
  const bars = planned.bars;
  let routine: RoutineName | undefined;

  // a named routine closes each phrase (section 37), unless the grid is not trusted
  if ((opts.routines ?? true) && !eff.levelCap && eff.mode !== 'SAFE' && capped !== 'none') {
    const name = routineFor(style, ctx.sectionName);
    const r = SCRATCH_ROUTINES[name];
    const first = opts.fromBar;
    for (let start = first - (first % ctx.phraseBars); start < first + opts.bars; start += ctx.phraseBars) {
      const at = start + ctx.phraseBars - r.bars;
      if (at < first || at + r.bars > first + opts.bars) continue;
      const placed = routineInVocabulary(routineToPlaced(r, at, DEFAULT_GRID, ctx.meter), gestures, opts.seed, ctx.sectionName);
      for (let k = 0; k < r.bars; k++) bars[at - first + k] = placed.filter((p) => p.bar === at + k);
      routine = name;
      reasons.push(`routine ${name} at bar ${at}`);
    }
  }

  let events = bars.flat().sort((a, b) => a.beat - b.beat);
  if (opts.record && opts.throwMemory && events.length) {
    events = withThrow(events, opts.record, opts.throwMemory, { firstBar: opts.fromBar, beatsPerBar: ctx.meter });
  }
  return { mode: eff.mode, events, bars, rests: planned.rests, routine, issues: planned.issues, reasons };
}

/** Humanize offsets for a plan (section 35), drawn once from the seed so a plan replays exactly. */
export function humanizeAll(events: readonly PlacedScratch[], bpm: number, seed: number): number[] {
  const rnd = lfsr(seed * 31 + 7);
  const out: number[] = [];
  let prev: number | null = null;
  for (const e of events) {
    const off = humanizeMs(e, rnd, bpm, prev);
    out.push(off);
    prev = off;
  }
  return out;
}

/** Placed scratches + their source -> the executor's `ScratchEvent`s (durations in beats of the gesture's steps). */
export function toScratchEvents(
  events: readonly PlacedScratch[],
  source: ScratchSource,
  anchor: ScratchAnchor | DeckScratchAnchor,
  opts: { bpm: number; seed: number; deck?: 'A' | 'B'; humanize?: boolean },
): ScratchEvent[] {
  const offsets = opts.humanize === false ? events.map(() => 0) : humanizeAll(events, opts.bpm, opts.seed);
  return events.map((e, i) => {
    const g = getGesture(e.gesture);
    return {
      executeAtBeat: e.beat,
      durationBeats: g.durationSteps / STEPS_PER_BEAT[DEFAULT_GRID],
      role: e.role,
      source,
      anchor,
      gesture: e.gesture,
      velocity: e.velocity,
      humanizeMs: offsets[i]!,
      intensity: g.intensity,
      deck: opts.deck,
      returnToAnchor: g.returnsToAnchor && !isThrowGesture(e.gesture),
    };
  });
}
