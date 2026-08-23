/**
 * sentenceProsody.test.ts — sentence-level melody: per-word declination with
 * final fall / question rise, pitch offsets applied to voiced frames only, and
 * the stress pitch accent inside buildFramesFromROMLibrary.
 *
 * All tests use a synthetic library so they run without ROMs.
 */
import { describe, it, expect } from 'vitest';
import { buildWordPitchOffsets, offsetFramesPitch, PROSODY_DECLINATION, PROSODY_FINAL_FALL, PROSODY_QUESTION_RISE } from '../sentenceProsody';
import { buildFramesFromROMLibrary } from '../ROMPhonemeExtractor';
import { type TMS5220Frame } from '../tms5220PhonemeMap';

const VOWEL: TMS5220Frame = {
  k: [20, 18, 12, 8, 6, 5, 4, 3, 2, 1], energy: 8, pitch: 20, unvoiced: false, durationMs: 25,
};
const STOP: TMS5220Frame = {
  k: [15, 10, 8, 6, 4, 3, 2, 2, 1, 1], energy: 7, pitch: 0, unvoiced: true, durationMs: 25,
};

function library(): Map<string, TMS5220Frame[]> {
  const map = new Map<string, TMS5220Frame[]>();
  const run = (base: TMS5220Frame) => [0, 1, 2, 3].map(i => ({ ...base, k: [...base.k], energy: base.energy + i }));
  map.set('AA', run(VOWEL));
  map.set('T*', run(STOP));
  return map;
}

const fallback = (code: string) => (code === 'AH' ? VOWEL : null);

function token(code: string, stress = 0) {
  return { code, stress };
}

describe('buildWordPitchOffsets', () => {
  it('gives a single-word statement a final fall', () => {
    expect(buildWordPitchOffsets(1, false)).toEqual([-PROSODY_FINAL_FALL]);
  });

  it('gives a single-word question a rise', () => {
    expect(buildWordPitchOffsets(1, true)).toEqual([PROSODY_QUESTION_RISE]);
  });

  it('drifts a multi-word statement down with an extra final fall', () => {
    const offsets = buildWordPitchOffsets(4, false);
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeLessThanOrEqual(offsets[i - 1]);
    }
    expect(offsets[offsets.length - 1]).toBe(-PROSODY_DECLINATION - PROSODY_FINAL_FALL);
  });

  it('ends a question on a rise instead of a fall', () => {
    const offsets = buildWordPitchOffsets(4, true);
    expect(offsets[offsets.length - 1]).toBeGreaterThanOrEqual(0);
    expect(offsets[offsets.length - 1]).toBe(PROSODY_QUESTION_RISE - Math.round(PROSODY_DECLINATION * 3 / 3));
  });
});

describe('offsetFramesPitch', () => {
  it('returns the same array for a zero offset', () => {
    const frames = [{ ...VOWEL, k: [...VOWEL.k] }];
    expect(offsetFramesPitch(frames, 0)).toBe(frames);
  });

  it('leaves unvoiced frames untouched', () => {
    const frames = [{ ...STOP, k: [...STOP.k] }];
    const out = offsetFramesPitch(frames, 3);
    expect(out[0].pitch).toBe(0);
  });

  it('shifts voiced pitch and clamps at 31', () => {
    const frames = [{ ...VOWEL, k: [...VOWEL.k], pitch: 30 }];
    const out = offsetFramesPitch(frames, 3);
    expect(out[0].pitch).toBe(31);
  });

  it('does not mutate the input frames', () => {
    const frames = [{ ...VOWEL, k: [...VOWEL.k], pitch: 20 }];
    offsetFramesPitch(frames, -5);
    expect(frames[0].pitch).toBe(20);
  });
});

describe('stress pitch accent in buildFramesFromROMLibrary', () => {
  it('raises pitch for stress >= 4 on STATIC frames (fallback only)', () => {
    // Use a code NOT in library, so static fallback is used (romSourced=false)
    const unstressed = buildFramesFromROMLibrary([token('AH', 2)], library(), fallback);
    const stressed = buildFramesFromROMLibrary([token('AH', 6)], library(), fallback);
    const unvoiced = buildFramesFromROMLibrary([token('T*', 6)], library(), fallback);

    // Stress also scales duration (0.9 vs 1.15), so frame counts differ —
    // compare mean voiced pitch, which interpolation preserves.
    const meanPitch = (frames: TMS5220Frame[]) => {
      const voiced = frames.filter(f => f.pitch > 0).map(f => f.pitch);
      return voiced.reduce((s, p) => s + p, 0) / voiced.length;
    };
    const stressedPitches = stressed.filter(f => f.pitch > 0);
    expect(stressedPitches.length).toBeGreaterThan(0);
    // Static frames get +3 pitch accent at stress 6 (allow diff from frame interpolation + stress duration scaling)
    expect(meanPitch(stressed)).toBeCloseTo(meanPitch(unstressed) + 3, 0);
    expect(unvoiced.filter(f => f.pitch > 0)).toHaveLength(0);
  });

  it('does NOT raise pitch for stress >= 4 on ROM-sourced frames', () => {
    // 'AA' is in library with 4-frame run (romSourced=true)
    // Stress accent should NOT be applied to authentic ROM frames
    const unstressed = buildFramesFromROMLibrary([token('AA', 2)], library(), fallback);
    const stressed = buildFramesFromROMLibrary([token('AA', 6)], library(), fallback);

    const meanPitch = (frames: TMS5220Frame[]) => {
      const voiced = frames.filter(f => f.pitch > 0).map(f => f.pitch);
      return voiced.reduce((s, p) => s + p, 0) / voiced.length;
    };
    // Authentic ROM frames pass through UNCHANGED - no stress accent
    expect(meanPitch(stressed)).toBeCloseTo(meanPitch(unstressed), 5);
  });
});