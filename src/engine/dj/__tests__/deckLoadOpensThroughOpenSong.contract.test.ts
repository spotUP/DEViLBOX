/**
 * Reachability (DJ family, plan 2026-10-07 U2.6): a deck load reaches the one
 * open path through its real top-level entry. loadPlaylistTrackToDeck with a
 * two-file Modland song opens ONCE on the deck target, the partner file
 * arrives with that call (parse AND render pipeline), and the editor song, its
 * loading state and its UADE engine are not touched. A deck's UADE scan runs on
 * the deck's own engine, passed down the parse.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

const probe = vi.hoisted(() => ({
  parseCalls: [] as Array<{ name: string; companions: string[] | undefined }>,
  pipelineCalls: [] as Array<{ filename: string; companions: string[] | undefined }>,
  loadedAudio: [] as string[],
  editorEngine: { load: vi.fn(), loadForPlayback: vi.fn(), stop: vi.fn(), ready: vi.fn(async () => {}) },
  deckEngine: {
    ready: vi.fn(async () => {}), enableTickSnapshots: vi.fn(), resetTickSnapshots: vi.fn(),
    load: vi.fn(async () => { throw new Error('scan stopped by the test'); }),
  },
}));

vi.mock('@/lib/import/parseModuleToSong', () => ({
  parseModuleToSong: vi.fn(async (file: File, _s?: number, _m?: unknown, _o?: unknown, companions?: Map<string, ArrayBuffer>) => {
    probe.parseCalls.push({ name: file.name, companions: companions ? [...companions.keys()] : undefined });
    return { name: 'bob', songLength: 3, patterns: [], songPositions: [] };
  }),
}));
vi.mock('@/lib/song/openSong', async (orig) => {
  const real = await orig<typeof import('@/lib/song/openSong')>();
  return { ...real, openDeckTrack: vi.fn(real.openDeckTrack) };
});
vi.mock('@engine/uade/UADEEngine', () => ({
  UADEEngine: {
    getInstance: vi.fn(() => probe.editorEngine),
    getDeckInstance: vi.fn(() => probe.deckEngine),
    getPreviewInstance: vi.fn(),
    hasInstance: vi.fn(() => false),
  },
}));
vi.mock('@/engine/dj/DJAudioCache', () => ({ getCachedAudioByFilename: vi.fn(async () => null) }));
vi.mock('@/engine/dj/DJBeatDetector', () => ({ detectBPM: () => ({ bpm: 125 }) }));
vi.mock('@/engine/dj/DJPipeline', () => ({
  getDJPipeline: () => ({
    loadOrEnqueue: vi.fn(async (_b: ArrayBuffer, filename: string, _d: unknown, _p: unknown, companions?: Array<{ filename: string }>) => {
      probe.pipelineCalls.push({ filename, companions: companions?.map((c) => c.filename) });
      return { wavData: new ArrayBuffer(8), analysis: { bpm: 125 }, duration: 1 };
    }),
    // The deck gets the analysis once it holds the track (deckLoadKeepsItsBeatGrid.test.ts).
    applyAnalysisToDeck: vi.fn(),
  }),
}));
vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngine: () => ({ loadAudioToDeck: vi.fn(async (_d: unknown, _w: unknown, name: string) => { probe.loadedAudio.push(name); }) }),
}));

import { loadPlaylistTrackToDeck } from '../DJTrackLoader';
import { openDeckTrack } from '@/lib/song/openSong';
import { UADEEngine } from '@engine/uade/UADEEngine';
import { useSongLoadStore } from '@/stores/useSongLoadStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useFormatStore } from '@/stores/useFormatStore';
import type { PlaylistTrack } from '@/stores/useDJPlaylistStore';

const DIR = 'pub/modules/Infogrames/Charles Callet';
const FILES = ['bob4e.dum', 'bob4.ins'].map((n) => `${DIR}/${n}`);

function stubModland(): void {
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = new URL(String(input), 'http://x');
    if (url.pathname.endsWith('/modland/list')) {
      const dir = url.searchParams.get('dir') ?? '';
      const files = FILES.filter((f) => f.startsWith(dir + '/')).map((f) => ({ full_path: f, filename: f.split('/').pop() }));
      return new Response(JSON.stringify({ files }), { status: 200 });
    }
    if (url.pathname.endsWith('/modland/download')) return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    return new Response('{}', { status: 404 });
  });
}

describe('a DJ deck load goes through the one open path', () => {
  afterEach(() => { vi.unstubAllGlobals(); probe.parseCalls.length = 0; probe.pipelineCalls.length = 0; });

  it('opens once on the deck target, carries the partner file with the call, and leaves the editor alone', async () => {
    stubModland();
    const editorBefore = {
      patterns: useTrackerStore.getState().patterns,
      editorMode: useFormatStore.getState().editorMode,
      load: { depth: useSongLoadStore.getState().depth, phase: useSongLoadStore.getState().phase },
    };
    const track = { id: 't1', fileName: `modland:${FILES[0]}`, trackName: 'bob4e' } as PlaylistTrack;

    const ok = await loadPlaylistTrackToDeck(track, 'B');

    expect(ok).toBe(true);
    // sentinel: the deck load opened once on deck B (openDeckTrack = openSong with the deck target);
    // the parse below can only have run inside that call, it is the one place that hands companions to it
    const calls = vi.mocked(openDeckTrack).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual({ kind: 'modland', path: FILES[0] });
    expect(calls[0][1]).toBe('B');
    // the partner file arrived with that call: in the parse and in the render pipeline
    expect(probe.parseCalls).toEqual([{ name: 'bob4e.dum', companions: ['bob4.ins'] }]);
    expect(probe.pipelineCalls).toEqual([{ filename: 'bob4e.dum', companions: ['bob4.ins'] }]);
    expect(probe.loadedAudio).toHaveLength(1);
    // the editor song and its engine are untouched
    expect(useTrackerStore.getState().patterns).toBe(editorBefore.patterns);
    expect(useFormatStore.getState().editorMode).toBe(editorBefore.editorMode);
    expect({ depth: useSongLoadStore.getState().depth, phase: useSongLoadStore.getState().phase }).toEqual(editorBefore.load);
    expect(UADEEngine.getInstance).not.toHaveBeenCalled();
    expect(probe.editorEngine.load).not.toHaveBeenCalled();
  });

  it('hands the parse the deck engine as an argument, so the scan runs there and nowhere else', async () => {
    const { parseUADEFile } = await import('@/lib/import/formats/UADEParser');
    const deck = UADEEngine.getDeckInstance();
    await expect(parseUADEFile(new ArrayBuffer(16), 'bob4e.dum', 'enhanced', 0, undefined, undefined, deck)).rejects.toThrow('scan stopped');
    expect(probe.deckEngine.load).toHaveBeenCalledTimes(1);
    expect(UADEEngine.getInstance).not.toHaveBeenCalled();
    // without an engine argument the editor's engine is the one
    probe.editorEngine.load.mockRejectedValueOnce(new Error('editor scan'));
    await expect(parseUADEFile(new ArrayBuffer(16), 'bob4e.dum')).rejects.toThrow();
    expect(UADEEngine.getInstance).toHaveBeenCalled();
  });
});
