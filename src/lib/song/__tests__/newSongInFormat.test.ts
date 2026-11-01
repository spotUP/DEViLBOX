/**
 * New Song in a format opens a real song in that format (plan
 * 2026-11-01-new-song-any-format, N11). Before, picking "ProTracker" in the
 * wizard only renamed channels on a generic song: no MOD replayer, no MOD
 * export. startNewSong is the one entry the wizard and the MCP `new_song` tool
 * share; for a format it must load the descriptor's template through openSong,
 * the same path a dropped file takes.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => vi.fn(async () => {}) });
  return { getToneEngine: () => engine };
});
vi.mock('@engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => vi.fn(async () => {}) });
  return { getToneEngine: () => engine };
});
vi.mock('@/engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => new Proxy({ stop: () => undefined, hasReplacedInstruments: false, replacedInstrumentIds: [] }, {
    get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => undefined),
  }),
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })), markKnownSource: vi.fn(), isKnownSource: () => true }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));
vi.mock('@/lib/song/openSong', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/song/openSong')>();
  return { ...actual, openSong: vi.fn(actual.openSong) };
});

import '@stores/useCursorStore';
import { openSong } from '@/lib/song/openSong';
import { startNewSong, NEW_SONG_NAME } from '@/lib/song/startNewSong';
import { useTabsStore } from '@stores/useTabsStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useProjectStore } from '@stores/useProjectStore';
import { useFormatStore } from '@/stores/useFormatStore';

const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../public');

beforeAll(() => {
  // The template is a static file under public/; serve it the way Vite does.
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = String(url).replace(/^.*?\/templates\//, 'templates/');
    try {
      const buf = readFileSync(resolve(PUBLIC, path));
      return new Response(new Uint8Array(buf));
    } catch {
      return new Response(null, { status: 404 });
    }
  }));
});

describe('New Song in a format', () => {
  it('opens the MOD template through openSong in a new tab', async () => {
    const tabsBefore = useTabsStore.getState().tabs.length;
    await startNewSong({ kind: 'format', formatId: 'mod' });

    // Sentinel: the shared load path ran exactly once, as a new song.
    expect(vi.mocked(openSong)).toHaveBeenCalledTimes(1);
    const [source, opts] = vi.mocked(openSong).mock.calls[0];
    expect(source).toMatchObject({ kind: 'bytes', name: 'protracker.mod' });
    expect(opts).toMatchObject({ origin: 'new-song' });

    expect(useTabsStore.getState().tabs.length).toBe(tabsBefore + 1);
    expect(useFormatStore.getState().originalModuleData?.format).toBe('MOD');
    expect(useTrackerStore.getState().patterns[0]?.channels.length).toBe(4);
    expect(useProjectStore.getState().metadata.name).toBe(NEW_SONG_NAME);
  });

  it('rejects a format without a template and leaves the tabs alone', async () => {
    const tabsBefore = useTabsStore.getState().tabs.length;
    await expect(startNewSong({ kind: 'format', formatId: 'amf' })).rejects.toThrow(/No new-song template/);
    expect(useTabsStore.getState().tabs.length).toBe(tabsBefore);
  });
});
