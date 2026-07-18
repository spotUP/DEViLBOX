import { describe, it, expect } from 'vitest';
import { cellFieldsEqual } from '../UADEPatternEncoder';
import type { TrackerCell } from '@/types';

const base: TrackerCell = { note: 40, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };

describe('cellFieldsEqual FX slots 3-5', () => {
  it('cells differing only in effTyp3 are NOT equal', () => {
    expect(cellFieldsEqual(base, { ...base, effTyp3: 39, eff3: 0x11 })).toBe(false);
  });
  it('cells differing only in eff5 are NOT equal', () => {
    expect(cellFieldsEqual({ ...base, effTyp5: 46 }, { ...base, effTyp5: 46, eff5: 3 })).toBe(false);
  });
  it('identical cells (incl. FX 3-5) are equal', () => {
    const c = { ...base, effTyp3: 39, eff3: 0x11, effTyp5: 46, eff5: 3 };
    expect(cellFieldsEqual(c, { ...c })).toBe(true);
  });
});
