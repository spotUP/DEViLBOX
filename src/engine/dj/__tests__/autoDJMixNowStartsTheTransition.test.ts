/**
 * Mix Now (owner live test 2026-10-08: "does nothing"): pressing the button
 * calls DJActions.skipAutoDJ -> DJAutoDJ.skip. With a playing deck and a
 * queued next track the transition must start at once: the status leaves
 * 'playing', the next track is loaded onto the idle deck, the skip crossfade
 * fires through the DJ quantised FX path, and the sweep guard is set so the
 * poll loop can complete it. Also with a pre-rendered next track and an
 * anticipated plan in place (the planner must not hold a skip).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  pipeline: null as unknown,
  skips: [] as Array<{ from: string; to: string; bars: number }>,
  legacy: 0,
  loads: [] as string[],
  failNext: '' as string,
}));

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));
vi.mock('../DJQuantizedFX', () => {
  const record = () => () => { holder.legacy++; return () => {}; };
  return {
    beatMatchedTransition: record(), cutTransition: record(), filterBuildTransition: record(), bassSwapTransition: record(), echoOutTransition: record(),
    skipTransition: (from: string, to: string, bars: number) => { holder.skips.push({ from, to, bars }); return () => {}; },
    getQuantizeMode: () => 'off', setQuantizeMode: () => {},
    filterSweep: () => () => {}, filterReset: () => () => {}, echoOut: () => () => {}, instantEQKill: () => {}, quantizedEQKill: () => () => {}, cancelAllAutomation: () => {},
  };
});
vi.mock('../DJTrackLoader', async (orig) => {
  const actual = await orig<typeof import('../DJTrackLoader')>();
  return {
    ...actual,
    preRenderTrack: async () => null,
    loadPlaylistTrackToDeck: async (track: { fileName: string; isBad?: boolean }, deck: string) => {
      holder.loads.push(`${track.fileName}@${deck}`);
      if (track.fileName === holder.failNext) {
        // What the real loader does on a load timeout: the playlist marks the track bad.
        const pl = useDJPlaylistStore.getState();
        const active = pl.playlists.find((p) => p.id === pl.activePlaylistId)!;
        pl.markTrackBad(active.id, active.tracks.findIndex((t) => t.fileName === track.fileName), 'Track load timeout');
        return false;
      }
      useDJStore.getState().setDeckState(deck as 'A' | 'B', { fileName: track.fileName, trackName: track.fileName, detectedBPM: 126, effectiveBPM: 126, durationMs: 180_000 });
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
import { useDJPlaylistStore, type PlaylistTrack } from '@/stores/useDJPlaylistStore';
import { skipAutoDJ } from '../DJActions';
import { getAutoDJ } from '../DJAutoDJ';
import { corpusAnalysis, corpusTrack, corpusPipelineAnalysis } from '../autodj/testing/corpus';
import { computeExtendedAnalysis } from '../autodj/activityTimelines';
import { setSessionController, DJSessionController } from '../autodj/sessionController';

type Internals = {
  activeDeck: 'A' | 'B'; idleDeck: 'A' | 'B'; preloadedDeck: 'A' | 'B' | null;
  preRenderedTrack: { track: unknown; data: unknown } | null;
  plan: unknown; transitionSweepStarted: boolean; pollTimer: unknown;
  transitionCancel: (() => void) | null; execution: unknown; preloading: boolean; incomingAnalysis: unknown;
  startPolling(): void; stopPolling(): void;
};

function fakeDeck(id: string) {
  let playing = id === 'A';
  return {
    id, playbackMode: 'audio' as const,
    play: async () => { playing = true; }, stop: () => { playing = false; }, isPlaying: () => playing,
    setPitch: () => {}, setKeyLock: () => {}, setEQ: () => {}, setEQKill: () => {}, setFilterPosition: () => {}, getFilterPosition: () => 0,
    setFilterResonance: () => {}, setVolume: () => {}, getVolume: () => 1, setEchoSend: () => {}, setEchoParams: () => {}, setReverbSend: () => {},
    setAudioLoop: () => {}, clearAudioLoop: () => {}, loadSong: async () => {}, clearLoadedSong: () => {}, getLoadedSong: () => null,
    loadAudioFile: async () => ({ duration: 120, sampleRate: 22050, numberOfChannels: 1, waveformPeaks: new Float32Array(4) }),
    audioPlayer: { seek: () => {}, getPosition: () => 30, getDuration: () => 180, stop: () => {} },
    replayer: { getElapsedMs: () => 30_000 },
  };
}

function playlist(): PlaylistTrack[] {
  return ['steady', 'longIntro', 'drops'].map((id, i) => ({ id, fileName: `${id}.wav`, trackName: id, format: 'WAV', bpm: 126, duration: 180, addedAt: i, musicalKey: 'A minor', energy: 0.7 }));
}

describe('Mix Now starts the transition at once', () => {
  beforeEach(async () => {
    holder.skips.length = 0; holder.legacy = 0; holder.loads.length = 0; holder.failNext = '';
    const { DJEngine } = await vi.importActual<typeof import('../DJEngine')>('../DJEngine');
    const { DJPipeline } = await vi.importActual<typeof import('../DJPipeline')>('../DJPipeline');
    holder.pipeline = Object.create(DJPipeline.prototype);
    const decks: Record<string, ReturnType<typeof fakeDeck>> = { A: fakeDeck('A'), B: fakeDeck('B') };
    holder.engine = Object.assign(Object.create(DJEngine.prototype), {
      getDeck: (id: string) => decks[id], remapInstrumentIds: () => {}, tryAutoLoadStems: async () => {}, recorder: null, _pendingTrackSource: null,
      mixer: { setCrossfader: () => {} }, setCrossfader: () => {},
    });
    const pl = useDJPlaylistStore.getState();
    const id = `mixnow-${Date.now()}`;
    pl.importPlaylists([{ id, name: 'mix now', createdAt: Date.now(), updatedAt: Date.now(), tracks: playlist() }]);
    pl.setActivePlaylist(id);
    const s = useDJStore.getState();
    s.setAutoDJConfig({ shuffle: false, style: 'Club', transitionBars: 8 });
    s.setDeckState('A', { fileName: 'steady.wav', isPlaying: true, detectedBPM: 126, effectiveBPM: 126, durationMs: 180_000, audioPosition: 30, trackAnalysis: corpusAnalysis('steady'), beatGrid: { beats: corpusTrack('steady').beats, downbeats: corpusTrack('steady').downbeats, bpm: 126, timeSignature: 4 } });
    s.setDeckState('B', { fileName: null, isPlaying: false, trackAnalysis: null });
    s.setAutoDJEnabled(true);
    s.setAutoDJStatus('playing');
    s.setAutoDJTrackIndices(0, 1);
    // What enable() does: the controller knows the playing track and plans the order from it.
    const controller = new DJSessionController();
    setSessionController(controller);
    const sessionTracks = playlist().map((track, index) => ({ index, id: track.id, name: track.trackName, artist: null, track }));
    controller.startSession(sessionTracks, 0);
    controller.onTrackStarted(0, corpusAnalysis('steady'), { bpm: 126, key: 'A minor', energy: 0.7 });
    const dj = getAutoDJ() as unknown as Internals;
    // The singleton keeps state between tests: reset what a previous skip left behind.
    dj.transitionCancel = null; dj.execution = null; dj.preloading = false; dj.incomingAnalysis = null; dj.transitionSweepStarted = false;
    dj.activeDeck = 'A'; dj.idleDeck = 'B'; dj.preloadedDeck = null; dj.preRenderedTrack = null; dj.plan = null;
  });
  afterEach(() => { (getAutoDJ() as unknown as Internals).stopPolling(); useDJStore.getState().setAutoDJEnabled(false); setSessionController(null); vi.restoreAllMocks(); });

  it('with no track preloaded yet: loads the next track onto the idle deck and fires the skip crossfade', async () => {
    await skipAutoDJ();
    expect(holder.loads).toEqual(['longIntro.wav@B']);
    // The crossfade fires within the plan's allowed wait: a skip is immediate (no grid wait), only the deck load is awaited.
    await vi.waitFor(() => expect(holder.skips).toEqual([{ from: 'A', to: 'B', bars: 4 }]), { timeout: 3000 });
    expect(useDJStore.getState().autoDJStatus).toBe('transitioning');
    await vi.waitFor(() => expect((getAutoDJ() as unknown as Internals).transitionSweepStarted).toBe(true), { timeout: 3000 });
  }, 30_000);

  it('when the queued track fails to load, Mix Now moves on to the next loadable track instead of doing nothing', async () => {
    holder.failNext = 'longIntro.wav';
    await skipAutoDJ();
    await vi.waitFor(() => expect(holder.skips.length).toBe(1), { timeout: 5000 });
    expect(holder.loads).toEqual(['longIntro.wav@B', 'drops.wav@B']);
    expect(useDJStore.getState().autoDJStatus).toBe('transitioning');
    expect(useDJStore.getState().autoDJNextTrackIndex).toBe(2);
  }, 30_000);

  it('with a pre-rendered next track and an anticipated plan: Mix Now still fires at once, not at the planned mix-out', async () => {
    const track = corpusTrack('longIntro');
    const extended = computeExtendedAnalysis(track.pcm, track.sampleRate, { beats: track.beats });
    const dj = getAutoDJ() as unknown as Internals;
    dj.preloadedDeck = 'B';
    dj.preRenderedTrack = { track: { fileName: 'longIntro.wav', trackName: 'longIntro', id: 'longIntro' }, data: { wavData: new ArrayBuffer(8), filename: 'longIntro.wav', trackName: 'longIntro', bpm: 124, duration: track.durationSec, analysis: { ...corpusPipelineAnalysis(track), extended } } };
    useDJStore.getState().setAutoDJStatus('transition-pending');
    await skipAutoDJ();
    await vi.waitFor(() => expect(holder.skips.length).toBe(1), { timeout: 5000 });
    expect(holder.legacy).toBe(0);
    expect(useDJStore.getState().autoDJStatus).toBe('transitioning');
    await vi.waitFor(() => expect(dj.transitionSweepStarted).toBe(true), { timeout: 3000 });
  }, 60_000);
});
