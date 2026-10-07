/**
 * Switching songs (plan 2026-10-07-one-load-save-export-path, U2.1).
 *
 * Seen by the owner: after a song switch the channel meters froze on the old
 * song's last frame (a late waveform message from the old engine switched the
 * oscilloscope store back on, and nothing ever expired it), and the old song
 * kept playing through the whole scan of the new file.
 *
 * Store behaviour is tested in the store; ONE reachability test drives the real
 * opener (importModuleFile) and proves the unload ran, in order, before the parse.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const order = vi.hoisted(() => ({ log: [] as string[] }));

vi.mock('@/engine/ToneEngine', () => {
  const engine = {
    releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}),
    invalidateInstrument: vi.fn(), setBPM: vi.fn(),
  };
  return { getToneEngine: () => engine };
});
vi.mock('@/engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => ({ stop: () => { order.log.push('old song stopped'); } }),
}));
vi.mock('@/lib/import/prepareModuleImport', () => ({
  prepareModuleImport: async (file: File) => {
    order.log.push('scan');
    return { info: { file, metadata: { title: file.name } }, uadeMetadata: undefined };
  },
}));
vi.mock('@/lib/import/parseModuleToSong', () => ({
  parseModuleToSong: async () => {
    order.log.push('parse');
    throw new Error('stop here: the order is what is under test');
  },
}));

import { useOscilloscopeStore, liveScopeFrame, SCOPE_FRAME_MAX_AGE_MS, SCOPE_UNLOAD_FENCE_MS } from '@stores/useOscilloscopeStore';
import { useSongLoadStore } from '@stores/useSongLoadStore';
import { unloadSong, currentSongGeneration } from '@/lib/song/songLifecycle';

const frame = () => [new Int16Array(256).fill(9000), null];

describe('switching songs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    useOscilloscopeStore.getState().clear();
    useOscilloscopeStore.setState({ fenceUntil: 0, generation: 0 });
    order.log.length = 0;
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('clears the meters', async () => {
    useOscilloscopeStore.getState().updateChannelData(frame());
    expect(liveScopeFrame()).not.toBeNull();
    await unloadSong();
    expect(liveScopeFrame()).toBeNull();
    expect(useOscilloscopeStore.getState().channelData).toEqual([]);
  });

  it('a late frame from the old song does not revive the meters', async () => {
    useOscilloscopeStore.getState().updateChannelData(frame(), undefined, undefined, currentSongGeneration());
    const oldGen = currentSongGeneration();
    await unloadSong();
    // The old engine's message was already in flight: stamped with its own generation...
    useOscilloscopeStore.getState().updateChannelData(frame(), undefined, undefined, oldGen);
    expect(liveScopeFrame()).toBeNull();
    // ...or unstamped (the engines that do not pass one), inside the fence.
    useOscilloscopeStore.getState().updateChannelData(frame());
    expect(liveScopeFrame()).toBeNull();
    // The new song's own frames come through once the fence is down.
    vi.setSystemTime(Date.now() + SCOPE_UNLOAD_FENCE_MS + 1);
    useOscilloscopeStore.getState().updateChannelData(frame(), undefined, undefined, currentSongGeneration());
    expect(liveScopeFrame()).not.toBeNull();
  });

  it('meters fall to nothing when the feed stops', () => {
    useOscilloscopeStore.getState().updateChannelData(frame());
    vi.setSystemTime(Date.now() + SCOPE_FRAME_MAX_AGE_MS + 50);
    expect(useOscilloscopeStore.getState().isActive).toBe(true); // the flag alone is what froze the meters
    expect(liveScopeFrame()).toBeNull();
  });

  it('the old song stops before the new one is scanned and parsed, and a failed load leaves no load in flight', async () => {
    const { importModuleFile } = await import('@/lib/song/songBranches');
    await expect(importModuleFile(new File([new Uint8Array(4)], 'next.mod'))).rejects.toThrow('stop here');
    expect(order.log).toEqual(['old song stopped', 'scan', 'parse']);
    expect(useSongLoadStore.getState().depth).toBe(0);
    expect(useSongLoadStore.getState().unloadedForLoad).toBe(false);
  });
});
