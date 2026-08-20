/**
 * buildFramesFromROMLibrary.test.ts — regression tests for the synthesis-path
 * behaviors that fixed the two user complaints: the inter-word gap (collapsed
 * pause tokens) and the phoneme quality (authentic ROM frames kept unshaped,
 * with a light splice bridge between recordings).
 *
 * All tests use a synthetic library so they run without ROMs.
 */
import { describe, it, expect } from 'vitest';
import { buildFramesFromROMLibrary } from '../ROMPhonemeExtractor';
import { type TMS5220Frame } from '../tms5220PhonemeMap';

const VOWEL: TMS5220Frame = {
  k: [20, 18, 12, 8, 6, 5, 4, 3, 2, 1], energy: 8, pitch: 20, unvoiced: false, durationMs: 25,
};
const STOP: TMS5220Frame = {
  k: [15, 10, 8, 6, 4, 3, 2, 2, 1, 1], energy: 7, pitch: 0, unvoiced: true, durationMs: 25,
};
const SILENCE: TMS5220Frame = {
  k: [8, 8, 8, 8, 8, 8, 8, 4, 4, 4], energy: 1, pitch: 0, unvoiced: false, durationMs: 25,
};

/** Library: every code returns a 4-frame run with a distinctive energy ramp. */
function library(): Map<string, TMS5220Frame[]> {
  const map = new Map<string, TMS5220Frame[]>();
  const run = (base: TMS5220Frame) => [0, 1, 2, 3].map(i => ({ ...base, k: [...base.k], energy: base.energy + i }));
  map.set('AA', run(VOWEL));
  map.set('T*', run(STOP));
  map.set(' ', [SILENCE, SILENCE]);
  return map;
}

const fallback = (code: string) => {
  if (code === 'AH') return VOWEL;
  return null;
};

function token(code: string, stress = 0) {
  return { code, stress };
}

describe('buildFramesFromROMLibrary synthesis path', () => {
  it('collapses consecutive pause tokens into a single word-boundary pause', () => {
    // "AA   AH" — SAM emits multiple spaces per word boundary.
    const frames = buildFramesFromROMLibrary(
      [token('AA'), token(' '), token(' '), token(' '), token('AH')],
      library(),
      fallback,
    );
    // 4 vowel frames + 4 static AH frames + 2 pause frames = 10, with 0 or 1
    // transition frames between segments. The two pause frames are the whole
    // gap — a single collapsed pause, not three.
    const silence = frames.filter(f => f.energy <= 1).length;
    expect(silence).toBe(2);
    expect(frames.length).toBeLessThanOrEqual(12);
  });

  it('trims leading and trailing pauses entirely', () => {
    const frames = buildFramesFromROMLibrary(
      [token(' '), token(' '), token('AA'), token(' '), token(' ')],
      library(),
      fallback,
    );
    // No leading/trailing silence frames survive.
    expect(frames[0].energy).toBeGreaterThan(1);
    expect(frames[frames.length - 1].energy).toBeGreaterThan(1);
  });

  it('does not impose a synthetic energy envelope on authentic ROM frames', () => {
    // The 4-frame AA run has energies 8,9,10,11; the stress-4 boost adds +2,
    // landing on 10,11,12,13. The old pipeline applied applyEnergyEnvelope
    // which forced a 0.6→1.0 attack — flattening real dynamics. Authentic
    // frames must pass through with only the stress boost, no envelope.
    // Stress 4 maps to a 1.0 duration scale so no stress scaling interferes.
    const frames = buildFramesFromROMLibrary([token('AA', 4)], library(), fallback);
    const energies = frames.slice(0, 4).map(f => f.energy);
    expect(energies).toEqual([10, 11, 12, 13]);
  });

  it('bridges a splice between two authentic ROM segments', () => {
    // Two ROM-sourced sonorant vowels: the class rule gives 2 transition
    // frames between them. Output = 4 + 4 + 2 = 10 frames.
    const frames = buildFramesFromROMLibrary([token('AA', 4), token('AA', 4)], library(), fallback);
    expect(frames.length).toBe(10);
  });
});