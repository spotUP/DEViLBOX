/**
 * The scratch planner (owner plan sections 21-24, 35, 62, 66; ledger SCR-P4.13;
 * SCR-PHRASING-PARITY): a `ScratchPerformanceContext` + a mode + a seed in, the
 * demo's scratch overlay for the window's bars out. Pure and deterministic - the same seed and context give
 * the same events - and conservative where the music is: low beat
 * confidence plays level 1 only with no routine and behaves as SAFE.
 */

import { barSeed, lfsr } from './scratchRandom';
import {
  DENSITY_RATE, planPhrase, demoPhraseSteps, pickGesture, vocabulary, humanizeMs, isThrowGesture, sectionDensity, SECTION_ENERGY, PLAN_VEL,
  DENSITY_ORDER, overlapsOneHand, fillVocabulary, validatePhrase, VOCAL_BUSY, type DensityState, type PlacedScratch, type PlannedRest, type ScratchSection,
} from './scratchPlacement';
import { juggleResponseRoutine, routineFor, routineToPlaced, SCRATCH_ROUTINES, validateRoutine, type RoutineName } from './scratchRoutines';
import type { JugglePhase } from '../autodj/juggle/juggleTypes';
import { maxLevelFor, PALETTE_PROFILE, SCRATCH_PROFILES, styleVocabulary, type ScratchMode, type ScratchProfileId } from './scratchStyles';
import { getGesture, gestureBeats, SCRATCH_GESTURE_IDS } from './scratchGestureCatalog';
import { DEFAULT_GRID, STEPS_PER_BEAT, stepToBeat } from './scratchAnchor';
import { barStartBeat } from '../autodj/beatGrid';
import { overlayRecord } from './scratchDemoRoutines';
import type { ScratchPerformanceContext } from './scratchContext';
import { DEMO_PROFILES, DEMO_RATE, type DemoProfileName } from './scratchRender';
import { CLEAN_CRATE_POOL } from './scratchCatalogue';
import type { ScratchAnchor, ScratchEvent, ScratchGestureId, ScratchRenderSpec, ScratchSource, DeckScratchAnchor } from './scratchTypes';

/** Below this beat confidence the planner plays safe: level 1, no routine. */
export const LOW_BEAT_CONFIDENCE = 0.5;

/** Densest state each mode may reach (section 62). */
export const MODE_MAX_DENSITY: Readonly<Record<ScratchMode, DensityState>> = {
  OFF: 'none', SAFE: 'low', MUSICAL: 'medium', PERFORMER: 'high', BATTLE: 'showcase',
};

/** A section of the track as the overlay reads it: the demo's section name, its first bar, its length. */
export interface OverlaySection { name: ScratchSection | string; startBar: number; bars: number }

export interface ScratchPlanOptions {
  mode: ScratchMode;
  seed: number;
  /** First bar of the plan and its length. */
  fromBar: number;
  bars: number;
  /** The section a bar sits in (the demo plans every section on its own: section-local bars, the
   *  section's length, the seed + the bars before it). The context's section when omitted. */
  sectionAt?: (bar: number) => OverlaySection;
  /** The demo profile whose gestures and ladder the overlay plays; the palette's when omitted. */
  profile?: ScratchProfileId;
  /** The demo's routine option: none (the demo's default), 'auto' (`routine_for` closes each section), or one routine. */
  routine?: 'auto' | RoutineName | null;
  /** One crate record per section (`pick_source` over the clean crate) on every event. */
  records?: boolean;
  /** Genre modifiers (section 33): density multiplier, extra bias, level cap. */
  genre?: { densityScale?: number; restScale?: number; bias?: readonly ScratchGestureId[]; levelCap?: number; durationCapSteps?: number; fxScale?: number };
  /** Vocal activity per bar of the plan; every bar takes the context's reading when omitted. */
  vocalByBar?: readonly number[];
  /** Gestures left out of the vocabulary. */
  exclude?: readonly ScratchGestureId[];
  /** Steps up (+) or down (-) the density ladder from the section's state, still capped by the mode
   *  (section 52: escalate after a phrase that lifted the energy, resolve after a repeated one). */
  densityShift?: number;
  /** false: the demo's strokes alone, no DEViLBOX extras on top (a planned rest, the bed under a feature). */
  extras?: boolean;
}

export interface ScratchPlan {
  /** Effective mode after the confidence and permission gates. */
  mode: ScratchMode;
  events: PlacedScratch[];
  bars: PlacedScratch[][];
  rests: PlannedRest[];
  routine?: RoutineName | 'juggleResponse' | 'scratchDj' | 'threeDeck';
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
  // a replaced gesture never repeats the one before it (section 21: no one-gesture phrase)
  let last: ScratchGestureId | null = null;
  return placed.map((p) => {
    const g = ranked.includes(p.gesture) ? p.gesture : pickGesture(ranked, getGesture(p.gesture).intensity, p.placementRole, rnd, last);
    last = g;
    return g === p.gesture ? p : { ...p, gesture: g };
  });
}

/**
 * The juggle response (owner plan section 49, SCR-P7.9): the scratch over a running juggle, bar by
 * bar on the juggle's own phases (`juggleResponseRoutine`), in the style's vocabulary at the mode's
 * level and, on a crate record, in the record's own gestures.
 */
export function planJuggleResponse(ctx: ScratchPerformanceContext, opts: { mode: ScratchMode; seed: number; fromBar: number; phases: ReadonlyArray<JugglePhase | null>; allowed?: readonly ScratchGestureId[] }): ScratchPlan {
  const routine = juggleResponseRoutine(opts.phases, ctx.style, opts.seed + opts.fromBar);
  const styleVocab = styleVocabulary(ctx.style, opts.mode);
  const vocab = opts.allowed ? styleVocab.filter((g) => opts.allowed!.includes(g)) : styleVocab;
  const events = routineInVocabulary(routineToPlaced(routine, opts.fromBar, DEFAULT_GRID, ctx.meter), vocab.length ? vocab : styleVocab, opts.seed, ctx.sectionName);
  const bars = opts.phases.map((_, k) => events.filter((e) => e.bar === opts.fromBar + k));
  const peaks = opts.phases.filter((p) => p === 'PEAK').length;
  return {
    mode: opts.mode, events, bars, rests: [], routine: 'juggleResponse', issues: validateRoutine(routine),
    reasons: [`juggleResponse: scratch vocal over the loops, ${peaks} trade bar${peaks === 1 ? '' : 's'} answered, out for the payoff`],
  };
}

/** How the overlay renders a section's strokes (scratch.render_scratch_section; ledger P10, P11, C2). */
export interface OverlayRender {
  /** A stroke at (section-local bar, step): the profile's deck, the physics seed `seed x 3 + bar x 16 + step`, the
   *  section's bus chain; matched to one of the demo's own slots, the demo's human timing `int((-10 + 25 x lfsr)
   *  ms)` from LFSR(seed x 999 + 5), drawn once per slot in the demo's order (DEViLBOX's own strokes: none). */
  stroke(bar: number, step: number, demo?: boolean): ScratchRenderSpec;
  /** A routine event (render_routine(channel=False)): the boom-bap deck, seed + bar x 16 + step on the routine's
   *  own (bar, step), no human timing, the ending's one-step delay; summed into the section from `firstBar`. */
  routine(routineBar: number, step: number, firstBar: number, ending: boolean): ScratchRenderSpec;
}

export function overlayRender(o: { key: string; bars: number; seed: number; profile: DemoProfileName; demoSteps: (bar: number) => readonly number[]; routineBars?: ReadonlySet<number> }): OverlayRender {
  const prof = DEMO_PROFILES[o.profile];
  const rnd = lfsr(o.seed * 999 + 5);
  const draws: number[] = [];
  const draw = (i: number): number => { while (draws.length <= i) draws.push(rnd()); return draws[i]!; };
  const counts: number[] = [];
  const before = (bar: number): number => {
    while (counts.length <= bar) {
      const b = counts.length;
      const prev = b === 0 ? 0 : counts[b - 1]! + (o.routineBars?.has(b - 1) ? 0 : o.demoSteps(b - 1).length);
      counts.push(prev);
    }
    return counts[bar]!;
  };
  const used = new Map<number, Set<number>>();
  const section = (step: number): NonNullable<ScratchRenderSpec['section']> => ({ key: o.key, step, bars: o.bars, fx: prof.fx });
  return {
    stroke(bar, step, demo = true) {
      let humanizeSamples = 0;
      if (demo && !o.routineBars?.has(bar)) {
        const slots = o.demoSteps(bar);
        const u = used.get(bar) ?? new Set<number>();
        const j = slots.findIndex((x, i) => x === step && !u.has(i));
        if (j >= 0) {
          u.add(j); used.set(bar, u);
          humanizeSamples = Math.trunc((-10 + 25 * draw(before(bar) + j)) * 1e-3 * DEMO_RATE);
        }
      }
      return { seed: o.seed * 3 + bar * 16 + step, humanizeSamples, chain: 'overlay', deck: prof.deck, section: section(bar * 16 + step) };
    },
    routine(routineBar, step, firstBar, ending) {
      return { seed: o.seed + routineBar * 16 + step, humanizeSamples: 0, chain: 'overlay', deck: 'boombap', ...(ending ? { ending } : {}), section: section((firstBar + routineBar) * 16 + step) };
    },
  };
}

/** `_routine_cues` with a record set (R12): slot i of (ROCK, FUNKY, BEAT, IF, YOU, REALLY, PHRASE) is the i-th sorted record. */
const ROUTINE_SLOTS = ['ROCK', 'FUNKY', 'BEAT', 'IF', 'YOU', 'REALLY', 'PHRASE'] as const;
export function routineSlotRecord(slot: string, records: readonly string[] = CLEAN_CRATE_POOL): string | undefined {
  const picked = [...records].sort();
  const i = ROUTINE_SLOTS.indexOf(slot as typeof ROUTINE_SLOTS[number]);
  return picked.length && i >= 0 ? picked[i % picked.length] : undefined;
}

/** Reachability sentinel: sections the overlay planned bar by bar on section-local coordinates. */
export const scratchOverlayStats = { sectionBars: 0 };

/**
 * The scratch overlay a track gets (the demo's `render_scratch_section`, run section by section as
 * `hiphop.render_section` runs it; SCR-PHRASING-PARITY D2-D7): every bar is the demo's `plan_phrase` on
 * its SECTION - the bar counted from the section's start, the section's length, the seed + the bars
 * before the section - so the phrase ends are the section's bars 3, 7, 15 and its last, wherever the
 * window falls. The gestures are the profile's (`PROFILES[...]['gestures']`), the density the section's
 * on the profile's ladder, the energy the section's, one record per section (`pick_source`). A routine
 * closes a section only when asked ('auto' = the demo's `routine_for`). Every stroke the demo plans is
 * played - two on step 15 when it plans them, summed as the demo sums them.
 *
 * DEViLBOX on top (owner decision P13, 2026-10-12: the extras never change what the demo plans; they
 * only add): strokes marked `layer: 'extra'`, planned inside the mode's level and density caps and the
 * genre modifiers - the evaluation's escalation (a denser phrase: only its strokes on steps the demo left
 * empty), the vocal rule (the extras' density x (1 - vocal), a busy vocal bar keeps only their answers,
 * a vocal call that just ended gets an answer) - and one hand (an extra that would start inside any
 * sounding stroke is dropped). `extras: false` plans the demo's strokes alone.
 */
export function planScratch(ctx: ScratchPerformanceContext, opts: ScratchPlanOptions): ScratchPlan {
  const reasons: string[] = [];
  const eff = effectiveMode(ctx, opts.mode);
  if (eff.reason) reasons.push(eff.reason);
  const empty: ScratchPlan = { mode: eff.mode, events: [], bars: Array.from({ length: opts.bars }, () => []), rests: [], issues: [], reasons };
  if (eff.mode === 'OFF' || opts.bars <= 0) return empty;

  const style = ctx.style;
  const profile = SCRATCH_PROFILES[opts.profile ?? PALETTE_PROFILE[style]];
  const genre = opts.genre ?? {};
  const extrasOn = opts.extras !== false;
  // the extras' vocabulary: the profile's gestures inside the mode's level and the genre's modifiers
  const levelCap = Math.min(eff.levelCap ?? 4, genre.levelCap ?? 4, maxLevelFor(eff.mode, style) || 4);
  const inLevel = (id: ScratchGestureId): boolean => getGesture(id).difficulty <= levelCap || (eff.mode === 'SAFE' && !eff.levelCap && id === 'chirp');
  let extraVocab = [...new Set([...profile.gestures, ...(genre.bias ?? [])])].filter(inLevel);
  if (genre.durationCapSteps) {
    const fits = (id: ScratchGestureId): boolean => getGesture(id).durationSteps <= genre.durationCapSteps! && id !== 'drag';
    extraVocab = extraVocab.filter(fits);
  }
  if (opts.exclude?.length) extraVocab = extraVocab.filter((id) => !opts.exclude!.includes(id));
  // a mode cap can leave the profile with fewer than three gestures: the nearest the mode allows join (section 21)
  if (extraVocab.length < profile.gestures.length) {
    extraVocab = fillVocabulary(extraVocab, SCRATCH_GESTURE_IDS.filter((id) => inLevel(id) && !getGesture(id).flourish && !isThrowGesture(id) && !getGesture(id).needle));
    if (extrasOn) reasons.push(`${eff.mode}: extras inside level ${levelCap}: ${extraVocab.join(', ')}`);
  }

  const sectionAt = opts.sectionAt ?? ((): OverlaySection => ({
    name: ctx.sectionName,
    startBar: ctx.section?.startBar ?? opts.fromBar,
    bars: ctx.section ? Math.max(1, ctx.section.endBar - ctx.section.startBar) : opts.bars,
  }));
  const vocalByBar = opts.vocalByBar ?? Array(opts.bars).fill(ctx.vocalActivity);
  const vocalAt = (k: number): number => vocalByBar[k] ?? 0;
  const grid = DEFAULT_GRID;
  const bpb = ctx.meter;

  interface SectionPlan { natural: DensityState; extraState: DensityState; extraRate: number; routineBars: Map<number, PlacedScratch[]>; record?: string; render: OverlayRender }
  const demoProfile = profile.reference as DemoProfileName;
  const sections = new Map<string, SectionPlan>();
  const sectionPlan = (sec: OverlaySection): SectionPlan => {
    const key = `${sec.startBar}:${sec.name}`;
    const known = sections.get(key);
    if (known) return known;
    // the demo's density: the section's state on the profile's ladder, nothing else
    const natural = sectionDensity(style, sec.name, profile.scale);
    // the extras' density: shifted by the evaluation, capped by the mode, scaled by the genre (they add only
    // where it is denser than the demo's)
    const shifted = natural === 'none' ? natural : DENSITY_ORDER[Math.max(0, Math.min(DENSITY_ORDER.length - 1, DENSITY_ORDER.indexOf(natural) + Math.trunc(opts.densityShift ?? 0)))]!;
    const extraState = minDensity(shifted, MODE_MAX_DENSITY[eff.mode]);
    const extraRate = DENSITY_RATE[extraState] * (genre.densityScale ?? 1);
    reasons.push(`${sec.name} (bars ${sec.startBar}-${sec.startBar + sec.bars - 1}): the demo's ${natural}${extrasOn && extraRate > DENSITY_RATE[natural] ? `, extras up to ${extraState}` : ''}`);
    const routineBars = new Map<number, PlacedScratch[]>();
    // the demo renders the section from its own seed (the track seed + the bars before it)
    const sectionSeed = opts.seed + sec.startBar;
    const demoName = opts.routine ? (opts.routine === 'auto' ? routineFor(profile.id, sec.name) : opts.routine) : null;
    const demoRb = demoName ? Math.min(SCRATCH_ROUTINES[demoName].bars, sec.bars) : 0;
    const render = overlayRender({
      key: `${sec.startBar}:${sec.name}`, bars: sec.bars, seed: sectionSeed, profile: demoProfile,
      demoSteps: (b) => demoPhraseSteps({ style, section: sec.name, bar: b, bars: sec.bars, seed: sectionSeed, gestures: profile.gestures, scale: profile.scale }),
      routineBars: new Set(Array.from({ length: demoRb }, (_, k) => sec.bars - demoRb + k)),
    });
    // the demo's routine option: the routine takes the section's closing bars as written; a step past the section is trimmed
    if (demoName) {
      const r = SCRATCH_ROUTINES[demoName];
      const first = sec.bars - demoRb;
      const placed = r.events.filter((ev) => ev.bar * 16 + ev.step < demoRb * 16).map((ev): PlacedScratch => {
        const bar = sec.startBar + first + ev.bar + Math.floor(ev.step / 16);
        const step = ev.step % 16;
        // with a record set each word slot scratches its own record (`_routine_cues`, R12)
        const record = opts.records ? routineSlotRecord(ev.sourceRole) : undefined;
        return {
          bar, step, beat: stepToBeat({ bar, step }, grid, bpb), gesture: ev.gesture, velocity: ev.velocity, placementRole: ev.role === 'ANSWER' ? 'answer' as const : step >= 15 ? 'turnaround' as const : 'accent' as const, role: ev.role,
          render: render.routine(ev.bar, ev.step, first, ev.tail), routineSlot: ev.sourceRole, layer: 'demo', ...(record ? { record } : {}),
        };
      });
      for (let k = 0; k < demoRb; k++) routineBars.set(sec.startBar + first + k, placed.filter((p) => p.bar === sec.startBar + first + k));
      reasons.push(`routine ${demoName} closes ${sec.name} at bar ${sec.startBar + first}`);
    }
    const plan: SectionPlan = { natural, extraState, extraRate, routineBars, record: opts.records ? overlayRecord(sec.name, opts.seed + sec.startBar) : undefined, render };
    sections.set(key, plan);
    return plan;
  };

  const demoEvents: PlacedScratch[] = [];
  const extraEvents: PlacedScratch[] = [];
  const rests: PlannedRest[] = [];
  let routine: RoutineName | undefined;
  for (let k = 0; k < opts.bars; k++) {
    const bar = opts.fromBar + k;
    const sec = sectionAt(bar);
    const sp = sectionPlan(sec);
    const local = bar - sec.startBar;
    const vocal = vocalAt(k);
    const fixed = sp.routineBars.get(bar);
    const withRecord = (e: PlacedScratch): PlacedScratch => (sp.record && !e.record ? { ...e, record: sp.record } : e);
    let base: PlacedScratch[];
    if (fixed) {
      base = fixed;
      routine = (opts.routine === 'auto' ? routineFor(profile.id, sec.name) : opts.routine) ?? undefined;
    } else {
      scratchOverlayStats.sectionBars++;
      base = planPhrase({ style, section: sec.name, bar: local, bars: sec.bars, seed: opts.seed + sec.startBar, gestures: profile.gestures, scale: profile.scale, density: sp.natural, beatsPerBar: bpb, grid, demo: true })
        .map((e) => ({ ...e, bar, beat: stepToBeat({ bar, step: e.step }, grid, bpb), render: sp.render.stroke(local, e.step), layer: 'demo' as const }));
    }
    demoEvents.push(...base.map(withRecord));
    if (!extrasOn || fixed || extraVocab.length === 0) continue;
    // the escalation and the genre: a denser phrase than the demo's adds its strokes on the steps the demo left empty
    let extra: PlacedScratch[] = [];
    const rate = sp.extraRate * (1 - Math.max(0, Math.min(1, vocal)));
    if (rate > DENSITY_RATE[sp.natural] + 1e-12) {
      const taken = new Set(base.map((e) => e.step));
      extra = planPhrase({ style, section: sec.name, bar: local, bars: sec.bars, seed: opts.seed + sec.startBar, gestures: extraVocab, scale: profile.scale, density: sp.extraState, rateOverride: rate, beatsPerBar: bpb, grid })
        .filter((e) => !taken.has(e.step))
        .map((e) => ({ ...e, bar, beat: stepToBeat({ bar, step: e.step }, grid, bpb), render: sp.render.stroke(local, e.step, false), layer: 'extra' as const }));
    }
    // section 24: a busy vocal bar keeps only the extras' answers; a vocal call just ended gets an answer
    if (vocal > VOCAL_BUSY && extra.length) {
      const answers = extra.filter((e) => e.role === 'ANSWER').slice(0, 2);
      if (answers.length < extra.length) rests.push({ bar, reason: 'vocal', role: extra[0]!.role });
      extra = answers;
    }
    const afterCall = k > 0 && vocalAt(k - 1) > VOCAL_BUSY && vocal <= VOCAL_BUSY;
    if (afterCall && ![...base, ...extra].some((e) => e.role === 'ANSWER') && DENSITY_RATE[sp.natural] > 0) {
      const rnd = lfsr(barSeed(opts.seed + sec.startBar, local, sec.name) + 0x5a);
      const energy = SECTION_ENERGY[sec.name as ScratchSection] ?? 0.4;
      const g = pickGesture(vocabulary(extraVocab), energy, 'answer', rnd, null);
      extra.push({ bar, step: 8, beat: stepToBeat({ bar, step: 8 }, grid, bpb), gesture: g, velocity: Math.min(1, PLAN_VEL.base + PLAN_VEL.rand * rnd() + PLAN_VEL.energy * energy), placementRole: 'answer', role: 'ANSWER', render: sp.render.stroke(local, 8, false), layer: 'extra' });
    }
    extraEvents.push(...extra.map(withRecord));
  }

  const events = onTopOfTheDemo(demoEvents, extraEvents);
  const finalBars = Array.from({ length: opts.bars }, (_, k) => events.filter((e) => e.bar === opts.fromBar + k));
  return { mode: eff.mode, events, bars: finalBars, rests, routine, issues: validatePhrase(finalBars), reasons };
}

/**
 * P13: the demo's strokes, all of them, plus the DEViLBOX extras one hand can add - an extra that would
 * start inside a sounding stroke (the demo's or an extra already kept), or run into one, is dropped. Time order.
 */
export function onTopOfTheDemo<T extends Pick<PlacedScratch, 'beat' | 'gesture'> & { beats?: number }>(demo: readonly T[], extras: readonly T[]): T[] {
  const kept: T[] = [];
  for (const e of [...extras].sort((x, y) => x.beat - y.beat)) {
    if (demo.some((d) => overlapsOneHand(d, e)) || kept.some((d) => overlapsOneHand(d, e))) continue;
    kept.push(e);
  }
  return [...demo, ...kept].sort((x, y) => x.beat - y.beat);
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

/**
 * Placed scratches + their source -> the executor's `ScratchEvent`s (the gesture's one length,
 * whole stroke cycles). The plan speaks bars (bar 0 = the downbeat grid's first bar); the
 * executor's clock speaks raw beats (`fractionalBeatAt`), so each event's beat is its bar's
 * downbeat on that clock (`barStartBeat`, the grid's `phaseOffset` included) plus its step (SA-M1).
 */
export function toScratchEvents(
  events: readonly PlacedScratch[],
  source: ScratchSource,
  anchor: ScratchAnchor | DeckScratchAnchor,
  opts: { bpm: number; seed: number; downbeats: Parameters<typeof barStartBeat>[0]; deck?: 'A' | 'B'; humanize?: boolean; fx?: ScratchEvent['fx'] },
): ScratchEvent[] {
  const offsets = opts.humanize === false ? events.map(() => 0) : humanizeAll(events, opts.bpm, opts.seed);
  return events.map((e, i) => {
    const g = getGesture(e.gesture);
    return {
      executeAtBeat: barStartBeat(opts.downbeats, e.bar) + e.step / STEPS_PER_BEAT[DEFAULT_GRID],
      durationBeats: e.beats ?? gestureBeats(e.gesture),
      role: e.role,
      source,
      anchor,
      gesture: e.gesture,
      velocity: e.velocity,
      // a demo routine's stroke carries the demo's own human timing, in samples, on the bus
      humanizeMs: e.render ? 0 : offsets[i]!,
      intensity: g.intensity,
      deck: opts.deck,
      returnToAnchor: g.returnsToAnchor && !isThrowGesture(e.gesture),
      ...(opts.fx ? { fx: opts.fx } : {}),
      ...(e.render ? { render: e.render } : {}),
    };
  });
}
