/**
 * Furnace native rows ↔ the pattern editor (lib/import/furnaceEditorCells.ts).
 *
 * Two bugs, one mapping:
 *  - Import showed every Furnace note one semitone low: Furnace counts C-0 = 0
 *    (C-4 = 48), the editor C-0 = 1 (C-4 = 49), and the conversion passed the
 *    number through unchanged. Anything playing the editor's notes played
 *    them flat, and C-0 came out as an empty cell.
 *  - An edit went to the running sequencer raw — editor note numbers (an A-4
 *    typed in played as C-4), 1-based instruments, XM-scale volumes, the
 *    editor's composite pattern index — and never into the song's native
 *    data, so the next Play re-uploaded the old notes.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  furnaceNoteToXM, xmNoteToFurnace, furnaceRowToTrackerCell, applyEditorCellEdit,
} from '../furnaceEditorCells';
import type { FurnaceNativeData, FurnaceRow } from '@/types/tracker';
import { installFurnaceFileOpsWasm, readSong } from './furnaceFileOpsWasmHarness';

const row = (r: Partial<FurnaceRow>): FurnaceRow => ({ note: -1, ins: -1, vol: -1, effects: [], ...r });

/** Two channels, two positions: position 1 plays ch0 pattern 0 again and ch1 pattern 5. */
function song(): { native: FurnaceNativeData; songPositions: number[] } {
  const native = {
    activeSubsong: 0,
    subsongs: [{
      name: '', patLen: 4, ordersLen: 2,
      orders: [[0, 0], [2, 5]],
      channels: [
        { name: 'FM1', effectCols: 1, patterns: new Map([[0, { rows: [row({ note: 48, ins: 0, vol: 120, effects: [{ cmd: 0xE5, val: 0x80 }] })] }]]) },
        { name: 'FM2', effectCols: 1, patterns: new Map() },
      ],
      speed1: 6, speed2: 6, hz: 60, virtualTempoN: 150, virtualTempoD: 150,
    }],
  } as unknown as FurnaceNativeData;
  return { native, songPositions: [0, 1] };
}

describe('Furnace notes in the editor', () => {
  it('shows Furnace C-4 as the editor\'s C-4, not B-3', () => {
    expect(furnaceNoteToXM(48)).toBe(49);
    expect(furnaceNoteToXM(0)).toBe(1);        // C-0 is a note, not an empty cell
    expect(furnaceNoteToXM(-1)).toBe(0);
    expect(furnaceNoteToXM(253)).toBe(97);
  });

  it('turns an editor note back into the same Furnace note', () => {
    for (let n = 1; n <= 96; n++) expect(furnaceNoteToXM(xmNoteToFurnace(n))).toBe(n);
    expect(xmNoteToFurnace(97)).toBe(253);
    expect(xmNoteToFurnace(0)).toBe(-1);
  });
});

describe('an edit in the editor', () => {
  it('reaches the song\'s native data and the sequencer in Furnace\'s units', () => {
    const { native, songPositions } = song();
    const writes = applyEditorCellEdit(native, songPositions, 0, 0, 0, { note: 58 }); // A-4
    const nat = native.subsongs[0].channels[0].patterns.get(0)!.rows[0];
    expect(nat.note).toBe(57);
    expect(writes).toEqual([{ ch: 0, pat: 0, row: 0, col: 0, val: 117 }]); // sequencer's A-4
  });

  it('leaves every field it did not change at its native value', () => {
    const { native, songPositions } = song();
    const shown = furnaceRowToTrackerCell(native.subsongs[0].channels[0].patterns.get(0)!.rows[0]);
    applyEditorCellEdit(native, songPositions, 0, 0, 0, { ...shown, note: 50 });
    const nat = native.subsongs[0].channels[0].patterns.get(0)!.rows[0];
    expect(nat.vol).toBe(120);                             // not rescaled through the XM column
    expect(nat.effects[0]).toEqual({ cmd: 0xE5, val: 0x80 }); // fine pitch not cut to E5 00
  });

  it('lands in the channel\'s own Furnace pattern, not the editor\'s pattern index', () => {
    const { native, songPositions } = song();
    const writes = applyEditorCellEdit(native, songPositions, 1, 1, 2, { note: 49, instrument: 3 });
    expect(native.subsongs[0].channels[1].patterns.get(5)!.rows[2]).toMatchObject({ note: 48, ins: 2 });
    expect(writes.map((w) => w.pat)).toEqual([5, 5]);
  });

  it('empties a cleared cell', () => {
    const { native, songPositions } = song();
    applyEditorCellEdit(native, songPositions, 0, 0, 0, { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0 });
    expect(native.subsongs[0].channels[0].patterns.get(0)!.rows[0]).toMatchObject({
      note: -1, ins: -1, vol: -1, effects: [{ cmd: -1, val: -1 }],
    });
  });
});

describe('through the real loader and replayer', { timeout: 60000 }, () => {
  beforeAll(installFurnaceFileOpsWasm);

  it('opens a DefleMask song with its first note as C-4 and keeps an edit for the next Play', async () => {
    const { parseFurnaceFile } = await import('../parsers/FurnaceToSong');
    const s = await parseFurnaceFile(readSong('deflemask/220hertz/Andrew_haggles.dmf'), 'Andrew_haggles.dmf');
    expect(s.patterns[0].channels[0].rows[0].note).toBe(49);   // C-4, as Furnace shows it

    const { TrackerReplayer } = await import('@/engine/TrackerReplayer');
    const sync = TrackerReplayer.prototype.syncCellToWasmSequencer;
    sync.call({ song: s, useWasmSequencer: false } as never, 0, 0, 0, { note: 58 });
    const native = s.furnaceNative!;
    const first = native.subsongs[0].orders[0][0];
    expect(native.subsongs[0].channels[0].patterns.get(first)!.rows[0].note).toBe(57);
  });
});
