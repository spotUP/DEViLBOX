/**
 * JA-ABORT-HEARD: a juggle transition whose ladder aborts AFTER the incoming was heard (a vocal
 * collision, drift, the governor) used to run the juggle plan's 1-bar release straight away - a
 * crossfader cut onto the incoming in the middle of its intro, a ladder's length before its drop.
 * JA-B1 (3229ab18b) covered only a refusal or an abort before the incoming was heard. Owner juggling
 * plan sections 33 and 42: an aborted juggle resolves gracefully into a normal state.
 *
 * The resolve: the juggle releases to the outgoing (section 33: the strongest deck, a stable fader),
 * the incoming plays on beneath it, and the plan's normal-blend fallback runs onto the incoming as it
 * plays (never re-cued: it was heard), ENDING on the ladder's landing - the incoming phrase start the
 * ladder was handing over on.
 *
 * Entry: getAutoDJ() - its own anticipate() plans the juggle transition, the poll loop triggers it,
 * the executor runs the ladder through the real juggle controller; the test aborts the ladder after
 * its first cut onto the incoming.
 *
 * Numbers (4-2-1-1 ladder, 64 beats; the fallback an 8-bar blend): after the abort the crossfader
 * stays on the outgoing until the blend's start; the blend is >= 5 intermediate values; it starts
 * 8 bars before the landing and reaches the incoming within a beat of the landing; the incoming is
 * never seeked or stopped while it plays; the transition completes on the incoming and reports the
 * blend as the executed plan. Fake timers, fake engine, no audio.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  pipeline: null as unknown,
  loads: 0,
  crossfader: [] as Array<{ at: number; v: number; masterPos: number }>,
  incomingGridShiftSec: 0,
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
    // A beat-level pair (the R3 setup): the anticipated plan is a 4-2-1-1 juggle transition.
    buildDJTrackAnalysis: (...args: Parameters<typeof actual.buildDJTrackAnalysis>) => {
      const a = actual.buildDJTrackAnalysis(...args);
      for (const p of a.phrases) p.confidence = 0.9;
      return a;
    },
  };
});

import { useDJStore } from '@/stores/useDJStore';
import { BAR, BEAT, setupJuggleTransition, teardownJuggleTransition } from './juggleTransitionHarness';
import { getSessionController } from '../autodj/sessionController';
import type { DJTransitionPlan } from '../autodj/types';

describe('JA-ABORT-HEARD: a juggle ladder aborted after the incoming was heard blends onto its landing, never cuts', () => {
  afterEach(() => teardownJuggleTransition());

  it('a vocal collision after the first answer: the outgoing holds, then the fallback blend ends on the ladder\'s landing', async () => {
    const { dj, decks, anticipated } = await setupJuggleTransition(holder, { mode: 'PERFORMER' });
    expect(anticipated?.style, `anticipated plan: ${anticipated?.reasons.join(' | ')}`).toBe('juggleTransition');
    expect(anticipated!.juggle).toMatchObject({ ladderBars: [4, 2, 1, 1], tradeBeats: 64 });
    const fallback = anticipated!.juggle!.fallback!;
    expect(fallback.style).not.toBe('juggleTransition');
    const j = dj.getJuggle();
    const completed = vi.spyOn(getSessionController()!, 'onTransitionComplete');
    let abortedAtPos: number | null = null;
    let abortedAtWrite = 0;
    dj.startPolling();
    for (let t = 0; t < 150_000; t += 20) {
      await vi.advanceTimersByTimeAsync(20);
      if (abortedAtPos === null && j.events.some((e) => e.kind === 'juggleActionExecuted' && e.action?.type === 'CutIn' && e.action.deck === 'B')) {
        // The incoming has been heard; a bar later the ladder aborts.
        await vi.advanceTimersByTimeAsync(BAR * 1000);
        abortedAtPos = decks.A.position();
        abortedAtWrite = holder.crossfader.length;
        j.abort('vocal collision');
      }
      if (abortedAtPos !== null && useDJStore.getState().autoDJStatus !== 'transitioning' && !decks.A.isPlaying()) break;
    }
    expect(abortedAtPos, 'the ladder answered with the incoming').not.toBeNull();
    expect(j.counts.aborted).toBe(1);
    const landing = anticipated!.startTimeSec + 64 * BEAT;
    // Sentinel: the plan that played is the fallback, resumed onto the landing; the session scored it.
    const executed = completed.mock.calls.at(-1)?.[1] as DJTransitionPlan | undefined;
    expect(executed?.id).toBe(`${fallback.id}-heard`);
    expect(executed!.durationBars).toBe(fallback.durationBars);
    expect(executed!.startTimeSec + executed!.durationBars * BAR).toBeCloseTo(landing, 3);

    // The abort released to the outgoing (a juggle cut back to the master, whichever deck was on air): from
    // there the fader holds the outgoing until the blend starts - no cut onto the incoming.
    const released = holder.crossfader.findIndex((c, i) => i >= abortedAtWrite && c.v === 0);
    expect(released, 'the abort released to the outgoing').toBeGreaterThanOrEqual(0);
    expect(holder.crossfader[released].masterPos - abortedAtPos!).toBeLessThan(BEAT);
    const after = holder.crossfader.slice(released);
    const firstIncomingHalf = after.find((c) => c.v > 0.5);
    expect(firstIncomingHalf, 'the crossfader reached the incoming').toBeDefined();
    expect(firstIncomingHalf!.masterPos, `incoming half at ${firstIncomingHalf!.masterPos.toFixed(2)} s, blend from ${executed!.startTimeSec.toFixed(2)} s`).toBeGreaterThanOrEqual(executed!.startTimeSec - 1e-3);
    expect(after.filter((c) => c.v > 0.05 && c.v < 0.95).length, `writes ${after.map((c) => c.v.toFixed(2)).join(' ')}`).toBeGreaterThanOrEqual(5);
    // The blend lands on the incoming at the ladder's landing.
    const landed = after.find((c) => c.v === 1);
    expect(landed, 'the crossfader landed on the incoming').toBeDefined();
    expect(Math.abs(landed!.masterPos - landing), `landed at ${landed!.masterPos.toFixed(2)} s, landing ${landing.toFixed(2)} s`).toBeLessThanOrEqual(BEAT);
    // The heard incoming was never re-cued or stopped.
    expect(decks.B.seeksWhilePlaying).toBe(0);
    expect(decks.B.stoppedAt).toBeNull();
    expect(useDJStore.getState().crossfaderPosition).toBe(1);
    expect(decks.A.isPlaying()).toBe(false);
    expect(decks.B.isPlaying()).toBe(true);
  }, 60_000);
});
