/**
 * JUGGLE-LAST-CUT-LATE, live 2026-10-12 (CHAOS, a stand-alone callResponse tease, 8 bars at 125 BPM):
 * the first three crossfades were on the beat, the last one was heard late. The pattern's trace was on
 * time (timing 0.968). The last cut is the hand-back: the pattern releases to the master and the
 * stand-alone layer stops the idle deck. A crossfader move is a Tone ramp, scheduled one lookAhead
 * (100 ms, measured live) after it is set; the deck stop acted at the context's current time. The idle
 * deck the crowd still heard fell silent 100 ms before the fader reached the master: a hole before the
 * master's downbeat. The idle deck now stops when the fader move has landed.
 *
 * Entry: getAutoDJ()'s poll loop, a stand-alone double to the pattern's end. The fake mixer models the
 * audio clock: a move set at t lands at t + lookAhead + its ramp. Sentinel: the idle deck's stop time.
 * Numbers: the stop is no earlier than the hand-back's fader landing; the history carries every cut's
 * planned and executed beat and its error in ms.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  pipeline: null as unknown,
  loads: 0,
  crossfader: [] as Array<{ at: number; v: number; masterPos: number }>,
  incomingGridShiftSec: 0,
  doubles: 0,
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
    loadDoubleToDeck: async (...args: Parameters<typeof actual.loadDoubleToDeck>) => { holder.doubles++; return actual.loadDoubleToDeck(...args); },
  };
});
vi.mock('../DJPipeline', async (orig) => {
  const actual = await orig<typeof import('../DJPipeline')>();
  return { ...actual, getDJPipeline: () => holder.pipeline };
});
vi.mock('../DJPerSongFx', () => ({ applyPerSongMasterFx: () => {} }));

import { useDJStore } from '@/stores/useDJStore';
import { getAutoDJ } from '../DJAutoDJ';
import { getDecisionLog } from '../autodj/decisionLog';
import type { AutoDJInternals } from './juggleTransitionHarness';
import { setupStandalone, teardownStandalone, runStandalone, type StandaloneRig } from './standaloneJuggleHarness';

/** Tone's lookAhead in the live app (measured 2026-10-12) and the mixer's longest crossfader ramp. */
const LOOKAHEAD_SEC = 0.1;
const RAMP_SEC = 0.01;
const contextNow = () => Date.now() / 1000;

let rig: StandaloneRig;

describe('JUGGLE-LAST-CUT-LATE: the hand-back stops the idle deck only once the fader has closed it', () => {
  beforeEach(async () => { rig = await setupStandalone(holder, { track: 'drops', bpm: 130, startSec: 46 }); });
  afterEach(() => { teardownStandalone(); });

  it('the last cut of a stand-alone juggle has no hole: the idle deck stops after the fader move lands', async () => {
    // The fake mixer on the audio clock: a move set now lands one lookAhead plus its ramp later.
    let landsAt = 0;
    const engine = holder.engine as { setCrossfader: (v: number) => void; mixer: { setCrossfader: (v: number) => void; crossfaderSettledAt?: () => number } };
    const recordMove = engine.mixer.setCrossfader;
    const move = (v: number) => { landsAt = contextNow() + LOOKAHEAD_SEC + RAMP_SEC; recordMove(v); };
    engine.setCrossfader = move;
    engine.mixer.setCrossfader = move;
    engine.mixer.crossfaderSettledAt = () => landsAt;
    // The idle deck's stop: now, or at the context time it was given.
    const stops: Array<{ stopSec: number; faderLandsSec: number }> = [];
    const stop = rig.decks.B.stop;
    rig.decks.B.stop = ((at?: number) => { stops.push({ stopSec: Math.max(contextNow(), at ?? 0), faderLandsSec: landsAt }); stop(); }) as typeof stop;

    const dj = getAutoDJ() as unknown as AutoDJInternals;
    const j = dj.getJuggle();
    dj.startPolling();
    await runStandalone(rig, 90_000, () => j.counts.completed + j.counts.aborted >= 1 && !rig.decks.B.isPlaying(), 20);

    const why = `log: ${getDecisionLog().list(5, 'JUGGLE').map((e) => e.reasons[0]).join(' | ')}; stops ${JSON.stringify(stops)}`;
    expect(j.counts.completed, why).toBe(1);
    expect(stops.length, why).toBeGreaterThanOrEqual(1);
    const handBack = stops[stops.length - 1];
    // Sentinel + number: no hole - the deck the crowd still hears stops when the fader has reached the master.
    expect(handBack.stopSec, why).toBeGreaterThanOrEqual(handBack.faderLandsSec - 1e-9);
    expect(useDJStore.getState().crossfaderPosition).toBe(0);

    // The evidence a live report carries: every cut, planned against executed, error in ms.
    const last = j.getHistory()[j.getHistory().length - 1];
    expect(last.cuts?.length, why).toBeGreaterThanOrEqual(2);
    for (const c of last.cuts!.filter((x) => x.status === 'executed')) {
      expect(c.executedBeat).not.toBeNull();
      expect(Math.abs(c.errorMs!)).toBeLessThan(60);
    }
    expect(last.cuts![last.cuts!.length - 1].type).toBe('ReleaseDeck');
    expect(useDJStore.getState().autoDJJuggleTelemetry?.history.at(-1)?.cuts?.length).toBe(last.cuts!.length);
  }, 120_000);
});
