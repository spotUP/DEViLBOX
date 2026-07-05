import { describe, it, expect } from 'vitest';
import { addHarmonic } from '../sonixInstrument';

describe('addHarmonic', () => {
  it('adds a 2nd-harmonic partial and stays within i8 range', () => {
    const flat = new Array(128).fill(0);
    const out = addHarmonic(flat, 2, 1);
    expect(out).toHaveLength(128);
    expect(Math.max(...out)).toBeLessThanOrEqual(127);
    expect(Math.min(...out)).toBeGreaterThanOrEqual(-128);
    // A 2nd harmonic over 128 samples completes 2 cycles → 4 zero-crossings.
    let crossings = 0;
    for (let i = 1; i < out.length; i++) if ((out[i - 1] <= 0) !== (out[i] <= 0)) crossings++;
    expect(crossings).toBeGreaterThanOrEqual(3);
  });

  it('amt=0 is a no-op', () => {
    const wave = Array.from({ length: 128 }, (_, i) => (i < 64 ? 40 : -40));
    expect(addHarmonic(wave, 3, 0)).toEqual(wave);
  });
});
