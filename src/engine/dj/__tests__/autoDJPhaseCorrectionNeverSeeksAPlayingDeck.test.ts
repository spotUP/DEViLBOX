/**
 * Reachability R2 (plan 2026-10-11-dj-juggling, JUGX-P2.R2, moved to the
 * ladder setup by JUGX-P3.8a): Auto DJ's phase correction of a playing deck
 * is a rate bend, never a seek. A seek of a playing deck is an audible skip
 * and a platter jump (C3: the deleted juggle prelude started the incoming
 * deck, then phase-aligned it with a seek of up to half a bar).
 *
 * Entry: getAutoDJ() poll loop, transition-pending with a juggle transition
 * anticipated by Auto DJ itself; the executor starts the incoming deck on the
 * master's bar, and its trade stage locks the incoming to the master's bars
 * before the ladder trades. The incoming deck's grid sits 40 ms after its
 * audio start, so it starts 40 ms off the master's bars.
 *
 * Sentinel: the fake deck's bendRate call count. Numbers: zero seeks land on a
 * deck while it plays; the heard bar-phase error after the bend < 5 ms.
 * Fake timers, fake engine, no audio.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  pipeline: null as unknown,
  loads: 0,
  crossfader: [] as Array<{ at: number; v: number; masterPos: number }>,
  incomingGridShiftSec: 0.040,
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

import { barPhaseErrorSec, setupJuggleTransition, teardownJuggleTransition, OUTGOING } from './juggleTransitionHarness';
import { corpusTrack } from '../autodj/testing/corpus';

describe('Auto DJ phase correction bends a playing deck, never seeks it', () => {
  afterEach(() => teardownJuggleTransition());

  it('the incoming deck started 40 ms off the grid is bent into phase: no seek while it plays, heard error < 5 ms', async () => {
    const { dj, decks, anticipated } = await setupJuggleTransition(holder, { mode: 'PERFORMER' });
    expect(anticipated?.style).toBe('juggleTransition');
    const a0 = corpusTrack(OUTGOING).beats[0];
    /** Heard bar-phase error of B against A, each against its own grid. */
    const error = () => barPhaseErrorSec(decks.A.position() - a0, decks.B.position() - holder.incomingGridShiftSec);
    let errorAtStart: number | null = null;
    dj.startPolling();
    for (let t = 0; t < 60_000; t += 50) {
      await vi.advanceTimersByTimeAsync(50);
      if (errorAtStart === null && decks.B.isPlaying()) errorAtStart = error();
      if (decks.B.startedAt !== null && Date.now() - decks.B.startedAt > 4000) break;
    }
    expect(holder.loads, 'the poll loop never loaded the incoming deck').toBe(1);
    expect(decks.B.startedAt, 'the incoming deck never started').not.toBeNull();
    // Sentinel: the correction ran through DeckEngine.bendRate.
    expect(decks.B.bends.length, 'no bend: the phase correction never reached the deck as a bend').toBeGreaterThanOrEqual(1);
    expect(decks.B.seeksWhilePlaying, 'a playing deck was seeked').toBe(0);
    expect(decks.A.seeksWhilePlaying).toBe(0);
    // Measured on the first poll after the start (the bend already runs): about 40 ms off.
    expect(Math.abs(errorAtStart!)).toBeGreaterThan(0.030);
    expect(Math.abs(error())).toBeLessThan(0.005);
  }, 30_000);
});
