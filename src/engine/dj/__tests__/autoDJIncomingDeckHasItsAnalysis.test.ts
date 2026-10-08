/**
 * Auto DJ's preloaded track reached the idle deck without its analysis: the
 * preload renders with no deck id, loading cleared the beat grid, the deck kept
 * the key and energy of the track it held before, and triggerTransition chose
 * the transition from a store snapshot taken before the load (found reading the
 * code 2026-10-08; live dj_get_state showed musicalKey null on both decks).
 *
 * Drives the real triggerTransition with a pre-rendered track: the real
 * loadPreRenderedTrackToDeck, DJEngine.loadAudioToDeck and DJPipeline analysis
 * apply, against a fake deck engine. The transition functions are recorded with
 * the incoming deck's state at the moment each is chosen.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  pipeline: null as unknown,
  chosen: [] as Array<{ type: string; incoming: { beatGrid: unknown; musicalKey: string | null; energy: number } }>,
}));

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));
vi.mock('../DJQuantizedFX', async () => {
  const { useDJStore } = await import('@/stores/useDJStore');
  const record = (type: string) => (_from: string, to: 'A' | 'B') => {
    const d = useDJStore.getState().decks[to];
    holder.chosen.push({ type, incoming: { beatGrid: d.beatGrid, musicalKey: d.musicalKey, energy: d.energy } });
    return () => {};
  };
  return {
    beatMatchedTransition: record('crossfade'),
    skipTransition: record('skip'),
    cutTransition: record('cut'),
    filterBuildTransition: record('filter-build'),
    bassSwapTransition: record('bass-swap'),
    echoOutTransition: record('echo-out'),
    getQuantizeMode: () => 'off',
  };
});
// A real DJPipeline starts a worker; the stand-in is the real class without its constructor.
vi.mock('../DJPipeline', () => ({
  getDJPipeline: () => holder.pipeline,
  analysisFromCachedAudio: () => null,
}));
vi.mock('../DJPerSongFx', () => ({ applyPerSongMasterFx: () => {} }));

import { getAutoDJ } from '../DJAutoDJ';
import { useDJStore } from '@/stores/useDJStore';
import type { PipelineResult } from '../DJPipeline';

const analysis = (key: string, energy: number, bpm: number): NonNullable<PipelineResult['analysis']> => ({
  bpm, bpmConfidence: 1, beats: [0, 60 / bpm, 120 / bpm], downbeats: [0], timeSignature: 4,
  musicalKey: key, keyConfidence: 0.9, frequencyPeaks: [[0.1], [0.2], [0.3]], rmsDb: -14, peakDb: -1,
  genre: { primary: 'Electronic', subgenre: 'House', confidence: 1, mood: 'Energetic', energy, danceability: 0.7 },
});

type Internals = {
  activeDeck: 'A' | 'B'; idleDeck: 'A' | 'B'; preloadedDeck: 'A' | 'B' | null;
  preRenderedTrack: { track: unknown; data: unknown } | null;
  triggerTransition(bars: number): Promise<void>;
};

describe('the incoming Auto DJ deck has its own analysis when the transition is chosen', () => {
  beforeEach(async () => {
    holder.chosen.length = 0;
    const { DJEngine } = await vi.importActual<typeof import('../DJEngine')>('../DJEngine');
    const { DJPipeline } = await vi.importActual<typeof import('../DJPipeline')>('../DJPipeline');
    holder.pipeline = Object.create(DJPipeline.prototype);
    const deck = {
      loadSong: async () => {}, clearLoadedSong: () => {}, getLoadedSong: () => null,
      loadAudioFile: async () => ({ duration: 240, sampleRate: 44100, numberOfChannels: 2, waveformPeaks: new Float32Array(4) }),
    };
    holder.engine = Object.assign(Object.create(DJEngine.prototype), {
      getDeck: () => deck, remapInstrumentIds: () => {}, tryAutoLoadStems: async () => {},
      recorder: null, _pendingTrackSource: null,
    });
    const s = useDJStore.getState();
    // Deck A is playing a loud track in A minor; deck B still holds a quiet track in F# major.
    s.setDeckState('A', { fileName: 'out.wav', isPlaying: true, effectiveBPM: 126, detectedBPM: 126, musicalKey: 'A minor', energy: 0.8,
      beatGrid: { beats: [0, 0.48], downbeats: [0], bpm: 126, timeSignature: 4 } });
    s.setDeckState('B', { fileName: 'old.wav', isPlaying: false, musicalKey: 'F# major', energy: 0.2,
      beatGrid: { beats: [0, 0.5], downbeats: [0], bpm: 120, timeSignature: 4 } });
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  async function runTransition(data: Record<string, unknown>) {
    const dj = getAutoDJ() as unknown as Internals;
    dj.activeDeck = 'A'; dj.idleDeck = 'B'; dj.preloadedDeck = 'B';
    dj.preRenderedTrack = { track: { fileName: 'in.wav', trackName: 'in' }, data: { wavData: new ArrayBuffer(8), filename: 'in.wav', trackName: 'in', bpm: 126, duration: 240, ...data } };
    useDJStore.getState().setAutoDJStatus('transition-pending');
    await dj.triggerTransition(8);
  }

  it('a preloaded track arrives with its beat grid, key and energy, and the transition is chosen from them', async () => {
    await runTransition({ analysis: analysis('A minor', 0.8, 126) });
    const incoming = holder.chosen[0];
    expect(incoming.incoming.beatGrid).toMatchObject({ bpm: 126, timeSignature: 4 });
    expect(incoming.incoming.musicalKey).toBe('A minor');
    expect(incoming.incoming.energy).toBe(0.8);
    // same key, close tempo, high energy: bass-swap (with the old deck state: echo-out)
    expect(incoming.type).toBe('bass-swap');
  });

  it('a preloaded track without an analysis does not inherit the key and energy of the track before it', async () => {
    await runTransition({});
    const incoming = holder.chosen[0];
    expect(incoming.incoming.musicalKey).toBeNull();
    expect(incoming.incoming.energy).toBe(0.5);
    expect(incoming.incoming.beatGrid).toBeNull();
  });
});
