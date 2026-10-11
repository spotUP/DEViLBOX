/**
 * Smart Sort stops using keys for every playlist analysed before analyses recorded a key confidence
 * (audit M9): such a track has a musicalKey and no djSummary, so keyConfidenceOf reads 0 and every pair
 * with it scores the unknown-key penalty. The confidence cannot be recovered from what was stored: the
 * playlist store migration (v3) marks those tracks, the Analyze actions pick them up, and the analysis
 * write clears the mark and records the confidence, so the key counts again.
 */
import { describe, it, expect, vi } from 'vitest';

const holder = vi.hoisted(() => ({ analysis: null as unknown }));

vi.mock('../DJAudioCache', async (orig) => ({
  ...(await orig<typeof import('../DJAudioCache')>()),
  getCachedAudioByFilename: async () => ({ sourceData: new ArrayBuffer(16), audioData: new ArrayBuffer(16) }),
  cacheSourceFile: async () => {},
}));
vi.mock('../DJPipeline', async (orig) => ({
  ...(await orig<typeof import('../DJPipeline')>()),
  getDJPipeline: () => ({ loadOrEnqueue: async () => ({ wavData: new ArrayBuffer(8), duration: 90, sampleRate: 44100, waveformPeaks: new Float32Array(4), analysis: holder.analysis }) }),
}));

import { useDJPlaylistStore, type DJPlaylist, type PlaylistTrack } from '@/stores/useDJPlaylistStore';
import { analyzePlaylist, trackNeedsAnalysis, playlistNeedsAnalysis } from '../DJPlaylistAnalyzer';
import { keyTerm } from '../DJPlaylistSort';
import { corpusPipelineAnalysis, corpusTrack } from '../autodj/testing/corpus';

const oldTrack = (id: string, over: Partial<PlaylistTrack> = {}): PlaylistTrack => ({ id, fileName: `${id}.wav`, trackName: id, format: 'WAV', bpm: 124, duration: 200, addedAt: 0, musicalKey: '8A', energy: 0.5, ...over });

function migrate(playlists: DJPlaylist[]): DJPlaylist[] {
  const m = useDJPlaylistStore.persist.getOptions().migrate!;
  return (m({ playlists, activePlaylistId: null }, 2) as { playlists: DJPlaylist[] }).playlists;
}

describe('a track analysed before key confidence was recorded', () => {
  it('is marked by the migration, analysed again, and then counts its key in Smart Sort', async () => {
    const [pl] = migrate([{ id: `old-${Date.now()}`, name: 'old', createdAt: 0, updatedAt: 0, tracks: [oldTrack('a'), oldTrack('keyless', { musicalKey: undefined }), oldTrack('skipped', { analysisSkipped: true })] }]);
    const [a, keyless, skipped] = pl.tracks;
    // Migration: only the key-without-summary track is marked, nothing is dropped.
    expect(pl.tracks).toHaveLength(3);
    expect(a.keyConfidenceStale).toBe(true);
    expect(keyless.keyConfidenceStale).toBeUndefined();
    expect(skipped.keyConfidenceStale).toBeUndefined();
    // It has a BPM, which used to be the only reason to analyse; now the mark is.
    expect(trackNeedsAnalysis(a)).toBe(true);
    expect(trackNeedsAnalysis(keyless)).toBe(false);
    expect(trackNeedsAnalysis(skipped)).toBe(false);
    expect(playlistNeedsAnalysis(pl)).toBe(true);
    // Before: the key weighs nothing (unknown penalty only).
    const peer = { ...a, id: 'peer' };
    const before = keyTerm(a, peer);

    holder.analysis = corpusPipelineAnalysis(corpusTrack('steady'));
    useDJPlaylistStore.getState().importPlaylists([{ ...pl, tracks: [a] }]);
    const r = await analyzePlaylist(pl.id);
    expect(r.analyzed).toBe(1);
    const after = useDJPlaylistStore.getState().playlists.find((p) => p.id === pl.id)!.tracks[0];
    expect(after.keyConfidenceStale).toBe(false);
    expect(after.djSummary?.keyConfidence).toBeGreaterThan(0);
    expect(trackNeedsAnalysis(after)).toBe(false);
    // The key now counts: the same key twice is no longer scored as unknown.
    expect(keyTerm(after, { ...after, id: 'twin' })).toBeLessThan(before);
  }, 30_000);
});
