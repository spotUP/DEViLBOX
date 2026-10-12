/**
 * The performance arc (owner plan `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md`
 * sections 29, 30, 74; ledger SCR-P6.1-P6.3): a configurable template of phases - bars,
 * energy, level cap, the record role it draws on, a density scale, whether silence is allowed -
 * that a feature is performed through. A template, not a transport structure: `scaleArc`
 * fits it to 8, 16, 32 or 64 bars, and `arcForSection` picks the shape the set's section
 * calls for (section 30). `planArc` performs one deterministically (the Up Rough
 * `scratch_dj.build_routine` port: hook bars, answers in the gaps, a level that climbs to the
 * peak, genuine rests, a return home).
 */

import { lfsr } from './scratchRandom';
import { oneHand, pickGesture, planVocabulary, vocabulary, PLAN_VEL, type DensityState, type PlacedScratch, type PlacementRole } from './scratchPlacement';
import { stepToBeat } from './scratchAnchor';
import { getGesture, SCRATCH_GESTURES } from './scratchGestureCatalog';
import { maxLevelFor, type ScratchMode } from './scratchStyles';
import type { DJTrackAnalysis, SectionKind, SetEnergyPhase } from '../autodj/types';
import type { ScratchDJStyle, ScratchGestureId, ScratchLevel, ScratchRole } from './scratchTypes';

export type ArcPhaseName =
  | 'establish' | 'build' | 'call' | 'response' | 'develop' | 'intensify' | 'callResponse'
  | 'feature' | 'peak' | 'burst' | 'resolution';

/** The reference's four cue roles (HOME = the long vowel, SECONDARY = fresh, ACCENT = yeah, FX). */
export type ArcSourceRole = 'HOME' | 'SECONDARY' | 'ACCENT' | 'FX';

export interface ArcPhase {
  name: ArcPhaseName;
  startBar: number;
  bars: number;
  energy: number;
  level: ScratchLevel;
  sourceRole: ArcSourceRole;
  densityScale: number;
  silenceAllowed: boolean;
}

export interface ArcTemplate { name: string; bars: number; phases: readonly ArcPhase[] }

const ph = (name: ArcPhaseName, startBar: number, bars: number, energy: number, level: ScratchLevel, sourceRole: ArcSourceRole, densityScale: number, silenceAllowed: boolean): ArcPhase =>
  ({ name, startBar, bars, energy, level, sourceRole, densityScale, silenceAllowed });

/** Section 74: the 32-bar feature the performance test verifies. */
export const FEATURE_ARC: ArcTemplate = { name: 'feature', bars: 32, phases: [
  ph('establish', 0, 4, 0.5, 1, 'HOME', 0.5, true),
  ph('build', 4, 4, 0.65, 1, 'HOME', 0.8, false),
  ph('call', 8, 4, 0.7, 2, 'HOME', 0.7, true),
  ph('response', 12, 4, 0.72, 2, 'ACCENT', 0.7, true),
  ph('develop', 16, 4, 0.8, 3, 'SECONDARY', 0.9, false),
  ph('feature', 20, 4, 0.85, 3, 'SECONDARY', 1.0, true),
  ph('peak', 24, 4, 1.0, 4, 'SECONDARY', 1.2, false),
  ph('burst', 28, 3, 1.0, 4, 'FX', 1.4, false),
  ph('resolution', 31, 1, 0.6, 1, 'HOME', 0.7, false),
] };

/** Section 29: the Up Rough arc as written there (develop before the call/response, an intensify). */
export const UP_ROUGH_ARC: ArcTemplate = { name: 'upRough', bars: 32, phases: [
  ph('establish', 0, 4, 0.5, 1, 'HOME', 0.5, true),
  ph('build', 4, 4, 0.65, 1, 'HOME', 0.8, false),
  ph('develop', 8, 4, 0.72, 2, 'HOME', 0.9, false),
  ph('callResponse', 12, 4, 0.75, 2, 'ACCENT', 0.7, true),
  ph('intensify', 16, 4, 0.85, 3, 'SECONDARY', 1.0, false),
  ph('feature', 20, 4, 0.85, 3, 'SECONDARY', 1.0, true),
  ph('peak', 24, 4, 1.0, 4, 'SECONDARY', 1.2, false),
  ph('burst', 28, 3, 1.0, 4, 'FX', 1.4, false),
  ph('resolution', 31, 1, 0.6, 1, 'HOME', 0.7, false),
] };

/**
 * Fit a template to `bars` bars: every boundary scales by bars / template.bars (floored), the
 * order is kept; a phase that rounds to no bar is dropped (an 8-bar arc cannot hold nine).
 */
export function scaleArc(template: ArcTemplate, bars: number): ArcTemplate {
  const k = bars / template.bars;
  const edges = template.phases.map((p) => Math.floor(p.startBar * k + 1e-9));
  const phases: ArcPhase[] = [];
  template.phases.forEach((p, i) => {
    const start = edges[i]!, end = i + 1 < edges.length ? edges[i + 1]! : bars;
    if (end > start) phases.push({ ...p, startBar: start, bars: end - start });
  });
  return { name: template.name, bars, phases };
}

/** Reachability sentinel (SCR-P6.R6): bars resolved to their phase. */
export const scratchArcStats = { phaseAt: 0 };

const phaseOf = (arc: ArcTemplate, barInArc: number): ArcPhase | null =>
  arc.phases.find((p) => barInArc >= p.startBar && barInArc < p.startBar + p.bars) ?? null;

/** The phase a bar of the arc falls in (bar counted from the arc's start): the performer's per-bar read. */
export function phaseAt(arc: ArcTemplate, barInArc: number): ArcPhase | null {
  scratchArcStats.phaseAt++;
  return phaseOf(arc, barInArc);
}

/** What section 30 asks of a section of the set. */
export interface SectionArcShape {
  template: ArcTemplate | null;
  /** Feature length in bars (null = no feature, accents only). */
  bars: number | null;
  density: DensityState;
  level: ScratchLevel;
  role: 'sparse' | 'more' | 'shortFeature' | 'accents' | 'space' | 'escalation' | 'peakBurst' | 'resolution';
}

/**
 * Section 30: intro sparse, build more gestures, drop a short feature, groove occasional
 * accents, breakdown space / vocal scratches, a build at the set's climb escalation, a drop at
 * the set's peak a peak burst, outro resolution.
 */
export function arcForSection(kind: SectionKind | undefined, setPhase: SetEnergyPhase): SectionArcShape {
  const climbing = setPhase === 'PEAKING' || setPhase === 'PEAK';
  switch (kind) {
    case 'intro': return { template: null, bars: null, density: 'low', level: 1, role: 'sparse' };
    case 'build': case 'pre-drop':
      return climbing
        ? { template: scaleArc(FEATURE_ARC, 8), bars: 8, density: 'high', level: 3, role: 'escalation' }
        : { template: null, bars: null, density: 'medium', level: 2, role: 'more' };
    case 'drop':
      return setPhase === 'PEAK'
        ? { template: FEATURE_ARC, bars: 32, density: 'showcase', level: 4, role: 'peakBurst' }
        : { template: scaleArc(FEATURE_ARC, 4), bars: 4, density: 'high', level: 3, role: 'shortFeature' };
    case 'breakdown': case 'vocal-heavy':
      return { template: null, bars: null, density: 'low', level: 2, role: 'space' };
    case 'outro': return { template: null, bars: null, density: 'veryLow', level: 1, role: 'resolution' };
    default: return { template: null, bars: null, density: 'veryLow', level: 2, role: 'accents' };
  }
}

// ─── Performing an arc ───────────────────────────────────────────────────

export interface ArcEvent extends PlacedScratch { phase: ArcPhaseName }

export interface ArcPlan {
  arc: ArcTemplate;
  events: ArcEvent[];
  /** Phase label of each bar (telemetry). */
  phaseByBar: ArcPhaseName[];
  emptyBars: number[];
}

/** Steps per bar of each phase (bar index inside the phase), the reference routine's shapes. */
function phaseSteps(name: ArcPhaseName, b: number, rnd: () => number, dens: number): number[] {
  switch (name) {
    case 'establish': return [[], [2], [8], [14]][b % 4]!;
    case 'build': return b % 4 === 2 ? [2, 8, 14] : [2, 10];
    case 'call': return b % 2 === 0 ? [2, 6] : [];
    case 'response': return b % 2 === 0 ? [6] : [14];
    case 'callResponse': return b % 2 === 0 ? [6] : [14];
    case 'develop': case 'intensify': return [2, 10];
    case 'feature': return b % 4 === 1 ? [] : b % 4 === 3 ? [2, 10] : [2, 6, 10];
    case 'peak': case 'burst': {
      const steps = [2, 6, 10, 14].filter(() => rnd() < Math.min(1, dens));
      return steps.length ? steps : [2];
    }
    case 'resolution': return [6];
  }
}

const ROLE_OF: Readonly<Record<ArcPhaseName, ScratchRole>> = {
  establish: 'INTRO', build: 'THEME', call: 'THEME', response: 'ANSWER', callResponse: 'ANSWER', develop: 'THEME',
  intensify: 'THEME', feature: 'FEATURE', peak: 'FEATURE', burst: 'FEATURE', resolution: 'OUTRO',
};

/**
 * Perform an arc from `startBar`: each phase's gestures come from the style's vocabulary inside
 * the phase's level (capped by the mode); the last event of a phase plays at the phase's level
 * (the climb is audible), one hand performs it all, and the phases that allow silence keep
 * their empty bars. Deterministic for a seed.
 */
export function planArc(opts: { arc: ArcTemplate; startBar: number; style: ScratchDJStyle; mode: ScratchMode; seed: number; densityScale?: number; beatsPerBar?: number; levelCap?: ScratchLevel; exclude?: readonly ScratchGestureId[] }): ArcPlan {
  const { arc, style, mode } = opts;
  const bpb = opts.beatsPerBar ?? 4;
  const modeMax = opts.levelCap ?? (maxLevelFor(mode, style) || 1);
  // a peak lifts the cap above the mode (section 56): the vocabulary is the battle palette's then
  const base = planVocabulary(style, opts.levelCap && opts.levelCap > (maxLevelFor(mode, style) || 0) ? 'BATTLE' : mode)
    .filter((g) => getGesture(g).difficulty <= modeMax && !opts.exclude?.includes(g));
  const rnd = lfsr(opts.seed * 131 + 7);
  const events: ArcEvent[] = [];
  const phaseByBar: ArcPhaseName[] = [];
  let last: ScratchGestureId | null = null;
  for (let b = 0; b < arc.bars; b++) {
    const p = phaseOf(arc, b);
    if (!p) { phaseByBar.push('resolution'); continue; }
    phaseByBar.push(p.name);
    const cap = Math.min(p.level, modeMax) as ScratchLevel;
    // the style's gestures inside the cap, plus the cap level's own when the palette has none there
    const atCap = SCRATCH_GESTURES.filter((g) => g.difficulty === cap && g.id !== 'drop' && g.id !== 'dropPhrase' && !opts.exclude?.includes(g.id)).map((g) => g.id);
    const pool = vocabulary([...base.filter((g) => getGesture(g).difficulty <= cap), ...(base.some((g) => getGesture(g).difficulty === cap) ? [] : atCap)]);
    const inPhase = b - p.startBar;
    const steps = phaseSteps(p.name, inPhase, rnd, p.densityScale * (opts.densityScale ?? 1));
    const lastBarOfPhase = inPhase === p.bars - 1;
    steps.forEach((step, i) => {
      const placementRole: PlacementRole = step >= 14 ? 'turnaround' : step >= 6 && step <= 8 ? 'answer' : 'accent';
      const signature = lastBarOfPhase && i === steps.length - 1;
      const band = signature ? pool.filter((g) => getGesture(g).difficulty === cap) : pool;
      const gesture = pickGesture(band.length ? band : pool, p.energy, placementRole, rnd, last);
      last = gesture;
      const bar = opts.startBar + b;
      events.push({
        bar, step, beat: stepToBeat({ bar, step }, '1/16', bpb), gesture,
        velocity: Math.min(1, PLAN_VEL.base + PLAN_VEL.rand * rnd() + PLAN_VEL.energy * p.energy),
        placementRole, role: ROLE_OF[p.name], phase: p.name,
      });
    });
  }
  const performed = oneHand(events);
  const busy = new Set(performed.map((e) => e.bar - opts.startBar));
  const emptyBars = Array.from({ length: arc.bars }, (_, i) => i).filter((i) => !busy.has(i));
  return { arc, events: performed, phaseByBar, emptyBars };
}

/** The section 30 arc for a track position: the template the section calls for, if any. */
export function arcAt(track: Pick<DJTrackAnalysis, 'sections'>, bar: number, setPhase: SetEnergyPhase): SectionArcShape {
  const s = track.sections.find((x) => bar >= x.startBar && bar < x.endBar);
  return arcForSection(s?.kind, setPhase);
}
