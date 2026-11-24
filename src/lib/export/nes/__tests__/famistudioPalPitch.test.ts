import { describe, expect, it } from 'vitest';
import { furnaceNesClock, roundOnClock } from '../famistudioSong';

const PAL = 4433618.75 * 3 / 8;

describe('FamiStudio PAL pitch mapping', () => {
  it('PAL clockSel=1 resolves to the PAL clock', () => {
    expect(furnaceNesClock({ chipFlags: ['clockSel=1\ncustomClock=0\n'] })).toBeCloseTo(PAL, 3);
  });
  it('the_best-1990 first pulse note (PAL period 224, tuning 436) lands on NTSC period 241, not an octave off', () => {
    const raw = 1789773 / (16 * 436 * 2 ** (1 / 12));
    expect(roundOnClock(raw, PAL) - 1).toBe(241);
    expect(Math.round((224 + 1) * 1789773 / PAL) - 1).toBe(241);
  });
});
