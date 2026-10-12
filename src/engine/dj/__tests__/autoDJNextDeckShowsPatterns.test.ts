/**
 * "auto dj plays now, the first song in the left deck shows the pattern view
 * but the second tune in the right deck shows an oscilloscope" (owner
 * 2026-10-08). A deck shows the pattern view when the song reaches its
 * replayer. Auto DJ's pre-rendered load passed no song, and a track played
 * from the audio cache after a reload found none in the in-memory song cache.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const probe = vi.hoisted(() => ({
  loads: [] as Array<{ name: string; song: unknown }>,
  cached: null as null | { audioData: ArrayBuffer; sourceData?: ArrayBuffer; bpm: number; duration: number; waveformPeaks: Float32Array; filename: string },
}));

vi.mock('@/lib/import/parseModuleToSong', () => ({
  parseModuleToSong: vi.fn(async (file: File) => ({ name: file.name, songLength: 7, patterns: [], songPositions: [] })),
}));
vi.mock('@engine/uade/UADEEngine', () => ({
  UADEEngine: { getInstance: vi.fn(), getDeckInstance: vi.fn(() => ({})), getPreviewInstance: vi.fn(), hasInstance: vi.fn(() => false) },
}));
vi.mock('@/engine/dj/DJAudioCache', () => ({ getCachedAudioByFilename: vi.fn(async () => probe.cached) }));
vi.mock('@/engine/dj/DJBeatDetector', () => ({ detectBPM: () => ({ bpm: 125 }) }));
vi.mock('@/engine/dj/DJPipeline', () => ({
  getDJPipeline: () => ({ loadOrEnqueue: vi.fn(async () => ({ wavData: new ArrayBuffer(8), duration: 1 })), applyAnalysisToDeck: vi.fn() }),
  analysisFromCachedAudio: () => undefined,
}));
vi.mock('@/lib/hvscApi', () => ({ downloadHVSCFile: vi.fn(async () => new Uint8Array([0x50, 0x53, 0x49, 0x44]).buffer) }));
vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => ({
    loadAudioToDeck: vi.fn(async (_d: unknown, _w: unknown, name: string, _t: unknown, _b: unknown, song: unknown) => {
      probe.loads.push({ name, song });
    }),
  }),
}));

import { loadPreRenderedTrackToDeck, loadPlaylistTrackToDeck, preRenderTrack } from '../DJTrackLoader';
import { cacheSong } from '../DJSongCache';
import type { PlaylistTrack } from '@/stores/useDJPlaylistStore';

const song = { name: 'return of da dread!', songLength: 12, patterns: [], songPositions: [] } as never;
const track = { id: 't', fileName: 'modland:pub/modules/Protracker/Hoffman/return of da dread!.mod', trackName: 'return of da dread!' } as unknown as PlaylistTrack;

describe('the next Auto DJ deck shows the pattern view', () => {
  beforeEach(() => { probe.loads.length = 0; probe.cached = null; });

  it('a pre-rendered track reaches the deck with its song', async () => {
    await loadPreRenderedTrackToDeck({ wavData: new ArrayBuffer(8), filename: 'x.wav', trackName: 'x', bpm: 93, song, duration: 1 }, track, 'B');
    expect(probe.loads[0].song).toBe(song);
  });

  it('a pre-rendered track without its song takes the cached one', async () => {
    cacheSong(track.fileName, song);
    await loadPreRenderedTrackToDeck({ wavData: new ArrayBuffer(8), filename: 'x.wav', trackName: 'x', bpm: 93, duration: 1 }, track, 'B');
    expect(probe.loads[0].song).toBe(song);
  });

  it('a track from the audio cache after a reload parses the module bytes the cache keeps', async () => {
    const other = { ...track, fileName: 'modland:pub/modules/Protracker/Hoffman/infrared.mod' } as PlaylistTrack;
    probe.cached = { audioData: new ArrayBuffer(8), sourceData: new Uint8Array([1, 2, 3]).buffer, bpm: 81, duration: 1, waveformPeaks: new Float32Array(4), filename: 'infrared.mod' };
    await loadPlaylistTrackToDeck(other, 'B');
    const loaded = probe.loads[0].song as { songLength: number } | undefined;
    expect(loaded?.songLength).toBe(7);
  });

  // SID-DECK-AUDIT (owner 2026-10-12): deck A showed a SID's patterns, deck B its oscilloscope.
  // The HVSC branches rendered the SID without ever parsing it, so only a deck that met the
  // tune through another path (audio cache, file browser) had its song.
  it('an HVSC SID loaded straight onto a deck reaches it with its song', async () => {
    const sid = { id: 's', fileName: 'hvsc:MUSICIANS/L/LMan/La_Mer.sid', trackName: 'La Mer' } as unknown as PlaylistTrack;
    await loadPlaylistTrackToDeck(sid, 'A');
    expect((probe.loads[0].song as { songLength: number } | undefined)?.songLength).toBe(7);
  });

  it('an HVSC SID Auto DJ pre-renders for the next deck reaches it with its song', async () => {
    const sid = { id: 'v', fileName: 'hvsc:MUSICIANS/L/LMan/Venus_Falling_SCC_Extended.sid', trackName: 'Venus Falling' } as unknown as PlaylistTrack;
    const pre = await preRenderTrack(sid);
    expect(pre).not.toBeNull();
    await loadPreRenderedTrackToDeck(pre!, sid, 'B');
    expect((probe.loads[0].song as { songLength: number } | undefined)?.songLength).toBe(7);
  });
});
