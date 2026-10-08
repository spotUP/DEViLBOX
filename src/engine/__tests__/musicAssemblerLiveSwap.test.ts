/**
 * G24 / Music Assembler: a note edit is heard WHILE the song plays, without a restart (the real worklet and WASM, the store's own
 * route; see helpers/liveSwapCheck.ts): before the edit the audio is the song's, after it the edited module's from the start
 * sample for sample, and it differs from the unedited song.
 */
import { describe, it, expect, vi } from 'vitest';
import { assertLiveSwap, importSong, type LiveSwapSpec, type LiveCell } from './helpers/liveSwapCheck';

vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })) }));
vi.mock('@engine/TrackerReplayer', async (orig) => {
  const replayer: object = new Proxy({}, { get: (_t, k) => (k === 'getSong' ? () => (globalThis as { __liveSong?: () => unknown }).__liveSong?.() ?? null : () => undefined) });
  return { ...(await orig<object>()), getTrackerReplayer: () => replayer, peekTrackerReplayer: () => replayer };
});
vi.mock('@/engine/ma/MaEngine', () => ({
  MaEngine: {
    hasInstance: () => !!(globalThis as { __liveEngine?: unknown }).__liveEngine,
    getInstance: () => (globalThis as { __liveEngine?: unknown }).__liveEngine,
  },
}));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));

const spec: LiveSwapSpec = {
  file: 'public/data/songs/formats/baseheads.ma',
  worklet: { dir: 'ma', name: 'Ma', factory: 'createMa' },
  start: (module) => [{ type: 'loadModule', moduleData: module, subsong: 0 }],
  swapMessage: (module, args) => ({ type: 'swapModule', moduleData: module, subsong: args[0] ?? 0 }),
  pre: 60,
  post: 600,
};

describe('Music Assembler: an edit is heard while the song plays', { timeout: 300000 }, () => {
  it('a note changed in place: the song plays on from where it was, as the edited module', async () => {
    await importSong(spec.file);
    const { useTrackerStore } = await import('@/stores/useTrackerStore');
    // Notes of the first patterns in playing order, from a little after the start: the first whose edit is audible in the window is measured.
    const cells: LiveCell[] = [];
    useTrackerStore.getState().patterns.slice(0, 4).forEach((pat, p) => pat.channels.forEach((c, ch) => c.rows.forEach((cell, row) => { if (row >= 4 && cell.note > 0 && cell.note < 97) cells.push({ p, ch, row }); })));
    cells.sort((a, b) => a.p - b.p || a.row - b.row);
    expect(cells.length, 'the first patterns have notes to edit').toBeGreaterThan(0);
    await assertLiveSwap(expect as never, spec, cells.slice(0, 10), (cell) => {
      const cur = useTrackerStore.getState().patterns[cell.p].channels[cell.ch].rows[cell.row].note;
      useTrackerStore.getState().setCell(cell.ch, cell.row, { note: cur + (cur > 60 ? -2 : 2) });
    });
  });
});
