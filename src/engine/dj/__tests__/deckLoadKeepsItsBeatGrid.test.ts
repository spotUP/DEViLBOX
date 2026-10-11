/**
 * A playlist track loaded to a deck kept no beat grid (live MCP probe
 * 2026-10-11: ultraux vision on deck B, analysisState 'ready', beatGrid null,
 * detectedBPM the audio 140.95). The cached-audio load never applied the
 * analysis; the render load applied it during the render, then
 * loadAudioToDeck renamed the deck's file (.wav), which clears the grid, and
 * the analysis was built with the previous song. Without a grid, sync never
 * phase-aligns. Now every load applies the analysis once the deck holds the
 * track: the grid is there and it is the module's.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const holder = vi.hoisted(() => ({ engine: null as unknown, pipeline: null as unknown, cached: null as unknown }));

vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => holder.engine,
  getDJEngineIfActive: () => holder.engine,
}));
vi.mock('../DJAudioCache', async (orig) => ({
  ...(await orig<typeof import('../DJAudioCache')>()),
  getCachedAudioByFilename: async () => holder.cached,
}));
vi.mock('../DJPipeline', async (orig) => {
  const actual = await orig<typeof import('../DJPipeline')>();
  return { ...actual, getDJPipeline: () => holder.pipeline };
});

import { useDJStore } from '@/stores/useDJStore';
import { loadPlaylistTrackToDeck } from '../DJTrackLoader';
import { cacheSong } from '../DJSongCache';
import { corpusTrackerSong, corpusTrack } from '../autodj/testing/corpus';
import { timeOrderPositions } from '../autodj/trackerMixAnalysis';

describe('a deck load keeps its beat grid, and it is the module\'s', () => {
  beforeEach(async () => {
    const { DJEngine } = await vi.importActual<typeof import('../DJEngine')>('../DJEngine');
    const { DJPipeline } = await vi.importActual<typeof import('../DJPipeline')>('../DJPipeline');
    holder.pipeline = Object.create(DJPipeline.prototype);
    let song: TrackerSong | null = null;
    const deck = {
      loadSong: async (s: TrackerSong) => { song = s; }, clearLoadedSong: () => { song = null; }, getLoadedSong: () => song,
      loadAudioFile: async () => ({ duration: (holder.cached as { duration: number }).duration, sampleRate: 44100, numberOfChannels: 2, waveformPeaks: new Float32Array(4) }),
    };
    holder.engine = Object.assign(Object.create(DJEngine.prototype), {
      getDeck: () => deck, remapInstrumentIds: () => {}, tryAutoLoadStems: async () => {}, recorder: null, _pendingTrackSource: null,
    });
    useDJStore.getState().setDeckState('B', { fileName: 'before.mod', beatGrid: null, trackAnalysis: null, detectedBPM: 0 });
  });

  it('a cached module loads with the module grid: 125 BPM at speed 3, a beat every 8 rows', async () => {
    const song = { ...corpusTrackerSong(), initialSpeed: 3 } as TrackerSong;
    const { positions } = timeOrderPositions(song);
    const duration = positions[positions.length - 1].end + 0.3;
    cacheSong('modland:pub/modules/x/speed3.mod', song);
    const t = corpusTrack('tracker');
    // The cached audio analysis read 140.95 (the deck number of the live probe).
    holder.cached = {
      hash: 'h', filename: 'speed3.mod', audioData: new ArrayBuffer(16), duration, waveformPeaks: [0], sampleRate: 44100, numberOfChannels: 2,
      timestamp: 0, sizeBytes: 16, beatGrid: { beats: t.beats, downbeats: t.downbeats, bpm: 140.95, timeSignature: 4 }, bpm: 140.95, bpmConfidence: 0.9,
    };
    const ok = await loadPlaylistTrackToDeck({ id: 'x', fileName: 'modland:pub/modules/x/speed3.mod', trackName: 'speed3', format: 'MOD', bpm: 0, duration: 0, addedAt: 0 }, 'B');
    expect(ok).toBe(true);
    const d = useDJStore.getState().decks.B;
    expect(d.beatGrid).not.toBeNull();
    expect(d.trackAnalysis?.tempoSource).toBe('module');
    expect(d.beatGrid!.bpm).toBeCloseTo(125, 2);
    expect(d.detectedBPM).toBeCloseTo(125, 2);
    expect(d.beatGrid!.beats[1] - d.beatGrid!.beats[0]).toBeCloseTo(0.48, 6);
  });
});
