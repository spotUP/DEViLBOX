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
import { findRecords, type ScratchRecord } from './scratchCatalogue';
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
  juggleIntensity?: number;
  transitionIntensity?: number;
}

export interface ScratchDJDeps {
  /** The executor on `deck`'s beat clock for `track` (cached by the controller per deck + track). */
  executorFor(deck: AB, track: DJTrackAnalysis): ScratchEventSink;
  /** Source selection (P5 `ScratchSourceSelector`); a crate record by style and role when omitted. */
  chooseSource?(ctx: ScratchPerformanceContext, plan: ScratchPlan): ChosenScratchSource | null;
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

/** The best clean vocal record for the style and the plan's leading role (pre-P5 default). */
export function defaultCrateSource(ctx: ScratchPerformanceContext, plan: ScratchPlan): ChosenScratchSource | null {
  const role = plan.events.find((e) => e.gesture !== 'drop' && e.gesture !== 'dropPhrase')?.role ?? 'THEME';
  const record = findRecords({ style: ctx.style, role, clean: true, vocal: true, recent: ctx.recentSources })[0];
  if (!record) return null;
  const source: ScratchSource = { type: 'CRATE', recordId: record.id, anchor: { position: record.anchors.vowel, safe: record.safe, safeForward: record.safeForward, safeReverse: record.safeReverse } };
  const anchor = anchorFor(source, role);
  return anchor ? { source, anchor, record } : null;
}

export class DJScratchDJ {
  private readonly deps: ScratchDJDeps;
  private sink: { key: string; exec: ScratchEventSink } | null = null;
  /** First bar not yet planned on the current track. */
  private plannedThroughBar = -1;
  private trackKey = '';
  private lastBar = -1;
  private readonly throwMemory: ThrowMemory = {};
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
    const chosen = probe.events.length ? (this.deps.chooseSource ?? defaultCrateSource)(ctx, probe) : null;
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
