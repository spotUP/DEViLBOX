/**
 * N13d: a New Song started from the wizard's system preset path (kind 'preset')
 * for Hippel CoSo carries the CoSo layout id, so exportNativeSong(null) from the
 * stores reaches the CoSo serializer (before: no layout id, nothing exported).
 *
 * Drives startNewSong (what the wizard calls), then exportNativeSong; the
 * serializer is proven to have run by a spy on exportAsHippelCoSo and by the
 * "COSO" magic of the output.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => vi.fn(async () => {}) });
  return { getToneEngine: () => engine };
});
vi.mock('@engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => vi.fn(async () => {}) });
  return { getToneEngine: () => engine };
});
vi.mock('@/engine/TrackerReplayer', () => {
  const r = {
    song: null as unknown,
    stop: () => undefined,
    loadSong(song: unknown) { r.song = song; },
    releaseSong() { r.song = null; },
    getSong: () => r.song,
    hasReplacedInstruments: false,
    replacedInstrumentIds: [] as number[],
  };
  const proxy = new Proxy(r, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => undefined) });
  return { getTrackerReplayer: () => proxy, peekTrackerReplayer: () => proxy };
});
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })), markKnownSource: vi.fn(), isKnownSource: () => true }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

const serializer = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/export/HippelCoSoExporter', async (orig) => {
  const mod = await orig<typeof import('@lib/export/HippelCoSoExporter')>();
  return { ...mod, exportAsHippelCoSo: (...a: Parameters<typeof mod.exportAsHippelCoSo>) => { serializer.calls++; return mod.exportAsHippelCoSo(...a); } };
});

import '@stores/useCursorStore';
import { startNewSong } from '@/lib/song/startNewSong';
import { exportNativeSong } from '@lib/export/nativeExportRouter';

describe('wizard preset path: Hippel CoSo New Song exports as CoSo', () => {
  it('startNewSong preset uade_hippelcoso with instruments, then exportNativeSong, runs the CoSo serializer', async () => {
    await startNewSong({ kind: 'preset', presetId: 'uade_hippelcoso', loadInstruments: true });
    const out = await exportNativeSong(null);
    expect(out, 'router returned nothing: no CoSo layout id on the preset-path song').not.toBeNull();
    expect(serializer.calls, 'CoSo serializer did not run').toBeGreaterThan(0);
    const bytes = new Uint8Array(await new Blob([out!.data as BlobPart]).arrayBuffer());
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('COSO');
  }, 60_000);
});
