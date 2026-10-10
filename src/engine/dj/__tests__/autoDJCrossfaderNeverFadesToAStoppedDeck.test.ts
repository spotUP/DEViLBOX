/**
 * Auto DJ "pulls the crossfader over, back, over again" and "fades to a
 * silent deck" (owner live report 2026-10-10, console: "[AutoDJ] Crossfader
 * stuck at 1.00 for 10 polls - forcing to 0").
 *
 * A planned transition is finalised at trigger time and its executor waits for
 * the grid moment, which can be a phrase (~9 s) away. During that wait the
 * fader is held on purpose and the incoming deck is stopped. The poll loop's
 * stuck-crossfader guard counted those polls as "stuck" and after 5 s forced
 * the fader to the stopped incoming deck; the executor's first curve sample
 * then pulled it back and swept again. Invariant: only the running transition
 * moves the fader, never toward a deck that is not playing.
 *
 * Also: when the timeout guard force-completes a transition, the executor that
 * was still running is cancelled, so its interval cannot keep writing the fader
 * after the decks have been swapped.
 *
 * And: the executor's wait for the grid moment resolves AT the planned start,
 * not seconds early (its safety deadline was recomputed from the shrinking
 * remaining time each check, so a 9 s wait resolved at ~6.6 s - off-grid
 * starts, double kicks in the blend).
 *
 * Drives the Auto DJ's real poll loop and wait with stubbed decks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  faderWrites: [] as number[],
  positionA: 30,
}));

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));
vi.mock('../DJTrackLoader', async (orig) => {
  const actual = await orig<typeof import('../DJTrackLoader')>();
  return { ...actual, preRenderTrack: async () => null };
});
vi.mock('../DJPerSongFx', () => ({ applyPerSongMasterFx: () => {} }));

import { useDJStore } from '@/stores/useDJStore';
import { useDJPlaylistStore, type PlaylistTrack } from '@/stores/useDJPlaylistStore';
import { getAutoDJ } from '../DJAutoDJ';
import { setSessionController, DJSessionController } from '../autodj/sessionController';

type Internals = {
  activeDeck: 'A' | 'B'; idleDeck: 'A' | 'B'; preloadedDeck: 'A' | 'B' | null;
  preRenderedTrack: unknown; plan: unknown; transitionSweepStarted: boolean;
  transitionCancel: (() => void) | null; execution: unknown; preloading: boolean; incomingAnalysis: unknown;
  transitionStartTime: number; lastCrossfaderValue: number; crossfaderStuckCount: number;
  pollLoop(): void; stopPolling(): void; preloadNextTrack(): Promise<void>;
  waitForDeckPosition(deck: 'A' | 'B', targetSec: number): Promise<void>;
};

function fakeDeck(id: 'A' | 'B') {
  let playing = id === 'A';
  return {
    id, playbackMode: 'audio' as const,
    play: async () => { playing = true; }, stop: () => { playing = false; }, isPlaying: () => playing,
    setFilterPosition: () => {}, setVolume: () => {},
    audioPlayer: { seek: () => {}, getPosition: () => (id === 'A' ? holder.positionA : 0), getDuration: () => 180 },
    replayer: { getElapsedMs: () => 30_000 },
  };
}

function playlist(): PlaylistTrack[] {
  return ['one', 'two', 'three'].map((id, i) => ({ id, fileName: `${id}.wav`, trackName: id, format: 'WAV', bpm: 126, duration: 180, addedAt: i, musicalKey: 'A minor', energy: 0.7 }));
}

describe('Auto DJ never fades the crossfader to a stopped deck', () => {
  let dj: Internals;

  beforeEach(() => {
    holder.faderWrites.length = 0;
    holder.positionA = 30;
    const decks = { A: fakeDeck('A'), B: fakeDeck('B') };
    holder.engine = {
      getDeck: (id: 'A' | 'B') => decks[id],
      setCrossfader: (v: number) => { holder.faderWrites.push(v); },
    };
    const pl = useDJPlaylistStore.getState();
    const id = `fader-${Date.now()}-${Math.random()}`;
    pl.importPlaylists([{ id, name: 'fader', createdAt: Date.now(), updatedAt: Date.now(), tracks: playlist() }]);
    pl.setActivePlaylist(id);
    const s = useDJStore.getState();
    s.setAutoDJConfig({ shuffle: false, style: 'Club', transitionBars: 8 });
    s.setDeckState('A', { fileName: 'one.wav', isPlaying: true, detectedBPM: 126, effectiveBPM: 126, durationMs: 180_000 });
    // triggerTransition marks the incoming deck playing in the store before the
    // executor starts it: the guard must read the engine, not this flag.
    s.setDeckState('B', { fileName: 'two.wav', isPlaying: true, detectedBPM: 126, effectiveBPM: 126, durationMs: 180_000 });
    s.setCrossfader(0);
    s.setAutoDJEnabled(true);
    s.setAutoDJTrackIndices(0, 1);
    s.setAutoDJStatus('transitioning');
    const controller = new DJSessionController();
    setSessionController(controller);
    controller.startSession(playlist().map((track, index) => ({ index, id: track.id, name: track.trackName, artist: null, track })), 0);
    dj = getAutoDJ() as unknown as Internals;
    dj.activeDeck = 'A'; dj.idleDeck = 'B'; dj.preloadedDeck = 'B'; dj.preRenderedTrack = null; dj.plan = null;
    dj.preloading = false; dj.incomingAnalysis = null;
    dj.lastCrossfaderValue = -1; dj.crossfaderStuckCount = 0;
    dj.transitionStartTime = Date.now();
    // The follow-up preload is not under test here.
    dj.preloadNextTrack = async () => {};
  });
  afterEach(() => {
    dj.stopPolling();
    dj.transitionCancel = null; dj.execution = null; dj.transitionSweepStarted = false;
    useDJStore.getState().setAutoDJEnabled(false);
    setSessionController(null);
    vi.restoreAllMocks();
  });

  it('holds the fader while a planned transition waits for its start (incoming deck stopped)', () => {
    // An executor waiting for its grid moment: sweep not started, incoming deck stopped.
    const execution = { cancel: vi.fn() };
    dj.execution = execution;
    dj.transitionCancel = () => execution.cancel();
    dj.transitionSweepStarted = false;

    // 12 polls = 6 s, past the 10-poll (5 s) stuck threshold.
    for (let i = 0; i < 12; i++) dj.pollLoop();

    expect(holder.faderWrites).not.toContain(1);
    expect(useDJStore.getState().crossfaderPosition).toBe(0);
    expect(useDJStore.getState().autoDJStatus).toBe('transitioning');
  });

  it('a force-completed transition cancels the executor that was still running', () => {
    const execution = { cancel: vi.fn() };
    dj.execution = execution;
    dj.transitionCancel = () => execution.cancel();
    dj.transitionSweepStarted = true;
    // Past the 45 s transition timeout.
    dj.transitionStartTime = Date.now() - 46_000;

    dj.pollLoop();

    expect(execution.cancel).toHaveBeenCalledTimes(1);
    expect(useDJStore.getState().autoDJStatus).toBe('playing');
    expect(dj.transitionCancel).toBeNull();
  });

  it('the wait for the planned start resolves at the planned position, not seconds early', async () => {
    vi.useFakeTimers();
    try {
      const t0 = Date.now();
      // The outgoing deck plays in real time from 30 s; the plan starts at 39 s (a 9 s wait).
      Object.defineProperty(holder, 'positionA', { configurable: true, get: () => 30 + (Date.now() - t0) / 1000 });
      let resolvedAt = -1;
      void dj.waitForDeckPosition('A', 39).then(() => { resolvedAt = Date.now() - t0; });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(resolvedAt).toBeGreaterThanOrEqual(8_990);
      expect(resolvedAt).toBeLessThanOrEqual(9_100);
    } finally {
      Object.defineProperty(holder, 'positionA', { configurable: true, writable: true, value: 30 });
      vi.useRealTimers();
    }
  });
});
