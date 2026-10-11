/**
 * The Modland server branch of the playlist analyser (audit m4): the server answers with its own tempo,
 * key and energy, and the local piggyback render supplies the analysis. The playlist row takes tempo, key
 * and energy from that one analysis (the server's tempo is the fallback only), an unknown key writes no
 * key (never `musicalKey: undefined` over a stored one), and a failed piggyback keeps the server tempo
 * without inventing a key. Fake pipeline, audio cache and fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const holder = vi.hoisted(() => ({ analysis: null as unknown, pipelineFails: false }));

vi.mock('../DJAudioCache', async (orig) => ({
  ...(await orig<typeof import('../DJAudioCache')>()),
  getCachedAudioByFilename: async () => ({ sourceData: new ArrayBuffer(16), audioData: new ArrayBuffer(16) }),
  cacheSourceFile: async () => {},
}));
vi.mock('../DJPipeline', async (orig) => ({
  ...(await orig<typeof import('../DJPipeline')>()),
  getDJPipeline: () => ({
    loadOrEnqueue: async () => {
      if (holder.pipelineFails) throw new Error('render failed');
      return { wavData: new ArrayBuffer(8), duration: 90, sampleRate: 44100, waveformPeaks: new Float32Array(4), analysis: holder.analysis };
    },
  }),
}));

import { useDJPlaylistStore, type PlaylistTrack } from '@/stores/useDJPlaylistStore';
import { analyzePlaylist } from '../DJPlaylistAnalyzer';
import { corpusPipelineAnalysis, corpusTrack } from '../autodj/testing/corpus';

async function analyseModland(track: Partial<PlaylistTrack>): Promise<PlaylistTrack> {
  const id = `modland-${Math.random().toString(36).slice(2)}`;
  useDJPlaylistStore.getState().importPlaylists([{ id, name: 'modland', createdAt: 0, updatedAt: 0, tracks: [
    { id: 't', fileName: 'modland:Protracker/x/song.mod', trackName: 'song', format: 'MOD', bpm: 0, duration: 0, addedAt: 0, ...track },
  ] }]);
  await analyzePlaylist(id);
  return useDJPlaylistStore.getState().playlists.find((p) => p.id === id)!.tracks[0];
}

describe('the Modland branch of the playlist analyser', () => {
  beforeEach(() => {
    holder.pipelineFails = false;
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ bpm: 77, musicalKey: 'F#m', energy: 0.99, duration: 200 }), { status: 200 }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('takes tempo, key and energy from the one local analysis, not the server numbers', async () => {
    holder.analysis = corpusPipelineAnalysis(corpusTrack('steady'));
    const t = await analyseModland({});
    expect(t.djSummary).toBeDefined();
    expect(t.bpm).toBeCloseTo(t.djSummary!.bpm, 9);
    expect(t.bpm).not.toBe(77);
    expect(t.energy).toBeCloseTo(t.djSummary!.energy.perceivedIntensity, 9);
    expect(t.energy).not.toBe(0.99);
    expect(t.musicalKey).toBe(t.djSummary!.key ?? undefined);
  }, 30_000);

  it('an unknown key in the analysis writes no key over the one the row has', async () => {
    holder.analysis = corpusPipelineAnalysis(corpusTrack('steady'), { musicalKey: 'Unknown' });
    const t = await analyseModland({ musicalKey: '5A' });
    expect(t.djSummary!.key).toBeNull();
    expect(t.musicalKey, 'musicalKey: undefined was written over the stored key').toBe('5A');
  }, 30_000);

  it('a failed piggyback render keeps the server tempo and writes no key or summary', async () => {
    holder.pipelineFails = true;
    const t = await analyseModland({});
    expect(t.bpm).toBe(77);
    expect(t.musicalKey).toBeUndefined();
    expect(t.djSummary).toBeUndefined();
  }, 30_000);
});
