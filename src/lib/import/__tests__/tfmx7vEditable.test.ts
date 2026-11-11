/**
 * Jochen Hippel 7V (.hip7) is editable end to end: one reachability test from the product load path (importTrackerModule)
 * through the keystroke entry (useTrackerStore.setCell, which calls sendCellEditsToEngine) to the engine that plays it
 * (the Hippel engine: the chip-RAM cell writer is handed the edited cell) and to Export (the registered exporter (rebuildHippelSong) writes the
 * edited note over the one 2-byte cell the layout names, nothing else). An unedited export is byte-identical to the source.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sentinel = vi.hoisted(() => ({ writer: 0, exporter: 0, poked: [] as Array<{ pattern: number; row: number; channel: number }> }));
// Sentinel: Export reached the format's own registered exporter (EditableFormatRegistry.builtins.ts), not a generic fallback.
vi.mock('@lib/export/Tfmx7vExporter', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@lib/export/Tfmx7vExporter')>();
  return { ...orig, exportTfmx7v: (...a: Parameters<typeof orig.exportTfmx7v>) => { sentinel.exporter++; return orig.exportTfmx7v(...a); } };
});
vi.mock('@/engine/hippel/rebuildHippelModule', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/engine/hippel/rebuildHippelModule')>();
  return { ...orig, rebuildHippelSong: (...a: Parameters<typeof orig.rebuildHippelSong>) => { sentinel.writer++; return orig.rebuildHippelSong(...a); } };
});
// The import walks the song in the TFMX decoder (wasm in a worker in the product): the test hands it the same decoder host.
vi.mock('@/lib/import/formats/hippelPlayedPitch', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/import/formats/hippelPlayedPitch')>();
  const { loadTfmxWalkModule } = await import('@/engine/__tests__/helpers/tfmxWalkHost');
  const host = await loadTfmxWalkModule();
  return { ...orig, hippelPlayedPitch: (bytes: Uint8Array, _w: unknown, subsong?: number) => orig.hippelPlayedPitch(bytes, async (b, s, t) => host.walk(b, s, t).records, subsong) };
});
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
vi.mock('@engine/TrackerReplayer', async (orig) => {
  // The replayer's song is the live one: the store's edit hook hands the cell to the engine that plays it.
  const replayer: object = new Proxy({}, { get: (_t, k) => (k === 'getSong' ? () => (globalThis as { __liveSong?: () => unknown }).__liveSong?.() ?? null : () => undefined) });
  return { ...(await orig<object>()), getTrackerReplayer: () => replayer, peekTrackerReplayer: () => replayer };
});
// The playing engine is UADE: a keystroke is poked into chip RAM through writeCellToChipRam, which records the cell it is handed.
vi.mock('@/engine/uade/writeCellToChipRam', () => ({
  writeCellToChipRam: async (_song: unknown, pattern: number, row: number, channel: number) => { sentinel.poked.push({ pattern, row, channel }); },
}));

import { exportNativeSong } from '@lib/export/nativeExportRouter';
import { liveEditRoute } from '@/engine/replayer/liveCellEdits';
import { useTrackerStore } from '@/stores/useTrackerStore';

const NAME = 'ghostbattle_gameover.hip7';
const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats', NAME)));
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);
/** The swap runs after a debounce and a lazy import: wait for the engine to be handed a module, not a fixed time (a loaded machine is slower). */
const settle = async () => {
  for (let waited = 0; waited < 8000 && sentinel.poked.length === 0; waited += 50) await new Promise((r) => setTimeout(r, 50));
};

beforeEach(() => { sentinel.writer = 0; sentinel.poked = []; });

describe('Jochen Hippel 7V is editable through the product load path', () => {
  it('an unedited song exports byte-identical, and a keystroke reaches the module the engine is handed', async () => {
    const file = new File([raw.slice().buffer as ArrayBuffer], NAME);
    const { importTrackerModule } = await import('@/lib/song/songBranches');
    await importTrackerModule({
      metadata: { title: NAME, type: 'MOD', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
      arrayBuffer: await file.arrayBuffer(), file,
    } as never, { useLibopenmpt: true } as never);
    const { liveTrackerSong } = await import('@/lib/song/liveSong');
    (globalThis as { __liveSong?: () => unknown }).__liveSong = () => liveTrackerSong();
    expect(liveEditRoute(liveTrackerSong())).toEqual({ route: 'chip-ram', engine: 'Hippel' });
    expect(Array.from((await exportNativeSong(null, {}))!.data)).toEqual(Array.from(raw));
    expect(sentinel.exporter).toBe(1);

    const layout = liveTrackerSong()!.uadePatternLayout!;
    expect(layout.formatId).toBe('tfmx7v');
    // the first note cell of voice 0 that has a file place
    const patterns = useTrackerStore.getState().patterns;
    let voice = 0, row = -1, pat = 0;
    for (pat = 0; pat < patterns.length && row < 0; pat++) {
      row = patterns[pat].channels[voice].rows.findIndex((c, r) => c.note > 0 && layout.getCellFileOffset!(pat, r, voice) >= 0);
      if (row >= 0) break;
    }
    expect(row).toBeGreaterThanOrEqual(0);
    const at = layout.getCellFileOffset!(pat, row, voice);
    const store = useTrackerStore.getState();
    store.setCurrentPattern(pat);
    const cell = useTrackerStore.getState().patterns[pat].channels[voice].rows[row];

    store.setCell(voice, row, { note: cell.note > 12 ? cell.note - 1 : cell.note + 1 });
    await settle();
    // A 7V pattern is pooled: the other track steps that play the same pattern are handed the cell as well.
    expect(sentinel.poked.length).toBeGreaterThan(0);
    expect(sentinel.poked.every((p) => p.row === row)).toBe(true);
    sentinel.writer = 0;
    const edited = new Uint8Array((await exportNativeSong(null, {}))!.data);
    expect(sentinel.writer).toBeGreaterThan(0);
    expect(sentinel.exporter).toBe(2);
    expect(edited.length).toBe(raw.length);
    const d = diffAt(edited, raw);
    expect(d.length).toBeGreaterThan(0);
    expect(d.every((i) => i >= at && i < at + layout.bytesPerCell)).toBe(true);
  }, 240000);
});
