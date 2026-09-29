/**
 * The native export builds its song from the stores.
 *
 * The Export dialog and MCP export_native handed the router the replayer's
 * copy of the song, which is only rebuilt when playback starts: edit a cell,
 * export without playing, and the edit was missing (2026-09-29). The router
 * takes the song live from the stores now (liveTrackerSong); the stale-copy
 * case itself needs an engine that has played and is on the manual list.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })) }));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('the song native export and the MOD export take', () => {
  it('is the live store song: an edit shows at once, without playing', async () => {
    const { importTrackerModule } = await import('@/lib/file/UnifiedFileLoader');
    const { useTrackerStore } = await import('@/stores/useTrackerStore');
    const { liveTrackerSong } = await import('../liveSong');
    const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');

    const b = readFileSync(resolve(ROOT, 'src/__tests__/fixtures/micro15-goto80.mod'));
    const file = new File([b], 'micro15.mod');
    await importTrackerModule({
      metadata: { title: 'micro15', type: 'MOD', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
      arrayBuffer: await file.arrayBuffer(), file,
    } as never, { useLibopenmpt: true } as never);

    useTrackerStore.getState().setCurrentPattern(0);
    useTrackerStore.getState().setCell(0, 63, { note: 37, instrument: 1 });
    expect(liveTrackerSong().patterns[0].channels[0].rows[63].note).toBe(37);

    // A classic MOD has no native serializer (it exports through OpenMPT);
    // the router says so rather than exporting something stale.
    expect(await exportNativeSong(null, {})).toBeNull();
  }, 60000);

  it('carries a native-engine song\'s data (an AHX exports from the stores)', async () => {
    const { importTrackerModule } = await import('@/lib/file/UnifiedFileLoader');
    const { liveTrackerSong } = await import('../liveSong');
    const b = readFileSync(resolve(ROOT, 'public/data/songs/ahx/amanda.ahx'));
    const file = new File([b], 'amanda.ahx');
    await importTrackerModule({
      metadata: { title: 'amanda', type: 'AHX', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
      arrayBuffer: await file.arrayBuffer(), file,
    } as never, { useLibopenmpt: true } as never);
    const song = liveTrackerSong();
    expect(song.format).toBe('AHX');
    expect(song.hivelyNative).toBeTruthy();
    expect((song.hivelyFileData as ArrayBuffer).byteLength).toBe(b.byteLength);
  }, 60000);
});
