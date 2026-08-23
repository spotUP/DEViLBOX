/**
 * finalLengthening.test.ts — phrase-final lengthening (Klatt): the last
 * syllable before a pause or the end of the utterance stretches. Flat rhythm
 * with a hard stop is one of the strongest "machine" tells in the TTS.
 */
import { describe, it, expect } from 'vitest';
import {
  buildFinalLengthening,
  buildFramesFromROMLibrary,
  FINAL_VOWEL_SCALE,
  FINAL_CODA_SCALE,
} from '../ROMPhonemeExtractor';
import type { TMS5220Frame } from '../tms5220PhonemeMap';

const VOWEL: TMS5220Frame = {
  k: [20, 18, 12, 8, 6, 5, 4, 3, 2, 1], energy: 8, pitch: 20, unvoiced: false, durationMs: 25,
};

describe('buildFinalLengthening', () => {
  it('stretches the last vowel and its coda before the end of the utterance', () => {
    // "SEVEN" ≈ S* EH V* IH N* — IH is the final nucleus, N* its coda.
    const scales = buildFinalLengthening(['S*', 'EH', 'V*', 'IH', 'N*']);
    expect(scales).toEqual([1, 1, 1, FINAL_VOWEL_SCALE, FINAL_CODA_SCALE]);
  });

  it('stretches before every pause, not only the utterance end', () => {
    const scales = buildFinalLengthening(['EH', 'N*', ' ', 'EH', 'N*']);
    expect(scales).toEqual([FINAL_VOWEL_SCALE, FINAL_CODA_SCALE, 1, FINAL_VOWEL_SCALE, FINAL_CODA_SCALE]);
  });

  it('leaves a vowel-final word with only the vowel stretched', () => {
    const scales = buildFinalLengthening(['B*', 'IY']);
    expect(scales).toEqual([1, FINAL_VOWEL_SCALE]);
  });

  it('does not scale the pause itself', () => {
    const scales = buildFinalLengthening(['IY', ' ', 'IY']);
    expect(scales[1]).toBe(1);
  });
});

describe('rendered final lengthening', () => {
  it('renders the utterance-final vowel longer than the same vowel mid-utterance', () => {
    const lib = new Map<string, TMS5220Frame[]>();
    lib.set('AA', Array.from({ length: 8 }, (_, i) => ({ ...VOWEL, k: [...VOWEL.k], energy: 7 + (i % 2) })));
    lib.set('EH', Array.from({ length: 8 }, () => ({ ...VOWEL, k: [...VOWEL.k], energy: 14 })));
    // AA mid-utterance vs AA final (EH is a filler so AA isn't always final).
    const frames = buildFramesFromROMLibrary(
      [{ code: 'AA', stress: 0 }, { code: 'EH', stress: 0 }, { code: ' ', stress: 0 },
       { code: 'EH', stress: 0 }, { code: 'AA', stress: 0 }],
      lib,
      () => null,
    );
    const mid = frames.filter(f => f.energy === 7 || f.energy === 8).length;
    // Count AA frames in the final position: they carry the 7/8 energies too,
    // so count total and compare halves via order — final AA is the tail run.
    let tail = 0;
    for (let i = frames.length - 1; i >= 0 && (frames[i].energy === 7 || frames[i].energy === 8); i--) tail++;
    const head = mid - tail;
    expect(tail).toBeGreaterThan(head);
  });
});
