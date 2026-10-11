/**
 * The DJ view always sounded processed (the tracker view did not), with a
 * pumping kick (owner report 2026-10-10). Live: deck A's limiter sat in 2-3 dB
 * of gain reduction continuously, one deck playing.
 *
 * Cause: a deck whose track had no loudness measurement got a +9 dB trim
 * ("unanalysed fallback"), and every rendered track was unmeasured on its
 * next load because the pipeline wrote the analysis to the cache WITHOUT
 * rmsDb/peakDb - each cache hit read -100 dB and got the +9 dB.
 *
 * Drives the real pipeline: the analysis write after a render, the cache-hit
 * load, and the analysis applied to the deck Auto DJ loads onto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const holder = vi.hoisted(() => ({
  writes: [] as Array<Record<string, unknown>>,
  cached: null as unknown,
}));

vi.mock('../DJAudioCache', async (orig) => {
  const actual = await orig<typeof import('../DJAudioCache')>();
  return {
    ...actual,
    hashFile: async () => 'hash',
    getCachedAudio: async () => holder.cached,
    cacheAudio: async () => {},
    updateCacheAnalysis: async (_buf: ArrayBuffer, analysis: Record<string, unknown>) => { holder.writes.push(analysis); },
  };
});
vi.mock('@/lib/analysisCache', () => ({ lookupServerAnalysis: async () => null, storeServerAnalysis: () => {} }));
vi.mock('../DJAutoSync', () => ({ autoMatchOnLoad: () => {} }));

import { useDJStore } from '@/stores/useDJStore';
import { DJPipeline, computeAutoTrim, type PipelineResult } from '../DJPipeline';
import { DJ_ANALYSIS_VERSION } from '../autodj/trackAnalysis';
import { DECK_LIMITER_THRESHOLD_DB } from '../djLimiter';

function analysis(rmsDb: number, peakDb: number): NonNullable<PipelineResult['analysis']> {
  return {
    bpm: 125, bpmConfidence: 0.9, beats: [0, 0.48, 0.96, 1.44], downbeats: [0], timeSignature: 4,
    musicalKey: 'A minor', keyConfidence: 0.8, frequencyPeaks: [[0], [0], [0]], rmsDb, peakDb,
    genre: { primary: 'Electronic', subgenre: 'Techno', confidence: 0.5, mood: 'Energetic', energy: 0.7, danceability: 0.7 },
  };
}

function pipeline(result: NonNullable<PipelineResult['analysis']>): DJPipeline {
  return Object.assign(Object.create(DJPipeline.prototype), {
    stemSeparationEnabled: false,
    updateDeckAnalysisState: () => {},
    emitTaskProgress: () => {},
    doAnalysis: async () => result,
  }) as DJPipeline;
}

describe('a DJ deck is not gained into the limiter', () => {
  beforeEach(() => {
    holder.writes.length = 0;
    holder.cached = null;
    useDJStore.getState().setDeckState('A', { fileName: 'track.mod', durationMs: 120_000, autoGainEnabled: true, trimGain: 0 });
  });

  it('a track with no loudness measurement plays at 0 dB trim, not +9 dB', () => {
    expect(computeAutoTrim(-100, -100)).toBe(0);
    pipeline(analysis(-100, -100)).applyAnalysisToDeck('A', analysis(-100, -100));
    expect(useDJStore.getState().decks.A.trimGain).toBe(0);
  });

  it('a typical track (crest 12 dB) plays at its tracker level and reaches the deck limiter with its peaks below the threshold', () => {
    // Owner decision 2026-10-11: decks match the tracker view's level (no per-song normalisation there), the limiter only catches overs.
    pipeline(analysis(-16, -4)).applyAnalysisToDeck('A', analysis(-16, -4));
    const trim = useDJStore.getState().decks.A.trimGain;
    expect(trim).toBe(0);
    expect(-4 + trim).toBeLessThan(DECK_LIMITER_THRESHOLD_DB);
  });

  it('the analysis written to the cache after a render carries the loudness the trim is computed from', async () => {
    const pcm = new Float32Array(4410).fill(0.1);
    const p = pipeline(analysis(-14, -1));
    await (p as unknown as { executeTask(t: unknown): Promise<unknown> }).executeTask({
      id: 't1', fileBuffer: new ArrayBuffer(8), filename: 'track.mod', priority: 'high',
      analysisOnly: true, pcmLeft: pcm, sampleRate: 44100,
    });
    expect(holder.writes).toHaveLength(1);
    expect(holder.writes[0].rmsDb).toBe(-14);
    expect(holder.writes[0].peakDb).toBe(-1);
  });

  it('a cache entry written before the fix reports its extended loudness, not -100 dB', async () => {
    holder.cached = {
      hash: 'hash', filename: 'track.mod', audioData: new ArrayBuffer(64), duration: 120, waveformPeaks: [0, 0], sampleRate: 44100,
      numberOfChannels: 2, timestamp: 0, sizeBytes: 64,
      beatGrid: { beats: [0, 0.48], downbeats: [0], bpm: 125, timeSignature: 4 }, bpm: 125, analysisVersion: DJ_ANALYSIS_VERSION,
      extended: { loudness: { integratedDb: -12, shortTermMaxDb: -10, peakDb: -0.5, truePeakDb: -0.4, dynamicRangeDb: 6, crestFactorDb: 11.5 } },
    };
    await pipeline(analysis(-12, -0.5)).loadOrEnqueue(new ArrayBuffer(8), 'track.mod', 'A');
    expect(useDJStore.getState().decks.A.rmsDb).toBe(-12);
    expect(useDJStore.getState().decks.A.peakDb).toBe(-0.5);
  });
});
