/**
 * U2.4: a song that needs no file parse - a restored project, a switched tab,
 * a collaborator's full sync - enters through the same open lifecycle as a
 * dropped file: the outgoing song unloads FIRST (generation bumped, meters
 * fenced), the song is built (a restore re-decodes the stored bytes here, in
 * the silence), then it is applied once. Before, applySong stopped the
 * outgoing song itself and the restore decoded while the old song still played.
 *
 * One reachability test per family, through each family's real entry point.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const order: string[] = [];

vi.mock('@/engine/ToneEngine', () => {
  const engine = {
    releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}),
    invalidateInstrument: vi.fn(), setBPM: vi.fn(),
  };
  return { getToneEngine: () => engine };
});
vi.mock('@engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/lib/song/applySong', async (orig) => {
  const actual = await orig<typeof import('@/lib/song/applySong')>();
  return { ...actual, applySong: async (...a: Parameters<typeof actual.applySong>) => { order.push('apply'); await actual.applySong(...a); } };
});
vi.mock('@/lib/song/restoreFromStoredBytes', async (orig) => {
  const actual = await orig<typeof import('@/lib/song/restoreFromStoredBytes')>();
  return { ...actual, restoreFromStoredBytes: async (...a: Parameters<typeof actual.restoreFromStoredBytes>) => { order.push('build'); return actual.restoreFromStoredBytes(...a); } };
});

import '@/stores/useCursorStore';
import { useSongLoadStore } from '@/stores/useSongLoadStore';

// The unload sentinel: unloadSong bumps the generation before anything else,
// so a generation change IS the unload (the opener calls it in-module).
useSongLoadStore.subscribe((s, prev) => { if (s.generation !== prev.generation) order.push('unload'); });

async function plainProject(name: string): Promise<ReturnType<typeof import('@hooks/useProjectPersistence').makeEmptyTestSnapshot>> {
  const { makeEmptyTestSnapshot } = await import('@hooks/useProjectPersistence');
  const project = makeEmptyTestSnapshot() as unknown as Record<string, unknown>;
  project.patterns = [{ id: 'p0', name: 'P0', length: 64, channels: [] }];
  project.metadata = { ...(project.metadata as object), name };
  delete project.nativeEngineData;
  delete project.nativeEngineMeta;
  return project as never;
}

async function generation(): Promise<number> {
  return (await import('@/stores/useSongLoadStore')).useSongLoadStore.getState().generation;
}

beforeEach(() => { order.length = 0; });

describe('stored songs open through the lifecycle', () => {
  it('restore: applySavedProject unloads, builds (re-decode), then applies once, with a new generation', async () => {
    const { applySavedProject } = await import('@hooks/useProjectPersistence');
    const { useProjectStore } = await import('@/stores/useProjectStore');
    const before = await generation();
    expect(await applySavedProject((await plainProject('restored one')) as never, { fromRecovery: true })).toBe(true);
    expect(order).toEqual(['unload', 'build', 'apply']);
    expect(await generation()).toBe(before + 1);
    expect(useProjectStore.getState().metadata.name).toBe('restored one');
  }, 30000);

  it('tab switch: addTab unloads then applies the new tab song once, with a new generation', async () => {
    const { useTabsStore } = await import('@/stores/useTabsStore');
    const before = await generation();
    useTabsStore.getState().addTab();
    await vi.waitFor(() => expect(order).toContain('apply'));
    expect(order).toEqual(['unload', 'apply']);
    expect(await generation()).toBe(before + 1);
  }, 30000);

  it('sync: a full_sync message unloads then applies the remote song once, with a new generation', async () => {
    const { applyRemotePatch } = await import('@/lib/collaboration/SongSyncLayer');
    const { useProjectStore } = await import('@/stores/useProjectStore');
    const before = await generation();
    applyRemotePatch({ type: 'full_sync', project: (await plainProject('remote song')) as never } as never);
    await vi.waitFor(() => expect(order).toContain('apply'));
    expect(order).toEqual(['unload', 'apply']);
    expect(await generation()).toBe(before + 1);
    await vi.waitFor(() => expect(useProjectStore.getState().metadata.name).toBe('remote song'));
  }, 30000);
});
