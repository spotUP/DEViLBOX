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

import { barStartBeat, timelineAt } from '../autodj/beatGrid';
import type { DJPerformanceContext, DJTrackAnalysis } from '../autodj/types';
import { buildScratchContext, type ScratchPerformanceContext } from './scratchContext';
import { planScratch, toScratchEvents, type ScratchPlan, type ScratchPlanOptions } from './scratchPlanner';
import type { ThrowMemory } from './scratchPlacement';
import type { ScratchMode } from './scratchStyles';
import { anchorFor } from './scratchAnchor';
import type { ScratchRecord } from './scratchCatalogue';
import { selectScratchSource, type SourceDecision, type TrackerSampleInfo } from './ScratchSourceSelector';
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
}

export interface ScratchDJDeps {
  /** The executor on `deck`'s beat clock for `track` (cached by the controller per deck + track). */
  executorFor(deck: AB, track: DJTrackAnalysis): ScratchEventSink;
  /** Source selection; `selectScratchSource` (section 13) when omitted. */
  chooseSource?(ctx: ScratchPerformanceContext, plan: ScratchPlan, input: ScratchTickInput, recent: readonly string[]): ChosenScratchSource | null;
  /** Get a chosen source ready before its first event (a TRACKER_SAMPLE is decoded into the voice pool:
   *  `loadTrackerSample`); the plan is a bar ahead, so the load lands before the stroke. */
  prepareSource?(chosen: ChosenScratchSource, input: ScratchTickInput): void | Promise<unknown>;
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
export function selectorSource(ctx: ScratchPerformanceContext, plan: ScratchPlan, input: ScratchTickInput, recent: readonly string[]): ChosenScratchSource | null {
  const track = input.perf.currentTrack;
  if (!track) return null;
  const performed = plan.events.filter((e) => e.gesture !== 'drop' && e.gesture !== 'dropPhrase');
  const roles = [...new Set(performed.map((e) => e.role))];
  const decision = selectScratchSource({
    ctx, track, deck: input.deck, roles: roles.length ? roles : ['THEME'], gestures: performed.map((e) => e.gesture),
    bar: plan.events[0]?.bar ?? ctx.masterBar + 1, genre: input.genreHint, trackerSamples: input.trackerSamples, recent,
  });
  if (!decision) return null;
  const c = decision.candidate;
  return { source: c.source, anchor: c.anchor, record: c.record, decision };
}

/** Source keys remembered for novelty / repetition (section 13; the full memory is P6.6). */
const RECENT_SOURCES = 8;

export class DJScratchDJ {
  private readonly deps: ScratchDJDeps;
  private sink: { key: string; exec: ScratchEventSink } | null = null;
  /** First bar not yet planned on the current track. */
  private plannedThroughBar = -1;
  private trackKey = '';
  private lastBar = -1;
  private readonly throwMemory: ThrowMemory = {};
  private readonly recentSources: string[] = [];
  /** Last plan (telemetry, P9.5). */
  lastPlan: ScratchPlan | null = null;

  constructor(deps: ScratchDJDeps) {
    this.deps = deps;
  }

  /** Drop every planned event and forget the window (mode off, track change, seek). */
  reset(): void {
    this.sink?.exec.cancel();
    this.plannedThroughBar = -1;
    this.lastBar = -1;
  }

  tick(input: ScratchTickInput): ScratchDJTickResult {
    scratchDJStats.ticks++;
    const track = input.perf.currentTrack;
    if (input.mode === 'OFF' || input.scratchPermission <= 0 || !track) {
      if (this.plannedThroughBar >= 0) this.reset();
      return { planned: false, scheduled: 0, reason: !track ? 'no track' : input.mode === 'OFF' ? 'mode off' : 'no scratch permission' };
    }
    const ctx = buildScratchContext({
      perf: input.perf, style: input.style, scratchPermission: input.scratchPermission,
      juggleIntensity: input.juggleIntensity, transitionIntensity: input.transitionIntensity,
    });
    if (!ctx) return { planned: false, scheduled: 0, reason: 'no context' };

    // a new track, a new deck or a jump back invalidates what is planned
    const key = `${input.deck}:${track.id}`;
    if (key !== this.trackKey || ctx.masterBar < this.lastBar) {
      this.reset();
      this.trackKey = key;
    }
    this.lastBar = ctx.masterBar;
    if (!this.sink || this.sink.key !== key) this.sink = { key, exec: this.deps.executorFor(input.deck, track) };

    // plan the window that starts on the next bar, up to the next phrase boundary
    const fromBar = Math.max(ctx.masterBar + 1, this.plannedThroughBar);
    if (fromBar > ctx.masterBar + 1) return { planned: false, scheduled: 0 };
    const phraseStart = ctx.masterBar - ctx.barInPhrase;
    const phraseBars = Math.max(1, ctx.phraseBars);
    let toBar = phraseStart + phraseBars;
    while (toBar <= fromBar) toBar += phraseBars;
    const bars = toBar - fromBar;
    this.plannedThroughBar = toBar;

    const vocalByBar = Array.from({ length: bars }, (_, k) => {
      const b = track.downbeats.bars[fromBar + k];
      return b ? timelineAt(track.vocalActivity.values, track.vocalActivity.hopSec, b.start) : ctx.vocalActivity;
    });
    const seed = this.deps.seed ?? 1;
    // the source is chosen before the throw: a crate record opens its phrase with one (section 41)
    const probe = planScratch(ctx, { mode: input.mode, seed, fromBar, bars, vocalByBar, genre: input.genre });
    const chosen = probe.events.length ? (this.deps.chooseSource ?? selectorSource)(ctx, probe, input, this.recentSources) : null;
    if (chosen?.decision) {
      this.recentSources.push(chosen.decision.candidate.key);
      if (this.recentSources.length > RECENT_SOURCES) this.recentSources.shift();
      this.deps.onSourceDecision?.(chosen.decision, ctx);
    }
    if (chosen && this.deps.prepareSource) {
      void Promise.resolve(this.deps.prepareSource(chosen, input)).catch((err) => console.warn('[DJScratchDJ] source not ready:', err));
    }
    const plan = chosen?.record
      ? planScratch(ctx, { mode: input.mode, seed, fromBar, bars, vocalByBar, genre: input.genre, record: chosen.record, throwMemory: this.throwMemory })
      : probe;
    scratchDJStats.plans++;
    this.lastPlan = plan;
    if (!chosen || plan.events.length === 0) return { planned: true, scheduled: 0, reason: chosen ? 'a planned rest' : 'no source' };

    const events = toScratchEvents(plan.events, chosen.source, chosen.anchor, {
      bpm: ctx.bpm, seed: seed + fromBar, downbeats: track.downbeats, deck: input.deck,
    }).map((e) => (chosen.source.type === 'CRATE' ? { ...e, anchor: anchorFor(chosen.source, e.role) ?? e.anchor } : e));
    // only what is still ahead of the clock
    const now = ctx.masterBeat;
    const ahead = events.filter((e) => e.executeAtBeat >= now && e.executeAtBeat >= barStartBeat(track.downbeats, fromBar) - 1e-9);
    for (const e of ahead) this.sink.exec.schedule(e);
    scratchDJStats.scheduled += ahead.length;
    this.deps.onPlan?.(plan, ahead, ctx);
    return { planned: true, scheduled: ahead.length };
  }
}
