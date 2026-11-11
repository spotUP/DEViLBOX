/**
 * Riff Raff (.riff) is editable end to end: one reachability test from the product load path (importTrackerModule)
 * through the keystroke entry (useTrackerStore.setCell, which calls sendCellEditsToEngine) to the module the playing
 * nuade engine is handed. Sentinels: the
 * grid-edit writer (applyRiffRaffGridEdits) ran, and the engine's swapModule got a module that differs from the source
 * file by exactly the one note byte the edited cell came from. An unedited export is byte-identical to the source.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sentinel = vi.hoisted(() => ({ writer: 0, swapped: [] as ArrayBuffer[] }));
vi.mock('../formats/riffRaffEdits', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../formats/riffRaffEdits')>();
  return { ...orig, applyRiffRaffGridEdits: (...a: Parameters<typeof orig.applyRiffRaffGridEdits>) => { sentinel.writer++; return orig.applyRiffRaffGridEdits(...a); } };
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
// The playing engine: a running instance that records the module it is swapped to.
vi.mock('@/engine/nuade/NuadeEngine', () => {
  const instance = { swapModule: (m: ArrayBuffer) => { sentinel.swapped.push(m); } };
  return { NuadeEngine: { hasInstance: () => true, getInstance: () => instance } };
});

import { buildRiffRaffGrid, type RiffRaffGrid } from '../formats/riffRaffGrid';
import { exportNativeSong } from '@lib/export/nativeExportRouter';
import { liveEditRoute } from '@/engine/replayer/liveCellEdits';
import { useTrackerStore } from '@/stores/useTrackerStore';

const NAME = 'riffraff_smallest.riff';
const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats', NAME)));
const diffAt = (a: Uint8Array, b: Uint8Array) => a.reduce<number[]>((l, v, k) => (v !== b[k] ? [...l, k] : l), []);
const settle = () => new Promise((r) => setTimeout(r, 300));

beforeEach(() => { sentinel.writer = 0; sentinel.swapped = []; });

describe('Riff Raff is editable through the product load path', () => {
  it('an unedited song exports byte-identical, and a keystroke reaches the module the engine is handed', async () => {
    const file = new File([raw.slice().buffer as ArrayBuffer], NAME);
    const { importTrackerModule } = await import('@/lib/song/songBranches');
    await importTrackerModule({
      metadata: { title: NAME, type: 'MOD', channels: -1, patterns: -1, orders: -1, instruments: -1, samples: -1, duration: 0 },
      arrayBuffer: await file.arrayBuffer(), file,
    } as never, { useLibopenmpt: true } as never);
    const { liveTrackerSong } = await import('@/lib/song/liveSong');
    (globalThis as { __liveSong?: () => unknown }).__liveSong = () => liveTrackerSong();
    expect(liveEditRoute(liveTrackerSong())).toEqual({ route: 'engine-swap', engine: 'Nuade' });
    expect(Array.from((await exportNativeSong(null, {}))!.data)).toEqual(Array.from(raw));

    const grid = buildRiffRaffGrid(raw) as RiffRaffGrid;
    let at: { voice: number; row: number } | null = null;
    for (let voice = 0; voice < 4 && !at; voice++) {
      const row = grid.sources[voice].findIndex((s) => !!s && s.noteAt >= 0);
      if (row >= 0) at = { voice, row };
    }
    expect(at).not.toBeNull();
    const { voice, row } = at!;
    const src = grid.sources[voice][row]!;
    const store = useTrackerStore.getState();
    store.setCurrentPattern(Math.floor(row / 64));
    const cell = useTrackerStore.getState().patterns[Math.floor(row / 64)].channels[voice].rows[row % 64];

    sentinel.writer = 0;
    store.setCell(voice, row % 64, { note: cell.note > 12 ? cell.note - 1 : cell.note + 1 });
    await settle();
    expect(sentinel.writer).toBeGreaterThan(0);
    expect(sentinel.swapped).toHaveLength(1);
    const handed = new Uint8Array(sentinel.swapped[0]);
    expect(handed.length).toBe(raw.length);
    expect(diffAt(handed, raw)).toEqual([src.noteAt]);
  }, 240000);
});
