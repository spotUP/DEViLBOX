/**
 * Tape Saturation passes a quiet signal at unity and only compresses loud ones.
 *
 * Its curve kept the drive as gain (tanh(x*k), k up to 9, after an input boost
 * of up to 3x): a -18 dBFS sine came out +14.7 dB louder at the default drive
 * (+7 dB even after a -5 dB static compensation), measured in the browser
 * 2026-09-29 by tools/master-fx-response-audit.ts.
 */
import { describe, it, expect } from 'vitest';
import { tapeSaturationCurve, tapeSaturationInputGain } from '../TapeSaturation';

/** The chain on one sample: input boost -> curve (WaveShaper lookup, clamped) -> makeup 1/boost. */
function through(x: number, drive: number): number {
  const curve = tapeSaturationCurve(drive);
  const g = tapeSaturationInputGain(drive);
  const u = Math.max(-1, Math.min(1, x * g));
  const pos = ((u + 1) / 2) * (curve.length - 1);
  const i = Math.floor(pos), f = pos - i;
  const y = curve[i] + (curve[Math.min(i + 1, curve.length - 1)] - curve[i]) * f;
  return y / g;
}

describe('Tape Saturation', () => {
  for (const drive of [0, 0.5, 1]) {
    it(`quiet signals pass at unity (drive ${drive})`, () => {
      for (const x of [0.005, -0.005]) expect(through(x, drive) / x).toBeCloseTo(1, 1);
    });
  }

  it('a hot signal comes out quieter than it went in, never louder', () => {
    for (const drive of [0.5, 1]) {
      expect(Math.abs(through(0.5, drive))).toBeLessThan(0.5);
      expect(Math.abs(through(-0.5, drive))).toBeLessThan(0.5);
    }
  });
});
