/**
 * A note typed in a New Song reaches the new song's engine, never the previous
 * song's (plan 2026-11-01-new-song-any-format, N12).
 *
 * Seen live: play a MONOTONE New Song, then start a MOD New Song and type a
 * note. The MOD grid showed the note, but play sounded the MONOTONE square
 * wave: the replayer still held the MONOTONE song (it takes the next song only
 * at play), the grid edit picked its engine from that song, re-encoded the old
 * MONOTONE module and planted it in the new song's format store.
 *
 * Drives startNewSong + the tracker store's setCell, the path the wizard and
 * the keyboard take. The replayer is a stand-in that keeps the song it is
 * given, the one fact the bug lives in.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const replayer = vi.hoisted(() => {
  const r = {
    song: null as unknown,
    released: 0,
    stop: () => undefined,
    loadSong(song: unknown) { r.song = song; },
    releaseSong() { r.released++; r.song = null; },
    getSong: () => r.song,
    hasReplacedInstruments: false,
    replacedInstrumentIds: [] as number[],
  };
  return r;
});

vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => vi.fn(async () => {}) });
  return { getToneEngine: () => engine };
});
vi.mock('@engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => vi.fn(async () => {}) });
  return { getToneEngine: () => engine };
});
vi.mock('@/engine/TrackerReplayer', () => {
  const proxy = new Proxy(replayer, {
    get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => undefined),
  });
  return { getTrackerReplayer: () => proxy, peekTrackerReplayer: () => proxy };
});
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })), markKnownSource: vi.fn(), isKnownSource: () => true }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));

import '@stores/useCursorStore';
import { startNewSong } from '@/lib/song/startNewSong';
import { liveTrackerSong } from '@/lib/song/liveSong';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useFormatStore } from '@/stores/useFormatStore';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { playingEngineFromStores } from '@/engine/replayer/NativeEngineRouting';

const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../public');
const C2 = 25; // XM note number of C-2

beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = String(url).replace(/^.*?\/templates\//, 'templates/');
    try {
      return new Response(new Uint8Array(readFileSync(resolve(PUBLIC, path))));
    } catch {
      return new Response(null, { status: 404 });
    }
  }));
});

/** Let the edit's dynamic imports and the module re-encode settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 10));
}

describe('a note typed in a New Song', () => {
  it('goes to the new song, not the song played before it', async () => {
    await startNewSong({ kind: 'format', formatId: 'monotone' });
    replayer.loadSong(liveTrackerSong()); // play loads the song into the replayer
    expect(useFormatStore.getState().monotoneFileData).not.toBeNull();

    const releasedBefore = replayer.released;
    await startNewSong({ kind: 'format', formatId: 'mod' });
    // Sentinel: opening the MOD song unloaded the MONOTONE one from the replayer.
    expect(replayer.released).toBeGreaterThan(releasedBefore);
    expect(replayer.getSong()).toBeNull();
    expect(useFormatStore.getState().monotoneFileData, 'the MOD song opened clean').toBeNull();
    useTrackerStore.getState().setCell(0, 0, { note: C2, instrument: 1 }, 0);
    await settle();

    expect(useFormatStore.getState().monotoneFileData).toBeNull();
    expect(playingEngineFromStores(useFormatStore.getState() as never, useInstrumentStore.getState().instruments)).toBe('tracker');
  }, 60_000);

  it('reaches the module of a format song that has not played yet', async () => {
    await startNewSong({ kind: 'format', formatId: 'monotone' });
    expect(replayer.getSong()).toBeNull();
    const before = new Uint8Array(useFormatStore.getState().monotoneFileData!.slice(0));
    useTrackerStore.getState().setCell(0, 0, { note: C2, instrument: 1 }, 0);
    await settle();

    const after = new Uint8Array(useFormatStore.getState().monotoneFileData!);
    expect(Array.from(after)).not.toEqual(Array.from(before));
  }, 60_000);
});
