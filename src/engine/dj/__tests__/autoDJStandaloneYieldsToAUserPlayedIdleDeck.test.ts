/**
 * Owner plan section 43 (audit m3): the user decides. When the user starts the idle deck themselves (a
 * manual play to preview, not Auto DJ's own stand-alone juggle or a transition), Auto Juggle does not
 * plan juggles with the two decks: the controller plans only with decks Auto DJ lent it.
 *
 * Entry: getAutoDJ() - its poll loop. Fake timers, fake decks, no audio.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

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
import { corpusAnalysis } from '../autodj/testing/corpus';
import type { AutoDJInternals } from './juggleTransitionHarness';
import { setupStandalone, teardownStandalone, runStandalone } from './standaloneJuggleHarness';

describe('Auto Juggle yields when the user starts the idle deck', () => {
  afterEach(() => teardownStandalone());

  it('a deck the user started beside the playing master is not juggled with', async () => {
    const rig = await setupStandalone(holder, { track: 'drops', bpm: 130, startSec: 46 });
    const { decks } = rig;
    // The user loads the same track on deck B, on the master's position (a perfect double), and presses play.
    const analysis = corpusAnalysis('drops');
    const a = useDJStore.getState().decks.A;
    useDJStore.getState().setDeckState('B', {
      fileName: 'drops.wav', trackName: 'drops', isPlaying: true, detectedBPM: 130, effectiveBPM: 130, durationMs: 600_000,
      pitchOffset: 0, trackAnalysis: analysis, beatGrid: a.beatGrid, analysisState: 'ready',
    });
    decks.B.audioPlayer.seek(decks.A.position());
    await decks.B.play();
    const dj = getAutoDJ() as unknown as AutoDJInternals;
    dj.startPolling();
    await runStandalone(rig, 40_000);
    const j = dj.getJuggle();
    expect(j.counts.started, `juggle events: ${j.events.map((e) => e.reason).join(' | ')}`).toBe(0);
    expect(holder.doubles).toBe(0);
    expect(decks.B.isPlaying(), 'the user\'s deck keeps playing').toBe(true);
    expect(useDJStore.getState().autoDJJuggleTelemetry?.safety ?? '').toMatch(/user/);
  }, 120_000);
});
