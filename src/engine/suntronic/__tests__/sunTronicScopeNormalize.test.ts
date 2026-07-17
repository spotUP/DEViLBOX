/**
 * Regression: SunTronic native per-voice scope/VU taps read at full scale.
 *
 * Bug (2026-07-17): the visualizer fed the raw Paula per-voice sample, whose
 * single-channel ceiling is PAULA_VOICE_CEILING (0.25). A voice at chip max
 * therefore reached only ~8191 of Int16 range — scopes drew quarter-height and
 * VU meters read very low. The display path must normalize by 1/0.25 so a
 * chip-max voice reads Int16 full scale, WITHOUT touching the audible mix or
 * the oracle fidelity path (both keep the raw 0.25 scaling).
 *
 * Fails on revert: drop the 1/PAULA_VOICE_CEILING normalize in voiceScopeToInt16
 * and the chip-max voice maps to ~8191 instead of 32767 — the first assertion
 * fails.
 */
import { describe, it, expect } from 'vitest';
import { voiceScopeToInt16, PAULA_VOICE_CEILING } from '../SunTronicNativeRender';

describe('SunTronic scope/VU normalization', () => {
  it('maps a chip-max voice (0.25) to Int16 full scale, not quarter-height', () => {
    const src = new Float32Array(8).fill(PAULA_VOICE_CEILING); // 0.25 = single-voice ceiling
    const out = voiceScopeToInt16(src, 8);
    // Full scale, NOT ~8191 (which is what the un-normalized raw tap produced).
    expect(out[0]).toBe(32767);
    expect(out[0]).toBeGreaterThan(8192);
  });

  it('maps a negative chip-max voice to Int16 negative full scale', () => {
    const src = new Float32Array(4).fill(-PAULA_VOICE_CEILING);
    const out = voiceScopeToInt16(src, 4);
    expect(out[0]).toBe(-32768);
  });

  it('maps half the ceiling (0.125) to half scale', () => {
    const src = new Float32Array(4).fill(PAULA_VOICE_CEILING / 2);
    const out = voiceScopeToInt16(src, 4);
    expect(out[0]).toBeGreaterThan(16000);
    expect(out[0]).toBeLessThan(16600); // 0.5 * 32767 ≈ 16383
  });

  it('clamps voices louder than the ceiling instead of wrapping', () => {
    const src = new Float32Array(4).fill(0.5); // 2x ceiling
    const out = voiceScopeToInt16(src, 4);
    expect(out[0]).toBe(32767);
  });

  it('silence stays zero', () => {
    const out = voiceScopeToInt16(new Float32Array(4), 4);
    expect(Array.from(out)).toEqual([0, 0, 0, 0]);
  });
});
