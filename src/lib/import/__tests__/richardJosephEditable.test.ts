/**
 * Richard Joseph (rjp.* / *.sng) is editable end to end: one reachability test from the product load path (importTrackerModule)
 * through the keystroke entry (useTrackerStore.setCell, which calls sendCellEditsToEngine) to the engine that plays it
 * (UADE by default: the chip-RAM cell writer is handed the edited cell) and to Export (the registered exporter writes the
 * edited note over the one note byte the layout names, nothing else). An unedited export is byte-identical to the source.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sentinel = vi.hoisted(() => ({ writer: 0, exporter: 0, poked: [] as Array<{ pattern: number; row: number; channel: number }> }));
// Sentinel: Export reached the format's own registered exporter (EditableFormatRegistry.builtins.ts), not a generic fallback.
vi.mock('@lib/export/RichardJosephExporter', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@lib/export/RichardJosephExporter')>();
  return { ...orig, exportRichardJoseph: (...a: Parameters<typeof orig.exportRichardJoseph>) => { sentinel.exporter++; return orig.exportRichardJoseph(...a); } };
});
vi.mock('@lib/export/layoutPatch', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@lib/export/layoutPatch')>();
  return { ...orig, patchModuleByLayout: (...a: Parameters<typeof orig.patchModuleByLayout>) => { sentinel.writer++; return orig.patchModuleByLayout(...a); } };
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

const NAME = 'cannon fodder (intro).sng';
const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/richard-joseph', NAME)));
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);
/** The swap runs after a debounce and a lazy import: wait for the engine to be handed a module, not a fixed time (a loaded machine is slower). */
const settle = async () => {
  for (let waited = 0; waited < 8000 && sentinel.poked.length === 0; waited += 50) await new Promise((r) => setTimeout(r, 50));
};

beforeEach(() => { sentinel.writer = 0; sentinel.poked = []; });

describe('Richard Joseph is editable through the product load path', () => {
  it('an unedited song exports byte-identical, and a keystroke reaches the module the engine is handed', async () => {
    const file = new File([raw.slice().buffer as ArrayBuffer], NAME);
    const { importTrackerModule } = await import('@/lib/song/songBranches');
    await importTrackerModule({
      metadata: { title: NAME, type: 'MOD', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
      arrayBuffer: await file.arrayBuffer(), file,
    } as never, { useLibopenmpt: true } as never);
    const { liveTrackerSong } = await import('@/lib/song/liveSong');
    (globalThis as { __liveSong?: () => unknown }).__liveSong = () => liveTrackerSong();
    expect(liveEditRoute(liveTrackerSong())).toEqual({ route: 'chip-ram', engine: 'UADEEditable' });
    expect(Array.from((await exportNativeSong(null, {}))!.data)).toEqual(Array.from(raw));
    expect(sentinel.exporter).toBe(1);

    const layout = liveTrackerSong()!.uadePatternLayout!;
    expect(layout.formatId).toBe('richardJoseph');
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
    expect(sentinel.poked).toEqual([{ pattern: pat, row, channel: voice }]);
    sentinel.writer = 0;
    const edited = new Uint8Array((await exportNativeSong(null, {}))!.data);
    expect(sentinel.writer).toBeGreaterThan(0);
    expect(sentinel.exporter).toBe(2);
    expect(edited.length).toBe(raw.length);
    const d = diffAt(edited, raw);
    expect(d.length).toBeGreaterThan(0);
    expect(d.every((i) => i >= at && i < at + 1)).toBe(true);
  }, 240000);
});
