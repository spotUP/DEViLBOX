/**
 * The current song survives its own save and load: snapshotSong ->
 * savedSongToApply -> applySong -> snapshotSong gives the same song.
 *
 * One reader (snapshotSong) and one writer (applySong) for every save and
 * load (2026-09-29, single load/save path). A field one side knows and the
 * other drops shows up here - the old .dbx path dropped the mixer, tabs
 * dropped everything native.
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

/** The snapshot without what legitimately changes between two reads. */
function comparable(song: Record<string, unknown>) {
  const { performanceJournal: _j, ...rest } = song;
  const out = JSON.parse(JSON.stringify(rest));
  // setMetadata stamps the modification time.
  delete out.metadata?.modifiedAt;
  return out;
}

describe('song round trip', () => {
  it.each([
    ['a MOD', 'src/__tests__/fixtures/micro15-goto80.mod', 'MOD'],
    ['an AHX (native engine data)', 'public/data/songs/ahx/amanda.ahx', 'AHX'],
  ])('%s: snapshot -> apply -> snapshot is unchanged', async (_label, path, type) => {
    const { importTrackerModule } = await import('@/lib/file/UnifiedFileLoader');
    const { snapshotSong } = await import('../snapshotSong');
    const { savedSongToApply } = await import('../savedSong');
    const { applySong } = await import('../applySong');
    const { useMixerStore } = await import('@stores/useMixerStore');

    const b = readFileSync(resolve(ROOT, path));
    const file = new File([b], path.split('/').pop()!);
    await importTrackerModule({
      metadata: { title: file.name, type, channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
      arrayBuffer: await file.arrayBuffer(), file,
    } as never, { useLibopenmpt: true } as never);
    // Something beyond the song itself, so the extras are exercised.
    useMixerStore.getState().loadMixerState({ channels: [{ volume: 0.42 }] });

    const first = structuredClone(snapshotSong());
    await applySong(savedSongToApply(structuredClone(first)), 'project');
    const second = structuredClone(snapshotSong());

    const a = comparable(first as never), c = comparable(second as never);
    const diffs: string[] = [];
    const walk = (x: unknown, y: unknown, path: string) => {
      if (diffs.length > 12) return;
      if (JSON.stringify(x) === JSON.stringify(y)) return;
      if (x && y && typeof x === 'object' && typeof y === 'object') {
        for (const k of new Set([...Object.keys(x), ...Object.keys(y as object)])) walk((x as never)[k], (y as never)[k], `${path}.${k}`);
      } else diffs.push(`${path}: ${JSON.stringify(x)?.slice(0, 80)} -> ${JSON.stringify(y)?.slice(0, 80)}`);
    };
    walk(a, c, '');
    expect(diffs).toEqual([]);
  }, 60000);
});
