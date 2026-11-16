import { describe, it, expect } from 'vitest';
import { convertFurnaceCell } from '../furnace/FurnacePatternParser';
import { furnaceNoteToXM } from '../../furnaceEditorCells';

// Gumbirds arena.fur (YM2610 ext): SSG arps on F-4 played two octaves low, and ZX Extinction
// Sequence.fur (ZX beeper) lost its octave-1 bass, because the TS fallback shifted notes -24 for
// chips missing from an allowlist. The WASM import path never shifts; both paths must agree.
describe('Furnace TS fallback notes keep their Furnace octave on every chip', () => {
  const cell = (note: number, octave: number) =>
    ({ note, octave, instrument: 0, volume: -1, effects: [] }) as unknown as Parameters<typeof convertFurnaceCell>[0];

  it('F-4 converts to native F-4', () => {
    expect(convertFurnaceCell(cell(5, 4)).note).toBe(4 * 12 + 5 + 1);
  });

  it('D#1 bass survives and matches the WASM path', () => {
    // Furnace native note number = octave * 12 + semitone; furnaceNoteToXM is the WASM-path mapping.
    expect(convertFurnaceCell(cell(3, 1)).note).toBe(furnaceNoteToXM(1 * 12 + 3));
    expect(convertFurnaceCell(cell(3, 1)).note).toBe(16);
  });
});
