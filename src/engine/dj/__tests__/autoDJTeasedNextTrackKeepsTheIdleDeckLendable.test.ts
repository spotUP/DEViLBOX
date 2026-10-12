/**
 * JUGGLE-FOLLOWUPS (b), live 2026-10-12 (37-minute module set): once the next track had been pre-rendered
 * early (short modules preload at once) and teased on the idle deck, the tease's load spent the
 * pre-render - the idle deck became the next track's only copy - and every later stand-alone juggle was
 * refused "the next track waits on the idle deck" for the rest of the track. The tease borrows the idle
 * deck; the pre-render stays the transition's source.
 *
 * Entry: getAutoDJ() - the tease's own load (loadNextForTease) puts the pre-rendered next track on the
 * idle deck, then the poll loop runs. Sentinel: a double is loaded over the teased track. Numbers: the
 * stand-alone note never reads "waits on the idle deck"; the pre-render is still held for the transition.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  pipeline: null as unknown,
  loads: 0,
  crossfader: [] as Array<{ at: number; v: number; masterPos: number }>,
  incomingGridShiftSec: 0,
  doubles: 0,
  teaseLoads: 0,
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
  const { useDJStore: store } = await import('@/stores/useDJStore');
  return {
    ...actual, preRenderTrack: async () => null, loadPlaylistTrackToDeck: async () => false,
    loadDoubleToDeck: async (...args: Parameters<typeof actual.loadDoubleToDeck>) => { holder.doubles++; return actual.loadDoubleToDeck(...args); },
    // The next track's pre-render lands on the deck, stopped (what the tease's load does).
    loadPreRenderedTrackToDeck: async (_data: unknown, track: { fileName: string; trackName: string }, deck: 'A' | 'B') => {
      holder.teaseLoads++;
      store.getState().setDeckState(deck, { fileName: track.fileName, trackName: track.trackName, isPlaying: false, trackAnalysis: null, beatGrid: null });
      return true;
    },
  };
});
vi.mock('../DJPipeline', async (orig) => {
  const actual = await orig<typeof import('../DJPipeline')>();
  return { ...actual, getDJPipeline: () => holder.pipeline };
});
vi.mock('../DJPerSongFx', () => ({ applyPerSongMasterFx: () => {} }));

import { useDJStore } from '@/stores/useDJStore';
import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';
import { getAutoDJ } from '../DJAutoDJ';
import { getDecisionLog } from '../autodj/decisionLog';
import type { AutoDJInternals } from './juggleTransitionHarness';
import { setupStandalone, teardownStandalone, runStandalone, type StandaloneRig } from './standaloneJuggleHarness';

let rig: StandaloneRig;

describe('JUGGLE-FOLLOWUPS (b): a teased next track leaves the idle deck lendable', () => {
  beforeEach(async () => { holder.teaseLoads = 0; rig = await setupStandalone(holder, { track: 'drops', bpm: 130, startSec: 46 }); });
  afterEach(() => { teardownStandalone(); });

  it('after a tease loads the pre-rendered next track, a stand-alone double is still set up and the pre-render stays for the transition', async () => {
    const dj = getAutoDJ() as unknown as AutoDJInternals & { loadNextForTease(deck: 'A' | 'B'): Promise<boolean> };
    const pl = useDJPlaylistStore.getState();
    const next = pl.playlists.find((p) => p.id === pl.activePlaylistId)!.tracks[1];
    const pre = { track: next, data: { duration: 600 } };
    dj.preRenderedTrack = pre;
    dj.preloadedDeck = 'B';
    // The tease's load (the stand-alone layer's loadNext): the next track on the idle deck, stopped after the tease.
    expect(await dj.loadNextForTease('B')).toBe(true);
    expect(holder.teaseLoads).toBe(1);

    const notes = new Set<string>();
    dj.startPolling();
    await runStandalone(rig, 60_000, () => {
      const note = useDJStore.getState().autoDJJuggleTelemetry?.safety;
      if (note) notes.add(note);
      return holder.doubles >= 1;
    }, 50);
    const why = `notes: ${[...notes].join(' | ')}; log: ${getDecisionLog().list(5, 'JUGGLE').map((e) => e.reasons[0]).join(' | ')}`;
    expect(holder.doubles, why).toBe(1);
    expect([...notes].some((n) => n.includes('waits on the idle deck')), why).toBe(false);
    // The transition still loads the next track from its pre-render (the double sits on the deck now).
    expect(dj.preRenderedTrack, why).toBe(pre);
    expect(dj.preloadedDeck).toBe('B');
  }, 120_000);
});
