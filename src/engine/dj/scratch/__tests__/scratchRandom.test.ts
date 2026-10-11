/** The placement brain's random is the reference LFSR (section 36, SCR-P4.3). */
import { describe, it, expect } from 'vitest';
import fixture from './fixtures/lfsr.json';
import { lfsr, crc32, barSeed } from '../scratchRandom';

describe('deterministic scratch random (SCR-P4.3)', () => {
  for (const seed of [1, 7, 12345]) {
    it(`seed ${seed}: the first 32 values equal the Python reference exactly`, () => {
      const r = lfsr(seed);
      const got = Array.from({ length: 32 }, () => r());
      expect(got).toEqual((fixture.lfsr as Record<string, number[]>)[String(seed)]);
    });
  }

  it('seed 0 behaves as seed 1 (the reference `or 1`)', () => {
    const a = lfsr(0), b = lfsr(1);
    for (let i = 0; i < 8; i++) expect(a()).toBe(b());
  });

  it('crc32 equals zlib.crc32 for every section name the reference seeds with', () => {
    for (const [name, crc] of Object.entries(fixture.crc)) expect(crc32(name), name).toBe(crc);
  });

  it('the bar seed is seed x 71 + bar x 7 + crc32(section) % 97', () => {
    expect(barSeed(3, 5, 'hook')).toBe(3 * 71 + 35 + (fixture.crc.hook % 97));
  });
});
