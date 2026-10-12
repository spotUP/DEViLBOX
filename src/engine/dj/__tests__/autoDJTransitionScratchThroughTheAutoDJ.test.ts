/**
 * Reachability R8 through the Auto DJ (scratch ledger SCR-P7.R8; owner scratch plan sections 44-48,
 * 76): Auto Scratch MUSICAL, Auto Juggle off, the corpus pair. Entry: getAutoDJ() - its own
 * anticipate() plans the transition (the planner attaches `plan.scratch`), the poll loop triggers
 * it, the executor's scratch stage calls the Auto DJ's `performScratch`, which records the decision
 * and the set's memory and hands the events to `performTransitionScratch`.
 *
 * Sentinels: `autoScratchRuntimeStats.transitionScratches` 1, one SCRATCH decision naming the
 * transition scratch, the session memory counting every logged phrase. Numbers: every scratched event ends
 * before the plan's end beat; no scratched gesture touches the crossfader, which runs the transition's
 * curve 0 to 1; with Auto Scratch off the same transition (longBlend) carries no scratch. The per-style compatibility (6 styles, echoOut refused)
 * lives in autoDJTransitionWithScratch.test.ts. Fake timers, fake engine, no audio: the runtime's
 * scratch executor records the events instead of playing them.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  pipeline: null as unknown,
  loads: 0,
  crossfader: [] as Array<{ at: number; v: number; masterPos: number }>,
  incomingGridShiftSec: 0,
  scratched: [] as Array<{ executeAtBeat: number; durationBeats: number; gesture: string; source: { type: 'CRATE' | 'DECK' | 'TRACKER_CHANNEL' | 'TRACKER_SAMPLE' } }>,
}));

vi.mock('@/engine/dj/DJEngine', () => ({ getDJEngine: () => holder.engine, getDJEngineIfActive: () => holder.engine }));
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
vi.mock('../scratch/autoScratchRuntime', async (orig) => {
  const actual = await orig<typeof import('../scratch/autoScratchRuntime')>();
  return {
    ...actual,
    performTransitionScratch: (s: Parameters<typeof actual.performTransitionScratch>[0], deck: 'A' | 'B', analysis: Parameters<typeof actual.performTransitionScratch>[2]) =>
      actual.performTransitionScratch(s, deck, analysis, {
        executorFor: () => ({ schedule: (e) => { holder.scratched.push(e); }, cancel: () => {}, active: 0 }),
        fire: () => true,
      }),
  };
});

import { useDJStore } from '@/stores/useDJStore';
import { setupJuggleTransition, teardownJuggleTransition } from './juggleTransitionHarness';
import { autoScratchRuntimeStats } from '../scratch/autoScratchRuntime';
import { getDecisionLog } from '../autodj/decisionLog';
import { getSessionController } from '../autodj/sessionController';
import { fieldsTouchedBy } from '../scratch/scratchSnapshot';
import { getGesture } from '../scratch/scratchGestureCatalog';
import type { ScratchGestureId } from '../scratch/scratchTypes';

async function runTransition(scratchMode: 'MUSICAL' | 'OFF') {
  holder.scratched.length = 0;
  useDJStore.getState().setAutoDJConfig({ scratchMode, scratchStyle: 'boomBap' });
  const { dj, decks, anticipated } = await setupJuggleTransition(holder, { mode: 'OFF' });
  const before = { scratches: autoScratchRuntimeStats.transitionScratches, decisions: getDecisionLog().counts.SCRATCH ?? 0 };
  let executed = false;
  dj.startPolling();
  for (let t = 0; t < 120_000; t += 50) {
    await vi.advanceTimersByTimeAsync(50);
    if (dj.execution) executed = true;
    if (executed && useDJStore.getState().autoDJStatus !== 'transitioning' && !decks.A.isPlaying()) break;
  }
  const memory = getSessionController().memory.snapshot();
  const newDecisions = (getDecisionLog().counts.SCRATCH ?? 0) - before.decisions;
  return {
    anticipated, executed, crossfader: holder.crossfader.map((c) => c.v), memory,
    scratches: autoScratchRuntimeStats.transitionScratches - before.scratches,
    decisions: newDecisions > 0 ? getDecisionLog().list(newDecisions, 'SCRATCH') : [],
  };
}

describe('R8: the Auto DJ performs the transition\'s scratch (SCR-P7.R8)', () => {
  beforeEach(() => { holder.incomingGridShiftSec = 0; });
  afterEach(() => { teardownJuggleTransition(); useDJStore.getState().setAutoDJConfig({ scratchMode: 'MUSICAL', scratchStyle: 'auto' }); });

  it('MUSICAL: the planned scratch is performed once, logged, remembered, inside the plan, off the crossfader', async () => {
    const on = await runTransition('MUSICAL');
    expect(on.anticipated?.scratch, `plan: ${on.anticipated?.reasons.join(' | ')}`).toBeDefined();
    expect(on.anticipated?.style).toBe('longBlend');
    expect(on.executed).toBe(true);
    expect(on.scratches).toBe(1);
    // the transition's own scratch is one decision; the performer's phrases before the transition log theirs
    expect(on.decisions.filter((d) => /^transition scratch: /.test(d.reasons[0] ?? ''))).toHaveLength(1);
    expect(on.memory.scratchPhrases).toBe(on.decisions.length);
    expect(holder.scratched.length).toBe(on.anticipated!.scratch!.events.length);
    for (const e of holder.scratched) {
      expect(e.executeAtBeat + e.durationBeats, e.gesture).toBeLessThanOrEqual(on.anticipated!.endBeat + 1e-9);
      expect(fieldsTouchedBy(e.source.type, getGesture(e.gesture as ScratchGestureId).faderWindows)).not.toContain('crossfader');
    }
    // the transition's curve ran, from the outgoing to the incoming
    expect(on.crossfader[0]).toBe(0);
    expect(on.crossfader[on.crossfader.length - 1]).toBe(1);
  }, 120_000);

  it('Auto Scratch off: the same transition carries no scratch', async () => {
    useDJStore.getState().setAutoDJConfig({ scratchMode: 'OFF' });
    const { anticipated } = await setupJuggleTransition(holder, { mode: 'OFF' });
    expect(anticipated?.style).toBe('longBlend');
    expect(anticipated?.scratch).toBeUndefined();
  }, 120_000);
});
