/**
 * Plan section 3 reachability: the unified DJTrackAnalysis reaches the deck
 * through the product path. Auto DJ's triggerTransition loads the pre-rendered
 * track (real loadPreRenderedTrackToDeck, real DJEngine.loadAudioToDeck, real
 * DJPipeline.applyAnalysisToDeck) and the incoming deck ends up holding
 * sections, phrases, cue points and confidences built from the worker's
 * extended analysis - not only the legacy beat grid, key and energy.
 *
 * Also the cache contract: an entry analysed before the extended analysis
 * existed is not "fully analysed" (it is re-analysed), and a current entry
 * carries the extended data back out.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({
  engine: null as unknown,
  pipeline: null as unknown,
  transitions: 0,
}));

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));
vi.mock('../DJQuantizedFX', () => {
  const record = () => () => { holder.transitions++; return () => {}; };
  return {
    beatMatchedTransition: record(), skipTransition: record(), cutTransition: record(),
    filterBuildTransition: record(), bassSwapTransition: record(), echoOutTransition: record(),
    getQuantizeMode: () => 'off',
  };
});
vi.mock('../DJPipeline', async (orig) => {
  const actual = await orig<typeof import('../DJPipeline')>();
  return { ...actual, getDJPipeline: () => holder.pipeline };
});
vi.mock('../DJPerSongFx', () => ({ applyPerSongMasterFx: () => {} }));

import { getAutoDJ } from '../DJAutoDJ';
import { useDJStore } from '@/stores/useDJStore';
import { analysisFromCachedAudio, isCacheFullyAnalyzed } from '../DJPipeline';
import type { CachedAudio } from '../DJAudioCache';
import { corpusTrack, corpusPipelineAnalysis } from '../autodj/testing/corpus';
import { computeExtendedAnalysis } from '../autodj/activityTimelines';
import { DJ_ANALYSIS_VERSION, DJ_AUDIO_ANALYSIS_VERSION } from '../autodj/trackAnalysis';

type Internals = {
  activeDeck: 'A' | 'B'; idleDeck: 'A' | 'B'; preloadedDeck: 'A' | 'B' | null;
  preRenderedTrack: { track: unknown; data: unknown } | null;
  triggerTransition(bars: number): Promise<void>;
};

describe('the incoming Auto DJ deck holds the unified DJTrackAnalysis', () => {
  beforeAll(() => { corpusTrack('longIntro'); corpusTrack('steady'); corpusTrack('short'); }, 120_000);
  beforeEach(async () => {
    holder.transitions = 0;
    const { DJEngine } = await vi.importActual<typeof import('../DJEngine')>('../DJEngine');
    const { DJPipeline } = await vi.importActual<typeof import('../DJPipeline')>('../DJPipeline');
    holder.pipeline = Object.create(DJPipeline.prototype);
    const deck = {
      loadSong: async () => {}, clearLoadedSong: () => {}, getLoadedSong: () => null,
      loadAudioFile: async () => ({ duration: corpusTrack('longIntro').durationSec, sampleRate: 22050, numberOfChannels: 1, waveformPeaks: new Float32Array(4) }),
    };
    holder.engine = Object.assign(Object.create(DJEngine.prototype), {
      getDeck: () => deck, remapInstrumentIds: () => {}, tryAutoLoadStems: async () => {},
      recorder: null, _pendingTrackSource: null,
    });
    const s = useDJStore.getState();
    s.setDeckState('A', { fileName: 'out.wav', isPlaying: true, effectiveBPM: 126, detectedBPM: 126, musicalKey: 'A minor', energy: 0.8,
      beatGrid: { beats: [0, 0.48], downbeats: [0], bpm: 126, timeSignature: 4 } });
    s.setDeckState('B', { fileName: 'old.wav', isPlaying: false, trackAnalysis: null });
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('a pre-rendered track with extended analysis lands on the deck as sections, phrases, cue points and confidences', async () => {
    const track = corpusTrack('longIntro');
    const extended = computeExtendedAnalysis(track.pcm, track.sampleRate, { beats: track.beats });
    const analysis = { ...corpusPipelineAnalysis(track), extended };
    const dj = getAutoDJ() as unknown as Internals;
    dj.activeDeck = 'A'; dj.idleDeck = 'B'; dj.preloadedDeck = 'B';
    dj.preRenderedTrack = {
      track: { fileName: 'in.wav', trackName: 'in' },
      data: { wavData: new ArrayBuffer(8), filename: 'in.wav', trackName: 'in', bpm: 124, duration: track.durationSec, analysis },
    };
    useDJStore.getState().setAutoDJStatus('transition-pending');
    await dj.triggerTransition(8);

    expect(holder.transitions).toBe(1);
    const ta = useDJStore.getState().decks.B.trackAnalysis;
    expect(ta).not.toBeNull();
    expect(ta!.version).toBe(DJ_ANALYSIS_VERSION);
    expect(ta!.sections[0].kind).toBe('intro');
    expect(ta!.phrases.length).toBeGreaterThan(3);
    // The drums enter at bar 16 (31 s at 124 BPM): the deck knows where to start the track.
    expect(ta!.cuePoints.firstDrums!).toBeGreaterThan(28);
    expect(ta!.cuePoints.bestMixIn!).toBeGreaterThan(28);
    expect(ta!.analysisConfidence.beatGrid).toBeGreaterThan(0.5);
    expect(ta!.analysisConfidence.vocal).toBe(0.45);
    expect(ta!.energy.perceivedIntensity).toBeGreaterThan(0);
    expect(ta!.loudness.truePeakDb).toBeGreaterThanOrEqual(ta!.loudness.peakDb - 0.01);
  }, 60_000);

  it('a legacy analysis without extended data still gives the deck a (low-confidence) analysis, never null', async () => {
    const track = corpusTrack('steady');
    const dj = getAutoDJ() as unknown as Internals;
    dj.activeDeck = 'A'; dj.idleDeck = 'B'; dj.preloadedDeck = 'B';
    dj.preRenderedTrack = {
      track: { fileName: 'in.wav', trackName: 'in' },
      data: { wavData: new ArrayBuffer(8), filename: 'in.wav', trackName: 'in', bpm: 126, duration: track.durationSec, analysis: corpusPipelineAnalysis(track) },
    };
    useDJStore.getState().setAutoDJStatus('transition-pending');
    await dj.triggerTransition(8);
    const ta = useDJStore.getState().decks.B.trackAnalysis;
    expect(ta).not.toBeNull();
    expect(ta!.analysisConfidence.vocal).toBe(0);
    expect(ta!.analysisConfidence.bass).toBeLessThan(0.5);
  }, 60_000);

  it('cache contract: a version-1 entry is not fully analysed; a current entry hands the extended data back', () => {
    const base = {
      hash: 'h', filename: 'x.wav', audioData: new ArrayBuffer(8), duration: 10, waveformPeaks: [], sampleRate: 44100,
      numberOfChannels: 2, timestamp: 0, sizeBytes: 8, bpm: 120, beatGrid: { beats: [0], downbeats: [0], bpm: 120, timeSignature: 4 },
    } as unknown as CachedAudio;
    expect(isCacheFullyAnalyzed({ ...base, analysisVersion: 1 })).toBe(false);
    expect(analysisFromCachedAudio({ ...base, analysisVersion: 1 })!.extended).toBeNull();
    const track = corpusTrack('short');
    const extended = computeExtendedAnalysis(track.pcm, track.sampleRate, { beats: track.beats });
    const current = { ...base, analysisVersion: DJ_AUDIO_ANALYSIS_VERSION, extended };
    expect(isCacheFullyAnalyzed(current)).toBe(true);
    expect(analysisFromCachedAudio(current)!.extended).toBe(extended);
  });
});
