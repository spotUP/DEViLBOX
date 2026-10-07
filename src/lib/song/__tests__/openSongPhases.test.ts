/**
 * openSong publishes where the load is (plan U6 foundation) and is the one
 * place that decides what a song file IS (plan U2.2).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/engine/ToneEngine', () => {
  const engine = { releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}), invalidateInstrument: vi.fn(), setBPM: vi.fn() };
  return { getToneEngine: () => engine };
});
vi.mock('@/engine/TrackerReplayer', () => ({ getTrackerReplayer: () => ({ stop: () => {} }) }));
vi.mock('@/lib/import/prepareModuleImport', () => ({
  prepareModuleImport: async (file: File) => ({ info: { file, metadata: { title: file.name } }, uadeMetadata: undefined }),
}));
vi.mock('@/lib/import/parseModuleToSong', () => ({
  parseModuleToSong: async () => { throw new Error('stop at the parse'); },
}));

import { useSongLoadStore } from '@/stores/useSongLoadStore';
import { openSong, classifySong, START_BY_ORIGIN } from '@/lib/song/openSong';

describe('openSong lifecycle phases', () => {
  it('publishes unload, acquire, scan and parse in order, then returns to idle; a failure is a result, not a throw', async () => {
    const seen: string[] = [];
    const unsub = useSongLoadStore.subscribe((s) => { if (seen[seen.length - 1] !== s.phase) seen.push(s.phase); });
    const result = await openSong({ kind: 'bytes', name: 'x.mod', bytes: new ArrayBuffer(8) }, { origin: 'mcp' });
    unsub();
    expect(seen).toEqual(['unload', 'acquire', 'scan', 'parse', 'idle']);
    expect(result).toEqual({ ok: false, error: 'stop at the parse' });
    expect(useSongLoadStore.getState().depth).toBe(0);
  });

  it('a headless origin is not interactive for the whole load; the flag resets after', async () => {
    let during: boolean | null = null;
    const unsub = useSongLoadStore.subscribe((s) => { if (s.phase === 'parse') during = s.interactive; });
    await openSong({ kind: 'bytes', name: 'x.mod', bytes: new ArrayBuffer(8) }, { origin: 'jukebox' });
    unsub();
    expect(during).toBe(false);
    expect(useSongLoadStore.getState().interactive).toBe(true);
  });
});

describe('classifySong', () => {
  const kind = (name: string, bytes = new Uint8Array(8)) => classifySong(new File([bytes], name));
  it('routes by name and treats non-songs as not songs', async () => {
    expect(await kind('a.v2m')).toBe('v2m');
    expect(await kind('a.sunvox')).toBe('sunvox');
    expect(await kind('a.dbx')).toBe('project');
    expect(await kind('a.mid')).toBe('project');
    expect(await kind('a.sqs')).toBe('td3');
    expect(await kind('a.mod')).toBe('module');
    expect(await kind('a.dbi')).toBeNull();
    expect(await kind('a.wav')).toBeNull();
    expect(await kind('a.xml')).toBeNull();
    expect(await kind('whatever.zzz')).toBeNull();
  });
  it('D2: drop, file browser and dialog do not start; jukebox, tour and embed do', () => {
    expect([START_BY_ORIGIN.drop, START_BY_ORIGIN.filebrowser, START_BY_ORIGIN.dialog]).toEqual([false, false, false]);
    expect([START_BY_ORIGIN.jukebox, START_BY_ORIGIN.tour, START_BY_ORIGIN.embed]).toEqual(['song', 'song', 'song']);
  });
});
