/**
 * The playlist analyser writes the module's own tempo (dj-juggling plan
 * P1.7b): a local module at speed 3 / tempo 125 is analysed from a 90 s
 * preview render whose audio reading is 125; the playlist row gets 250, the
 * same number the deck and the DJTrackAnalysis read. Fake pipeline and
 * audio cache, the song from the DJ song cache.
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

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { useDJPlaylistStore } from '@/stores/useDJPlaylistStore';
import { analyzePlaylist } from '../DJPlaylistAnalyzer';
import { cacheSong } from '../DJSongCache';
import { corpusPipelineAnalysis, corpusTrack, corpusTrackerSong } from '../autodj/testing/corpus';

describe('the playlist analyser writes the module tempo', () => {
  it('a speed 3 module analysed from a capped preview gets 250, not the audio 125', async () => {
    const base = corpusTrackerSong();
    // Four times the corpus order: 123 s at speed 3, longer than the 90 s preview.
    const song = { ...base, initialSpeed: 3, songPositions: [...base.songPositions, ...base.songPositions, ...base.songPositions, ...base.songPositions], songLength: base.songLength * 4 } as TrackerSong;
    cacheSong('speed3.mod', song);
    holder.analysis = corpusPipelineAnalysis(corpusTrack('tracker'));
    const pl = useDJPlaylistStore.getState();
    const id = `analyse-${Date.now()}`;
    pl.importPlaylists([{ id, name: 'analyse', createdAt: Date.now(), updatedAt: Date.now(), tracks: [
      { id: 'mod', fileName: 'speed3.mod', trackName: 'speed3', format: 'MOD', bpm: 0, duration: 0, addedAt: 0 },
    ] }]);
    const r = await analyzePlaylist(id);
    expect(r.analyzed).toBe(1);
    const track = useDJPlaylistStore.getState().playlists.find((p) => p.id === id)!.tracks[0];
    expect(track.bpm).toBeCloseTo(250, 2);
    expect(track.djSummary?.bpm).toBeCloseTo(250, 2);
  }, 30_000);
});
