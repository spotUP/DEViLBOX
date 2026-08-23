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
  // Sub-audible extractions: 2-frame vowel, 2-frame stop (the IH/L*/R* class).
  map.set('IH', [0, 1].map(() => ({ ...VOWEL, k: [...VOWEL.k] })));
  map.set('P*', [0, 1].map(i => ({ ...STOP, k: [...STOP.k], energy: STOP.energy + i })));
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
    // 4 mined AA frames + static pause + 4 static AH frames, with 0 or 1
    // transition frames between segments. The pause frames are the whole
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

  it('does not impose a synthetic energy envelope or stress boost on authentic ROM frames', () => {
    // The 4-frame AA run has energies 8,9,10,11; authentic ROM frames must pass
    // through UNCHANGED — no stress energy boost (+2), no pitch accent, no
    // synthetic envelope. The old pipeline applied stress boost + envelope,
    // which flattened real dynamics. Authentic frames must pass through raw.
    const frames = buildFramesFromROMLibrary([token('AA', 4)], library(), fallback);
    const energies = frames.slice(0, 4).map(f => f.energy);
    // Original energies 8,9,10,11 pass through unchanged (no +2 stress boost)
    expect(energies).toEqual([8, 9, 10, 11]);
  });

  it('bridges a splice between two authentic ROM segments', () => {
    // Two ROM-sourced sonorant vowels: the class rule gives 2 transition
    // frames between them. Output = 4 + 4 + 2 = 10 frames.
    const frames = buildFramesFromROMLibrary([token('AA', 4), token('AA', 4)], library(), fallback);
    expect(frames.length).toBe(10);
  });

  it('floors sub-audible extractions: 2-frame vowels stretch to the class minimum', () => {
    // "iss" = IH + S*. IH mines as 2 frames (50ms) — clipped, not a vowel. It
    // must be stretched to the vowel floor (4 frames) so the i stays audible
    // next to the s. (A ONE-frame run is a different case: it has no trajectory
    // at all and goes to the static table instead — see the R* whistle test.)
    const frames = buildFramesFromROMLibrary([token('IH'), token('S*')], library(), fallback);
    // IH segment: 4 frames. S* has no library entry and no static fallback
    // (fallback only knows AH) — dropped entirely.
    expect(frames.length).toBe(4);
    expect(frames.every(f => f.k[0] === VOWEL.k[0])).toBe(true);
  });

  it('floors sub-audible extractions: 2-frame stops stretch to the class minimum', () => {
    // P* was mined as 2 frames (50ms) — clipped. Floor is 3 for stops.
    const frames = buildFramesFromROMLibrary([token('P*')], library(), fallback);
    expect(frames.length).toBeGreaterThanOrEqual(3);
    expect(frames[0].energy).toBe(STOP.energy); // no synthetic envelope added
    expect(frames[0].pitch).toBe(STOP.pitch);   // stays unvoiced
  });

  it('does not floor the inter-word pause', () => {
    // "AA  AA": the collapsed pause must stay short — flooring pauses would
    // widen the gap the user complained about.
    const frames = buildFramesFromROMLibrary(
      [token('AA'), token(' '), token('AA')],
      library(),
      fallback,
    );
    const silence = frames.filter(f => f.energy <= 1).length;
    expect(silence).toBe(2);
  });

  it('takes the mined run over the static table when the library has one', () => {
    // The precedence decider: leave-one-out reconstruction of 128 vocabulary
    // words puts library-first closer to the real recording on 124 of them
    // (tools/tms5220-audit/holdoutReconstruction.ts). A static entry existing
    // for the same code must NOT shadow the mined run — that shadowing made
    // the whole mining path dead code at runtime, because the static table
    // answers for all 54 SAM codes.
    const staticAA = { ...VOWEL, k: [17, 15, 9, 9, 6, 10, 7, 5, 4, 4] };
    const frames = buildFramesFromROMLibrary([token('AA')], library(), () => staticAA);
    // The 4-frame mined AA run has k2=18 and energies 8,9,10,11; the static
    // entry has k2=15. Mined data must be what comes out.
    expect(frames.slice(0, 4).map(f => f.energy)).toEqual([8, 9, 10, 11]);
    for (const f of frames) expect(f.k[1]).toBe(18);
  });

  it('falls back to the static table for a single-frame mined run (R* whistle fix)', () => {
    // "rough" = R* AH F*. The ROM-mined R* segment is a single 25ms frame with
    // k2=28 — an /i/-fronted shape that renders as a hollow whistle. One frame
    // carries no trajectory, which is the one case the curated table does
    // better, so runs shorter than MIN_MINED_RUN_FRAMES fall through.
    const badMinedR = {
      k: [11, 28, 1, 9, 9, 7, 6, 4, 5, 5],
      energy: 11, pitch: 18, unvoiced: false, durationMs: 25,
    };
    const lib = library();
    lib.set('R*', [badMinedR]);
    const staticR = { ...VOWEL, k: [17, 15, 9, 9, 6, 10, 7, 5, 4, 4] };
    const rFallback = (code: string) => (code === 'R*' ? staticR : null);

    const frames = buildFramesFromROMLibrary([token('R*')], lib, rFallback);
    // Static R* (liquid): 5 generated frames, compression keeps 3.
    expect(frames.length).toBeGreaterThanOrEqual(3);
    // All frames carry the static R* k2 (15 ±1 oscillation), never the bad 28.
    for (const f of frames) {
      expect(Math.abs(f.k[1] - 15)).toBeLessThanOrEqual(1);
    }
  });
});