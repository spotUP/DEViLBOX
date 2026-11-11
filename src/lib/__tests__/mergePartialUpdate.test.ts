import { describe, it, expect } from 'vitest';
import { mergePartialUpdate } from '../mergePartialUpdate';

describe('mergePartialUpdate', () => {
  it('changes one field of one list entry and keeps the rest', () => {
    const current = { algorithm: 4, operators: [{ tl: 30, mult: 1 }, { tl: 20, mult: 2 }, { tl: 0, mult: 3 }] };
    const merged = mergePartialUpdate(current, { operators: [{ tl: 10 }] });
    expect(merged).toEqual({ algorithm: 4, operators: [{ tl: 10, mult: 1 }, { tl: 20, mult: 2 }, { tl: 0, mult: 3 }] });
  });

  it('a null entry keeps the current entry, so a later entry can be addressed alone', () => {
    const current = { operators: [{ tl: 30 }, { tl: 20 }, { tl: 5 }] };
    expect(mergePartialUpdate(current, { operators: [null, null, { tl: 9 }] }))
      .toEqual({ operators: [{ tl: 30 }, { tl: 20 }, { tl: 9 }] });
  });

  it('adds entries past the current length', () => {
    expect(mergePartialUpdate({ operators: [{ tl: 1 }] }, { operators: [null, { tl: 2 }] }))
      .toEqual({ operators: [{ tl: 1 }, { tl: 2 }] });
  });

  it('merges nested objects key by key', () => {
    expect(mergePartialUpdate({ filter: { cutoff: 100, resonance: 5 }, volume: 3 }, { filter: { cutoff: 50 } }))
      .toEqual({ filter: { cutoff: 50, resonance: 5 }, volume: 3 });
  });

  it('a list of numbers replaces the current list', () => {
    expect(mergePartialUpdate({ wave: [1, 2, 3, 4] }, { wave: [9, 8] })).toEqual({ wave: [9, 8] });
  });

  it('a typed array replaces the current value', () => {
    const bytes = new Uint8Array([1, 2]);
    expect(mergePartialUpdate({ data: new Uint8Array([7]) }, { data: bytes })).toEqual({ data: bytes });
  });

  it('an empty list replaces the current list (a caller can clear it)', () => {
    expect(mergePartialUpdate({ macros: [{ type: 1 }] }, { macros: [] })).toEqual({ macros: [] });
  });

  it('does not mutate its inputs', () => {
    const current = { operators: [{ tl: 30, mult: 1 }] };
    const update = { operators: [{ tl: 10 }] };
    mergePartialUpdate(current, update);
    expect(current).toEqual({ operators: [{ tl: 30, mult: 1 }] });
    expect(update).toEqual({ operators: [{ tl: 10 }] });
  });
});
