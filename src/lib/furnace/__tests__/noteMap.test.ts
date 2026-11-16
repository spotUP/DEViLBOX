import { describe, it, expect } from 'vitest';
import { furnaceNoteName, readNoteMapEntry, withNoteMapEntry } from '../noteMap';

describe('noteMap', () => {
  it('names Furnace notes', () => {
    expect(furnaceNoteName(108)).toBe('C-4');
    expect(furnaceNoteName(60)).toBe('C-0');
    expect(furnaceNoteName(0)).toBe('C--5');
  });
  it('reads both stored shapes', () => {
    expect(readNoteMapEntry({ freq: 5, map: 2 } as never, 0)).toEqual({ freq: 5, map: 2 });
    expect(readNoteMapEntry({ note: 1, sample: 3, frequency: 7 }, 0)).toEqual({ freq: 7, map: 3 });
    expect(readNoteMapEntry(undefined, 9)).toEqual({ freq: 9, map: -1 });
  });
  it('pads to 180 and patches one entry', () => {
    const m = withNoteMapEntry([], 108, { map: 4 });
    expect(m).toHaveLength(180);
    expect(m[108]).toEqual({ freq: 108, map: 4 });
    expect(m[107]).toEqual({ freq: 107, map: -1 });
  });
});
