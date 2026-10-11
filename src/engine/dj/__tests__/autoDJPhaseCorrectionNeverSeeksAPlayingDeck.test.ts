/**
 * Reachability R2 (plan 2026-10-11-dj-juggling, JUGX-P2.R2): Auto DJ's phase
 * correction of a playing deck is a rate bend, never a seek. A seek of a
 * playing deck is an audible skip and a platter jump (C3: the juggle
 * prelude started the incoming deck, then phase-aligned it with a seek of up
 * to half a bar).
 *
 * Entry: getAutoDJ() poll loop, status transition-pending with a planned
 * juggle transition, the incoming deck pre-rendered. The poll loop starts the
 * incoming deck 40 ms behind the master's bar grid and phase-aligns it.
 * Today that path is the juggle prelude (DJAutoDJ.maybeStartJugglePrelude);
 * when P3 replaces the prelude with the transition ladder, this test moves to
 * the ladder's setup (same assertions).
 *
 * Sentinel: the fake deck's bendRate call count. Numbers: zero seeks land on a
 * deck while it plays; the heard bar-phase error after the bend < 5 ms.
 * Fake timers, fake engine, no audio.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  pipeline: null as unknown,
  loads: 0,
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
    loadPreRenderedTrackToDeck: async () => { holder.loads++; return true; },
  };
});
vi.mock('../DJPipeline', async (orig) => {
  const actual = await orig<typeof import('../DJPipeline')>();
  return { ...actual, getDJPipeline: () => holder.pipeline };
});
vi.mock('../DJPerSongFx', () => ({ applyPerSongMasterFx: () => {} }));

import { useDJStore } from '@/stores/useDJStore';
import { useDJPlaylistStore, type PlaylistTrack } from '@/stores/useDJPlaylistStore';
import { getAutoDJ } from '../DJAutoDJ';
import { corpusAnalysis } from '../autodj/testing/corpus';
import { setSessionController, DJSessionController } from '../autodj/sessionController';

type Internals = {
  activeDeck: 'A' | 'B'; idleDeck: 'A' | 'B'; preloadedDeck: 'A' | 'B' | null; plan: unknown; pollCount: number;
  transitionCancel: (() => void) | null; execution: unknown; preloading: boolean; incomingAnalysis: unknown; transitionSweepStarted: boolean;
  preRenderedTrack: unknown; jugglePreludeStarted: boolean;
  startPolling(): void; stopPolling(): void; getJuggle(): import('../autodj/juggle/juggleController').DJJuggleController;
};

const BPM = 126;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const PRELUDE_SEC = 8 * BAR;

/** A deck whose position advances at its rate on the fake clock; records bends and seeks. */
function fakeDeck(id: 'A' | 'B', startSec: number, playing: boolean, onPlay: (positionSec: number) => void = () => {}) {
  let pos = startSec, rate = 1, at = Date.now(), isPlaying = playing;
  let restore: ReturnType<typeof setTimeout> | null = null;
  const position = () => pos + (isPlaying ? ((Date.now() - at) / 1000) * rate : 0);
  const rebase = () => { pos = position(); at = Date.now(); };
  const d = {
    id, playbackMode: 'audio' as const,
    seeksWhilePlaying: 0, bends: [] as Array<{ ratio: number; ms: number }>,
    position,
    play: async () => { rebase(); onPlay(pos); isPlaying = true; }, stop: () => { rebase(); isPlaying = false; }, isPlaying: () => isPlaying,
    bendRate: (ratio: number, ms: number) => {
      d.bends.push({ ratio, ms });
      rebase(); rate = ratio;
      if (restore) clearTimeout(restore);
      restore = setTimeout(() => { rebase(); rate = 1; restore = null; }, ms);
    },
    getHeardPosition: () => position(),
    setPitch: () => {}, setKeyLock: () => {}, setEQ: () => {}, setEQKill: () => {}, setFilterPosition: () => {}, getFilterPosition: () => 0,
    setFilterResonance: () => {}, setVolume: () => {}, getVolume: () => 1, setEchoSend: () => {}, setEchoParams: () => {}, setReverbSend: () => {},
    setAudioLoop: () => {}, clearAudioLoop: () => {}, loadSong: async () => {}, clearLoadedSong: () => {}, getLoadedSong: () => null,
    audioPlayer: {
      seek: (t: number) => { if (isPlaying) d.seeksWhilePlaying++; pos = t; at = Date.now(); },
      getPosition: () => position(), getDuration: () => 600, stop: () => {},
    },
    replayer: { getElapsedMs: () => position() * 1000 },
  };
  return d;
}

const grid = () => {
  const beats = Array.from({ length: Math.ceil(600 / BEAT) }, (_, i) => i * BEAT);
  return { beats, downbeats: beats.filter((_, i) => i % 4 === 0), bpm: BPM, timeSignature: 4 };
};

/** Signed bar-phase distance of `b` from `a` in seconds, in [-BAR/2, BAR/2). */
function barPhaseErrorSec(a: number, b: number): number {
  const d = (((b - a) % BAR) + BAR) % BAR;
  return d >= BAR / 2 ? d - BAR : d;
}

describe('Auto DJ phase correction bends a playing deck, never seeks it', () => {
  let decks: { A: ReturnType<typeof fakeDeck>; B: ReturnType<typeof fakeDeck> };
  /** Bar-phase error of the incoming deck against the master at the moment it starts. */
  let errorAtPlay: number | null = null;

  beforeEach(async () => {
    vi.useFakeTimers();
    holder.loads = 0;
    const { DJEngine } = await vi.importActual<typeof import('../DJEngine')>('../DJEngine');
    const { DJPipeline } = await vi.importActual<typeof import('../DJPipeline')>('../DJPipeline');
    holder.pipeline = Object.create(DJPipeline.prototype);
    errorAtPlay = null;
    decks = { A: fakeDeck('A', 10, true), B: fakeDeck('B', 0, false, (p) => { errorAtPlay = barPhaseErrorSec(decks.A.position(), p); }) };
    holder.engine = Object.assign(Object.create(DJEngine.prototype), {
      getDeck: (id: 'A' | 'B') => decks[id], remapInstrumentIds: () => {}, tryAutoLoadStems: async () => {}, recorder: null, _pendingTrackSource: null,
      mixer: { setCrossfader: () => {} }, setCrossfader: () => {},
    });
    const pl = useDJPlaylistStore.getState();
    const id = `phase-${Date.now()}`;
    const tracks: PlaylistTrack[] = ['steady', 'compatibleKey'].map((n, i) => ({ id: n, fileName: `${n}.wav`, trackName: n, format: 'WAV', bpm: BPM, duration: 600, addedAt: i, musicalKey: 'A minor', energy: 0.8 }));
    pl.importPlaylists([{ id, name: 'phase', createdAt: Date.now(), updatedAt: Date.now(), tracks }]);
    pl.setActivePlaylist(id);
    const s = useDJStore.getState();
    s.setAutoDJConfig({ shuffle: false, style: 'Club', transitionBars: 8, juggleMode: 'MUSICAL', juggleIntensity: -1 });
    s.setDeckState('A', {
      fileName: 'steady.wav', trackName: 'steady', isPlaying: true, detectedBPM: BPM, effectiveBPM: BPM, durationMs: 600_000, audioPosition: 10,
      pitchOffset: 0, trackAnalysis: corpusAnalysis('steady'), beatGrid: grid(),
    });
    s.setDeckState('B', {
      fileName: 'compatibleKey.wav', trackName: 'compatibleKey', isPlaying: false, detectedBPM: BPM, effectiveBPM: BPM, durationMs: 600_000, audioPosition: 0,
      pitchOffset: 0, trackAnalysis: corpusAnalysis('compatibleKey'), beatGrid: grid(),
    });
    s.setCrossfader(0);
    s.setAutoDJEnabled(true);
    s.setAutoDJStatus('transition-pending');
    s.setAutoDJTrackIndices(0, 1);
    const controller = new DJSessionController();
    setSessionController(controller);
    controller.startSession(tracks.map((track, index) => ({ index, id: track.id, name: track.trackName, artist: null, track })), 0);
    controller.onTrackStarted(0, corpusAnalysis('steady'), { bpm: BPM, key: 'A minor', energy: 0.8 });
    const dj = getAutoDJ() as unknown as Internals;
    dj.transitionCancel = null; dj.execution = null; dj.preloading = false; dj.transitionSweepStarted = false;
    dj.activeDeck = 'A'; dj.idleDeck = 'B'; dj.preloadedDeck = 'B'; dj.jugglePreludeStarted = false;
    dj.incomingAnalysis = corpusAnalysis('compatibleKey');
    dj.preRenderedTrack = { track: tracks[1], data: new ArrayBuffer(8) };
    // The planned mix-in: the master reaches the plan start 2 s after the prelude window opens; the
    // incoming deck will start 40 ms behind the master's bar grid (10 bars + 0 phase - 40 ms).
    const startTimeSec = 10 + PRELUDE_SEC + 2;
    const masterAtStart = startTimeSec - PRELUDE_SEC;
    dj.plan = { style: 'blend', startTimeSec, incomingPosition: PRELUDE_SEC + masterAtStart + 10 * BAR - 0.040, durationSec: 8 * BAR, bars: 8 };
  });

  afterEach(() => {
    const dj = getAutoDJ() as unknown as Internals;
    dj.stopPolling();
    dj.getJuggle().abort('test end');
    dj.plan = null; dj.preRenderedTrack = null; dj.preloadedDeck = null; dj.jugglePreludeStarted = false;
    useDJStore.getState().setAutoDJEnabled(false);
    useDJStore.getState().setAutoDJConfig({ juggleMode: 'OFF' });
    setSessionController(null);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('the incoming deck started 40 ms off the grid is bent into phase: no seek while it plays, heard error < 5 ms', async () => {
    const dj = getAutoDJ() as unknown as Internals;
    dj.startPolling();
    let startedAt: number | null = null;
    for (let t = 0; t < 12_000; t += 50) {
      await vi.advanceTimersByTimeAsync(50);
      if (startedAt === null && decks.B.isPlaying()) startedAt = Date.now();
      if (startedAt !== null && Date.now() - startedAt > 4000) break;
    }
    expect(holder.loads, 'the poll loop never loaded the incoming deck').toBe(1);
    expect(startedAt, 'the incoming deck never started').not.toBeNull();
    // Sentinel: the correction ran through DeckEngine.bendRate.
    expect(decks.B.bends.length, 'no bend: the phase correction never reached the deck as a bend').toBeGreaterThanOrEqual(1);
    expect(decks.B.seeksWhilePlaying, 'a playing deck was seeked').toBe(0);
    expect(decks.A.seeksWhilePlaying).toBe(0);
    expect(errorAtPlay!).toBeCloseTo(-0.040, 3);
    expect(Math.abs(barPhaseErrorSec(decks.A.position(), decks.B.position()))).toBeLessThan(0.005);
  }, 30_000);
});
