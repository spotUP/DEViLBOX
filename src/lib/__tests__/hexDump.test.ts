import { describe, it, expect } from 'vitest';
import { toHexRows } from '../hexDump';

describe('toHexRows', () => {
  it('splits into rows with padded upper-case hex and offsets', () => {
    const rows = toHexRows(Uint8Array.from([0, 10, 255, 1, 2]), 4);
    expect(rows).toEqual([
      { offset: '0000', cells: ['00', '0A', 'FF', '01'] },
      { offset: '0004', cells: ['02'] },
    ]);
  });
  it('returns no rows for empty input', () => {
    expect(toHexRows(new Uint8Array(0))).toEqual([]);
  });
});
