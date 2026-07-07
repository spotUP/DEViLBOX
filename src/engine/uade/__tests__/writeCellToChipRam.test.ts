/**
 * writeCellToChipRam — routing unit tests.
 *
 * The helper is the single source of truth for writing one edited pattern cell
 * into live UADE playback state. These tests assert it routes:
 *   - fixed-length chip-RAM layouts → UADEChipEditor.patchPatternCell (with the
 *     right layout/pattern/row/channel/cell args), when the UADE engine is live;
 *   - TFMX songs (tfmxFileData + layout) → direct write into the tfmxFileData
 *     buffer, without touching patchPatternCell;
 *   - and is a safe no-op when neither a layout nor a live engine is present.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EMPTY_CELL, type TrackerCell } from '@/types';

// ── Mocks ──────────────────────────────────────────────────────────────────
// vi.hoisted so the spies exist before the hoisted vi.mock factories run.
const { patchPatternCell, hasInstance, getInstance } = vi.hoisted(() => ({
  patchPatternCell: vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve()),
  hasInstance: vi.fn<() => boolean>(() => false),
  getInstance: vi.fn<() => object>(() => ({})),
}));

vi.mock('../UADEChipEditor', () => ({
  // A class so `new UADEChipEditor(engine)` works (arrow mockImplementations
  // are not constructable). Each instance exposes the shared patchPatternCell spy.
  UADEChipEditor: class {
    patchPatternCell = patchPatternCell;
  },
}));

vi.mock('../UADEEngine', () => ({
  UADEEngine: {
    hasInstance: () => hasInstance(),
    getInstance: () => getInstance(),
  },
}));

// Import after mocks are registered.
import { writeCellToChipRam } from '../writeCellToChipRam';

// Minimal fake TrackerSong shape — the helper only reads a couple of fields.
type FakeSong = Parameters<typeof writeCellToChipRam>[0];

const cell: TrackerCell = { ...EMPTY_CELL, note: 24, instrument: 3 };

beforeEach(() => {
  patchPatternCell.mockClear();
  hasInstance.mockReset();
  hasInstance.mockReturnValue(false);
});

describe('writeCellToChipRam', () => {
  it('routes a fixed-layout song to patchPatternCell with the right args', async () => {
    hasInstance.mockReturnValue(true);
    const layout = { encodeCell: vi.fn(() => new Uint8Array([1, 2, 3, 4])) };
    const song = { uadePatternLayout: layout } as unknown as FakeSong;

    await writeCellToChipRam(song, 2, 5, 1, cell);

    expect(patchPatternCell).toHaveBeenCalledTimes(1);
    expect(patchPatternCell).toHaveBeenCalledWith(layout, 2, 5, 1, cell);
  });

  it('routes a TFMX song to the direct tfmxFileData write, not patchPatternCell', async () => {
    // Engine not live → the chip-RAM branch is a no-op; only the TFMX branch runs.
    hasInstance.mockReturnValue(false);
    const buf = new ArrayBuffer(16);
    const layout = {
      getCellFileOffset: () => 4,
      encodeCell: () => new Uint8Array([0xaa, 0xbb]),
    };
    const song = { uadePatternLayout: layout, tfmxFileData: buf } as unknown as FakeSong;

    await writeCellToChipRam(song, 0, 0, 0, cell);

    const view = new Uint8Array(buf);
    expect(view[4]).toBe(0xaa);
    expect(view[5]).toBe(0xbb);
    // Untouched bytes stay zero.
    expect(view[3]).toBe(0);
    expect(view[6]).toBe(0);
    expect(patchPatternCell).not.toHaveBeenCalled();
  });

  it('writes both targets for a fixed-layout song that also has tfmxFileData', async () => {
    hasInstance.mockReturnValue(true);
    const buf = new ArrayBuffer(8);
    const layout = {
      getCellFileOffset: () => 0,
      encodeCell: () => new Uint8Array([0x11, 0x22]),
    };
    const song = { uadePatternLayout: layout, tfmxFileData: buf } as unknown as FakeSong;

    await writeCellToChipRam(song, 1, 2, 3, cell);

    expect(patchPatternCell).toHaveBeenCalledWith(layout, 1, 2, 3, cell);
    const view = new Uint8Array(buf);
    expect(view[0]).toBe(0x11);
    expect(view[1]).toBe(0x22);
  });

  it('is a no-op when the song is null', async () => {
    await writeCellToChipRam(null, 0, 0, 0, cell);
    expect(patchPatternCell).not.toHaveBeenCalled();
  });

  it('is a no-op when the song has neither a layout nor tfmxFileData', async () => {
    const song = {} as unknown as FakeSong;
    await writeCellToChipRam(song, 0, 0, 0, cell);
    expect(patchPatternCell).not.toHaveBeenCalled();
  });

  it('is a no-op when a layout exists but the UADE engine is not live and there is no TFMX buffer', async () => {
    hasInstance.mockReturnValue(false);
    const layout = { encodeCell: () => new Uint8Array([0, 0, 0, 0]) };
    const song = { uadePatternLayout: layout } as unknown as FakeSong;

    await writeCellToChipRam(song, 0, 0, 0, cell);

    expect(patchPatternCell).not.toHaveBeenCalled();
  });
});
