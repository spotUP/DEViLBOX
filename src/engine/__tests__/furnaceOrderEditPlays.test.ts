/**
 * Owner 2026-11-03: "my matrix edits look like they change the pattern but pressing play plays the unchanged song"
 * (checked for the Furnace order matrix).
 *
 * Play hands liveTrackerSong() to the replayer; FurnaceDispatchEngine.startWithCoordinator uploads that song's
 * furnaceNative to the WASM sequencer (uploadFurnaceToSequencer). This test pins that an order-matrix edit
 * (setFurnaceOrderEntry) is in the furnaceNative the next play uploads.
 *
 * Real song through the real parser (FurnaceFileOps WASM harness).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { installFurnaceFileOpsWasm, readSong } from '@/lib/import/__tests__/furnaceFileOpsWasmHarness';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const SONG = 'furnace/misc/meaningful_connection_es5506.fur';
let song: TrackerSong;

describe('Furnace: an order matrix edit is what the next play uploads', { timeout: 120000 }, () => {
  beforeAll(async () => {
    installFurnaceFileOpsWasm();
    const { parseFurnaceFile } = await import('@/lib/import/parsers/FurnaceToSong');
    song = await parseFurnaceFile(readSong(SONG), 'meaningful_connection_es5506.fur');
  }, 300000);

  it('the edited order entry reaches the sequencer upload', async () => {
    const { useFormatStore } = await import('@stores/useFormatStore');
    const { useTrackerStore } = await import('@stores/useTrackerStore');
    const { liveTrackerSong } = await import('@/lib/song/liveSong');
    const { FurnaceDispatchEngine } = await import('@/engine/furnace-dispatch/FurnaceDispatchEngine');
    const { uploadFurnaceToSequencer } = await import('@/lib/export/FurnaceSequencerSerializer');

    useTrackerStore.getState().loadPatterns(song.patterns);
    useFormatStore.getState().setFurnaceNative(song.furnaceNative!);
    const sub = song.furnaceNative!.subsongs[song.furnaceNative!.activeSubsong];
    const was = sub.orders[0][0];
    const to = [...sub.channels[0].patterns.keys()].find((p) => p !== was);
    expect(to, 'channel 0 has another pattern to choose').toBeDefined();

    useFormatStore.getState().setFurnaceOrderEntry(0, 0, to!);

    // the song play hands the replayer carries the edit
    const live = liveTrackerSong();
    const liveSub = live.furnaceNative!.subsongs[live.furnaceNative!.activeSubsong];
    expect(liveSub.orders[0][0]).toBe(to);

    // and the upload play runs writes it to the sequencer (sentinel: the recorded seqSetOrder call)
    const calls: Array<[string, unknown[]]> = [];
    const engine = new Proxy({}, { get: (_, name) => (...a: unknown[]) => { calls.push([String(name), a]); return Promise.resolve(); } });
    vi.spyOn(FurnaceDispatchEngine, 'getInstance').mockReturnValue(engine as never);
    await uploadFurnaceToSequencer(live.furnaceNative!, live.furnaceActiveSubsong ?? 0);
    const order = calls.filter(([n]) => n === 'seqSetOrder').map(([, a]) => a);
    expect(order).toContainEqual([0, 0, to]);
    expect(order).not.toContainEqual([0, 0, was]);
  });

  it('an order edit while the tune plays reaches the running sequencer', async () => {
    const { useFormatStore } = await import('@stores/useFormatStore');
    const { FurnaceDispatchEngine } = await import('@/engine/furnace-dispatch/FurnaceDispatchEngine');
    useFormatStore.getState().setFurnaceNative(structuredClone(song.furnaceNative!));
    const sub = song.furnaceNative!.subsongs[song.furnaceNative!.activeSubsong];
    const to = [...sub.channels[0].patterns.keys()].find((p) => p !== sub.orders[0][1]);
    expect(to, 'channel 0 has another pattern to choose').toBeDefined();

    const calls: Array<[string, unknown[]]> = [];
    const engine = new Proxy({}, { get: (_, name) => (...a: unknown[]) => { calls.push([String(name), a]); return Promise.resolve(); } });
    vi.spyOn(FurnaceDispatchEngine, 'hasInstance').mockReturnValue(true);
    vi.spyOn(FurnaceDispatchEngine, 'getInstance').mockReturnValue(engine as never);

    useFormatStore.getState().setFurnaceOrderEntry(0, 1, to!);
    await vi.dynamicImportSettled();
    expect(calls.filter(([n]) => n === 'seqSetOrder').map(([, a]) => a)).toEqual([[0, 1, to]]);
  });
});
