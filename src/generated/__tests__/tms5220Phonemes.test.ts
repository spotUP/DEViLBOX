/**
 * tms5220Phonemes.test.ts — guard for the generated authentic phoneme library:
 * every SAM phoneme code must have an authentic entry, and every entry must be
 * a valid, non-empty frame sequence. A phoneme falling back to the static
 * table is the documented quality gap, so this test fails loudly if one appears.
 */
import { describe, it, expect } from 'vitest';
import { AUTHENTIC_PHONEMES } from '../tms5220Phonemes';
import { KNOWN_PHONEMES } from '../../engine/speech/Reciter';

describe('AUTHENTIC_PHONEMES coverage', () => {
  it('has an entry for every SAM phoneme code', () => {
    const missing = [...KNOWN_PHONEMES].filter((code) => !AUTHENTIC_PHONEMES[code]);
    expect(missing).toEqual([]);
  });

  it('every entry is a non-empty sequence of valid frames', () => {
    for (const [code, frames] of Object.entries(AUTHENTIC_PHONEMES)) {
      expect(frames.length, `${code} is empty`).toBeGreaterThan(0);
      for (const f of frames) {
        expect(f.k).toHaveLength(10);
        expect(f.energy).toBeGreaterThanOrEqual(0);
        expect(f.energy).toBeLessThanOrEqual(15);
        expect(f.pitch).toBeGreaterThanOrEqual(0);
        expect(f.pitch).toBeLessThanOrEqual(31);
        expect(f.durationMs).toBeGreaterThan(0);
      }
    }
  });
});