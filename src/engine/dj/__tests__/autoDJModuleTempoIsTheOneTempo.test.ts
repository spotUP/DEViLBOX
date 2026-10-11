/**
 * One tempo per track (dj-juggling plan P1, reachability test R1). A module
 * at speed 3 / tick tempo 125 plays 250 BPM. Through the real Auto DJ - enable,
 * the preload finishing (anticipate), the transition loading the preloaded
 * track with the real loadPreRenderedTrackToDeck, DJEngine.loadAudioToDeck and
 * DJPipeline.applyAnalysisToDeck - the deck BPM, the deck beat grid, the
 * DJTrackAnalysis and the playlist BPM all read the module's own timing, never
 * the audio analysis' 125 (the DJ-K split: playlist 94, deck 140.95).
 * Fake deck engine, no audio.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  pipeline: null as unknown,
  preRendered: null as unknown,
  moduleGridCalls: 0,
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
  return { ...actual, preRenderTrack: async () => holder.preRendered, loadPlaylistTrackToDeck: async () => false };
});
vi.mock('../DJPipeline', async (orig) => {
  const actual = await orig<typeof import('../DJPipeline')>();
  return { ...actual, getDJPipeline: () => holder.pipeline };
});
vi.mock('../DJPerSongFx', () => ({ applyPerSongMasterFx: () => {} }));
// Sentinel: the module grid ran (anticipate + deck load).
vi.mock('../autodj/moduleBeatGrid', async (orig) => {
  const actual = await orig<typeof import('../autodj/moduleBeatGrid')>();
  return { ...actual, moduleBeatGrid: (...args: Parameters<typeof actual.moduleBeatGrid>) => { holder.moduleGridCalls++; return actual.moduleBeatGrid(...args); } };
});

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { useDJStore } from '@/stores/useDJStore';
import { useDJPlaylistStore, type PlaylistTrack } from '@/stores/useDJPlaylistStore';
import { getAutoDJ } from '../DJAutoDJ';
import { corpusPipelineAnalysis, corpusTrack, corpusTrackerSong, corpusAnalysis } from '../autodj/testing/corpus';
import { timeOrderPositions } from '../autodj/trackerMixAnalysis';
import { setSessionController, DJSessionController } from '../autodj/sessionController';

type Internals = {
  activeDeck: 'A' | 'B'; idleDeck: 'A' | 'B'; preloadedDeck: 'A' | 'B' | null;
  stopPolling(): void; preloadNextTrack(): Promise<void>; triggerTransition(bars: number): Promise<void>;
};

function fakeDeck(id: 'A' | 'B', durationSec: () => number) {
  let playing = id === 'A';
  let song: TrackerSong | null = null;
  return {
    id, playbackMode: 'audio' as const,
    play: async () => { playing = true; }, stop: () => { playing = false; }, isPlaying: () => playing,
    setPitch: () => {}, setKeyLock: () => {}, setEQ: () => {}, setEQKill: () => {}, setFilterPosition: () => {}, getFilterPosition: () => 0,
    setFilterResonance: () => {}, setVolume: () => {}, getVolume: () => 1, setEchoSend: () => {}, setEchoParams: () => {}, setReverbSend: () => {},
    setAudioLoop: () => {}, clearAudioLoop: () => {},
    loadSong: async (s: TrackerSong) => { song = s; }, clearLoadedSong: () => { song = null; }, getLoadedSong: () => song,
    loadAudioFile: async () => ({ duration: durationSec(), sampleRate: 44100, numberOfChannels: 2, waveformPeaks: new Float32Array(4) }),
    audioPlayer: { seek: () => {}, getPosition: () => 20, getDuration: () => 600, stop: () => {} },
    replayer: { getElapsedMs: () => 20_000 },
  };
}

describe('a module\'s own tempo is the one tempo: deck, grid, analysis and playlist agree', () => {
  let renderSec = 0;
  beforeEach(async () => {
    vi.useFakeTimers();
    holder.moduleGridCalls = 0;
    const { DJEngine } = await vi.importActual<typeof import('../DJEngine')>('../DJEngine');
    const { DJPipeline } = await vi.importActual<typeof import('../DJPipeline')>('../DJPipeline');
    holder.pipeline = Object.create(DJPipeline.prototype);
    const decks = { A: fakeDeck('A', () => 600), B: fakeDeck('B', () => renderSec) };
    holder.engine = Object.assign(Object.create(DJEngine.prototype), {
      getDeck: (id: 'A' | 'B') => decks[id], remapInstrumentIds: () => {}, tryAutoLoadStems: async () => {}, recorder: null, _pendingTrackSource: null,
      mixer: { setCrossfader: () => {} }, setCrossfader: () => {},
    });
    const pl = useDJPlaylistStore.getState();
    const id = `one-tempo-${Date.now()}`;
    const tracks: PlaylistTrack[] = [
      { id: 'out', fileName: 'out.wav', trackName: 'out', format: 'WAV', bpm: 126, duration: 600, addedAt: 0, musicalKey: 'A minor', energy: 0.8 },
      // The playlist analyser's old audio reading.
      { id: 'mod', fileName: 'speed3.mod', trackName: 'speed3', format: 'MOD', bpm: 125, duration: 31, addedAt: 1, musicalKey: 'A minor', energy: 0.7 },
    ];
    pl.importPlaylists([{ id, name: 'one tempo', createdAt: Date.now(), updatedAt: Date.now(), tracks }]);
    pl.setActivePlaylist(id);
    const s = useDJStore.getState();
    s.setAutoDJConfig({ shuffle: false, style: 'Club', transitionBars: 8, juggleMode: 'OFF' });
    s.setDeckState('A', {
      fileName: 'out.wav', trackName: 'out', isPlaying: true, detectedBPM: 126, effectiveBPM: 126, durationMs: 600_000, audioPosition: 20,
      trackAnalysis: corpusAnalysis('steady'), beatGrid: { beats: corpusTrack('steady').beats, downbeats: corpusTrack('steady').downbeats, bpm: 126, timeSignature: 4 },
    });
    s.setDeckState('B', { fileName: null, isPlaying: false, detectedBPM: 0, beatGrid: null, trackAnalysis: null });
    setSessionController(new DJSessionController());
  });
  afterEach(() => {
    const dj = getAutoDJ() as unknown as Internals;
    dj.stopPolling();
    getAutoDJ().disable();
    setSessionController(null);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('speed 3 / tempo 125: deck detectedBPM, deck grid, trackAnalysis and playlist bpm are all 250', async () => {
    const song = { ...corpusTrackerSong(), initialSpeed: 3 } as TrackerSong;
    const { positions } = timeOrderPositions(song);
    // The render: the song plus a short decay tail.
    renderSec = positions[positions.length - 1].end + 0.4;
    // The audio analysis heard the module at its tick tempo (125): the reading the module grid replaces.
    const audio = corpusPipelineAnalysis(corpusTrack('tracker'));
    expect(audio.bpm).toBe(125);
    holder.preRendered = { wavData: new ArrayBuffer(8), filename: 'speed3.mod', trackName: 'speed3', bpm: audio.bpm, song, duration: renderSec, analysis: audio };

    expect(await getAutoDJ().enable(0)).toBeNull();
    const dj = getAutoDJ() as unknown as Internals;
    dj.stopPolling();
    expect(dj.activeDeck).toBe('A');
    await dj.preloadNextTrack();
    expect(dj.preloadedDeck).toBe('B');
    await dj.triggerTransition(8);

    expect(holder.moduleGridCalls, 'moduleBeatGrid ran for anticipate and the deck load').toBeGreaterThanOrEqual(2);
    const deck = useDJStore.getState().decks.B;
    const playlistTrack = useDJPlaylistStore.getState().playlists.find((p) => p.id === useDJPlaylistStore.getState().activePlaylistId)!.tracks[1];
    expect(deck.trackAnalysis?.tempoSource).toBe('module');
    expect(deck.trackAnalysis?.bpm).toBeCloseTo(250, 2);
    expect(deck.trackAnalysis?.beatGrid.confidence).toBe(1);
    expect(deck.detectedBPM).toBeCloseTo(250, 2);
    expect(deck.beatGrid?.bpm).toBeCloseTo(250, 2);
    // The deck grid is the module's: a beat every 4 rows (0.24 s at 250 BPM), a bar every 16.
    expect(deck.beatGrid!.beats[1] - deck.beatGrid!.beats[0]).toBeCloseTo(0.24, 6);
    expect(deck.beatGrid!.downbeats[1] - deck.beatGrid!.downbeats[0]).toBeCloseTo(0.96, 6);
    expect(playlistTrack.bpm).toBeCloseTo(250, 2);
    expect(playlistTrack.djSummary?.bpm).toBeCloseTo(250, 2);
  }, 30_000);

  it('a render that does not match the walk: all four read the audio analysis', async () => {
    const song = { ...corpusTrackerSong(), initialSpeed: 3 } as TrackerSong;
    const { positions } = timeOrderPositions(song);
    // 10 % longer than the walk: a loop the walk did not follow; the song's timing is not trusted.
    renderSec = positions[positions.length - 1].end * 1.1;
    const audio = corpusPipelineAnalysis(corpusTrack('tracker'));
    holder.preRendered = { wavData: new ArrayBuffer(8), filename: 'speed3.mod', trackName: 'speed3', bpm: audio.bpm, song, duration: renderSec, analysis: audio };

    expect(await getAutoDJ().enable(0)).toBeNull();
    const dj = getAutoDJ() as unknown as Internals;
    dj.stopPolling();
    await dj.preloadNextTrack();
    await dj.triggerTransition(8);

    const deck = useDJStore.getState().decks.B;
    const playlistTrack = useDJPlaylistStore.getState().playlists.find((p) => p.id === useDJPlaylistStore.getState().activePlaylistId)!.tracks[1];
    expect(deck.trackAnalysis?.tempoSource).toBe('audio');
    expect(deck.trackAnalysis?.bpm).toBe(125);
    expect(deck.detectedBPM).toBe(125);
    expect(deck.beatGrid?.bpm).toBe(125);
    expect(playlistTrack.bpm).toBe(125);
  }, 30_000);
});
