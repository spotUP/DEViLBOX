/**
 * stopClosure.test.ts — plosives are closure silence + burst, and the silence
 * must survive every layer.
 *
 * Three layers each destroyed it:
 *  - packFrameBuffer clamped energy to a minimum of 1, so silence could not be
 *    encoded at all (the MAME core handles mid-utterance energy 0 correctly).
 *  - lpcToTMS5220Frames dropped energy-0 frames during mining.
 *  - insertTransitions bridged into a stop with an audible interpolated frame
 *    that its own comment called a "brief closure".
 */
import { describe, it, expect } from 'vitest';
import { packFrameBuffer } from '../tms5220FrameBuffer';
import { buildFramesFromROMLibrary, lpcToTMS5220Frames } from '../ROMPhonemeExtractor';
import type { TMS5220Frame } from '../tms5220PhonemeMap';
import type { LPCFrame } from '../VSMROMParser';

const VOWEL: TMS5220Frame = {
  k: [20, 18, 12, 8, 6, 5, 4, 3, 2, 1], energy: 8, pitch: 20, unvoiced: false, durationMs: 25,
};
const BURST: TMS5220Frame = {
  k: [15, 10, 8, 6, 4, 3, 2, 2, 1, 1], energy: 7, pitch: 0, unvoiced: true, durationMs: 25,
};

function library(): Map<string, TMS5220Frame[]> {
  const map = new Map<string, TMS5220Frame[]>();
  map.set('AA', [0, 1, 2, 3].map(i => ({ ...VOWEL, k: [...VOWEL.k], energy: VOWEL.energy + i })));
  map.set('T*', [0, 1].map(i => ({ ...BURST, k: [...BURST.k], energy: BURST.energy + i })));
  return map;
}

describe('packFrameBuffer silence', () => {
  it('keeps a mid-buffer energy-0 frame silent instead of clamping it audible', () => {
    const frames: TMS5220Frame[] = [
      { ...VOWEL, k: [...VOWEL.k] },
      { k: [...BURST.k], energy: 0, pitch: 0, unvoiced: true, durationMs: 25 },
      { ...BURST, k: [...BURST.k] },
    ];
    const { data } = packFrameBuffer(frames);
    expect(data[0 * 12]).toBe(VOWEL.energy);
    expect(data[1 * 12]).toBe(0); // the closure stays silent
    expect(data[2 * 12]).toBe(BURST.energy);
  });

  it('still clamps sounding frames into [1,14]', () => {
    const loud: TMS5220Frame = { ...VOWEL, k: [...VOWEL.k], energy: 99 };
    const { data } = packFrameBuffer([loud]);
    expect(data[0]).toBe(14);
  });
});

describe('lpcToTMS5220Frames closure', () => {
  const lpc = (energy: number): LPCFrame => ({
    energy, repeat: false, pitch: 0, unvoiced: true, k: [15, 10, 8, 6, 4, 3, 2, 2, 1, 1],
  });

  it('keeps closure silence when asked (stop mining)', () => {
    const out = lpcToTMS5220Frames([lpc(0), lpc(0), lpc(7)], true);
    expect(out.map(f => f.energy)).toEqual([0, 0, 7]);
  });

  it('drops silence by default (continuant mining)', () => {
    const out = lpcToTMS5220Frames([lpc(0), lpc(7)]);
    expect(out.map(f => f.energy)).toEqual([7]);
  });
});

describe('synthesis closure insertion', () => {
  it('inserts real silence between a vowel and a stop burst', () => {
    // "AT": AE-like vowel then T*. The frame right before the burst must be
    // energy 0 — an audible "transition" frame is not a closure.
    const frames = buildFramesFromROMLibrary(
      [{ code: 'AA', stress: 0 }, { code: 'T*', stress: 0 }],
      library(),
      () => null,
    );
    const burstAt = frames.findIndex(f => f.energy === BURST.energy && f.unvoiced);
    expect(burstAt).toBeGreaterThan(0);
    expect(frames[burstAt - 1].energy).toBe(0);
  });

  it('does not double-insert when the mined stop already starts with closure', () => {
    const lib = library();
    lib.set('T*', [
      { k: [...BURST.k], energy: 0, pitch: 0, unvoiced: true, durationMs: 25 },
      { ...BURST, k: [...BURST.k] },
      { ...BURST, k: [...BURST.k], energy: BURST.energy + 1 },
    ]);
    const frames = buildFramesFromROMLibrary(
      [{ code: 'AA', stress: 0 }, { code: 'T*', stress: 0 }],
      lib,
      () => null,
    );
    // Exactly one closure frame between the vowel run and the burst.
    const silent = frames.filter(f => f.energy === 0).length;
    expect(silent).toBe(1);
  });

  it('does not resample closure silence into half-loud frames', () => {
    // A 2-frame mined stop (closure + burst) floors to 3 frames: the padding
    // must extend the closure, never interpolate silence into the burst.
    const lib = library();
    lib.set('T*', [
      { k: [...BURST.k], energy: 0, pitch: 0, unvoiced: true, durationMs: 25 },
      { ...BURST, k: [...BURST.k] },
    ]);
    const frames = buildFramesFromROMLibrary([{ code: 'T*', stress: 0 }], lib, () => null);
    for (const f of frames) {
      expect(f.energy === 0 || f.energy >= BURST.energy).toBe(true);
    }
  });
});
