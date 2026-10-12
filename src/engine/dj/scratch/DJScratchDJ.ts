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
import { buildScratchContext, scratchSectionFor, type ScratchPerformanceContext } from './scratchContext';
import { planJuggleResponse, planScratch, toScratchEvents, type OverlaySection, type ScratchPlan, type ScratchPlanOptions } from './scratchPlanner';
import { buildScratchDjRoutine, buildThreeDeckRoutine, demoRoutineToPlaced, overlayRecord, SCRATCH_DJ_TEMPLATE, THREE_DECK_TEMPLATE, validateScratchDjRoutine } from './scratchDemoRoutines';
import type { RoutineName } from './scratchRoutines';
import type { ScratchProfileId } from './scratchStyles';
import type { JugglePhase } from '../autodj/juggle/juggleTypes';
import { SCRATCH_STYLES, type ScratchMode } from './scratchStyles';
import { anchorFor } from './scratchAnchor';
import { getScratchRecord, type ScratchRecord } from './scratchCatalogue';
import { selectScratchSource, type SourceDecision, type SourceRequest, type TrackerSampleInfo } from './ScratchSourceSelector';
import { ScratchMemory } from './scratchMemory';
import { PerformanceBudget, performancePermissions } from './scratchBudget';
import { ScratchStateMachine, type ScratchState } from './scratchStateMachine';
import { evaluatePhrase, type PhraseDecision, type PhraseEvaluation, type PhraseTrace } from './scratchEvaluate';
import { findOpportunity, type ScratchOpportunity } from './scratchOpportunity';
import { checkScratch, checkStuck, type SafetyRule, type SafetyState } from './ScratchSafety';
import { scratchCost } from '../autodj/performanceBudget';
import { GESTURE_LEVELS } from './scratchGestureCatalog';
import { arcForSection, phaseAt, planArc, type ArcPhaseName, type ArcTemplate } from './scratchArc';
import type { ScratchGenreHint } from './scratchStyles';
import type { ScratchGestureId, ScratchDJStyle, ScratchEvent, ScratchSource, ScratchAnchor, DeckScratchAnchor } from './scratchTypes';

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
  /** The demo profile the overlay plays (the subgenre's, else the palette's). */
  profile?: ScratchProfileId;
  /** The overlay's routine option (the demo's default: none; 'auto' = `routine_for` closes each section). */
  routine?: 'auto' | RoutineName | null;
  /** Section 33 genre the source selector reads. */
  genreHint?: ScratchGenreHint | 'unknown';
  /** Scratchable instruments of a tracker deck's song (P5.6). The Auto DJ scratches crate records only
   *  (the demo never scratches the music, SCR-PHRASING-PARITY D1): a selector override may still read them. */
  trackerSamples?: readonly TrackerSampleInfo[];
  juggleIntensity?: number;
  transitionIntensity?: number;
  /** A transition owns the decks (performance mode NORMAL_MIX): plan nothing new, let what runs finish. */
  hold?: boolean;
  /** A juggle is running (sections 26, 49): only crate accents and answers, never a deck, never a feature. */
  juggleActive?: boolean;
  /** The running juggle's grammar on the master's beat clock (section 49): with 2+ hands left the
   *  scratch plays the juggle response over its phases. Phase beats are relative to `startBeat`. */
  juggleShape?: { startBeat: number; phases: ReadonlyArray<{ phase: JugglePhase; startBeat: number; endBeat: number }> } | null;
  /** Which decks play now (the governor's no-silence rule); the master deck alone when omitted. */
  decksPlaying?: Readonly<Record<AB, boolean>>;
  /** The user touched a control the performer uses (platter, crossfader, a scratch pad): yield (section 63). */
  userControl?: string | null;
  /** Seconds until the planned transition starts (null: none planned). A transition inside the window
   *  keeps the decks still: crate records only, no feature (section 28: deck sync before a scratch). */
  transitionInSec?: number | null;
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
  /** A transient record the pool holds (the governor's tracker-sample check). */
  hasRecord?(id: string): boolean;
  /** Every event the governor refused, with its rule (section 59). */
  onRefused?(event: ScratchEvent, rule: SafetyRule, reason: string): void;
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
export const scratchDJStats = { ticks: 0, plans: 0, scheduled: 0, juggleResponses: 0, bookends: 0 };

/** The section 13 selector over the plan's roles and gestures (the default `chooseSource`). */
export function selectorSource(ctx: ScratchPerformanceContext, plan: ScratchPlan, input: ScratchTickInput, recent: readonly string[], memory: Pick<SourceRequest, 'blocked' | 'preference'> = {}): ChosenScratchSource | null {
  const track = input.perf.currentTrack;
  if (!track) return null;
  const performed = plan.events.filter((e) => e.gesture !== 'drop' && e.gesture !== 'dropPhrase' && e.gesture !== 'needleDrop' && e.gesture !== 'needleLift');
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
  /** Beat each deck is scratched until (the governor's one-hand-per-deck rule). */
  private deckBusyUntil: Partial<Record<AB, number>> = {};
  private lastEventBar: number | null = null;
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
    this.deckBusyUntil = {};
    this.lastEventBar = null;
  }

  /**
   * Hands the scratch holds now (section 27): 0 while idle, listening or resting; else the cost of the
   * hardest gesture in the windows being performed (short 1, complex / feature 2, a battle feature 4).
   * The juggle planner gets what is left (`TickInput.otherHands`).
   */
  handsInUse(): number {
    const st = this.states.state;
    if (st === 'IDLE' || st === 'LISTENING' || st === 'REST' || st === 'ABORTING' || !this.windows.length) return 0;
    let maxLevel = 0;
    for (const w of this.windows) for (const e of w.entries) maxLevel = Math.max(maxLevel, GESTURE_LEVELS[e.event.gesture] ?? 0);
    const feature = st === 'FEATURE' || st === 'ESCALATING';
    return scratchCost({ maxLevel, feature, battle: feature && this.lastMode === 'BATTLE' });
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
    // section 63: the user's hand wins - yield now, listen again next tick (never resume the phrase)
    if (input.userControl && this.states.state !== 'IDLE') {
      this.reset(`user control: ${input.userControl}`);
      return { planned: false, scheduled: 0, reason: `user control: ${input.userControl}` };
    }
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
    // section 59: a performing state with nothing played for 8 bars is stuck
    const performing = !['IDLE', 'LISTENING', 'REST', 'ABORTING'].includes(this.states.state);
    if (!checkStuck(performing, ctx.masterBar, this.lastEventBar).ok) { this.reset('stuck: no scratch for 8 bars'); this.states.go('LISTENING', 'after a stuck phrase', ctx.masterBar); return; }
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
    const barSec = (60 / Math.max(1, ctx.bpm)) * Math.max(1, ctx.meter);
    const decksStill = !!input.juggleActive || (input.transitionInSec != null && input.transitionInSec < (toBar - ctx.masterBar + 1) * barSec);
    const wantsFeature = !!shape.template && featureMode && !decksStill && onPhrase && this.memory.featureReady(fromBar) && this.intent !== 'rest'
      && (shape.role !== 'peakBurst' || this.memory.battleReady(fromBar) || input.mode !== 'BATTLE');
    let plan: ScratchPlan;
    let arc: ArcTemplate | null = null;
    // cooldowns are checked at each event's own bar (section 54), not for the whole window
    const cooling = (g: ScratchGestureId, bar: number): boolean => !this.memory.gestureReady(g, bar);
    if (wantsFeature) {
      arc = shape.template!;
      toBar = fromBar + arc.bars;
      this.budget.feature();
      const perm = performancePermissions({ setPhase, budgetTotal: this.budget.total, mode: input.mode });
      this.lastPeak = perm.peak;
      // the feature's cooldown runs from its end (section 54)
      this.memory.recordPerformance(shape.role === 'peakBurst' ? 'battle' : 'feature', toBar);
      this.arcPhases = [];
      if (arc.bars === 32) {
        // the 32-bar feature is the demo's own routine (SCR-PHRASING-PARITY D8): BATTLE the scratch_dj
        // showcase (A-A-B-A hook, varied endings, validated), PERFORMER the three-deck flow (a throw per
        // phrase, the word chopped, rests by energy, the words rotating); needles open and close it
        const battle = input.mode === 'BATTLE';
        arc = battle ? SCRATCH_DJ_TEMPLATE : THREE_DECK_TEMPLATE;
        scratchDJStats.bookends++;
        const demo = battle ? buildScratchDjRoutine(ctx.style, seed + fromBar) : buildThreeDeckRoutine(seed + fromBar);
        const events = demoRoutineToPlaced(demo, fromBar, ctx.meter);
        plan = {
          mode: input.mode, events, bars: Array.from({ length: arc.bars }, (_, k) => events.filter((e) => e.bar === fromBar + k)),
          rests: [], issues: battle ? validateScratchDjRoutine(demo) : [], routine: battle ? 'scratchDj' : 'threeDeck',
          reasons: [`${shape.role}: the demo's ${battle ? 'scratch_dj showcase' : 'three-deck routine'} over 32 bars`, perm.reason],
        };
      } else {
        const a = planArc({ arc, startBar: fromBar, style: ctx.style, mode: input.mode, seed: seed + fromBar, levelCap: perm.maxLevel || undefined, cooling, beatsPerBar: ctx.meter });
        // the section's record, as the overlay's (the demo's one record per section)
        const sec = overlaySectionAt(track, fromBar);
        const record = overlayRecord(sec.name, seed + sec.startBar);
        const events = record ? a.events.map((e) => ({ ...e, record })) : a.events;
        plan = {
          mode: input.mode, events, bars: Array.from({ length: arc.bars }, (_, k) => events.filter((e) => e.bar === fromBar + k)),
          rests: [], issues: [], reasons: [`${shape.role}: ${arc.name} arc over ${arc.bars} bars`, perm.reason],
        };
      }
    } else {
      this.lastPeak = false;
      const vocalByBar = Array.from({ length: toBar - fromBar }, (_, k) => {
        const b = track.downbeats.bars[fromBar + k];
        return b ? timelineAt(track.vocalActivity.values, track.vocalActivity.hopSec, b.start) : ctx.vocalActivity;
      });
      const densityShift = this.intent === 'escalate' ? 1 : this.intent === 'resolve' ? -1 : 0;
      // the demo's overlay: section by section, one crate record per section (SCR-PHRASING-PARITY)
      const opts: ScratchPlanOptions = {
        mode: input.mode, seed, fromBar, bars: toBar - fromBar, vocalByBar, genre: input.genre, densityShift,
        sectionAt: (bar) => overlaySectionAt(track, bar), profile: input.profile, routine: input.routine ?? null, records: true,
      };
      // a planned rest after a phrase that collided with the vocal (section 52)
      plan = this.intent === 'rest'
        ? { mode: input.mode, events: [], bars: [], rests: [], issues: [], reasons: [`rest: ${this.lastEvaluation?.reason ?? 'evaluation'}`] }
        : planScratch(ctx, opts);
    }
    // section 49: over a running juggle with two hands free, the juggle response replaces the phrase
    const responsePhases = !arc && input.juggleActive && input.juggleShape && input.scratchPermission >= 2
      ? juggleBarPhases(input.juggleShape, track, fromBar, toBar) : null;
    const response = !!responsePhases && responsePhases.some((p) => p === 'PEAK');
    if (response) plan = planJuggleResponse(ctx, { mode: input.mode, seed, fromBar, phases: responsePhases! });
    this.plannedThroughBar = toBar;
    if (input.juggleActive && !response) plan = juggleSafe(plan);
    if (response) scratchDJStats.juggleResponses++;
    // a feature is a routine: the needle drops on its first downbeat and lifts at its end (C8); the demo's own routines carry theirs
    if (arc && plan.events.length && !plan.events.some((e) => e.gesture === 'needleDrop')) plan = withNeedleBookends(plan, fromBar, arc.bars, ctx.meter);

    // the record: the plan's own per event (the demo's choice); a juggle response takes its section's record
    // too (one record per section, `pick_source`); never the music (D1). A `chooseSource` dependency overrides.
    if (!this.deps.chooseSource && plan.events.some((e) => !e.record)) {
      const sec = overlaySectionAt(track, fromBar);
      const record = overlayRecord(sec.name, seed + sec.startBar);
      if (record) plan = { ...plan, events: plan.events.map((e) => (e.record ? e : { ...e, record })), bars: plan.bars.map((b) => b.map((e) => (e.record ? e : { ...e, record }))) };
    }
    const performed = plan.events.filter((e) => e.gesture !== 'needleDrop' && e.gesture !== 'needleLift');
    const perEvent = !this.deps.chooseSource && performed.length > 0 && performed.every((e) => !!e.record);
    const chosen = plan.events.length ? (perEvent ? this.planRecords(plan, ctx) : this.chooseSource(ctx, plan, input, fromBar)) : null;
    scratchDJStats.plans++;
    this.lastPlan = plan;
    const intent = this.intent;
    this.intent = 'continue';
    if (!chosen || plan.events.length === 0) {
      this.windows.push({ fromBar, toBar, entries: [], arc: null, energyBefore: ctx.energy, setEnergyBefore: input.perf.setEnergy, plan, intent, started: false });
      return { planned: true, scheduled: 0, reason: chosen ? 'a planned rest' : plan.events.length ? 'no source' : 'a planned rest' };
    }

    const fx = { style: ctx.style, amount: SCRATCH_STYLES[ctx.style].fxAmount * (input.genre?.fxScale ?? 1) };
    const events = toScratchEvents(plan.events, chosen.source, chosen.anchor, {
      bpm: ctx.bpm, seed: seed + fromBar, downbeats: track.downbeats, deck: input.deck,
      // the style's FX on the bus: its preset, at its FX amount x the genre's FX scale (SCR-PG-A5)
      fx,
    }).map((e, i) => {
      const own = perEvent && plan.events[i]?.record ? crateSource(plan.events[i]!.record!) : null;
      const source = own ?? e.source;
      return source.type === 'CRATE' ? { ...e, source, anchor: anchorFor(source, e.gesture) ?? source.anchor } : e;
    });
    // only what is still ahead of the clock
    const now = ctx.masterBeat;
    const firstBeat = barStartBeat(track.downbeats, fromBar) - 1e-9;
    const windowKey = chosen.decision?.candidate.key ?? sourceKeyOf(chosen.source);
    const bassSource = chosen.decision?.candidate.material === 'bass';
    const anchorQuality = chosen.decision?.candidate.anchorQuality ?? 1;
    const entries: WindowEntry[] = [];
    const at = (beat: number): number => timeAtBeat(track.beatGrid, beat);
    const safety: SafetyState = {
      decksPlaying: input.decksPlaying ?? { A: input.deck === 'A', B: input.deck === 'B' },
      vocalAt: (b) => timelineAt(track.vocalActivity.values, track.vocalActivity.hopSec, at(b)),
      bassAt: (b) => timelineAt(track.bassActivity.values, track.bassActivity.hopSec, at(b)),
      bassSource, deckBusyUntil: this.deckBusyUntil, hasRecord: this.deps.hasRecord, bpm: ctx.bpm,
    };
    plan.events.forEach((p, i) => {
      const e = events[i]!;
      const sourceKey = perEvent && p.record ? `crate:${p.record}` : windowKey;
      if (e.executeAtBeat < now || e.executeAtBeat < firstBeat) return;
      // section 59: the governor has the last word on every event
      const verdict = checkScratch(e, safety);
      if (!verdict.ok) { this.deps.onRefused?.(e, verdict.rule, verdict.reason); plan.reasons.push(`refused ${e.gesture}: ${verdict.rule}`); return; }
      const d = e.source.type === 'DECK' || e.source.type === 'TRACKER_CHANNEL' ? (e.deck ?? e.source.deck) : undefined;
      if (d) this.deckBusyUntil[d] = Math.max(this.deckBusyUntil[d] ?? -Infinity, e.executeAtBeat + e.durationBeats);
      this.lastEventBar = Math.max(this.lastEventBar ?? p.bar, p.bar);
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

  /**
   * The crate record for a plan whose events name their own (the demo's `pick_source` per section, its role
   * pools per routine event): the window's source is the first record, for the decision log and telemetry.
   */
  private planRecords(plan: ScratchPlan, ctx: ScratchPerformanceContext): ChosenScratchSource | null {
    const first = plan.events.find((e) => e.record);
    const source = first?.record ? crateSource(first.record) : null;
    if (!source) return null;
    this.lastSource = `crate:${first!.record}`;
    void ctx;
    return { source, anchor: anchorFor(source, first!.gesture) ?? source.anchor, record: getScratchRecord(first!.record!) };
  }

  /**
   * The crate's best record for a plan without its own (a short feature, a juggle response): the section 13
   * selector over crate records only - the Auto DJ never scratches the music (the demo never does,
   * SCR-PHRASING-PARITY D1; the deck pads stay the user's).
   */
  private chooseSource(ctx: ScratchPerformanceContext, plan: ScratchPlan, input: ScratchTickInput, bar: number): ChosenScratchSource | null {
    const recent = this.memory.recent().recentSources;
    const leading = plan.events.find((e) => e.gesture !== 'drop' && e.gesture !== 'dropPhrase')?.gesture;
    const chosen = this.deps.chooseSource
      ? this.deps.chooseSource(ctx, plan, input, recent)
      : selectorSource(ctx, plan, input, recent, {
          blocked: (key) => !key.startsWith('crate:') || !this.memory.sourceReady(key, bar),
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

/** A crate record as a scratch source (its vowel the home anchor). */
export function crateSource(recordId: string): Extract<ScratchSource, { type: 'CRATE' }> | null {
  const r = getScratchRecord(recordId);
  if (!r) return null;
  return { type: 'CRATE', recordId: r.id, anchor: { position: r.anchors.vowel, safe: r.safe, safeForward: r.safeForward, safeReverse: r.safeReverse } };
}

/** The section a bar sits in, as the overlay reads it (the whole track as one section when the analysis has none). */
export function overlaySectionAt(track: Pick<DJTrackAnalysis, 'sections' | 'downbeats'>, bar: number): OverlaySection {
  const s = track.sections.find((x) => bar >= x.startBar && bar < x.endBar);
  if (s) return { name: scratchSectionFor(s.kind), startBar: s.startBar, bars: Math.max(1, s.endBar - s.startBar) };
  return { name: scratchSectionFor(undefined), startBar: 0, bars: Math.max(bar + 1, track.downbeats.bars.length) };
}

/** Under a running juggle a scratch only answers or accents (sections 26, 49). */
/**
 * The routine's bookends (reference scratch_dj.py :110, :161): a needle drop on the first bar's
 * step 0 (velocity 0.6) and a needle lift on the last bar's step 15 (velocity 0.5).
 */
export function withNeedleBookends(plan: ScratchPlan, fromBar: number, bars: number, beatsPerBar = 4): ScratchPlan {
  const at = (bar: number, step: number, gesture: 'needleDrop' | 'needleLift', role: 'INTRO' | 'OUTRO', velocity: number) => ({
    bar, step, beat: bar * beatsPerBar + step / 4, gesture, velocity, placementRole: 'accent' as const, role,
  });
  const drop = at(fromBar, 0, 'needleDrop', 'INTRO', 0.6);
  const lift = at(fromBar + bars - 1, 15, 'needleLift', 'OUTRO', 0.5);
  scratchDJStats.bookends++;
  return {
    ...plan,
    events: [drop, ...plan.events, lift],
    bars: plan.bars.map((b, k) => (k === 0 ? [drop, ...b] : k === bars - 1 ? [...b, lift] : b)),
    reasons: [...plan.reasons, 'needle drop / lift bookend the routine'],
  };
}

/** The juggle phase at each bar's downbeat of [fromBar, toBar) on the track's grid (null outside the pattern). */
export function juggleBarPhases(shape: NonNullable<ScratchTickInput['juggleShape']>, track: Pick<DJTrackAnalysis, 'downbeats'>, fromBar: number, toBar: number): Array<JugglePhase | null> {
  return Array.from({ length: Math.max(0, toBar - fromBar) }, (_, k) => {
    const rel = barStartBeat(track.downbeats, fromBar + k) - shape.startBeat;
    return shape.phases.find((p) => p.startBeat <= rel + 1e-6 && rel < p.endBeat - 1e-6)?.phase ?? null;
  });
}

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
