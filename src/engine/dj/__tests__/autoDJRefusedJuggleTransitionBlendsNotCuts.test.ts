/**
 * Audit JA-B1 (thoughts/shared/research/2026-10-11_juggling-sonnet-work-audit.md, B1): a juggle
 * transition whose trade stage is refused used to run the juggle plan's 1-bar release - a crossfader
 * cut onto the incoming a whole ladder (16-32 bars) before its drop. Owner juggling plan sections 31,
 * 33, 42: low confidence or a refused juggle -> a normal transition, resolved gracefully.
 *
 * Entry: getAutoDJ() - its own anticipate() plans a juggle transition with the juggle budget open,
 * the poll loop triggers it, the executor runs it through the real juggle controller.
 *
 * 1. The audit's scenario: a stand-alone juggle (a tease of the next track) finishes after the
 *    anticipation and starts the cooldown; the transition comes 30 s+ later inside it. The juggle
 *    plan no longer holds: the transition is planned again, a normal blend - no ladder is attempted.
 * 2. The budget closes between the trigger and the trade stage (the plan held at the trigger): the
 *    trade stage refuses with "cooldown", and the executor runs the plan's normal-blend fallback from
 *    its own phrase and mix-in - not the 1-bar release.
 *
 * Numbers: the crossfader moves to the incoming through >= 5 intermediate values, never reaches the
 * incoming half before the blend's planned start; the incoming starts at the blend's mix-in; the
 * transition completes on the incoming. Fake timers, fake engine, no audio.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  pipeline: null as unknown,
  loads: 0,
  crossfader: [] as Array<{ at: number; v: number; masterPos: number }>,
  incomingGridShiftSec: 0,
  ladderBuilds: 0,
}));

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));
vi.mock('../DJQuantizedFX', () => {
  const record = () => () => () => {};
  return {
    beatMatchedTransition: record(), cutTransition: record(), filterBuildTransition: record(), bassSwapTransition: record(), echoOutTransition: record(),
    skipTransition: record(), getQuantizeMode: () => 'off', setQuantizeMode: () => {},
    filterSweep: () => () => {}, filterReset: () => () => {}, echoOut: () => () => {}, instantEQKill: () => {}, quantizedEQKill: () => () => {}, cancelAllAutomation: () => {},
  };
});
vi.mock('../DJTrackLoader', async (orig) => {
  const actual = await orig<typeof import('../DJTrackLoader')>();
  return {
    ...actual, preRenderTrack: async () => null, loadPlaylistTrackToDeck: async () => false,
    loadPreRenderedTrackToDeck: async () => (await import('./juggleTransitionHarness')).loadIncoming(holder),
  };
});
vi.mock('../DJPipeline', async (orig) => {
  const actual = await orig<typeof import('../DJPipeline')>();
  return { ...actual, getDJPipeline: () => holder.pipeline };
});
vi.mock('../DJPerSongFx', () => ({ applyPerSongMasterFx: () => {} }));
vi.mock('../autodj/trackAnalysis', async (orig) => {
  const actual = await orig<typeof import('../autodj/trackAnalysis')>();
  return {
    ...actual,
    // A beat-level pair (the R3 setup): the anticipated plan is a juggle transition.
    buildDJTrackAnalysis: (...args: Parameters<typeof actual.buildDJTrackAnalysis>) => {
      const a = actual.buildDJTrackAnalysis(...args);
      for (const p of a.phrases) p.confidence = 0.9;
      return a;
    },
  };
});
vi.mock('../autodj/juggle/jugglePatterns', async (orig) => {
  const actual = await orig<typeof import('../autodj/juggle/jugglePatterns')>();
  return { ...actual, transitionLadder: (p: Parameters<typeof actual.transitionLadder>[0]) => { holder.ladderBuilds++; return actual.transitionLadder(p); } };
});

import { useDJStore } from '@/stores/useDJStore';
import { setupJuggleTransition, teardownJuggleTransition } from './juggleTransitionHarness';
import type { DJTransitionPlan } from '../autodj/types';
import type { DJJuggleController } from '../autodj/juggle/juggleController';

/** What a stand-alone juggle that finished `agoMs` ago leaves in the controller (its finish sets the cooldown clock, on the controller's own clock). */
const standaloneJuggleFinished = (j: DJJuggleController, agoMs = 0): void => {
  const c = j as unknown as { lastJuggleAt: number; now(): number };
  c.lastJuggleAt = c.now() - agoMs;
};

/** The crossfader writes as a blend, not a cut: intermediate values, the incoming half only from the blend's start. */
function expectBlendNotCut(plan: DJTransitionPlan): void {
  const writes = holder.crossfader;
  const between = writes.filter((c) => c.v > 0.05 && c.v < 0.95);
  expect(between.length, `crossfader writes ${writes.map((c) => c.v.toFixed(2)).join(' ')}`).toBeGreaterThanOrEqual(5);
  const firstIncomingHalf = writes.find((c) => c.v > 0.5);
  expect(firstIncomingHalf, 'the crossfader reached the incoming').toBeDefined();
  expect(firstIncomingHalf!.masterPos, 'the incoming half before the blend started').toBeGreaterThanOrEqual(plan.startTimeSec - 1e-3);
}

describe('JA-B1: a refused juggle transition plays a normal blend, never a cut before the incoming drop', () => {
  beforeEach(() => { holder.ladderBuilds = 0; holder.incomingGridShiftSec = 0; });
  afterEach(() => teardownJuggleTransition());

  it('a stand-alone tease finishing after the anticipation (cooldown at the transition): the transition re-plans as a normal blend', async () => {
    const { dj, decks, anticipated } = await setupJuggleTransition(holder, { mode: 'PERFORMER' });
    expect(anticipated?.style, `anticipated plan: ${anticipated?.reasons.join(' | ')}`).toBe('juggleTransition');
    const j = dj.getJuggle();
    // The tease of this very track ended 30 s before the anticipated plan reaches its trigger.
    standaloneJuggleFinished(j, 30_000);
    const teaseEndedAt = Date.now() - 30_000;
    const abortedBefore = j.counts.aborted;
    let executed: DJTransitionPlan | null = null;
    let executedAt = 0;
    let budgetAtExecution = '';
    const tickInput = (dj as unknown as { tickInput(m: string, r: number): Parameters<DJJuggleController['transitionBudget']>[0] }).tickInput.bind(dj);
    dj.startPolling();
    for (let t = 0; t < 150_000; t += 50) {
      await vi.advanceTimersByTimeAsync(50);
      if (dj.execution && !executed) {
        executed = dj.execution.plan; executedAt = Date.now();
        budgetAtExecution = j.transitionBudget(tickInput('JUGGLE_TRANSITION', 0)).reasons.join('; ');
      }
      if (executed && useDJStore.getState().autoDJStatus !== 'transitioning' && !decks.A.isPlaying()) break;
    }
    expect(executed, 'a transition executed').not.toBeNull();
    // The audit's timing: the transition comes 30 s+ after the tease, inside the cooldown it started.
    expect((executedAt - teaseEndedAt) / 1000).toBeGreaterThanOrEqual(30);
    expect(budgetAtExecution).toMatch(/cooldown/);
    // Sentinel: the plan that ran is a fresh normal one, and no ladder was attempted.
    expect(executed!.style).not.toBe('juggleTransition');
    expect(executed!.id).not.toBe(anticipated!.id);
    expect(holder.ladderBuilds).toBe(0);
    expect(j.counts.aborted).toBe(abortedBefore);
    expectBlendNotCut(executed!);
    expect(useDJStore.getState().crossfaderPosition).toBe(1);
    expect(decks.A.isPlaying()).toBe(false);
    expect(decks.B.isPlaying()).toBe(true);
  }, 60_000);

  it('the trade stage refuses (cooldown after the trigger): the executor runs the plan\'s normal-blend fallback, not the 1-bar release', async () => {
    const { dj, decks, anticipated } = await setupJuggleTransition(holder, { mode: 'PERFORMER' });
    expect(anticipated?.style, `anticipated plan: ${anticipated?.reasons.join(' | ')}`).toBe('juggleTransition');
    const fallback = anticipated!.juggle!.fallback!;
    expect(fallback, 'the juggle plan carries its normal blend').toBeDefined();
    expect(fallback.style).not.toBe('juggleTransition');
    expect(fallback.durationBars).toBeGreaterThanOrEqual(2);
    expect(fallback.startTimeSec).toBeGreaterThan(anticipated!.startTimeSec);
    const j = dj.getJuggle();
    let executed: DJTransitionPlan | null = null;
    dj.startPolling();
    for (let t = 0; t < 150_000; t += 50) {
      await vi.advanceTimersByTimeAsync(50);
      if (dj.execution && !executed) {
        executed = dj.execution.plan;
        // The budget closes between the trigger and the trade stage.
        standaloneJuggleFinished(j);
      }
      if (executed && useDJStore.getState().autoDJStatus !== 'transitioning' && !decks.A.isPlaying()) break;
    }
    // Sentinel: the anticipated juggle plan executed, its trade stage refused, no ladder pattern was built.
    expect(executed?.id).toBe(anticipated!.id);
    expect(j.events.some((e) => e.kind === 'juggleAborted' && /not performed: .*cooldown/.test(e.reason))).toBe(true);
    expect(holder.ladderBuilds).toBe(0);
    // The blend: the incoming cued at the fallback's own mix-in, the crossfader a blend from its start.
    expect(decks.B.seeks).toContain(fallback.incomingPosition);
    expect(decks.B.seeksWhilePlaying).toBe(0);
    expectBlendNotCut(fallback);
    expect(useDJStore.getState().crossfaderPosition).toBe(1);
    expect(decks.A.isPlaying()).toBe(false);
    expect(decks.B.isPlaying()).toBe(true);
  }, 60_000);
});
