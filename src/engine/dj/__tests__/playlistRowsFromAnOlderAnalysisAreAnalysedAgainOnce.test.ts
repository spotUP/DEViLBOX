/**
 * Playlist rows analysed before the current DJ_ANALYSIS_VERSION are analysed
 * again once, in the background (todos MODULE-BPM-FOLLOWUP a). After the
 * module tempo fix (one song walk) the row of Mortimer Twang 'suggestive
 * vibes' still stored the audio detector's 184.57 BPM: nothing re-analysed a
 * row that had a BPM. The DJ view now runs reanalyzeOutdatedTracks; it goes
 * through the real analyzePlaylist, one track at a time at LOW priority on the
 * one pipeline queue, and a row is analysed once.
 *
 * Fake pipeline and audio cache (as playlistAnalyzerUsesTheModuleTempo); the
 * song is the real module, from the DJ song cache.
 */
import { describe, it, expect, vi } from 'vitest';

const holder = vi.hoisted(() => ({ analysis: null as unknown, calls: [] as Array<{ name: string; priority: unknown }>, inflight: 0, maxInflight: 0 }));

vi.mock('../DJAudioCache', async (orig) => ({
  ...(await orig<typeof import('../DJAudioCache')>()),
  getCachedAudioByFilename: async () => ({ sourceData: new ArrayBuffer(16), audioData: new ArrayBuffer(16) }),
  cacheSourceFile: async () => {},
}));
vi.mock('../DJPipeline', async (orig) => ({
  ...(await orig<typeof import('../DJPipeline')>()),
  getDJPipeline: () => ({
    loadOrEnqueue: async (_buf: ArrayBuffer, name: string, _a: unknown, priority: unknown) => {
      holder.calls.push({ name, priority });
      holder.inflight++;
      holder.maxInflight = Math.max(holder.maxInflight, holder.inflight);
      await new Promise((r) => setTimeout(r, 5));
      holder.inflight--;
      return { wavData: new ArrayBuffer(8), duration: 90, sampleRate: 44100, waveformPeaks: new Float32Array(4), analysis: holder.analysis };
    },
  }),
}));

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';
import { reanalyzeOutdatedTracks, trackNeedsAnalysis, trackAnalysisOutdated } from '../DJPlaylistAnalyzer';
import { DJ_ANALYSIS_VERSION } from '../autodj/trackAnalysis';
import { cacheSong } from '../DJSongCache';
import { corpusPipelineAnalysis, corpusTrack } from '../autodj/testing/corpus';

describe('playlist rows from an older analysis', () => {
  it("are analysed again once in the background: 'suggestive vibes' 184.57 -> 93.75, one at a time, at low priority", async () => {
    const { parseModuleToSong } = await import('@/lib/import/parseModuleToSong');
    const fixture = 'mortimer-twang-suggestive-vibes.mod';
    const song = await parseModuleToSong(new File([readFileSync(resolve(process.cwd(), 'src/__tests__/fixtures', fixture))], fixture));
    cacheSong('suggestive vibes.mod', song);
    cacheSong('suggestive vibes copy.mod', song);
    cacheSong('current.mod', song);
    // The audio detector's reading of the render, as stored on the row.
    holder.analysis = corpusPipelineAnalysis(corpusTrack('tracker'), { bpm: 184.57 });

    const id = `outdated-${Date.now()}`;
    useDJPlaylistStore.getState().importPlaylists([{ id, name: 'outdated', createdAt: Date.now(), updatedAt: Date.now(), tracks: [
      { id: 'old', fileName: 'suggestive vibes.mod', trackName: 'suggestive vibes', format: 'MOD', bpm: 184.57, duration: 179, addedAt: 0 },
      { id: 'older', fileName: 'suggestive vibes copy.mod', trackName: 'suggestive vibes copy', format: 'MOD', bpm: 184.57, duration: 179, addedAt: 0, analysisVersion: DJ_ANALYSIS_VERSION - 1 },
      { id: 'current', fileName: 'current.mod', trackName: 'current', format: 'MOD', bpm: 111, duration: 179, addedAt: 0, analysisVersion: DJ_ANALYSIS_VERSION },
      { id: 'skipped', fileName: 'broken.mod', trackName: 'broken', format: 'MOD', bpm: 120, duration: 0, addedAt: 0, analysisSkipped: true },
    ] }]);
    const rows = () => useDJPlaylistStore.getState().playlists.find((p) => p.id === id)!.tracks;

    // An outdated row is usable: the Analyze actions and the Auto DJ warning do not ask for it.
    expect(trackNeedsAnalysis(rows()[0])).toBe(false);
    expect(rows().map(trackAnalysisOutdated)).toEqual([true, true, false, false]);

    const analysed = await reanalyzeOutdatedTracks();
    expect(analysed).toBe(2);
    expect(holder.calls.map((c) => c.name)).toEqual(['suggestive vibes.mod', 'suggestive vibes copy.mod']);
    expect(holder.calls.every((c) => c.priority === 'low')).toBe(true);
    expect(holder.maxInflight).toBe(1);

    const [old, older, current, skipped] = rows();
    expect(old.bpm).toBeCloseTo(93.75, 2);
    expect(older.bpm).toBeCloseTo(93.75, 2);
    expect(old.djSummary?.bpm).toBeCloseTo(93.75, 2);
    expect(old.analysisVersion).toBe(DJ_ANALYSIS_VERSION);
    expect(current.bpm).toBe(111);
    expect(skipped.bpm).toBe(120);

    // Once: a second pass (the DJ view mounted again) analyses nothing.
    expect(await reanalyzeOutdatedTracks()).toBe(0);
    expect(holder.calls).toHaveLength(2);
  }, 60_000);
});
