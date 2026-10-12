/**
 * The Auto Scratch controller (owner plan `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md`
 * sections 4, 8, 21, 83; ledger SCR-P4.R4, P5-P8). `DJAutoDJ` is not the brain (section 4):
 * it calls `tick()` from its poll with the performance context, and this controller
 *
 *   context (`buildScratchContext`)  ->  plan the next phrase window (`planScratch`)
 *   ->  source + anchor  ->  executor events (`toScratchEvents`)  ->  `ScratchExecutor.schedule`
 *
 * One phrase is planned ahead: when the master deck enters the bar before the planned window
 * ends, the window up to the next phrase boundary is planned. The plan speaks bars, the
 * executor speaks the master deck's beat clock; nothing here touches an engine.
 */

import { barStartBeat, timeAtBeat, timelineAt } from '../autodj/beatGrid';
import type { DJPerformanceContext, DJTrackAnalysis } from '../autodj/types';
import { buildScratchContext, type ScratchPerformanceContext } from './scratchContext';
import { planScratch, toScratchEvents, type ScratchPlan, type ScratchPlanOptions } from './scratchPlanner';
import type { ThrowMemory } from './scratchPlacement';
import type { ScratchMode } from './scratchStyles';
import { anchorFor } from './scratchAnchor';
import type { ScratchRecord } from './scratchCatalogue';
import { selectScratchSource, type SourceDecision, type SourceRequest, type TrackerSampleInfo } from './ScratchSourceSelector';
import { ScratchMemory } from './scratchMemory';
import { PerformanceBudget, performancePermissions } from './scratchBudget';
import { ScratchStateMachine, type ScratchState } from './scratchStateMachine';
import { evaluatePhrase, type PhraseDecision, type PhraseEvaluation, type PhraseTrace } from './scratchEvaluate';
import { findOpportunity, type ScratchOpportunity } from './scratchOpportunity';
import { arcForSection, phaseAt, planArc, type ArcPhaseName, type ArcTemplate } from './scratchArc';
import { SCRATCH_GESTURE_IDS } from './scratchGestureCatalog';
import type { ScratchGenreHint } from './scratchStyles';
import type { ScratchDJStyle, ScratchEvent, ScratchSource, ScratchAnchor, DeckScratchAnchor } from './scratchTypes';

type AB = 'A' | 'B';

/** What the controller needs of the executor (the real `ScratchExecutor`). */
export interface ScratchEventSink {
  schedule(event: ScratchEvent): unknown;
  cancel(): void;
  readonly active: number;
}

/** A chosen source for a planned window; `record` when it is a crate record (throws, anchors). */
export interface ChosenScratchSource {
  source: ScratchSource;
  anchor: ScratchAnchor | DeckScratchAnchor;
  record?: ScratchRecord;
  /** The selector's decision: score terms and reasons (decision log). */
  decision?: SourceDecision;
}

export interface ScratchTickInput {
  perf: DJPerformanceContext;
  /** The deck the plan is played against (its beat clock). */
  deck: AB;
  mode: ScratchMode;
  style: ScratchDJStyle;
  /** Hands budget grant (section 27); 0 = nothing is scratched. */
  scratchPermission: number;
  genre?: ScratchPlanOptions['genre'];
  /** Section 33 genre the source selector reads (house / techno favour the live deck). */
  genreHint?: ScratchGenreHint | 'unknown';
  /** Scratchable instruments of a tracker deck's song (P5.6). */
  trackerSamples?: readonly TrackerSampleInfo[];
  juggleIntensity?: number;
  transitionIntensity?: number;
  /** A transition owns the decks (performance mode NORMAL_MIX): plan nothing new, let what runs finish. */
  hold?: boolean;
  /** A juggle is running (sections 26, 49): only crate accents and answers, never a deck, never a feature. */
  juggleActive?: boolean;
}

export interface ScratchDJDeps {
  /** The executor on `deck`'s beat clock for `track` (cached by the controller per deck + track). */
  executorFor(deck: AB, track: DJTrackAnalysis): ScratchEventSink;
  /** Source selection; `selectScratchSource` (section 13) when omitted. */
  chooseSource?(ctx: ScratchPerformanceContext, plan: ScratchPlan, input: ScratchTickInput, recent: readonly string[]): ChosenScratchSource | null;
  /** Get a chosen source ready before its first event (a TRACKER_SAMPLE is decoded into the voice pool:
   *  `loadTrackerSample`); the plan is a bar ahead, so the load lands before the stroke. */
  prepareSource?(chosen: ChosenScratchSource, input: ScratchTickInput): void | Promise<unknown>;
  /** Every phrase's evaluation (section 52) - quality, decision, reason. */
  onEvaluation?(evaluation: PhraseEvaluation, ctx: ScratchPerformanceContext): void;
  /** Every source decision, with its score terms (the Auto DJ decision log, P7.12). */
  onSourceDecision?(decision: SourceDecision, ctx: ScratchPerformanceContext): void;
  seed?: number;
  onPlan?(plan: ScratchPlan, events: readonly ScratchEvent[], ctx: ScratchPerformanceContext): void;
}

export interface ScratchDJTickResult {
  planned: boolean;
  scheduled: number;
  reason?: string;
}

/** Reachability sentinels (SCR-P4.R4). */
export const scratchDJStats = { ticks: 0, plans: 0, scheduled: 0 };

/** The section 13 selector over the plan's roles and gestures (the default `chooseSource`). */
export function selectorSource(ctx: ScratchPerformanceContext, plan: ScratchPlan, input: ScratchTickInput, recent: readonly string[], memory: Pick<SourceRequest, 'blocked' | 'preference'> = {}): ChosenScratchSource | null {
  const track = input.perf.currentTrack;
  if (!track) return null;
  const performed = plan.events.filter((e) => e.gesture !== 'drop' && e.gesture !== 'dropPhrase');
  const roles = [...new Set(performed.map((e) => e.role))];
  const decision = selectScratchSource({
    ctx, track, deck: input.deck, roles: roles.length ? roles : ['THEME'], gestures: performed.map((e) => e.gesture),
    bar: plan.events[0]?.bar ?? ctx.masterBar + 1, genre: input.genreHint, trackerSamples: input.trackerSamples, recent, ...memory,
  });
  if (!decision) return null;
  const c = decision.candidate;
  return { source: c.source, anchor: c.anchor, record: c.record, decision };
}

/** Budget energy a performed scratch adds (section 55); a feature lifts the total to 75 itself. */
const BUDGET_PER_EVENT = 3;

/** One scheduled event of the window being performed, for the phrase's evaluation. */
interface WindowEntry { event: ScratchEvent; run: unknown; sourceKey: string; bar: number; bassSource: boolean; anchorQuality: number }

/** The window being performed: what was scheduled, and an arc when it is a feature. */
interface PerformedWindow {
  fromBar: number;
  toBar: number;
  entries: WindowEntry[];
  arc: ArcTemplate | null;
  energyBefore: number;
  setEnergyBefore: number;
  plan: ScratchPlan;
  /** The evaluation's decision the window was planned under. */
  intent: PhraseDecision;
  /** The performer entered the window's state (on its first bar). */
  started: boolean;
}

/** What the debug view and the decision log read (section 64; P9.5 builds the full record). */
export interface ScratchDJTelemetry {
  state: ScratchState;
  mode: ScratchMode;
  style: ScratchDJStyle | null;
  bar: number;
  /** The arc phase of the current bar while a feature plays. */
  arcPhase: ArcPhaseName | null;
  /** Arc phase labels of the bars played so far in the current / last feature. */
  arcPhases: ArcPhaseName[];
  budget: number;
  budgetBand: string;
  peak: boolean;
  source: string | null;
  opportunity: ScratchOpportunity | null;
  lastEvaluation: PhraseEvaluation | null;
  reasons: string[];
}

export class DJScratchDJ {
  private readonly deps: ScratchDJDeps;
  private sink: { key: string; exec: ScratchEventSink } | null = null;
  /** First bar not yet planned on the current track. */
  private plannedThroughBar = -1;
  private trackKey = '';
  private lastBar = -1;
  private readonly throwMemory: ThrowMemory = {};
  readonly memory = new ScratchMemory();
  readonly budget = new PerformanceBudget();
  readonly states = new ScratchStateMachine();
  /** Windows planned and not yet evaluated (the next one is planned a bar before this one ends). */
  private windows: PerformedWindow[] = [];
  private intent: PhraseDecision = 'continue';
  private lastMode: ScratchMode = 'OFF';
  private lastStyle: ScratchDJStyle | null = null;
  private lastSource: string | null = null;
  private lastOpportunity: ScratchOpportunity | null = null;
  private lastEvaluation: PhraseEvaluation | null = null;
  private lastPeak = false;
  private arcPhases: ArcPhaseName[] = [];
  private currentArcPhase: ArcPhaseName | null = null;
  /** Last plan (telemetry, P9.5). */
  lastPlan: ScratchPlan | null = null;

  constructor(deps: ScratchDJDeps) {
    this.deps = deps;
  }

  get state(): ScratchState { return this.states.state; }

  /** Drop every planned event and forget the window (mode off, track change, seek): ABORTING -> IDLE,
   *  the executor's cancel giving back what the run touched (section 60). */
  reset(reason = 'reset'): void {
    this.states.abort(reason, () => this.sink?.exec.cancel(), this.lastBar);
    if (this.states.state === 'IDLE' && this.sink && this.sink.exec.active > 0) this.sink.exec.cancel();
    this.plannedThroughBar = -1;
    this.lastBar = -1;
    this.windows = [];
    this.intent = 'continue';
    this.currentArcPhase = null;
  }

  telemetry(): ScratchDJTelemetry {
    return {
      state: this.states.state, mode: this.lastMode, style: this.lastStyle, bar: this.lastBar,
      arcPhase: this.currentArcPhase, arcPhases: [...this.arcPhases],
      budget: this.budget.total, budgetBand: this.budget.band, peak: this.lastPeak,
      source: this.lastSource, opportunity: this.lastOpportunity, lastEvaluation: this.lastEvaluation,
      reasons: this.lastPlan?.reasons ?? [],
    };
  }

  tick(input: ScratchTickInput): ScratchDJTickResult {
    scratchDJStats.ticks++;
    this.lastMode = input.mode;
    this.lastStyle = input.style;
    const track = input.perf.currentTrack;
    if (input.mode === 'OFF' || input.scratchPermission <= 0 || !track) {
      if (this.states.state !== 'IDLE') this.reset(!track ? 'no track' : input.mode === 'OFF' ? 'mode off' : 'no scratch permission');
      return { planned: false, scheduled: 0, reason: !track ? 'no track' : input.mode === 'OFF' ? 'mode off' : 'no scratch permission' };
    }
    const ctx = buildScratchContext({
      perf: input.perf, style: input.style, scratchPermission: input.scratchPermission,
      juggleIntensity: input.juggleIntensity, transitionIntensity: input.transitionIntensity, memory: this.memory.recent(),
    });
    if (!ctx) return { planned: false, scheduled: 0, reason: 'no context' };

    // a new track, a new deck or a jump back invalidates what is planned
    const key = `${input.deck}:${track.id}`;
    if (key !== this.trackKey || ctx.masterBar < this.lastBar) {
      if (this.states.state !== 'IDLE') this.reset(key !== this.trackKey ? 'track changed' : 'position jumped back');
      this.trackKey = key;
    }
    if (this.states.state === 'IDLE') this.states.go('LISTENING', 'Auto Scratch on', ctx.masterBar);
    if (ctx.masterBar !== this.lastBar) this.onBar(ctx, track, input);
    this.lastBar = ctx.masterBar;
    if (!this.sink || this.sink.key !== key) this.sink = { key, exec: this.deps.executorFor(input.deck, track) };

    // a transition owns the decks: nothing new is planned (what runs finishes on its own)
    if (input.hold) return { planned: false, scheduled: 0, reason: 'a transition owns the decks' };
    // plan the window that starts on the next bar
    const fromBar = Math.max(ctx.masterBar + 1, this.plannedThroughBar);
    if (fromBar > ctx.masterBar + 1) return { planned: false, scheduled: 0 };
    return this.planWindow(ctx, track, input, fromBar);
  }

  /** A new bar: the budget decays, an arc reports its phase, a finished window is evaluated (section 52). */
  private onBar(ctx: ScratchPerformanceContext, track: DJTrackAnalysis, input: ScratchTickInput): void {
    if (this.lastBar >= 0) this.budget.tickBar(Math.max(1, ctx.masterBar - this.lastBar));
    for (const done of this.windows.filter((x) => ctx.masterBar >= x.toBar)) this.finishWindow(done, ctx, track, input);
    // a window starts on its first bar: the performer sets up and plays it (section 51)
    for (const next of this.windows.filter((x) => !x.started && ctx.masterBar >= x.fromBar)) {
      next.started = true;
      if (next.entries.length) this.enterPerforming(next.plan, next.arc, next.intent, ctx.masterBar);
      else if (this.states.state === 'LISTENING') this.states.go('REST', next.plan.reasons.at(-1) ?? 'a planned rest', ctx.masterBar);
    }
    const w = this.windows.find((x) => ctx.masterBar >= x.fromBar && ctx.masterBar < x.toBar);
    if (w?.arc) {
      const phase = phaseAt(w.arc, ctx.masterBar - w.fromBar);
      this.currentArcPhase = phase?.name ?? null;
      if (phase) this.arcPhases.push(phase.name);
    } else {
      this.currentArcPhase = null;
    }
  }

  private finishWindow(w: PerformedWindow, ctx: ScratchPerformanceContext, track: DJTrackAnalysis, input: ScratchTickInput): void {
    this.windows = this.windows.filter((x) => x !== w);
    const performing = this.states.state;
    if (performing !== 'REST' && performing !== 'LISTENING') this.states.go('REST', 'phrase ended', ctx.masterBar);
    if (w.entries.length === 0) return;
    const beatSec = 60 / Math.max(1, track.bpm);
    const at = (beat: number): number => timeAtBeat(track.beatGrid, beat);
    const vocalByBar: Record<number, number> = {};
    const bassByBar: Record<number, number> = {};
    for (let b = w.fromBar; b < w.toBar; b++) {
      const t = at(barStartBeat(track.downbeats, b));
      vocalByBar[b] = timelineAt(track.vocalActivity.values, track.vocalActivity.hopSec, t);
      bassByBar[b] = timelineAt(track.bassActivity.values, track.bassActivity.hopSec, t);
    }
    const nextT = at(barStartBeat(track.downbeats, w.toBar));
    const trace: PhraseTrace = {
      events: w.entries.map((x) => {
        const started = (x.run as { startedBeat?: number | null } | undefined)?.startedBeat;
        const scheduledSec = at(x.event.executeAtBeat) + x.event.humanizeMs / 1000;
        return {
          bar: x.bar, gesture: x.event.gesture, role: x.event.role, sourceKey: x.sourceKey, bassSource: x.bassSource,
          intensity: x.event.intensity, scheduledSec,
          // the executor reports the beat it handed the stroke to the engine for (humanize included)
          firedSec: typeof started === 'number' ? at(x.event.executeAtBeat) + (started - x.event.executeAtBeat) * beatSec : null,
          anchorQuality: x.anchorQuality,
        };
      }),
      vocalByBar, bassByBar,
      energyBefore: w.energyBefore, energyAfter: ctx.energy,
      setEnergyTrend: input.perf.setEnergy - w.setEnergyBefore,
      nextBarVocal: timelineAt(track.vocalActivity.values, track.vocalActivity.hopSec, nextT),
    };
    const previous = this.memory.entries.filter((e) => e.bar < w.fromBar).map((e) => `${e.sourceKey}+${e.gesture}`);
    const ev = evaluatePhrase(trace, ctx, this.memory, previous);
    this.memory.recordQuality(this.memory.entries.filter((e) => e.bar >= w.fromBar && e.bar < w.toBar), ev.quality.total);
    this.lastEvaluation = ev;
    this.intent = ev.decision;
    this.deps.onEvaluation?.(ev, ctx);
  }

  private planWindow(ctx: ScratchPerformanceContext, track: DJTrackAnalysis, input: ScratchTickInput, fromBar: number): ScratchDJTickResult {
    const phraseStart = ctx.masterBar - ctx.barInPhrase;
    const phraseBars = Math.max(1, ctx.phraseBars);
    let toBar = phraseStart + phraseBars;
    while (toBar <= fromBar) toBar += phraseBars;
    const seed = this.deps.seed ?? 1;
    const setPhase = input.perf.setPhase;
    this.lastOpportunity = findOpportunity({ ...ctx, masterBar: toBar - 1, barInPhrase: phraseBars - 1 });

    // a feature (section 30): the section calls for an arc, the window starts on a phrase, the
    // performer plays features (PERFORMER, BATTLE) and the last one has cooled down (section 54)
    const shape = arcForSection(ctx.nextSection && ctx.nextSection.startBar === fromBar ? ctx.nextSection.kind : ctx.section?.kind, setPhase);
    const featureMode = input.mode === 'PERFORMER' || input.mode === 'BATTLE';
    const onPhrase = (fromBar - phraseStart) % phraseBars === 0;
    const wantsFeature = !!shape.template && featureMode && !input.juggleActive && onPhrase && this.memory.featureReady(fromBar) && this.intent !== 'rest'
      && (shape.role !== 'peakBurst' || this.memory.battleReady(fromBar) || input.mode !== 'BATTLE');
    let plan: ScratchPlan;
    let arc: ArcTemplate | null = null;
    const exclude = this.memory.coolingGestures(fromBar, SCRATCH_GESTURE_IDS);
    if (wantsFeature) {
      arc = shape.template!;
      toBar = fromBar + arc.bars;
      this.budget.feature();
      const perm = performancePermissions({ setPhase, budgetTotal: this.budget.total, mode: input.mode });
      this.lastPeak = perm.peak;
      const a = planArc({ arc, startBar: fromBar, style: ctx.style, mode: input.mode, seed: seed + fromBar, levelCap: perm.maxLevel || undefined, exclude, beatsPerBar: ctx.meter });
      // the feature's cooldown runs from its end (section 54)
      this.memory.recordPerformance(shape.role === 'peakBurst' ? 'battle' : 'feature', toBar);
      this.arcPhases = [];
      plan = {
        mode: input.mode, events: a.events, bars: Array.from({ length: arc.bars }, (_, k) => a.events.filter((e) => e.bar === fromBar + k)),
        rests: [], issues: [], reasons: [`${shape.role}: ${arc.name} arc over ${arc.bars} bars`, perm.reason],
      };
    } else {
      this.lastPeak = false;
      const vocalByBar = Array.from({ length: toBar - fromBar }, (_, k) => {
        const b = track.downbeats.bars[fromBar + k];
        return b ? timelineAt(track.vocalActivity.values, track.vocalActivity.hopSec, b.start) : ctx.vocalActivity;
      });
      const densityShift = this.intent === 'escalate' ? 1 : this.intent === 'resolve' ? -1 : 0;
      const opts = { mode: input.mode, seed, fromBar, bars: toBar - fromBar, vocalByBar, genre: input.genre, exclude, densityShift };
      // a planned rest after a phrase that collided with the vocal (section 52)
      plan = this.intent === 'rest'
        ? { mode: input.mode, events: [], bars: [], rests: [], issues: [], reasons: [`rest: ${this.lastEvaluation?.reason ?? 'evaluation'}`] }
        : planScratch(ctx, opts);
    }
    this.plannedThroughBar = toBar;
    if (input.juggleActive) plan = juggleSafe(plan);

    // the source is chosen before the throw: a crate record opens its phrase with one (section 41)
    const chosen = plan.events.length ? this.chooseSource(ctx, plan, input, fromBar) : null;
    if (chosen?.record && !arc) {
      const vocalByBar = Array.from({ length: toBar - fromBar }, (_, k) => {
        const b = track.downbeats.bars[fromBar + k];
        return b ? timelineAt(track.vocalActivity.values, track.vocalActivity.hopSec, b.start) : ctx.vocalActivity;
      });
      plan = planScratch(ctx, { mode: input.mode, seed, fromBar, bars: toBar - fromBar, vocalByBar, genre: input.genre, exclude, densityShift: this.intent === 'escalate' ? 1 : this.intent === 'resolve' ? -1 : 0, record: chosen.record, throwMemory: this.throwMemory });
    }
    if (input.juggleActive) plan = juggleSafe(plan);
    scratchDJStats.plans++;
    this.lastPlan = plan;
    const intent = this.intent;
    this.intent = 'continue';
    if (!chosen || plan.events.length === 0) {
      this.windows.push({ fromBar, toBar, entries: [], arc: null, energyBefore: ctx.energy, setEnergyBefore: input.perf.setEnergy, plan, intent, started: false });
      return { planned: true, scheduled: 0, reason: chosen ? 'a planned rest' : plan.events.length ? 'no source' : 'a planned rest' };
    }

    const events = toScratchEvents(plan.events, chosen.source, chosen.anchor, {
      bpm: ctx.bpm, seed: seed + fromBar, downbeats: track.downbeats, deck: input.deck,
    }).map((e) => (chosen.source.type === 'CRATE' ? { ...e, anchor: anchorFor(chosen.source, e.role) ?? e.anchor } : e));
    // only what is still ahead of the clock
    const now = ctx.masterBeat;
    const firstBeat = barStartBeat(track.downbeats, fromBar) - 1e-9;
    const sourceKey = chosen.decision?.candidate.key ?? sourceKeyOf(chosen.source);
    const bassSource = chosen.decision?.candidate.material === 'bass';
    const anchorQuality = chosen.decision?.candidate.anchorQuality ?? 1;
    const entries: WindowEntry[] = [];
    plan.events.forEach((p, i) => {
      const e = events[i]!;
      if (e.executeAtBeat < now || e.executeAtBeat < firstBeat) return;
      const run = this.sink!.exec.schedule(e);
      entries.push({ event: e, run, sourceKey, bar: p.bar, bassSource, anchorQuality });
      this.memory.record({ bar: p.bar, gesture: e.gesture, sourceKey, intensity: e.intensity, transitionType: ctx.transitionType, section: ctx.sectionName, nextSection: ctx.nextSection?.kind, routine: plan.routine });
      this.budget.add('scratch', BUDGET_PER_EVENT);
    });
    this.windows.push({ fromBar, toBar, entries, arc, energyBefore: ctx.energy, setEnergyBefore: input.perf.setEnergy, plan, intent, started: false });
    scratchDJStats.scheduled += entries.length;
    this.deps.onPlan?.(plan, entries.map((x) => x.event), ctx);
    return { planned: true, scheduled: entries.length };
  }

  /** Section 51: the performing state the window plays in, by the evaluation's intent and the plan. */
  private enterPerforming(plan: ScratchPlan, arc: ArcTemplate | null, intent: PhraseDecision, bar: number): void {
    const m = this.states;
    if (m.state === 'REST' && intent === 'escalate') { m.go('ESCALATING', 'escalate', bar); m.go(arc ? 'FEATURE' : 'SCRATCHING', 'escalated phrase', bar); return; }
    if (m.state === 'REST' && intent === 'resolve' && !arc) { m.go('RESOLVING', 'resolve', bar); return; }
    if (m.state === 'REST' && intent === 'answer' && !arc) { m.go('RESPONSE', 'answer', bar); return; }
    if (m.state === 'REST') m.go('LISTENING', 'listening', bar);
    const roles = plan.events.map((e) => e.role);
    m.go('SETUP', this.lastOpportunity?.reason ?? 'opportunity', bar);
    const throws = plan.events[0]?.gesture === 'drop' || plan.events[0]?.gesture === 'dropPhrase';
    if (throws) m.go('THROW', 'throw', bar);
    if (arc) m.go('FEATURE', 'feature', bar);
    else if (roles.includes('THEME') && roles.includes('ANSWER')) m.go('CALL', 'call and response', bar);
    else m.go('SCRATCHING', 'phrase', bar);
  }

  private chooseSource(ctx: ScratchPerformanceContext, plan: ScratchPlan, input: ScratchTickInput, bar: number): ChosenScratchSource | null {
    const recent = this.memory.recent().recentSources;
    const leading = plan.events.find((e) => e.gesture !== 'drop' && e.gesture !== 'dropPhrase')?.gesture;
    const chosen = this.deps.chooseSource
      ? this.deps.chooseSource(ctx, plan, input, recent)
      : selectorSource(ctx, plan, input, recent, {
          // under a juggle the decks are the juggle's: crate records only (sections 26, 49)
          blocked: (key) => !this.memory.sourceReady(key, bar) || (!!input.juggleActive && !key.startsWith('crate:')),
          preference: (c) => (leading ? this.memory.preference(c.key, leading, ctx.sectionName, ctx.nextSection?.kind) : 0),
        });
    if (chosen?.decision) this.deps.onSourceDecision?.(chosen.decision, ctx);
    this.lastSource = chosen ? (chosen.decision?.candidate.key ?? sourceKeyOf(chosen.source)) : null;
    if (chosen && this.deps.prepareSource) {
      void Promise.resolve(this.deps.prepareSource(chosen, input)).catch((err) => console.warn('[DJScratchDJ] source not ready:', err));
    }
    return chosen;
  }
}

/** Under a running juggle a scratch only answers or accents (sections 26, 49). */
function juggleSafe(plan: ScratchPlan): ScratchPlan {
  const events = plan.events.filter((e) => e.role === 'ANSWER' || e.role === 'ACCENT');
  if (events.length === plan.events.length) return plan;
  return { ...plan, events, bars: plan.bars.map((b) => b.filter((e) => events.includes(e))), reasons: [...plan.reasons, 'a juggle runs: answers and accents only'] };
}

/** A stable key for a source chosen without the selector. */
export function sourceKeyOf(source: ScratchSource): string {
  switch (source.type) {
    case 'CRATE': return `crate:${source.recordId}`;
    case 'DECK': return `deck:${source.deck}`;
    case 'TRACKER_CHANNEL': return `channel:${source.deck}:${source.segmentId}`;
    case 'TRACKER_SAMPLE': return `sample:${source.deck}:${source.sampleId}`;
  }
}
